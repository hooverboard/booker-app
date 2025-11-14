const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // function to send capture request
  //passes numScreenshots from React as a parameter
  startCapture: (numScreenshots) => {
    ipcRenderer.send("start-capture", numScreenshots);
  },
  // new: capture with region coordinates
  startCaptureWithRegion: (numScreenshots, region) => {
    ipcRenderer.send("start-capture-region", numScreenshots, region);
  },
  // open fullscreen region selector
  openRegionSelector: () => {
    ipcRenderer.send("open-region-selector");
  },
  // listen for region selection result (use once to prevent memory leaks)
  onRegionSelected: (callback) => {
    ipcRenderer.removeAllListeners("region-selected");
    ipcRenderer.on("region-selected", (event, region) => callback(region));
  },
  // selector errors from main
  onSelectorError: (callback) => {
    ipcRenderer.removeAllListeners("selector-error");
    ipcRenderer.on("selector-error", (_e, message) => callback(message));
  },
  //function react can use to listen for capture completion
  onCaptureComplete: (callback) => {
    ipcRenderer.removeAllListeners("capture-complete");
    ipcRenderer.on("capture-complete", callback);
  },
  // minimal additions to support renderer-based fullscreen capture
  saveFrame: (dataURL) => ipcRenderer.send("save-captured-frame", dataURL),
  pressSpace: () => ipcRenderer.send("press-space"),
  completeLoop: (meta) => ipcRenderer.send("capture-loop-complete", meta),
  getScreenPermissionStatus: () =>
    ipcRenderer.invoke("screen-permission-status"),
  // selector overlay -> main: send selected region (or null to cancel)
  sendRegion: (region) => ipcRenderer.send("region-selected", region),
});
