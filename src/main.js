import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import screenshot from "screenshot-desktop";
import robot from "robotjs";
import fs from "node:fs";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // create the app window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // load the index.html of the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // open the devtools on lauch
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Listen for screenshot capture requests
ipcMain.on("start-capture", async (event, numScreenshots) => {
  console.log(`Starting capture of ${numScreenshots} screenshots`);

  // Wait 3 seconds for user to prepare/switch windows
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Create screenshots folder in the app directory
  const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Loop through and capture each screenshot
  for (let i = 0; i < numScreenshots; i++) {
    try {
      // Take full screen screenshot
      const img = await screenshot();

      // Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `screenshot_${i + 1}_${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);

      // Save the screenshot
      fs.writeFileSync(filepath, img);
      console.log(`Saved: ${filename}`);

      // Press spacebar
      robot.keyTap("space");

      // Wait 500ms before next capture
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("Screenshot error:", error);
    }
  }

  // Send completion message back to React
  event.reply("capture-complete", {
    success: true,
    count: numScreenshots,
    folder: screenshotsDir,
  });
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
