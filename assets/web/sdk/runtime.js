// SPDX-License-Identifier: GPL-3.0-or-later
// CarView theme runtime. Loads the active theme module and vehicle module inside the sandboxed scene frame,
// runs the ~30 fps frame loop and relays messages to/from the dashboard (see THEMES.md for the contract).

const cfg = JSON.parse(decodeURIComponent(location.hash.slice(1) || '{}'));
// cfg = { theme: { url, base, manifest }, vehicle: { url, base, manifest } | null }

const canvas = document.getElementById('c');
let instance = null;
let state = {};
let errorsSent = 0;

function post(msg) { parent.postMessage(Object.assign({ carview: 1 }, msg), '*'); }
function fail(where, e) {
  if (errorsSent++ > 3) return;
  console.error('[carview ' + where + ']', e);
  post({ type: 'error', where, message: String((e && (e.stack || e.message)) || e).slice(0, 600) });
}

window.addEventListener('message', (e) => {
  if (e.source !== parent) return;
  const m = e.data || {};
  if (m.type === 'state') state = m.state || {};
  else if (m.type === 'vehicle') loadVehicle(m.vehicle);
});

async function loadVehicle(v) {
  if (!instance || !v) return;
  try {
    const mod = await import(v.url);
    await instance.setVehicle(mod, v.manifest || {}, v.base);
    post({ type: 'vehicleReady', id: v.manifest && v.manifest.id });
  } catch (e) { fail('vehicle', e); }
}

let last = 0, lastRect = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (now - last < 33) return;                           // ~30 fps: smooth enough, kind to the head unit
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  try { instance.frame(dt, state); } catch (e) { fail('frame', e); }
  if (instance.vehicleRect && now - lastRect > 400) {   // where the vehicle is, so tapping it can switch vehicles
    lastRect = now;
    try { post({ type: 'vehicleRect', rect: instance.vehicleRect() || null }); } catch (e) { /* ignore */ }
  }
}

(async function main() {
  try {
    const mod = await import(cfg.theme.url);
    const theme = mod.default || mod;
    instance = await theme.create(canvas, { manifest: cfg.theme.manifest || {}, base: cfg.theme.base });
    if (cfg.vehicle) await loadVehicle(cfg.vehicle);
    post({ type: 'ready' });
    requestAnimationFrame(loop);
  } catch (e) { fail('theme', e); }
})();
