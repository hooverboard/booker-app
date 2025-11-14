import { useState, useEffect, useRef } from "react";
import React from "react";
import "./Home.css";

const Home = () => {
  const [screenshotNum, setScreenshotNum] = useState("5");
  const [isCapturing, setIsCapturing] = useState(false);

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
        window.electronAPI.startCaptureWithRegion(num, region);
      }
    };

    window.electronAPI.onCaptureComplete(handleCaptureComplete);
    window.electronAPI.onRegionSelected?.(handleRegionSelected);
    window.electronAPI.onSelectorError?.((message) => {
      alert(`Selector failed to open: ${message}`);
    });

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
      alert("Must enter a valid number");
      return;
    }
    window.electronAPI.openRegionSelector?.();
  };

  return (
    <div className="home-container">
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
    </div>
  );
};

export default Home;
