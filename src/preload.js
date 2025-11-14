const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // function to send capture request
  //passes numScreenshots from React as a parameter
  startCapture: (numScreenshots) => {
    ipcRenderer.send("start-capture", numScreenshots);
  },
  //function react can use to listen for capture completion
  onCaptureComplete: (callback) => {
    ipcRenderer.on("capture-complete", callback);
  },
  // minimal additions to support renderer-based fullscreen capture
  saveFrame: (dataURL) => ipcRenderer.send("save-captured-frame", dataURL),
  pressSpace: () => ipcRenderer.send("press-space"),
  completeLoop: (meta) => ipcRenderer.send("capture-loop-complete", meta),
  getScreenPermissionStatus: () =>
    ipcRenderer.invoke("screen-permission-status"),
});
