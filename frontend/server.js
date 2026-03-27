const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 5500);
const HOLD_SECONDS = Number(process.env.PAYMENT_HOLD_SECONDS || 120);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function buildRuntimeConfig() {
  const apiBase = String(process.env.FRONTEND_API_BASE || '').trim().replace(/\/$/, '');
  return `window.RUNTIME_CONFIG = ${JSON.stringify(
    {
      API_BASE: apiBase,
      PAYMENT_HOLD_SECONDS: HOLD_SECONDS,
      MPESA_ENABLED: String(process.env.MPESA_ENABLED || 'false').trim().toLowerCase() === 'true',
    },
    null,
    2
  )};\n`;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, content, contentType) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': contentType.includes('javascript') ? 'no-store' : 'public, max-age=300',
  });
  res.end(content);
}

function resolveFilePath(requestPath) {
  const trimmed = requestPath.replace(/^\/+/, '');
  const rawPath = trimmed || 'index.html';
  const normalized = path.normalize(path.join(ROOT_DIR, rawPath));
  if (!normalized.startsWith(ROOT_DIR)) {
    return null;
  }
  return normalized;
}

function tryAlternateHtml(filePath) {
  if (path.extname(filePath)) {
    return filePath;
  }
  return `${filePath}.html`;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'frontend', time: new Date().toISOString() });
    return;
  }

  if (url.pathname === '/assets/js/runtime-config.js') {
    sendText(res, 200, buildRuntimeConfig(), 'application/javascript; charset=utf-8');
    return;
  }

  let filePath = resolveFilePath(url.pathname);
  if (!filePath) {
    sendText(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      serveFile(res, filePath);
      return;
    }

    if (!err && stats.isFile()) {
      serveFile(res, filePath);
      return;
    }

    const htmlFallback = tryAlternateHtml(filePath);
    if (htmlFallback !== filePath) {
      fs.stat(htmlFallback, (fallbackErr, fallbackStats) => {
        if (!fallbackErr && fallbackStats.isFile()) {
          serveFile(res, htmlFallback);
          return;
        }
        sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
      });
      return;
    }

    sendText(res, 404, 'Not found', 'text/plain; charset=utf-8');
  });
});

server.listen(PORT, () => {
  const appUrl = `http://localhost:${PORT}`;
  const healthUrl = `${appUrl}/health`;
  // eslint-disable-next-line no-console
  console.log(`Frontend server running on ${appUrl}`);
  // eslint-disable-next-line no-console
  console.log(`Open: ${appUrl}`);
  // eslint-disable-next-line no-console
  console.log(`Health: ${healthUrl}`);
});
