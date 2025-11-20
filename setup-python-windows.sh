#!/bin/bash
# Run this script on Windows (using Git Bash) to download and setup Python for Windows builds

echo "Downloading Python runtime for Windows..."
mkdir -p resources/python-windows
cd resources/python-windows

# Download Python for Windows
curl -L -o python-windows.tar.gz "https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-pc-windows-msvc-shared-install_only_stripped.tar.gz"

# Extract
tar -xzf python-windows.tar.gz
rm python-windows.tar.gz

# Rename to match our code expectations
mv python ../python-win

cd ../python-win

# Install pyautogui
./python.exe -m pip install pyautogui

echo "✅ Windows Python setup complete!"
echo "Now run: npm run make"
