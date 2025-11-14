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

const createWindow = () => {
  // create the app window
  const mainWindow = new BrowserWindow({
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
