const { app, BrowserWindow, ipcMain, desktopCapturer, screen, clipboard, dialog, shell, systemPreferences, Menu, ClipboardItem } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { cropRectangle } = require("./capture-geometry.cjs");
const { randomUUID } = require("node:crypto");
const imagePolicy = import("./image-policy.mjs");
let mainWindow, overlay, pendingCapture, captureData, lastSaved;
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
  if (!/\.(png|jpe?g)$/i.test(file)) throw Error("Selecciona una imagen PNG o JPG.");
  const { LIMITS, inspectEncodedImage } = await imagePolicy;
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > LIMITS.maxInputBytes) throw Error("La imagen está vacía o supera los 80 MB.");
    const header = Buffer.alloc(Math.min(stat.size, LIMITS.maxHeaderBytes));
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const info = inspectEncodedImage(header.subarray(0, bytesRead));
    // Bound the allocation even if the selected file grows while it is being read.
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const read = await handle.read(data, offset, data.length - offset, offset);
      if (!read.bytesRead) throw Error("La imagen ha cambiado o está incompleta.");
      offset += read.bytesRead;
    }
    return { bytes: data, mime: info.mime, name: path.basename(file) };
  } finally { await handle.close(); }
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
      { label: "Ocultar ExplainOnImage", role: "hide" },
      { label: "Mostrar todas las ventanas", role: "unhide" },
      { type: "separator" },
      { label: "Salir de ExplainOnImage", role: "quit" }
    ] },
    { label: "Ventana", submenu: [
      { label: "Minimizar", role: "minimize" },
      { label: "Ampliar", role: "zoom" },
      { label: "Cerrar", role: "close" }
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
    if (!expected || event.sender !== expected.webContents || event.senderFrame !== expected.webContents.mainFrame) return fail("Origen de la petición no válido.");
    try { return await fn(...args); } catch (e) { console.error(channel, e); return fail(e.message || "No se ha podido completar la operación."); }
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
  const result = await dialog.showOpenDialog(mainWindow, { title: "Abrir imagen", filters: [{ name: "Imágenes PNG y JPG", extensions: ["png", "jpg", "jpeg"] }], properties: ["openFile"] });
  return result.canceled ? null : readImage(result.filePaths[0]);
});
handle("image:paste", async () => {
  const items = await clipboard.read();
  const item = items.find(i => i.types.includes("image/png")) || items.find(i => i.types.includes("image/jpeg"));
  if (!item) return fail("El portapapeles no contiene ninguna imagen. Copia una imagen e inténtalo de nuevo.");
  const blob = await item.getType(item.types.includes("image/png") ? "image/png" : "image/jpeg");
  const { validateImageBlob } = await imagePolicy;
  const info = await validateImageBlob(blob);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: info.mime, name: "Imagen del portapapeles" };
});
handle("image:copy", async data => {
  const bytes = await exportPNGBytes(data);
  await clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  return { ok: true };
});
handle("image:save", async data => {
  const bytes = await exportPNGBytes(data);
  const result = await dialog.showSaveDialog(mainWindow, { title: "Guardar PNG", defaultPath: `ExplainOnImage-${new Date().toISOString().slice(0, 10)}.png`, filters: [{ name: "Imagen PNG", extensions: ["png"] }] });
  if (result.canceled || !result.filePath) return null;
  const file = /\.png$/i.test(result.filePath) ? result.filePath : result.filePath + ".png";
  const temporary = path.join(path.dirname(file), "." + path.basename(file) + "." + randomUUID() + ".tmp");
  try { await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 }); await fs.rename(temporary, file); }
  catch (e) { await fs.unlink(temporary).catch(() => {}); throw e; }
  lastSaved = file;
  return { name: path.basename(file), path: file };
});
handle("saved:open", async () => { if (lastSaved) { const error = await shell.openPath(lastSaved); if (error) throw Error(error); } });
handle("saved:reveal", () => { if (lastSaved) shell.showItemInFolder(lastSaved); });
handle("capture:displays", () => screen.getAllDisplays().map((d, index) => ({ id: String(d.id), label: d.label || `Pantalla ${index + 1}`, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor), scale: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id })));
handle("capture:start", async id => {
  if (pendingCapture) return fail("Ya hay una captura en curso.");
  const display = screen.getAllDisplays().find(d => String(d.id) === String(id));
  if (!display) return fail("La pantalla seleccionada ya no está conectada.");
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") === "denied") return fail("Activa la grabación de pantalla para ExplainOnImage en Ajustes del Sistema > Privacidad y seguridad. Después reinicia la aplicación.");
  mainWindow.hide();
  try {
    await new Promise(resolve => setTimeout(resolve, 420));
    const displays = screen.getAllDisplays();
    const width = Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor)));
    const height = Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height }, fetchWindowIcons: false });
    let source = sources.find(s => s.display_id === String(display.id));
    if (!source && sources.length === 1 && displays.length === 1) source = sources[0];
    if (!source || source.thumbnail.isEmpty()) throw Error("No se ha podido capturar esta pantalla. Comprueba los permisos de captura del sistema.");
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
  if (!captureData || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)) throw Error("Selección no válida.");
  const { width, height } = captureData;
  const crop = cropRectangle(rect, width, height);
  if (!crop) return false;
  const image = captureData.image.crop(crop);
  const w = crop.width, h = crop.height;
  completeCapture({ bytes: image.toPNG(), mime: "image/png", name: `Captura · ${w} × ${h} px` });
  return true;
}, true);
