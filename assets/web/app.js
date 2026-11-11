'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/* CarView dashboard: the HUD panels plus the theme/vehicle package manager. The scene itself is drawn by the
   active theme in a sandboxed frame (sdk/). Data arrives from Android via onCar(type, data). */

const $ = (id) => document.getElementById(id);
const Native = window.Car || null;
// Every bridge call carries the key the Android app put in this page (themes in frames never get it).
const BRIDGE_TOKEN = (() => {
  const m = document.querySelector('meta[name="carview-token"]');
  const token = m ? m.content : '';
  if (m) m.remove();
  return token;
})();
function call(fn, ...args) {
  const N = window.Car;
  try { if (N && typeof N[fn] === 'function') return N[fn](BRIDGE_TOKEN, ...args); } catch (e) { console.log(e); }
  return undefined;
}

// ------------------------------------------------------------------ settings
const COLOURS = [
  ['DARK BLUE', '#1f3a6e'], ['SILVER', '#8e9bb3'], ['BLACK', '#2a2d34'], ['WHITE', '#e4e4de'],
  ['RED', '#b3262f'], ['GREEN', '#2f6b45'], ['ORANGE', '#d9772b'], ['GREY', '#5b6270'],
];
const cfg = Object.assign({
  theme: 'modern',
  colour: '#1f3a6e',
  sky: 'auto',
}, JSON.parse(localStorage.getItem('carview') || '{}'));
function saveCfg() { localStorage.setItem('carview', JSON.stringify(cfg)); }

// ------------------------------------------------------------------ live state
const car = {
  speed: 0, shownSpeed: 0, bearing: null, used: null, visible: null, temp: null,
  lights: null, media: {}, mediaAt: 0, nav: null, access: {},
  doors: { frontLeft: false, rearLeft: false, frontRight: false, rearRight: false, tailgate: false },
};

function skyMode() {
  let m;
  if (cfg.sky === 'dusk') m = 'dusk';
  else if (car.temp && car.temp.day === false) m = 'night';
  else {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    m = (h >= 8.5 && h < 16) ? 'day' : ((h >= 16 && h < 17.5) || (h >= 7.5 && h < 8.5)) ? 'dusk' : 'night';
  }
  // headlights on in daylight (rain, tunnel): make it gloomy, not pitch dark
  if (car.lights === true) m = m === 'day' ? 'dusk' : 'night';
  return m;
}

const DOOR_LABEL = { frontLeft: 'Driver door', rearLeft: 'Rear left door', frontRight: 'Passenger door', rearRight: 'Rear right door', tailgate: 'Tailgate' };
function openParts() { return Object.keys(car.doors).filter((k) => car.doors[k]); }
function doorWarning() {
  const open = openParts();
  if (!open.length) return '';
  if (open.length === 1) return DOOR_LABEL[open[0]] + ' open';
  const n = open.filter((k) => k !== 'tailgate').length, tg = car.doors.tailgate;
  if (!n) return 'Tailgate open';
  return n + (n === 1 ? ' door' : ' doors') + (tg ? ' and tailgate' : '') + ' open';
}

// ------------------------------------------------------------------ themes and vehicles (packages)
// Built-in packages come from packages.js, installed ones from Android (Car.packages()). The theme draws the
// scene inside the sandboxed #scene frame. Vehicles belong to a family (three-pbr, pixel-16bit, ...) and only
// appear in themes of the same family. See THEMES.md.
let packages = [];
function loadPackages() {
  let user = [];
  try { user = JSON.parse(call('packages') || '[]'); } catch (e) { user = []; }
  const byKey = new Map();
  for (const p of (window.CARVIEW_BUILTIN || []).map((b) => Object.assign({ builtin: true }, b)).concat(user)) {
    if (p && p.manifest && p.manifest.id) byKey.set(p.manifest.type + ':' + p.manifest.id, p);   // installed copy wins
  }
  packages = [...byKey.values()];
}
const themes = () => packages.filter((p) => p.manifest.type === 'theme');
const vehiclesFor = (t) => (t ? packages.filter((p) => p.manifest.type === 'vehicle' && p.manifest.family === t.manifest.family) : []);
function currentTheme() {
  const all = themes();
  return all.find((p) => p.manifest.id === cfg.theme) || all.find((p) => p.manifest.id === 'modern') || all[0] || null;
}
function currentVehicle(t) {
  const list = vehiclesFor(t);
  cfg.vehicles = cfg.vehicles || {};
  return list.find((v) => v.manifest.id === cfg.vehicles[t.manifest.id])
    || list.find((v) => v.manifest.id === t.manifest.defaultVehicle) || list[0] || null;
}
function vehicleColour(v) {
  cfg.vcolour = cfg.vcolour || {};
  return (v && cfg.vcolour[v.manifest.id]) || (v && v.manifest.defaultColour) || cfg.colour;
}
// The scene frame is sealed (sandboxed) on the head unit. A desktop preview from disk can't load modules into a
// sealed frame, and some preview browsers can't either: ?nosandbox=1 is for previews only (the app never sets it).
const SANDBOX = location.protocol !== 'file:' && !(location.hostname === '127.0.0.1' && /[?&]nosandbox=1/.test(location.search));
const urlOf = (p, file) => '../' + p.base + file;     // relative to sdk/scene.html
const vehicleMsg = (v) => (v ? { url: urlOf(v, v.manifest.entry), base: v.base, manifest: v.manifest } : null);
let hud = {}, vehicleRect = null;
const themeFailed = {};

