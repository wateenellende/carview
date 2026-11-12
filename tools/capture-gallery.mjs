// SPDX-License-Identifier: GPL-3.0-or-later
// Chrome DevTools screenshot smoke test: wait for all 8 rendered thumbnails,
// instead of using --virtual-time-budget (which doesn't await WebGL compilation).
// Node 22, no npm packages required.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../assets/web/', import.meta.url)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = resolve(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1));
  if (!p.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(p);
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*',
      'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (_) { res.writeHead(404); res.end(); }
});
const listen = () => new Promise((res, rej) => {
  server.once('error', rej);
  server.listen(0, '127.0.0.1', res);
});

let chrome, socket, profile, stderr = '';
let sequence = 0;
const pending = new Map();
function onMessage(event) {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const entry = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message || JSON.stringify(message.error)));
  else entry.resolve(message.result || {});
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function launch() {
  profile = await mkdtemp(join(tmpdir(), 'carview-chrome-'));
  chrome = spawn(process.env.CHROME || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--window-size=1480,920', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', b => { stderr = (stderr + String(b)).slice(-12000); });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(portFile); i++) await wait(100);
  if (!existsSync(portFile)) throw new Error('Chrome did not start debugger: ' + stderr);
  const port = Number((await readFile(portFile, 'utf8')).split('\n')[0]);
  let pages = [];
  for (let i = 0; i < 60; i++) {
    try {
      pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      if (pages.some(t => t.type === 'page')) break;
    } catch (_) { /* debugger starting */ }
    await wait(100);
  }
  const target = pages.find(t => t.type === 'page');
  if (!target) throw new Error('Chrome has no page target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.addEventListener('open', res, { once: true });
    socket.addEventListener('error', rej, { once: true });
  });
  socket.addEventListener('message', onMessage);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',
    { width: 1480, height: 920, deviceScaleFactor: 1, mobile: false });
}
async function gallery(family, port, paint = null) {
  const expected = 8; // six new variants plus two existing in each theme
  const url = 'http://127.0.0.1:' + port + '/vehicle-gallery.html?family=' + family +
    (paint ? '&paint=' + encodeURIComponent(paint) : '');
  await cdp('Page.navigate', { url });
  let rendered = 0, errors = [], current = '';
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const response = await cdp('Runtime.evaluate', {
        expression: `({ family: new URLSearchParams(location.search).get('family'),
          rendered: Number(document.body.dataset.rendered || 0),
          errors: [...document.querySelectorAll('[data-error]')].map(x => x.dataset.error) })`,
        returnByValue: true
      });
      const state = response.result?.value;
      if (state?.family === family) {
        current = state.family; rendered = state.rendered; errors = state.errors;
        if (rendered >= expected || errors.length) break;
      }
    } catch (_) { /* navigation or frame still starting */ }
    await wait(250);
  }
  if (rendered !== expected || errors.length) {
    throw new Error(family + ': ' + rendered + '/' + expected + ' ready, errors: ' +
      errors.join('; ') + ', location: ' + current + '\n' + stderr.slice(-1500));
  }
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const file = join('preview-artifacts', family + (paint ? '-recoloured' : '') + '.png');
  await writeFile(file, Buffer.from(screenshot.data, 'base64'));
  console.log('OK: ' + expected + ' rendered ' + family + ' thumbnails captured in ' + file);
  const first = await cdp('Runtime.evaluate', {
    expression: 'document.querySelector("#gallery .tile img")?.src || ""',
    returnByValue: true
  });
  return first.result?.value || '';
}
try {
  await listen();
  await mkdir('preview-artifacts', { recursive: true });
  await launch();
  const port = server.address().port;
  const normal = await gallery('three-pbr', port);
  const recoloured = await gallery('three-pbr', port, '#f3f3f3');
  if (!normal.startsWith('data:image/png;') || !recoloured.startsWith('data:image/png;') ||
      normal === recoloured) throw new Error('Changing selected paint did not change the model thumbnail');
  console.log('OK: Modern vehicle thumbnail actually changes when paint colour changes');
  await gallery('pixel-16bit', port);
} finally {
  socket?.close();
  chrome?.kill('SIGTERM');
  server.close();
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
