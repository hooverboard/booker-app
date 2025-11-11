import { useState } from "react";
import React from "react";
import "./Home.css";

const Home = () => {
  const [screenshotNum, setScreenshotNum] = useState("");

  return (
    <div className="home-container">
      <h1>Booker</h1>

      <label>Number of screenshots</label>
      <input
        type="text"
        name="screenshotNum"
        value={screenshotNum}
        onChange={(e) => setScreenshotNum(e.target.value)}
      />
      <button>Start</button>
    </div>
  );
};

export default Home;