function sendScene(msg) { const w = $('scene').contentWindow; if (w) w.postMessage(msg, '*'); }

function applyTheme() {
  loadPackages();
  const t = currentTheme();
  if (!t) return;
  const m = t.manifest;
  hud = m.hud || {};
  document.body.className = 'theme-' + m.id + ' family-' + m.family;
  $('theme-css').href = m.style ? t.base + m.style : '';
  const conf = { theme: { url: urlOf(t, m.entry), base: t.base, manifest: m }, vehicle: vehicleMsg(currentVehicle(t)) };
  const f = $('scene');
  if (SANDBOX) f.setAttribute('sandbox', 'allow-scripts'); else f.removeAttribute('sandbox');
  vehicleRect = null;
  f.src = 'sdk/scene.html?t=' + Date.now() + '#' + encodeURIComponent(JSON.stringify(conf));
  renderStatus(); renderMedia(); renderNav();
}

function nextVehicle() {
  const t = currentTheme();
  const list = vehiclesFor(t);
  if (list.length < 2) { toast('This theme has one vehicle'); return; }
  const v = list[(list.indexOf(currentVehicle(t)) + 1) % list.length];
  cfg.vehicles[t.manifest.id] = v.manifest.id; saveCfg();
  vehicleRect = null;
  sendScene({ type: 'vehicle', vehicle: vehicleMsg(v) });
  toast(v.manifest.name);
}

window.addEventListener('message', (e) => {
  if (e.source !== $('scene').contentWindow) return;
  const m = e.data || {};
  if (!m.carview) return;
  if (!SANDBOX) document.body.dataset.scene = ((document.body.dataset.scene || '') + ' ' + m.type + (m.message ? ':' + m.message.slice(0, 160) : '')).slice(-600);   // desktop preview: record for debugging
  if (m.type === 'vehicleRect') vehicleRect = m.rect;
  else if (m.type === 'error') {
    console.log('scene error (' + m.where + '): ' + m.message);
    if (m.where === 'theme' && !themeFailed[cfg.theme] && cfg.theme !== 'retro') {
      themeFailed[cfg.theme] = true;                // e.g. no WebGL: fall back to Retro for this session
      toast('Theme could not start, using Retro');
      cfg.theme = 'retro'; applyTheme();
    } else if (m.where === 'vehicle') toast('That vehicle could not be loaded');
  }
});

// tap on the vehicle = next vehicle of this theme
$('tapLayer').addEventListener('click', (e) => {
  const r = vehicleRect, pad = 14;
  if (r && e.clientX >= r.x - pad && e.clientX <= r.x + r.w + pad && e.clientY >= r.y - pad && e.clientY <= r.y + r.h + pad) nextVehicle();
});

// ------------------------------------------------------------------ turns (road bends in the scene)
// Upcoming turn: distance from Google Maps' text ("300 m", "1,2 km") and direction read from its arrow picture
// (Maps rarely says "left"/"right" in words). Real turning: rate of change of the GPS heading.
// A steering-wheel angle from the CAN box would take priority (state.steer), but most cars don't provide one.
const turn = { distance: null, at: 0, dir: 0, amount: 0, iconKey: null, rate: 0, lastBearing: null, lastAt: 0 };

function parseDistance(s) {
  const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*(km|m|mi|ft|yd)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return n * ({ km: 1000, m: 1, mi: 1609.34, ft: 0.3048, yd: 0.9144 })[m[2].toLowerCase()];
}

function wordsDirection(text) {
  const t = String(text || '').toLowerCase();
  const dir = /\b(left|links|linksaf)\b/.test(t) ? -1 : /\b(right|rechts|rechtsaf)\b/.test(t) ? 1 : 0;
  if (!dir) return null;
  return { dir, amount: /\b(slight|keep|flauwe|aanhouden|houd)\b/.test(t) ? 0.35 : /\bsharp|scherp/.test(t) ? 1 : 0.7 };
}

