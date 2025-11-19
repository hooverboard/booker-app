import { useState, useEffect, useRef } from "react";
import React from "react";
import "./Home.css";

const Home = () => {
  const [screenshotNum, setScreenshotNum] = useState("5");
  const [interval, setInterval] = useState("2");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  //listen for response
  useEffect(() => {
    const handleCaptureComplete = (event, result) => {
      setIsCapturing(false);
      alert(`Captured ${result.count} screenshots`);
    };

    const handleRegionSelected = (region) => {
      if (region) {
        setIsCapturing(true);
        const num = parseInt(screenshotNum);
        const intervalSeconds = parseFloat(interval);
        window.electronAPI.startCaptureWithRegion(num, region, intervalSeconds);
      }
    };

    const handleConversionComplete = (event, result) => {
      setIsConverting(false);
      alert(`PDF saved to ${result.path}`);
    };

    window.electronAPI.onCaptureComplete(handleCaptureComplete);
    window.electronAPI.onRegionSelected?.(handleRegionSelected);
    window.electronAPI.onSelectorError?.((message) => {
      alert(`Selector failed to open: ${message}`);
    });
    window.electronAPI.onConversionComplete?.(handleConversionComplete);

    // Check macOS screen permission (no extra UI elements, just alert once if missing)
    (async () => {
      const status = await window.electronAPI.getScreenPermissionStatus?.();
      if (status && status !== "granted") {
        alert(
          "Screen Recording permission is not granted. Full window contents cannot be captured.\n\nGo to System Settings → Privacy & Security → Screen Recording and enable permission for the packaged Booker app. Then restart it."
        );
      }
    })();

    // Cleanup function is not needed for IPC listeners as they persist
  }, [screenshotNum]);

  // handle start button - open fullscreen region selector
  const handleStart = () => {
    const num = parseInt(screenshotNum);
    if (isNaN(num) || num < 1) {
      alert("Must enter a valid number of screenshots");
      return;
    }
    const intervalSeconds = parseFloat(interval);
    if (isNaN(intervalSeconds) || intervalSeconds < 0.5) {
      alert("Interval must be at least 0.5 seconds");
      return;
    }
    window.electronAPI.openRegionSelector?.();
  };

  const handleConvertToPdf = () => {
    setIsConverting(true);
    window.electronAPI.convertToPdf();
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div className={`home-container ${isDarkMode ? "dark-mode" : ""}`}>
      <button
        className="open-screenshots-button"
        onClick={() => window.electronAPI.openScreenshotDirectory()}
      >
        Screenshots Folder
      </button>
      <button
        className="convert-to-pdf-button"
        onClick={handleConvertToPdf}
        disabled={isConverting}
      >
        {isConverting ? "Converting..." : "Convert Screenshots to PDF"}
      </button>
      <button className="dark-mode-toggle" onClick={toggleDarkMode}>
        {isDarkMode ? "Light Mode" : "Dark Mode"}
      </button>
      <button
        className="open-output-button"
        onClick={() => window.electronAPI.openOutputDirectory()}
      >
        Open Output Folder
      </button>
      <h1>Booker</h1>

      <label>Number of screenshots</label>
      <input
        type="text"
        name="screenshotNum"
        value={screenshotNum}
        onChange={(e) => setScreenshotNum(e.target.value)}
        disabled={isCapturing}
      />
      <button onClick={handleStart} disabled={isCapturing}>
        {isCapturing ? "Capturing..." : "Start"}
      </button>

      <div className="interval-input-container">
        <label>Interval (seconds)</label>
        <input
          type="number"
          className="interval-input"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          disabled={isCapturing}
          min="0.5"
          step="0.1"
        />
      </div>
    </div>
  );
};

export default Home;
