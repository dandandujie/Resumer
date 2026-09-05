#!/bin/sh
set -eu
mkdir -p public/fonts
cp src-tauri/fonts/*.woff2 public/fonts/