/** Which way does Maps' arrow point? Looks where the arrow head (top part of the picture) sits. */
function classifyArrow(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const N = 24, c = document.createElement('canvas'); c.width = c.height = N;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, N, N);
        const px = g.getImageData(0, 0, N, N).data;
        const at = (x, y) => (y * N + x) * 4;
        const lum = (i) => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
        const opaque = px[at(0, 0) + 3] > 200;               // arrow on a solid background: compare with the corner
        const bg = lum(at(0, 0));
        const w = (x, y) => { const i = at(x, y); return opaque ? Math.abs(lum(i) - bg) / 255 : px[i + 3] / 255; };
        const centroid = (y0, y1) => {
          let s = 0, sx = 0, minX = N, maxX = -1;
          for (let y = y0; y < y1; y++) for (let x = 0; x < N; x++) { const v = w(x, y); if (v > 0.3) { s += v; sx += v * x; minX = Math.min(minX, x); maxX = Math.max(maxX, x); } }
          return s ? { cx: sx / s / (N - 1), spread: (maxX - minX) / (N - 1) } : null;
        };
        const top = centroid(0, Math.round(N * 0.42)), bottom = centroid(Math.round(N * 0.58), N);
        if (!top) return resolve(null);
        const dx = top.cx - 0.5;
        if (top.spread > 0.55 && Math.abs(dx) < 0.1 && bottom) {   // a U shape: U-turn, head on the heavier side
          return resolve({ dir: bottom.cx < 0.5 ? -1 : 1, amount: 1, uturn: true });
        }
        if (Math.abs(dx) < 0.07) return resolve({ dir: 0, amount: 0 });
        resolve({ dir: Math.sign(dx), amount: Math.max(0.3, Math.min(1, (Math.abs(dx) - 0.04) * 4)) });
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function updateNavTurn(n) {
  if (!n) { turn.distance = null; turn.dir = 0; turn.amount = 0; turn.iconKey = null; return; }
  const d = parseDistance(n.title) ?? parseDistance(n.text);
  if (d != null) { turn.distance = d; turn.at = performance.now(); }
  const words = wordsDirection(n.title + ' ' + n.text);
  if (words) { turn.dir = words.dir; turn.amount = words.amount; return; }
  if (n.icon && n.icon !== turn.iconKey) {
    turn.iconKey = n.icon;
    classifyArrow(n.icon).then((r) => { if (r && turn.iconKey === n.icon) { turn.dir = r.dir; turn.amount = r.amount; } });
  }
}

function updateTurnRate(bearing) {
  const now = performance.now();
  if (bearing == null || car.speed < 8) { turn.rate *= 0.5; turn.lastBearing = null; return; }
  if (turn.lastBearing != null && now > turn.lastAt) {
    const delta = ((bearing - turn.lastBearing + 540) % 360) - 180;          // degrees, + = turning right
    const rate = Math.max(-45, Math.min(45, delta / ((now - turn.lastAt) / 1000)));
    turn.rate = turn.rate * 0.55 + rate * 0.45;                              // smooth out GPS jitter
  }
  turn.lastBearing = bearing; turn.lastAt = now;
}

/** Navigation info for themes, with the distance counted down from the speed between Maps updates. */
function navState() {
  if (!car.nav) return null;
  let distance = turn.distance;
  if (distance != null) distance = Math.max(0, distance - (car.speed / 3.6) * (performance.now() - turn.at) / 1000);
  if (window.DEMO_DIST != null) distance = window.DEMO_DIST;          // desktop preview only
  return { distance, dir: turn.dir, amount: turn.amount, street: car.nav.text || '' };
}

function sceneState() {
  const t = currentTheme();
  return {
    speed: car.speed, lights: car.lights, doors: car.doors, nav: navState(), sky: skyMode(), openView: openView(),
    wx: weather(), colour: vehicleColour(t && currentVehicle(t)), bearing: car.bearing,
    turnRate: window.DEMO_RATE != null ? window.DEMO_RATE : turn.rate, steer: null,
  };
}

function openView() { return car.speed < 3 && openParts().length > 0; }

let lastFrame = 0, lastPush = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastFrame = 0; return; }        // Maps/Spotify in front: nothing to update
  if (now - lastFrame < 33) return;
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (now - lastPush > 100) { lastPush = now; sendScene({ type: 'state', state: sceneState() }); }   // 10x a second is plenty
  tickCompass(dt);
  document.body.classList.toggle('open', openView());
  car.shownSpeed += (car.speed - car.shownSpeed) * Math.min(1, dt * 5);
  const pad = hud.speedPad || 0;
  $('speed').textContent = !car.speedKnown ? '-'.repeat(Math.max(2, pad)) : String(Math.round(car.shownSpeed)).padStart(pad, '0');
  tickMusicBar();
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ HUD
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function renderStatus() {
  $('sat').textContent = (car.used == null ? '--' : car.used) + (car.used === 1 ? ' satellite' : ' satellites');
  $('dir').textContent = car.bearing == null ? '--' : COMPASS[Math.round(car.bearing / 45) % 8];
  $('temp').innerHTML = (car.temp ? Math.round(car.temp.c) : '--') + '&deg;C';
  $('wx').textContent = wxIcon(weather());
  $('wx').hidden = !$('wx').textContent;
  const l = $('lights');
  l.textContent = 'Lights ' + (car.lights == null ? '--' : car.lights ? 'on' : 'off');
  l.className = car.lights ? 'on' : 'off';
  const w = doorWarning();
  $('warn').hidden = !w;
  if (w) $('warn').textContent = (hud.warnIcon ? '⚠ ' : '') + w;
}

// Destination tiles: Home and Work come straight from Google Maps (its own saved places), the third asks by voice.
function renderDests() { /* labels are fixed in index.html */ }

function goHome() { toast('Driving home'); call('mapsPlace', 'home'); }
function goWork() { toast('Driving to work'); call('mapsPlace', 'work'); }
function goTo(place) { toast('Driving to ' + place); call('navigate', place); }

// ------------------------------------------------------------------ voice commands
// Speech-to-text happens on Android; here we decide what the words mean. English + a little Dutch.
let voiceMode = null;            // 'nav' when the "Where to?" tile asked, so any answer is a place
function listen(mode) { voiceMode = mode || null; call('assistant'); }

