import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen as electronScreen,
  systemPreferences,
  shell,
} from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";

import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import { nativeImage } from "electron";
import { PDFDocument } from "pdf-lib";
import { execSync, spawn } from "node:child_process";

// Get path to bundled Python
function getPythonPath() {
  if (app.isPackaged) {
    // In production, use bundled Python from resources
    const resourcesPath = process.resourcesPath;
    if (process.platform === "darwin") {
      return path.join(resourcesPath, "python", "bin", "python3");
    } else if (process.platform === "win32") {
      return path.join(resourcesPath, "python", "python.exe");
    }
  }
  // In development, use system Python
  return process.platform === "darwin" ? "/opt/homebrew/bin/python3" : "python3";
}

function pressSpacebar() {
  const logPath = path.join(app.getPath("userData"), "spacebar-log.txt");
  const timestamp = new Date().toISOString();

  // Append to log file
  fs.appendFileSync(logPath, `[${timestamp}] --- Spacebar press attempt ---\n`);

  try {
    if (process.platform === "darwin") {
      // Use Python pyautogui - reliable and works with Accessibility permissions
      const pythonScript = "import pyautogui; pyautogui.press('space')";

      fs.appendFileSync(logPath, `[${timestamp}] Using Python pyautogui\n`);

      // Use execSync for immediate execution with bundled Python
      const pythonPath = getPythonPath();
      execSync(`"${pythonPath}" -c "${pythonScript}"`, {
        encoding: "utf-8",
      });

      fs.appendFileSync(logPath, `[${timestamp}] SUCCESS - spacebar pressed\n`);
      console.log("Spacebar pressed successfully via Python");
    } else if (process.platform === "win32") {
      // Windows fallback
      const ps =
        "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(' ')";
      execSync(
        `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${ps}"`,
        { encoding: "utf-8" }
      );
      fs.appendFileSync(logPath, `[${timestamp}] SUCCESS - Windows spacebar\n`);
    }
  } catch (error) {
    fs.appendFileSync(logPath, `[${timestamp}] ERROR: ${error.message}\n`);
    console.error("Spacebar press failed:", error.message);
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
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Request screen capture permission on macOS
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen");
    console.log("Screen capture permission status:", status);

    // Check and request Accessibility permissions for spacebar control
    console.log("Checking Accessibility permissions...");
    const hasAccessibility =
      systemPreferences.isTrustedAccessibilityClient(true);
    console.log("Accessibility permission status:", hasAccessibility);

    const logPath = path.join(app.getPath("userData"), "permissions-log.txt");
    fs.writeFileSync(
      logPath,
      `Screen: ${status}\nAccessibility: ${hasAccessibility}\n`
    );

    if (!hasAccessibility) {
      console.log("⚠️  Accessibility permission NOT granted.");
      console.log("The system should have shown a prompt to grant permission.");
      console.log(
        "If not, go to: System Settings → Privacy & Security → Accessibility"
      );
      console.log("and manually add this app, then restart it.");

      // Show alert to user
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(`
            alert("⚠️ Accessibility Permission Required\\n\\nThis app needs Accessibility permission to press spacebar.\\n\\nPlease:\\n1. Go to System Settings → Privacy & Security → Accessibility\\n2. Add Booker.app to the list\\n3. Restart the app\\n\\nLog file: ${logPath}");
          `);
        }
      }, 1000);
    } else {
      console.log("✓ Accessibility permission granted.");
    }
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

      win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(selectorHTML)}`
      );
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
      mainWindow.webContents.send(
        "selector-error",
        err?.message || String(err)
      );
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
          try {
            w.removeAllListeners("closed");
          } catch {}
          try {
            w.close();
          } catch {}
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

      // wait 2s before next capture
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
ipcMain.on(
  "start-capture-region",
  async (event, numScreenshots, region, interval, key) => {
    console.log(
      `Starting capture of ${numScreenshots} screenshots with region:`,
      region
    );
    console.log(`Interval: ${interval} seconds`);
    console.log(`Key to press: ${key || "space"}`);

    // Default to 2 seconds if interval is invalid
    const delayMs = interval && interval >= 0.5 ? interval * 1000 : 2000;
    // Default to space if key is invalid
    const keyToPress = key || "space";

    // wait 3 seconds for user to prepare/switch windows
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // create screenshots folder in the app directory
    const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Start persistent Python process for faster key presses
    let pythonProcess = null;
    if (process.platform === "darwin") {
      try {
        const pythonScript = `
