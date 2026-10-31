// Build step: copy static source (src/) into the built output directory (dist/)
// inside PROJECT_DIR. Kept dependency-free so `npm install` is a fast no-op and
// the project works offline.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(SRC, DIST);
console.log(`Built static output: ${DIST}`);
