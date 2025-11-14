const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  sendRegion: (region) => ipcRenderer.send("region-selected", region),
});
