// 로컬 테스트용 정적 서버.  실행: node serve.js        (같은 Wi-Fi 기기에서 보려면: node serve.js --lan)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, 'docs');
const PORT = Number(process.env.PORT) || 5180;
const HOST = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`가계부 서버: http://localhost:${PORT}/`);
    if (HOST === '0.0.0.0') {
      for (const list of Object.values(os.networkInterfaces()))
        for (const a of list || [])
          if (a.family === 'IPv4' && !a.internal) console.log(`  같은 네트워크: http://${a.address}:${PORT}/`);
    }
  });