const HOME_WORDS = /^(?:my )?(?:home|house|huis|thuis|naar huis)$/;
const WORK_WORDS = /^(?:my )?(?:work|the office|office|werk|kantoor|mijn werk)$/;

function navigateTo(place) {
  place = place.replace(/^(?:the |de |het )/, '').trim();
  if (HOME_WORDS.test(place)) return goHome();
  if (WORK_WORDS.test(place)) return goWork();
  goTo(place);
}

function voiceCommand(said) {
  const raw = String(said || '').trim();
  const t = raw.toLowerCase().replace(/[.!?]+$/, '').replace(/^(?:hey google|ok google|okay google|please)[, ]*/, '');
  const mode = voiceMode; voiceMode = null;
  if (!t) return;
  if (mode === 'nav') return navigateTo(t.replace(/^(?:to|naar|navigate to|drive to)\s+/, ''));
  let m;
  if (/^(?:stop|end|cancel|exit) (?:navigation|navigating|route|the route)$|^stop navigeren$/.test(t)) return stopNav();
  m = t.match(/^(?:call|phone|ring|dial|bel|bellen)\s+(?:to\s+|naar\s+)?(.+)$/);
  if (m) return callByVoice(raw.replace(/^\s*(?:hey google|ok google|okay google|please)[, ]*/i, '').replace(/^\S+\s+(?:to\s+|naar\s+)?/i, '').replace(/[.!?]+$/, ''));
  // music controls
  if (/^(?:next|skip|next song|next track|volgende|volgend nummer)$/.test(t)) { toast('Next song'); return call('next'); }
  if (/^(?:previous|back|previous song|vorige|vorig nummer)$/.test(t)) { toast('Previous song'); return call('prev'); }
  if (/^(?:pause|stop|stop the music|stop music|pauze|stop muziek)$/.test(t)) { toast('Paused'); return call('pause'); }
  if (/^(?:play|resume|continue|play music|speel|verder|muziek)$/.test(t)) { toast('Playing'); return call('play'); }
  // navigation: "navigate to X", "take me home", "drive to X", "directions to X", "rijd naar X", "navigeer naar X"
  m = t.match(/^(?:navigate|navigation|drive|directions|route|take me|bring me|get me|go|navigeer|rijd|breng me|ga)\s+(?:me\s+)?(?:to|naar)?\s*(.+)$/);
  if (m) return navigateTo(m[1]);
  if (HOME_WORDS.test(t) || t === 'go home') return goHome();
  // music: "play X", "play X on Spotify", "put on X", "speel X", "zet X op"
  m = t.match(/^(?:play|put on|listen to|speel|zet)\s+(?:some\s+|iets van\s+|wat\s+)?(.+?)(?:\s+(?:on|op)\s+spotify)?(?:\s+(?:af|op))?$/);
  if (m) { toast('Searching Spotify for ' + m[1] + ' (tap to play)'); return call('playSearch', m[1]); }
  // anything else: ordinary Google search
  toast('Searching Google'); call('webSearch', raw);
}

function renderNav() {
  const n = car.nav;
  document.body.classList.toggle('nav', !!n);
  $('dests').hidden = !!n;
  $('turn').hidden = !n;
  if (!n) return;
  $('turnDist').textContent = n.title || '';
  $('turnStreet').textContent = n.text || '';
  $('turnSub').textContent = n.sub || '';
  const icon = $('turnIcon');
  if (n.icon) { icon.src = n.icon; icon.hidden = false; } else icon.hidden = true;
  $('turnArrow').hidden = !!n.icon;
}

function renderMedia() {
  const m = car.media || {};
  const has = !!(m.title || m.artist);
  $('musicApp').textContent = m.app && m.app !== 'com.spotify.music' ? 'Music' : 'Spotify';
  $('title').textContent = has ? m.title : 'Nothing playing';
  $('artist').textContent = has ? (m.artist || '') : 'Tap play or say Hey Google';
  document.body.classList.toggle('hasArt', !!m.art);
  $('art').style.backgroundImage = m.art ? 'url(' + m.art + ')' : '';
  $('play').innerHTML = m.playing ? '&#10074;&#10074;' : '&#9654;';
  $('musicHint').hidden = car.access.media !== false;
}

