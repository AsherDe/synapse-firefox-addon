const fs = require('fs');
const path = require('path');

// After TypeScript compilation, rename background-combined.js to background.js
const srcPath = path.join(__dirname, 'dist', 'background-combined.js');
const destPath = path.join(__dirname, 'dist', 'background.js');

if (fs.existsSync(srcPath)) {
  fs.renameSync(srcPath, destPath);
  console.log('Renamed background-combined.js to background.js');
} else {
  console.error('background-combined.js not found in dist folder');
}