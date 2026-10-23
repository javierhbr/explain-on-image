const { app, BrowserWindow, ipcMain, desktopCapturer, screen, clipboard, dialog, shell, systemPreferences, Menu, ClipboardItem } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { cropRectangle } = require("./capture-geometry.cjs");
const { randomUUID } = require("node:crypto");
const imagePolicy = import("./image-policy.mjs");
let mainWindow, overlay, pendingCapture, captureData, lastSaved, pendingSave;
app.setName("ExplainOnImage");
if(process.platform === "win32")app.setAppUserModelId("local.explainonimage.desktop");
const testMode = process.env.EXPLAIN_TEST === "1";
if (testMode) app.setPath("userData", path.resolve(__dirname, "../../verification/profile"));
const prefPath = () => path.join(app.getPath("userData"), "preferences.json");
function configureWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
}
function fail(message) { return { error: message }; }
async function readImage(file) {
  if (!/\.(png|jpe?g)$/i.test(file)) throw Error("Select a PNG or JPG image.");
  const { LIMITS, inspectEncodedImage } = await imagePolicy;
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > LIMITS.maxInputBytes) throw Error("The image is empty or exceeds 80 MB.");
    const header = Buffer.alloc(Math.min(stat.size, LIMITS.maxHeaderBytes));
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const info = inspectEncodedImage(header.subarray(0, bytesRead));
    // Bound the allocation even if the selected file grows while it is being read.
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const read = await handle.read(data, offset, data.length - offset, offset);
      if (!read.bytesRead) throw Error("The image has changed or is incomplete.");
      offset += read.bytesRead;
    }
    return { bytes: data, mime: info.mime, name: path.basename(file) };
  } finally { await handle.close(); }
}
async function exportJPEGBytes(data) {
  const { LIMITS, inspectEncodedImage } = await imagePolicy;
  if (!(data instanceof Uint8Array) || data.length > LIMITS.maxExportBytes) throw Error("The exported JPG is not valid.");
  if (inspectEncodedImage(data, { output: true }).mime !== "image/jpeg") throw Error("The exported JPG is not valid.");
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}
async function exportPNGBytes(data) {
  const { sanitizeExportPNG } = await imagePolicy;
  const clean = sanitizeExportPNG(data);
  return Buffer.from(clean.buffer, clean.byteOffset, clean.byteLength);
}
function restore() { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } }
function completeCapture(result) {
  const done = pendingCapture;
  pendingCapture = null;
  captureData = null;
  if (overlay && !overlay.isDestroyed()) overlay.close();
  overlay = null;
  restore();
  done?.(result);
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([
    { label: "ExplainOnImage", submenu: [
      { label: "Hide ExplainOnImage", role: "hide" },
      { label: "Show All", role: "unhide" },
      { type: "separator" },
      { label: "Quit ExplainOnImage", role: "quit" }
    ] },
    { label: "Window", submenu: [
      { label: "Minimize", role: "minimize" },
      { label: "Zoom", role: "zoom" },
      { label: "Close", role: "close" }
    ] }
  ]) : null);
  mainWindow = new BrowserWindow({ width: 1460, height: 940, minWidth: 1000, minHeight: 680, title: "ExplainOnImage", backgroundColor: "#f4f3ef", icon: path.join(__dirname, "../assets/app-icon.png"), webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  configureWindow(mainWindow);
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => { if (pendingCapture) completeCapture(null); mainWindow = null; });
  app.on("activate", restore);
});
app.on("window-all-closed", () => app.quit());
function handle(channel, fn, fromOverlay = false) {
  ipcMain.handle(channel, async (event, ...args) => {
    const expected = fromOverlay ? overlay : mainWindow;
    if (!expected || event.sender !== expected.webContents || event.senderFrame !== expected.webContents.mainFrame) return fail("Invalid request origin.");
    try { return await fn(...args); } catch (e) { console.error(channel, e); return fail(e.message || "The operation could not be completed."); }
  });
}
handle("preferences:get", async () => { try { return JSON.parse(await fs.readFile(prefPath(), "utf8")); } catch { return {}; } });
handle("preferences:set", async value => {
  if (!value || typeof value !== "object" || JSON.stringify(value).length > 5000) return false;
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const tmp = prefPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value), "utf8");
  await fs.rename(tmp, prefPath());
  return true;
});
handle("image:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Open image", filters: [{ name: "PNG and JPG images", extensions: ["png", "jpg", "jpeg"] }], properties: ["openFile"] });
  return result.canceled ? null : readImage(result.filePaths[0]);
});
handle("image:paste", async () => {
  const items = await clipboard.read();
  const item = items.find(i => i.types.includes("image/png")) || items.find(i => i.types.includes("image/jpeg"));
  if (!item) return fail("The clipboard does not contain an image. Copy an image and try again.");
  const blob = await item.getType(item.types.includes("image/png") ? "image/png" : "image/jpeg");
  const { validateImageBlob } = await imagePolicy;
  const info = await validateImageBlob(blob);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: info.mime, name: "Clipboard image" };
});
handle("image:copy", async data => {
  const bytes = await exportPNGBytes(data);
  await clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  return { ok: true };
});
// The destination stays in the main process; the renderer only learns the format to encode.
handle("save:choose", async () => {
  pendingSave = null;
  const result = await dialog.showSaveDialog(mainWindow, { title: "Save image as", defaultPath: `ExplainOnImage-${new Date().toISOString().slice(0, 10)}.png`, filters: [{ name: "PNG image", extensions: ["png"] }, { name: "JPG image", extensions: ["jpg", "jpeg"] }] });
  if (result.canceled || !result.filePath) return null;
  const jpeg = /\.jpe?g$/i.test(result.filePath);
  const file = jpeg || /\.png$/i.test(result.filePath) ? result.filePath : result.filePath + ".png";
  pendingSave = { file, format: jpeg ? "jpeg" : "png" };
  return { format: pendingSave.format, name: path.basename(file) };
});
handle("image:save", async data => {
  const target = pendingSave;
  pendingSave = null;
  if (!target) throw Error("Choose where to save the image first.");
  const bytes = target.format === "jpeg" ? await exportJPEGBytes(data) : await exportPNGBytes(data);
  const file = target.file;
  const temporary = path.join(path.dirname(file), "." + path.basename(file) + "." + randomUUID() + ".tmp");
  try { await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 }); await fs.rename(temporary, file); }
  catch (e) { await fs.unlink(temporary).catch(() => {}); throw e; }
  lastSaved = file;
  return { name: path.basename(file), path: file };
});
handle("saved:open", async () => { if (lastSaved) { const error = await shell.openPath(lastSaved); if (error) throw Error(error); } });
handle("saved:reveal", () => { if (lastSaved) shell.showItemInFolder(lastSaved); });
async function doctor() {
  const checks = [], displays = screen.getAllDisplays();
  checks.push(displays.length ? { id: "displays", label: "Displays", status: "ok", detail: `${displays.length} ${displays.length === 1 ? "display detected" : "displays detected"}.` } : { id: "displays", label: "Displays", status: "error", detail: "No display detected." });
  const access = process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "granted";
  if (process.platform === "darwin") checks.push(access === "granted" ? { id: "screen", label: "Screen recording", status: "ok", detail: "Permission granted." }
    : access === "not-determined" ? { id: "screen", label: "Screen recording", status: "warning", detail: "Not granted yet. macOS will ask on the first capture.", action: "settings" }
    : { id: "screen", label: "Screen recording", status: "error", detail: "Permission denied. Enable it in System Settings > Privacy & Security > Screen Recording and restart the app.", action: "settings" });
  // Probing without permission would trigger the macOS prompt; only probe once access is granted.
  // On Linux the probe can open the screen-share portal picker, so it only runs where it is silent.
  if (access === "granted" && process.platform !== "linux") {
    try {
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 32, height: 32 }, fetchWindowIcons: false });
      checks.push(sources.some(s => !s.thumbnail.isEmpty()) ? { id: "capture", label: "Screen capture", status: "ok", detail: "The system provides screen images." } : { id: "capture", label: "Screen capture", status: "error", detail: "The system does not provide screen images. Check the permissions and restart the app." });
    } catch (e) { checks.push({ id: "capture", label: "Screen capture", status: "error", detail: e.message || "Could not capture the screen." }); }
  }
  // Checks for a format without reading clipboard contents.
  try { await clipboard.has("image/png"); checks.push({ id: "clipboard", label: "Clipboard", status: "ok", detail: "Available to copy and paste images." }); }
  catch (e) { checks.push({ id: "clipboard", label: "Clipboard", status: "error", detail: e.message || "Cannot access the clipboard." }); }
  try {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    const probe = path.join(app.getPath("userData"), ".doctor-" + randomUUID() + ".tmp");
    await fs.writeFile(probe, ""); await fs.unlink(probe);
    checks.push({ id: "storage", label: "Preferences", status: "ok", detail: "The preferences folder is writable." });
  } catch (e) { checks.push({ id: "storage", label: "Preferences", status: "error", detail: "Cannot save preferences: " + (e.message || "no access to the folder.") }); }
  return { platform: process.platform, checks };
}
handle("doctor:run", doctor);
handle("system:username", () => os.userInfo().username);
handle("doctor:settings", async () => { if (process.platform === "darwin") await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"); return { ok: true }; });
handle("doctor:relaunch", () => { app.relaunch(); app.quit(); });
handle("capture:displays",() => screen.getAllDisplays().map((d, index) => ({ id: String(d.id), label: d.label || `Display ${index + 1}`, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor), scale: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id })));
handle("capture:start", async id => {
  if (pendingCapture) return fail("A capture is already in progress.");
  const display = screen.getAllDisplays().find(d => String(d.id) === String(id));
  if (!display) return fail("The selected display is no longer connected.");
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") === "denied") return fail("Enable screen recording for ExplainOnImage in System Settings > Privacy & Security, then restart the app. Use “Check permissions” to review it.");
  mainWindow.hide();
  try {
    await new Promise(resolve => setTimeout(resolve, 420));
    const displays = screen.getAllDisplays();
    const width = Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor)));
    const height = Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height }, fetchWindowIcons: false });
    let source = sources.find(s => s.display_id === String(display.id));
    if (!source && sources.length === 1 && displays.length === 1) source = sources[0];
    if (!source || source.thumbnail.isEmpty()) throw Error("Could not capture this display. Check the system capture permissions.");
    const screenshot = source.thumbnail;
    captureData = { image: screenshot, bytes: screenshot.toPNG(), width: screenshot.getSize().width, height: screenshot.getSize().height };
    const result = new Promise(resolve => { pendingCapture = resolve; });
    overlay = new BrowserWindow({ ...display.bounds, frame: false, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: "#111111", enableLargerThanScreen: true, webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    overlay.setBounds(display.bounds);
    overlay.setAlwaysOnTop(true, "screen-saver");
    configureWindow(overlay);
    overlay.on("closed", () => { overlay = null; if (pendingCapture) completeCapture(null); });
    await overlay.loadFile(path.join(__dirname, "overlay.html"));
    overlay.show(); overlay.focus();
    return await result;
  } catch (e) { completeCapture(null); throw e; }
});
handle("overlay:image", () => captureData && ({ bytes: captureData.bytes, width: captureData.width, height: captureData.height }), true);
handle("overlay:finish", rect => {
  if (!rect) { completeCapture(null); return true; }
  if (!captureData || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)) throw Error("Invalid selection.");
  const { width, height } = captureData;
  const crop = cropRectangle(rect, width, height);
  if (!crop) return false;
  const image = captureData.image.crop(crop);
  const w = crop.width, h = crop.height;
  completeCapture({ bytes: image.toPNG(), mime: "image/png", name: `Capture · ${w} × ${h} px` });
  return true;
}, true);