function tickMusicBar() {
  const m = car.media;
  if (!m || !m.duration) { $('barFill').style.width = '0'; return; }
  let pos = m.position || 0;
  if (m.playing) pos += ((m.now || 0) - (m.updated || 0)) * (m.speed || 1) + (performance.now() - car.mediaAt) * (m.speed || 1);
  $('barFill').style.width = Math.max(0, Math.min(100, (pos / m.duration) * 100)) + '%';
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = String(msg); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ------------------------------------------------------------------ data from Android
window.onCar = function (type, d) {
  switch (type) {
    case 'loc':
      if (d && d.speed != null) { car.speed = d.speed < 2 ? 0 : d.speed; car.speedKnown = true; }
      if (d && d.bearing != null && car.speed > 5) car.bearing = d.bearing;
      updateTurnRate(d && d.bearing != null ? d.bearing : null);
      break;
    case 'gps': car.used = d.used; car.visible = d.visible; break;
    case 'temp': car.temp = d; break;
    case 'lights': car.lights = d; break;
    case 'door': car.doors.frontLeft = !!d; break;                     // driver door only
    case 'doors': Object.keys(car.doors).forEach((k) => { if (d && k in d) car.doors[k] = !!d[k]; }); break;
    case 'media': car.media = d || {}; car.mediaAt = performance.now(); renderMedia(); break;
    case 'nav': car.nav = d; updateNavTurn(d); renderNav(); break;
    case 'access':
      car.access = d || {};
      if (d && d.location === false) toast('Location permission is off');
      renderMedia(); break;
    case 'toast': toast(d); break;
    case 'packages': applyTheme(); if (!$('settings').hidden) openSettings(); break;
    case 'call': car.call = d; renderCall(); break;
    case 'contacts': phonebook = null; break;                         // re-read on next use
    case 'spotify': car.spotify = d || {}; renderSpotify(); break;
    case 'voice': voiceCommand(Array.isArray(d) ? d[0] : d); break;
    case 'voiceKey': listen(); break;
    case 'back': closeSheets(); break;
  }
  renderStatus();
};

// ------------------------------------------------------------------ touch handling
function tap(id, fn) { $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(e); }); }

document.querySelectorAll('#dests .tile').forEach((t) => {
  t.addEventListener('click', () => {
    const i = +t.dataset.i;
    if (i === 0) goHome(); else if (i === 1) goWork(); else listen('nav');
  });
});

tap('play', () => { call('playPause'); });
tap('next', () => call('next'));
tap('prev', () => call('prev'));
tap('search', () => { toast('Search only when parked'); call('spotifySearch'); });
tap('spotify', () => call('spotify'));
tap('musicHint', () => call('mediaAccess'));
tap('mapBtn', () => call('maps'));
tap('splitBtn', () => call('mapsSplit'));
function stopNav() { call('stopNav'); car.nav = null; renderNav(); toast('Navigation stopped'); }
tap('navClose', stopNav);
tap('navStop', stopNav);
tap('mic', () => listen());
tap('appsBtn', openApps);
tap('appsClose', closeSheets);
tap('setBtn', openSettings);
tap('setClose', closeSheets);
tap('sysSettings', () => call('settings'));
tap('mediaAccess', () => call('mediaAccess'));
tap('pkgAdd', () => call('importPackage'));

// swipe: left = Google Maps, right = Spotify
let sx = null, sy = null;
document.addEventListener('touchstart', (e) => { if (anySheetOpen()) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (sx == null) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  sx = null;
  if (Math.abs(dx) < window.innerWidth * 0.22 || Math.abs(dy) > Math.abs(dx)) return;
  if (dx < 0) { toast('Google Maps'); call('maps'); } else { toast('Spotify'); call('spotify'); }
}, { passive: true });

// ------------------------------------------------------------------ sheets: apps + settings
function anySheetOpen() { return !$('apps').hidden || !$('settings').hidden || !$('callPick').hidden; }
function closeSheets() { $('apps').hidden = true; $('settings').hidden = true; $('callPick').hidden = true; }

function openApps() {
  const grid = $('appGrid');
  if (!grid.childElementCount) {
    let list = [];
    try { list = JSON.parse(call('apps') || '[]'); } catch (e) { list = []; }
    list.forEach((a) => {
      const el = document.createElement('div');
      el.className = 'app';
      el.innerHTML = '<img alt=""><span></span>';
      el.querySelector('img').src = a.icon;
      el.querySelector('span').textContent = a.label;
      el.addEventListener('click', () => { closeSheets(); call('launch', a.pkg, a.cls); });
      grid.appendChild(el);
    });
    if (!list.length) grid.innerHTML = '<div class="t">NO APPS FOUND</div>';
  }
  $('apps').hidden = false;
}

function matchesVehicle(vehicle, query) {
  const m = vehicle.manifest;
  const text = [m.id, m.name, m.make, m.model, m.body, m.years, ...(Array.isArray(m.tags) ? m.tags : [])]
    .filter(Boolean).join(' ').toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase());
}

function chooser(row, items, isOn, pick) {
  const el = $(row); el.innerHTML = '';
  items.forEach((it) => {
    const b = document.createElement('span');
    b.className = 'btn wide' + (isOn(it) ? ' on' : '');
    b.textContent = it.manifest.name || it.manifest.id;
    b.onclick = () => pick(it);
    el.appendChild(b);
  });
}

$('vehicleSearch').addEventListener('input', openSettings);

