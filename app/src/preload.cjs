const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", Object.freeze({
  preferences: () => ipcRenderer.invoke("preferences:get"),
  savePreferences: value => ipcRenderer.invoke("preferences:set", value),
  openImage: () => ipcRenderer.invoke("image:open"),
  pasteImage: () => ipcRenderer.invoke("image:paste"),
  displays: () => ipcRenderer.invoke("capture:displays"),
  capture: id => ipcRenderer.invoke("capture:start", id),
  copy: bytes => ipcRenderer.invoke("image:copy", bytes),
  save: bytes => ipcRenderer.invoke("image:save", bytes),
  openSaved: () => ipcRenderer.invoke("saved:open"),
  revealSaved: () => ipcRenderer.invoke("saved:reveal"),
  overlayImage: () => ipcRenderer.invoke("overlay:image"),
  overlayFinish: rect => ipcRenderer.invoke("overlay:finish", rect),
  platform: process.platform
}));
