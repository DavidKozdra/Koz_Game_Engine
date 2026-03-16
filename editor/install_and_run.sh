#!/bin/bash

APPIMAGE="./dist/Koz Engine-0.1.0.AppImage"

if [ ! -f "$APPIMAGE" ]; then
    echo "AppImage not found: $APPIMAGE"
    exit 1
fi

chmod +x "$APPIMAGE"

if [ ! -d "squashfs-root" ]; then
    echo "Extracting AppImage..."
    ./"$APPIMAGE" --appimage-extract
fi

echo "Running Koz Engine..."
cd squashfs-root && ./koz-engine-editor