function openSettings() {
  loadPackages();
  const t = currentTheme(), v = t && currentVehicle(t);
  // colour is remembered per vehicle
  const sw = $('colours');
  sw.innerHTML = '';
  COLOURS.forEach(([label, hex]) => {
    const b = document.createElement('div');
    b.className = 'sw' + (vehicleColour(v) === hex ? ' on' : '');
    b.style.background = hex;
    b.title = label;
    b.addEventListener('click', () => {
      cfg.vcolour = cfg.vcolour || {};
      if (v) cfg.vcolour[v.manifest.id] = hex; else cfg.colour = hex;
      saveCfg(); openSettings();                     // the scene repaints with the next state update
    });
    sw.appendChild(b);
  });
  chooser('themeRow', themes(), (it) => it === t, (it) => { cfg.theme = it.manifest.id; saveCfg(); applyTheme(); openSettings(); });
  const vehicleQuery = $('vehicleSearch').value;
  const choices = vehiclesFor(t).filter((it) => matchesVehicle(it, vehicleQuery));
  $('vehicleEmpty').hidden = choices.length !== 0;
  chooser('vehicleRow', choices, (it) => it === v, (it) => {
    cfg.vehicles[t.manifest.id] = it.manifest.id; saveCfg();
    sendScene({ type: 'vehicle', vehicle: vehicleMsg(it) }); openSettings();
  });
  // installed (not built-in) packages can be removed again
  const pl = $('pkgList'); pl.innerHTML = '';
  packages.filter((p) => !p.builtin).forEach((p) => {
    const row = document.createElement('div');
    row.className = 'pkg';
    row.innerHTML = '<span class="s"></span><span class="btn">Remove</span>';
    const m = p.manifest;
    row.querySelector('.s').textContent = (m.type === 'theme' ? 'Theme: ' : 'Vehicle: ') + (m.name || m.id) + (m.version ? ' ' + m.version : '') + (m.author ? ' · ' + m.author : '');
    row.querySelector('.btn').onclick = () => {
      call('removePackage', m.type, m.id);
      if (m.type === 'theme' && cfg.theme === m.id) cfg.theme = 'modern';
      saveCfg(); applyTheme(); openSettings();
    };
    pl.appendChild(row);
  });
  document.querySelectorAll('#skyRow .btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.sky === cfg.sky);
    b.onclick = () => { cfg.sky = b.dataset.sky; saveCfg(); openSettings(); };
  });
  refreshSpotify();
  $('settings').hidden = false;
}

// ------------------------------------------------------------------ weather (Open-Meteo, via Android)
// WMO weather codes → what to draw. Intensity 0..1.
function weather() {
  const w = car.temp || {};
  const c = w.code == null ? -1 : w.code;
  let kind = null, amount = 0;
  if ([71, 77, 85].includes(c)) { kind = 'snow'; amount = 0.4; }
  else if (c === 73) { kind = 'snow'; amount = 0.7; }
  else if ([75, 86].includes(c)) { kind = 'snow'; amount = 1; }
  else if ([51, 53, 56].includes(c)) { kind = 'rain'; amount = 0.25; }
  else if ([55, 57, 61, 80].includes(c)) { kind = 'rain'; amount = 0.45; }
  else if ([63, 66, 81].includes(c)) { kind = 'rain'; amount = 0.7; }
  else if ([65, 67, 82, 95, 96, 99].includes(c)) { kind = 'rain'; amount = 1; }
  else if ((w.rain || 0) > 0.1) { kind = (w.c != null && w.c < 1) ? 'snow' : 'rain'; amount = Math.min(1, 0.3 + w.rain / 4); }
  if (DEMO_WX) ({ kind, amount } = DEMO_WX);
  // side wind: the part of the wind blowing across the road (needs a heading); gusts make it bumpier
  const wind = DEMO_WX && DEMO_WX.wind != null ? DEMO_WX.wind : (w.wind || 0);
  const gust = DEMO_WX && DEMO_WX.gust != null ? DEMO_WX.gust : (w.gust || wind);
  const hd = car.bearing == null ? 90 : car.bearing;              // unknown heading: assume the worst (full side wind)
  const cross = Math.abs(Math.sin(((w.windDir || 0) - hd) * Math.PI / 180)) * Math.max(wind, gust * 0.8);
  return { kind, amount, wind, cross, sway: Math.max(0, Math.min(1, (cross - 20) / 45)), fog: [45, 48].includes(c), thunder: c >= 95 };
}
let DEMO_WX = null;
function wxIcon(x) {
  if (x.thunder) return '⛈';
  if (x.kind === 'snow') return '❄';
  if (x.kind === 'rain') return '☔';
  if (x.sway > 0.2) return '\u{1F32C}';
  if (x.fog) return '\u{1F32B}';
  return '';
}

// ------------------------------------------------------------------ compass (top right)
let shownHeading = 0;
function tickCompass(dt) {
  if (car.bearing == null) { $('hdg').textContent = '--'; return; }
  let d = ((car.bearing - shownHeading + 540) % 360) - 180;          // shortest way round
  shownHeading = (shownHeading + d * Math.min(1, dt * 4) + 360) % 360;
  $('rose').setAttribute('transform', 'rotate(' + (-shownHeading).toFixed(1) + ')');
  $('hdg').textContent = COMPASS[Math.round(car.bearing / 45) % 8];
}

