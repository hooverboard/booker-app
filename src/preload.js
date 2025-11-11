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
});
