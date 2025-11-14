import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen as electronScreen,
  systemPreferences,
} from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
// Try to load robotjs; fall back to OS-specific keypress if unavailable
let robot = null;
try {
  // eslint-disable-next-line global-require
  robot = require("robotjs");
} catch (e) {
  console.warn(
    "robotjs not available, will use OS fallback for spacebar:",
    e?.message || e
  );
}
import fs from "node:fs";
import { nativeImage } from "electron";
import { execFile } from "node:child_process";

function pressSpacebar() {
  if (robot) {
    try {
      robot.keyTap("space");
      return;
    } catch (err) {
      console.warn(
        "robotjs keyTap failed, using OS fallback:",
        err?.message || err
      );
    }
  }
  if (process.platform === "darwin") {
    // key code 49 = spacebar
    execFile(
      "osascript",
      ["-e", 'tell application "System Events" to key code 49'],
      (e) => {
        if (e) console.error("osascript spacebar failed:", e);
      }
    );
  } else if (process.platform === "win32") {
    const ps =
      "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(' ')";
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        ps,
      ],
      (e) => {
        if (e) console.error("PowerShell spacebar failed:", e);
      }
    );
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow = null;
let selectorWindows = [];

const createWindow = () => {
  // create the app window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Enable screen capture for the window
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  // load the index.html of the app (with robust prod fallbacks)
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const candidates = [
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      path.join(__dirname, "../renderer/index.html"),
      path.join(__dirname, "index.html"),
    ];
    const toLoad = candidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    console.log("Attempting to load renderer HTML:", toLoad || candidates);
    if (toLoad) {
      mainWindow
        .loadFile(toLoad)
        .catch((err) => console.error("loadFile failed:", err));
    } else {
      console.error("No renderer index.html found at candidates:", candidates);
    }
  }

  // open the devtools on launch
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Request screen capture permission on macOS
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen");
    console.log("Screen capture permission status:", status);
  }

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Expose screen recording permission status to renderer
ipcMain.handle("screen-permission-status", () => {
  if (process.platform === "darwin") {
    return systemPreferences.getMediaAccessStatus("screen");
  }
  // Windows/Linux do not use this API; assume allowed
  return "granted";
});

// Open fullscreen region selector window
ipcMain.on("open-region-selector", () => {
  try {
    if (selectorWindows.length) {
      // Already open: focus the first one
      selectorWindows[0].focus();
      return;
    }

    // Hide main window to avoid interaction confusion while selecting
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();

    // Create an overlay window for each display so selection works anywhere
    const displays = electronScreen.getAllDisplays();
    selectorWindows = displays.map((d) => {
      const win = new BrowserWindow({
        x: d.bounds.x,
        y: d.bounds.y,
        width: d.bounds.width,
        height: d.bounds.height,
        frame: false,
        transparent: false,
        backgroundColor: "#000000",
        alwaysOnTop: true,
        fullscreen: false,
        hasShadow: false,
        skipTaskbar: true,
        focusable: true,
        acceptFirstMouse: true,
        fullscreenable: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true, "screen-saver");
      win.setIgnoreMouseEvents(false, { forward: false });
      
      // Load selector HTML inline to avoid packaging issues
      const selectorHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Region Selector</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-user-select: none; user-select: none; }
    html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; cursor: crosshair; background: transparent; -webkit-app-region: no-drag; pointer-events: auto; }
    .hint { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); color: white; font-size: 18px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8); background: rgba(0,0,0,0.6); padding: 10px 20px; border-radius: 8px; z-index: 10000; pointer-events: none; }
    .selection-box { position: fixed; border: 2px solid #00c80d; background: rgba(0,200,13,0.1); pointer-events: none; z-index: 9999; display: none; }
  </style>
</head>
<body>
  <div class="hint" id="hint">Drag to select region, then release (ESC to cancel)</div>
  <div class="selection-box" id="selectionBox"></div>
  <script>
    let dragStart = null;
    const selectionBox = document.getElementById("selectionBox");
    const hintEl = document.getElementById("hint");
    
    document.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragStart = { x: e.screenX, y: e.screenY, clientX: e.clientX, clientY: e.clientY };
      selectionBox.style.display = "block";
      selectionBox.style.left = e.clientX + "px";
      selectionBox.style.top = e.clientY + "px";
      selectionBox.style.width = "0px";
      selectionBox.style.height = "0px";
      if (hintEl) hintEl.textContent = "Dragging… release to confirm (ESC to cancel)";
    });
    
    document.addEventListener("mousemove", (e) => {
      if (!dragStart) return;
      e.preventDefault();
      const left = Math.min(dragStart.clientX, e.clientX);
      const top = Math.min(dragStart.clientY, e.clientY);
      const width = Math.abs(e.clientX - dragStart.clientX);
      const height = Math.abs(e.clientY - dragStart.clientY);
      selectionBox.style.left = left + "px";
      selectionBox.style.top = top + "px";
      selectionBox.style.width = width + "px";
      selectionBox.style.height = height + "px";
      if (hintEl) hintEl.textContent = \`Drag \${width}×\${height} (ESC to cancel)\`;
    });
    
    function finishSelection(e) {
      if (!dragStart) return;
      e.preventDefault();
      const x = Math.min(dragStart.x, e.screenX);
      const y = Math.min(dragStart.y, e.screenY);
      const width = Math.abs(e.screenX - dragStart.x);
      const height = Math.abs(e.screenY - dragStart.y);
      if (width < 10 || height < 10) { window.close(); return; }
      if (window.electronAPI && window.electronAPI.sendRegion) {
        window.electronAPI.sendRegion({ x, y, width, height });
      }
      dragStart = null;
      window.close();
    }
    
    document.addEventListener("mouseup", finishSelection);
    window.addEventListener("mouseup", finishSelection);
    
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (window.electronAPI && window.electronAPI.sendRegion) {
          window.electronAPI.sendRegion(null);
        }
        window.close();
      }
    });
  </script>
</body>
</html>`;
      
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(selectorHTML)}`);
      win.once("ready-to-show", () => {
        win.setOpacity(0.35);
        win.show();
        win.focus();
        win.moveTop();
      });
      // If any overlay closes unexpectedly, clean them all up
      win.on("closed", () => {
        cleanupSelectorWindows();
      });
      return win;
    });
  } catch (err) {
    console.error("Failed to open region selector:", err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("selector-error", err?.message || String(err));
    }
  }
});

// Receive selected region from selector window
ipcMain.on("region-selected", (event, region) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("region-selected", region);
  }
  cleanupSelectorWindows();
});

function cleanupSelectorWindows() {
  try {
    if (selectorWindows && selectorWindows.length) {
      for (const w of selectorWindows) {
        if (w && !w.isDestroyed()) {
          try { w.removeAllListeners("closed"); } catch {}
          try { w.close(); } catch {}
        }
      }
    }
  } catch {}
  selectorWindows = [];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// listen for screenshot capture requests
ipcMain.on("start-capture", async (event, numScreenshots) => {
  console.log(`Starting capture of ${numScreenshots} screenshots`);

  // wait 3 seconds for user to prepare/switch windows
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // create screenshots folder in the app directory
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // loop through and capture each screenshot
  for (let i = 0; i < numScreenshots; i++) {
    try {
      // Get primary display size
      const primaryDisplay = electronScreen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.size;

      // Capture the screen using desktopCapturer
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.floor(width * primaryDisplay.scaleFactor),
          height: Math.floor(height * primaryDisplay.scaleFactor),
        },
        fetchWindowIcons: false,
      });

      console.log(`Found ${sources.length} screen sources`);

      if (sources.length === 0) {
        throw new Error(
          "No screen sources found. Please grant screen recording permission."
        );
      }

      // Get the first screen (primary display)
      const source = sources[0];
      const thumbnail = source.thumbnail;

      // Convert to PNG buffer
      const imageBuffer = thumbnail.toPNG();

      // generate filename with timestamp
      const timestamp = Date.now();
      const filename = `screenshot_${i + 1}_${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);

      // save the screenshot
      fs.writeFileSync(filepath, imageBuffer);
      console.log(`Saved: ${filename}`);

      // press spacebar
      pressSpacebar();

      // wait 500ms before next capture
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("Screenshot error:", error);
    }
  }

  // send completion message back to React
  event.reply("capture-complete", {
    success: true,
    count: numScreenshots,
    folder: screenshotsDir,
  });
});