// ------------------------------------------------------------------ phone (top left)
function renderCall() {
  // An incoming call that is still ringing is left to the car's own big call screen (the user prefers it),
  // so CarView only shows the hang-up button + name once a call is going (or while dialling out).
  const c = car.call && !(car.call.state === 'ringing' && car.call.dir === 'in') ? car.call : null;
  const ringing = c && c.state === 'ringing' && c.dir === 'in';
  document.body.classList.toggle('ringing', !!ringing);
  $('hangBtn').hidden = !c;
  $('phoneBtn').classList.toggle('pulse', !!ringing);
  $('phoneBtn').hidden = !!c && !ringing;   // in a call: only the red hang-up button
  $('callInfo').hidden = !c;
  if (c) {
    $('callState').textContent = ringing ? 'Incoming call' : c.state === 'ringing' ? 'Calling…' : 'On a call';
    $('callWho').textContent = (c.name && c.name !== 'null' ? c.name : nameForNumber(c.number)) || c.number || '';
  }
}
let callStart = 0;
tap('phoneBtn', () => {
  if (car.call && car.call.state === 'ringing' && car.call.dir === 'in') { call('answer'); toast('Answering'); }
  else call('phone');
});
tap('hangBtn', () => { call('hangUp'); });

// ------------------------------------------------------------------ Spotify connection (settings)
function renderSpotify() {
  const s = car.spotify || {};
  if (document.activeElement !== $('spClient')) $('spClient').value = s.clientId || '';
  $('spStatus').textContent = s.connected ? 'Connected' + (s.user ? ' as ' + s.user : '') + '. Say "play Dynamite by Taio Cruz".' : 'Not connected: "play …" opens Spotify search instead.';
  $('spConnect').textContent = s.connected ? 'Reconnect' : 'Connect Spotify';
  $('spDisconnect').hidden = !s.connected;
}
$('spClient').addEventListener('change', () => { call('spotifySetClient', $('spClient').value.trim()); refreshSpotify(); });
tap('spConnect', () => { call('spotifySetClient', $('spClient').value.trim()); call('spotifyConnect'); toast('Opening Spotify login'); });
tap('spDisconnect', () => { call('spotifyDisconnect'); refreshSpotify(); });
function refreshSpotify() { try { car.spotify = JSON.parse(call('spotifyStatus') || '{}'); } catch (e) { car.spotify = {}; } renderSpotify(); }
// ------------------------------------------------------------------ calling by voice
// The phonebook comes from the head unit's Bluetooth phone app (synced from the phone): [{name, number}, ...]
let phonebook = null;
function loadPhonebook() {
  try { phonebook = JSON.parse(call('contacts') || '[]'); } catch (e) { phonebook = []; }
  return phonebook;
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const NICK = { mum: ['mom', 'mama', 'mam', 'mother', 'moeder', 'mamma'], dad: ['papa', 'pap', 'father', 'vader', 'pa'] };

function findContacts(query) {
  const q = fold(query).replace(/^(?:my |mijn )/, '');
  const alias = Object.entries(NICK).find(([k, v]) => k === q || v.includes(q));
  const words = alias ? [alias[0], ...alias[1]] : [q];
  const scored = [];
  for (const c of phonebook || loadPhonebook()) {
    const n = fold(c.name);
    if (!n || !c.number) continue;
    let s = 0;
    for (const w of words) {
      if (n === w) s = Math.max(s, 100);
      else if (n.startsWith(w + ' ')) s = Math.max(s, 85);         // "alex" → "Alex Janssen"
      else if (n.split(' ').includes(w)) s = Math.max(s, 70);      // last name, or a word in "Mum (mobile)"
      else if (w.length >= 3 && n.startsWith(w)) s = Math.max(s, 55);
      else if (w.length >= 4 && n.includes(w)) s = Math.max(s, 40);
    }
    if (s) scored.push({ name: c.name, number: c.number, type: c.type, s });
  }
  scored.sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  // one entry per name+number
  const seen = new Set();
  return scored.filter((c) => { const k = fold(c.name) + '|' + c.number.replace(/\D/g, ''); if (seen.has(k)) return false; seen.add(k); return true; });
}

// The car's phone app sends only the caller's number: find the name in the contacts.
// Compares the last 9 digits so "+31 6 1234 5678" matches "06-12345678".
function nameForNumber(number) {
  const tail = String(number || '').replace(/\D/g, '').slice(-9);
  if (tail.length < 6) return '';
  const hit = (phonebook || loadPhonebook()).find((c) => String(c.number || '').replace(/\D/g, '').slice(-9) === tail);
  return hit ? hit.name : '';
}

function dialNumber(name, number) {
  closeSheets();
  toast('Calling ' + (name || number));
  call('dial', number);
}

function callByVoice(who) {
  const w = String(who || '').trim();
  if (/^[+\d][\d\s\-()]{3,}$/.test(w)) return dialNumber(null, w.replace(/[^\d+]/g, ''));   // "call 06 1234 5678"
  const found = findContacts(w);
  if (!found.length) {
    if (!(phonebook && phonebook.length)) { call('refreshContacts'); toast('Phonebook not synced yet, try again in a minute'); }
    else toast('No contact called ' + w);
    return;
  }
  const best = found.filter((c) => c.s === found[0].s);
  const names = new Set(best.map((c) => fold(c.name)));
  if (best.length === 1) return dialNumber(best[0].name, best[0].number);
  // several numbers or several people: big buttons to pick from
  $('callPickTitle').textContent = names.size === 1 ? 'Which number for ' + best[0].name + '?' : 'Who do you want to call?';
  const list = $('callPickList'); list.innerHTML = '';
  found.slice(0, 6).forEach((c) => {
    const el = document.createElement('div');
    el.className = 'tile pick';
    el.innerHTML = '<span class="ico"></span><span class="txt"><span class="nm"></span><span class="sub"></span></span>';
    el.querySelector('.ico').innerHTML = $('phoneBtn').innerHTML;
    el.querySelector('.nm').textContent = c.name;
    const digits = c.number.replace(/[^\d+]/g, '');
    const kind = c.type || (/^(?:\+316|00316|06)/.test(digits) ? 'Mobile' : /^(?:\+31|0031|0)/.test(digits) ? 'Landline' : '');
    el.querySelector('.sub').textContent = (kind ? kind + ' · ' : '') + c.number;
    el.addEventListener('click', () => dialNumber(c.name, c.number));
    list.appendChild(el);
  });
  $('callPick').hidden = false;
}
tap('callPickClose', closeSheets);
// ------------------------------------------------------------------ start
renderDests();
if (Native) {
  applyTheme();
  call('ready');
} else {
  // Demo mode for previewing in a desktop browser: ?scene=cruise|nav|night|open|day&theme=modern|retro
  const q = new URLSearchParams(location.search);
  const scene = q.get('scene') || 'cruise';
  if (q.get('theme')) cfg.theme = q.get('theme');
  if (q.get('vehicle')) { cfg.vehicles = cfg.vehicles || {}; cfg.vehicles[cfg.theme] = q.get('vehicle'); }
  applyTheme();
  const parked = scene === 'night' || scene === 'open';
  onCar('gps', { used: 19, visible: 31 });
  onCar('temp', { c: scene === 'night' ? 3 : 7, day: scene !== 'night' });
  onCar('loc', { speed: parked ? 0 : scene === 'nav' ? 63 : 48, bearing: 45 });
  onCar('lights', scene === 'night');
  onCar('door', scene === 'night');
  if (scene === 'open') onCar('doors', { frontLeft: true, rearLeft: true, frontRight: true, rearRight: true, tailgate: true });
  if (scene === 'rain') DEMO_WX = { kind: 'rain', amount: 0.9, wind: 25 };
  if (scene === 'snow') DEMO_WX = { kind: 'snow', amount: 0.8, wind: 15 };
  if (scene === 'wind') DEMO_WX = { kind: null, amount: 0, wind: 75, gust: 95 };
  if (scene === 'call') onCar('call', { state: 'ringing', dir: 'in', name: 'Alex', number: '+31 6 1234 5678' });
  if (scene === 'oncall') onCar('call', { state: 'active', dir: 'in', name: 'Alex' });
  onCar('access', { location: true, media: true });
  onCar('media', { app: 'com.spotify.music', title: 'Night Drive', artist: 'Demo Artist', playing: true, position: 61000, duration: 168000, speed: 1, updated: 0, now: 0 });
  if (scene === 'nav') onCar('nav', { title: '300 m', text: 'Stationsweg', sub: 'Arrive 10:52 · 14 km' });
  // road bends: ?scene=turnleft|turnright (navigation, &dist=60 freezes the distance) or ?scene=corner (GPS turn)
  if (scene === 'turnleft' || scene === 'turnright') {
    onCar('nav', { title: (q.get('dist') || '160') + ' m', text: 'Turn ' + (scene === 'turnleft' ? 'left' : 'right') + ' onto Stationsweg', sub: 'Arrive 10:52 · 14 km' });
    if (q.get('dist')) window.DEMO_DIST = parseFloat(q.get('dist'));
  }
  if (scene === 'corner' || q.get('rate')) { turn.rate = parseFloat(q.get('rate') || '20'); window.DEMO_RATE = turn.rate; }
  if (scene !== 'night' && scene !== 'day') cfg.sky = 'dusk';
  if (scene === 'day') { cfg.sky = 'auto'; car.temp = { c: 14, day: true }; Date.prototype.getHours = () => 12; }
  if (q.get('sheet') === 'settings') openSettings();
  console.log('VIEWPORT ' + innerWidth + 'x' + innerHeight);
  window.Car = { contacts: (k) => JSON.stringify([{ name: 'Alex Janssen', number: '+31 6 1111 1111' }, { name: 'Alex Janssen', number: '+31 30 222 2222' }, { name: 'Mama', number: '+31 6 3333 3333' }, { name: 'Sam de Vries', number: '+31 6 4444 4444' }, { name: 'Sam Bakker', number: '+31 6 5555 5555' }, { name: 'Pizzeria Roma', number: '+31 30 666 6666' }]), dial: (k, x) => console.log('CALL dial ' + x), refreshContacts: (k) => console.log('CALL refreshContacts'), navigate: (k, x) => console.log('CALL navigate ' + x), mapsPlace: (k, x) => console.log('CALL mapsPlace ' + x), playSearch: (k, x) => console.log('CALL playSearch ' + x), webSearch: (k, x) => console.log('CALL webSearch ' + x), next: (k) => console.log('CALL next'), prev: (k) => console.log('CALL prev'), pause: (k) => console.log('CALL pause'), play: (k) => console.log('CALL play'), assistant: (k) => console.log('CALL assistant') };
  q.getAll('say').forEach((s) => { if (s.startsWith('nav:')) { voiceMode = 'nav'; s = s.slice(4); } voiceCommand(s); });
}
