#!/bin/bash
cd "$(dirname "$0")"

echo "Building @calc-uil/keypad..."
npm run build --silent || exit 1

echo "Starting Server at http://localhost:8000/demo/ ..."
python3 -m http.server 8000
