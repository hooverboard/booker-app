# Booker

A  screenshot automation tool that captures specified screen region and converts it to PDF

I made this app to be used to convert eBooks into PDF files, specifically for bypassing DRM lock and
being able to read the book you purchased in any way, anywhere.

This is great for people who may have sensitive eyes and prefer to read a physical copy instead.

Features

- 📸 Region Selection - Select any area of your screen to capture
- ⏱️ Custom Intervals - Set screenshot intervals
- ⌨️ Keyboard Automation - Automatically press Space, Right Arrow, or Down Arrow between captures to go to next page
- 🖼️ Batch Capture - Take multiple screenshots in sequence
- 📄 PDF Export - Convert all screenshots to a single PDF document

## Download

### Latest Release

Download the latest version for your platform:
- Mac OS (Sillicon) - https://www.dropbox.com/scl/fi/9ujoho3jadzw6ik8peqth/booker-darwin-arm64-1.0.0.zip?rlkey=sc23awhwc7tr7oqq8ljtnw0hi&dl=1
  

All dependencies including Python are bundled

Installation

macOS
1. Download `booker-macos.zip`
2. Extract the archive
3. Move `Booker.app` to your Applications folder
4. First launch:** Right-click → Open (to bypass Gatekeeper security)
5. Grant permissions when prompted:
   - **Screen Recording** - Required to capture screenshots
   - **Accessibility** - Required for keyboard automation



## Usage

1. **Set Number of Screenshots** - Enter how many screenshots you want to capture
2. **Set Interval** - Choose the time between each screenshot (minimum 0.5 seconds, I found that on the first try after running the app it usually takes around 1 second even if its set to 0.5, but if you attempt a second time it should work at specified speed)
3. **Select Key** - Choose which key to press between screenshots:
   - Spacebar (default)
   - Right Arrow
   - Down Arrow
4. **Click Start** - The app will prompt you to select a screen region
5. **Select Region** - Click and drag to select the area you want to capture
6. **Automatic Capture** - Will capture screenshots at your specified interval (make sure you click on the program that you want to receive the button input after selecting the region)

## Screenshots Saved To

-  `~/Library/Application Support/booker/screenshots/`


### macOS: Permissions not working
- Go to System Settings → Privacy & Security
- Grant **Screen Recording** permission
- Grant **Accessibility** permission
- Restart the app

## Building from Source

### Prerequisites
- Node.js 20+
- Git

### Clone and Build
```bash
git clone https://github.com/hooverboard/booker-app.git
cd booker-app
npm install
npm run make
```

Built apps will be in `out/make/`

## Technology Stack

- Electron, React, Vite, Python

## Author

**Hever Boechat**
- Email: heveritosouza@gmail.com
- GitHub: [@hooverboard](https://github.com/hooverboard)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Changelog

### Version 1.0.0
- Initial release
- Region-based screenshot capture
- Custom interval support
- Keyboard automation (Space, Right, Down arrows)
- PDF export
- Dark mode
- Cross-platform support (macOS, Windows, Linux)


