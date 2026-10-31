// Minimal foreground static file server for the built `dist/` directory.
// Listens on PORT (default 3000) on 0.0.0.0 so the tmux app-server and the
// public cloudflared tunnel can reach it.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2',
};

function safeFile(target) {
  const resolved = path.resolve(target);
  const root = path.resolve(ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) return null;
  return stat.isDirectory() ? path.join(resolved, 'index.html') : resolved;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = safeFile(path.join(ROOT, '.' + decodeURIComponent(url.pathname)));
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const body = fs.readFileSync(file);
    res.end(body);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server listening on http://0.0.0.0:${PORT} (serving ${ROOT})`);
});