import sys
import pyautogui
print("READY")
sys.stdout.flush()
for line in sys.stdin:
    line = line.strip()
    if line == "space":
        pyautogui.press("space")
    elif line == "right":
        pyautogui.press("right")
    elif line == "down":
        pyautogui.press("down")
    print("DONE")
    sys.stdout.flush()
`;
        console.log("Spawning persistent Python process...");
        const pythonPath = getPythonPath();
        pythonProcess = spawn(pythonPath, [
          "-c",
          pythonScript,
        ]);

        // Wait for READY signal
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Python spawn timeout")),
            5000
          );
          const listener = (data) => {
            if (data.toString().includes("READY")) {
              clearTimeout(timeout);
              pythonProcess.stdout.off("data", listener);
              resolve();
            }
          };
          pythonProcess.stdout.on("data", listener);
          pythonProcess.stderr.on("data", (data) =>
            console.error("Python stderr:", data.toString())
          );
        });
        console.log("Python process ready.");
      } catch (e) {
        console.error("Failed to spawn Python process:", e);
        pythonProcess = null; // Fallback to execSync
      }
    }

    // loop through and capture each screenshot
    for (let i = 0; i < numScreenshots; i++) {
      try {
        const loopStart = Date.now();

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

        // Trigger key press immediately after capture
        if (pythonProcess) {
          pythonProcess.stdin.write(keyToPress + "\n");
          // We don't await the "DONE" signal here to avoid blocking
          // But we should consume the output to prevent buffer overflow
          pythonProcess.stdout.once("data", () => {});
        } else {
          pressSpacebar();
        }

        // Calculate wait time based on capture time only
        const captureTime = Date.now() - loopStart;
        const waitTime = Math.max(0, delayMs - captureTime);
        console.log(`Capture took ${captureTime}ms. Waiting ${waitTime}ms.`);

        // Start the wait timer concurrently with image processing
        const waitPromise = new Promise((resolve) =>
          setTimeout(resolve, waitTime)
        );

        // Process and save image in parallel
        const savePromise = (async () => {
          // Crop the thumbnail to the selected region
          const croppedImage = thumbnail.crop({
            x: Math.floor(region.x * scaleFactor),
            y: Math.floor(region.y * scaleFactor),
            width: Math.floor(region.width * scaleFactor),
            height: Math.floor(region.height * scaleFactor),
          });

          // Convert to PNG buffer (this is synchronous and might block, but we try)
          const imageBuffer = croppedImage.toPNG();

          // generate filename with timestamp
          const timestamp = Date.now();
          const filename = `screenshot_${i + 1}_${timestamp}.png`;
          const filepath = path.join(screenshotsDir, filename);

          // save the screenshot asynchronously
          await fsPromises.writeFile(filepath, imageBuffer);
          console.log(`Saved: ${filename}`);
        })();

        // Wait for both the interval timer AND the save operation
        await Promise.all([waitPromise, savePromise]);
      } catch (error) {
        console.error("Screenshot error:", error);
      }
    }

    if (pythonProcess) {
      pythonProcess.kill();
    }

    // send completion message back to React
    event.reply("capture-complete", {
      success: true,
      count: numScreenshots,
      folder: screenshotsDir,
    });
  }
);

ipcMain.on("open-screenshot-directory", () => {
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
  shell.openPath(screenshotsDir);
});

ipcMain.on("open-output-directory", () => {
  const outputDir = path.join(app.getPath("userData"), "output");
  shell.openPath(outputDir);
});

ipcMain.on("convert-to-pdf", async (event) => {
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
  const outputDir = path.join(app.getPath("userData"), "output");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs
    .readdirSync(screenshotsDir)
    .filter((file) => file.endsWith(".png"))
    .map((file) => ({
      name: file,
      time: fs.statSync(path.join(screenshotsDir, file)).mtime.getTime(),
    }))
    .sort((a, b) => a.time - b.time)
    .map((file) => file.name);

  if (files.length === 0) {
    event.reply("conversion-complete", {
      success: false,
      error: "No screenshots found.",
    });
    return;
  }

  try {
    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
      const imagePath = path.join(screenshotsDir, file);
      const imageBytes = fs.readFileSync(imagePath);
      const image = await pdfDoc.embedPng(imageBytes);
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    const pdfPath = path.join(outputDir, `booker_${Date.now()}.pdf`);
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);

    event.reply("conversion-complete", { success: true, path: pdfPath });
  } catch (error) {
    console.error("PDF conversion error:", error);
    event.reply("conversion-complete", {
      success: false,
      error: error.message,
    });
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