// IPC for renderer-based fullscreen capture
ipcMain.on("save-captured-frame", (event, dataURL) => {
  try {
    const img = nativeImage.createFromDataURL(dataURL);
    if (img.isEmpty()) throw new Error("Empty frame data");
    const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
    if (!fs.existsSync(screenshotsDir))
      fs.mkdirSync(screenshotsDir, { recursive: true });
    const filename = `screenshot_${Date.now()}.png`;
    const filepath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filepath, img.toPNG());
  } catch (e) {
    console.error("Failed saving frame:", e);
  }
});

ipcMain.on("press-space", () => {
  try {
    pressSpacebar();
  } catch (e) {
    console.error("robotjs error:", e);
  }
});

ipcMain.on("capture-loop-complete", (event, meta) => {
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
  event.sender.send("capture-complete", {
    success: true,
    count: meta?.count ?? 0,
    folder: screenshotsDir,
  });
});

// permission status expose
// (Removed duplicate handler; defined earlier in file)

// listen for screenshot capture requests with region
ipcMain.on("start-capture-region", async (event, numScreenshots, region) => {
  console.log(
    `Starting capture of ${numScreenshots} screenshots with region:`,
    region
  );

  // wait 3 seconds for user to prepare/switch windows
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // create screenshots folder in the app directory
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // loop through and capture each screenshot
  for (let i = 0; i < numScreenshots; i++) {
    try {
      // Get primary display size
      const primaryDisplay = electronScreen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.size;
      const scaleFactor = primaryDisplay.scaleFactor;

      // Capture the full screen using desktopCapturer
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.floor(width * scaleFactor),
          height: Math.floor(height * scaleFactor),
        },
        fetchWindowIcons: false,
      });

      console.log(`Found ${sources.length} screen sources`);

      if (sources.length === 0) {
        throw new Error(
          "No screen sources found. Please grant screen recording permission."
        );
      }

      // Get the first screen (primary display)
      const source = sources[0];
      const thumbnail = source.thumbnail;

      // Crop the thumbnail to the selected region
      const croppedImage = thumbnail.crop({
        x: Math.floor(region.x * scaleFactor),
        y: Math.floor(region.y * scaleFactor),
        width: Math.floor(region.width * scaleFactor),
        height: Math.floor(region.height * scaleFactor),
      });

      // Convert to PNG buffer
      const imageBuffer = croppedImage.toPNG();

      // generate filename with timestamp
      const timestamp = Date.now();
      const filename = `screenshot_${i + 1}_${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);

      // save the screenshot
      fs.writeFileSync(filepath, imageBuffer);
      console.log(`Saved: ${filename}`);

      // press spacebar
      pressSpacebar();

      // wait 500ms before next capture
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("Screenshot error:", error);
    }
  }

  // send completion message back to React
  event.reply("capture-complete", {
    success: true,
    count: numScreenshots,
    folder: screenshotsDir,
  });
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
