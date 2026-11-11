// SPDX-License-Identifier: GPL-3.0-or-later
// Thumbnail renderer for trusted bundled vehicle modules only.
// Android WebView may inject the native Car JavaScript bridge into child frames,
// even sandboxed ones. Never execute user-installed package scripts here.
const canvas = document.getElementById('thumbnail');
const WIDTH = 300, HEIGHT = 180;
// Canvas contexts cannot switch between 2D and WebGL; keep Retro separate.
const retroCanvas = document.createElement('canvas');
retroCanvas.width = WIDTH; retroCanvas.height = HEIGHT;
const cached = new Map();
let generation = 0, three = null, renderer = null, scene = null, camera = null;
let renderQueue = Promise.resolve();

const post = (message) => parent.postMessage({ carviewPreview: 1, ...message }, '*');
const shade = (hex, f) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const parts = [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return '#' + parts.map((v) => Math.round(v + ((f < 0 ? 0 : 255) - v) * Math.abs(f))
    .toString(16).padStart(2, '0')).join('');
};

function retroBackground(g) {
  const grad = g.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#283e68'); grad.addColorStop(0.65, '#667c9d');
  grad.addColorStop(1, '#8195ad');
  g.fillStyle = grad; g.fillRect(0, 0, WIDTH, HEIGHT);
  g.fillStyle = '#405166'; g.fillRect(0, 123, WIDTH, HEIGHT - 123);
  g.fillStyle = '#3d424d'; g.beginPath();
  g.moveTo(92, 124); g.lineTo(208, 124); g.lineTo(300, 180); g.lineTo(0, 180); g.fill();
  g.fillStyle = '#ebe2ce'; g.fillRect(148, 128, 4, 11);
}
async function renderRetro(item) {
  // Apply the exact same draw() contract as the Retro theme.
  const mod = await import(item.url);
  const draw = mod.draw || mod.default?.draw;
  if (!draw) throw new Error('No Retro vehicle draw function');
  const g = retroCanvas.getContext('2d');
  g.clearRect(0, 0, WIDTH, HEIGHT);
  g.imageSmoothingEnabled = false;
  retroBackground(g);
  const rect = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const poly = (pts, c, opacity = 1) => {
    g.save(); g.globalAlpha = opacity; g.fillStyle = c; g.beginPath();
    pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath(); g.fill(); g.restore();
  };
  draw(g, { cx: WIDTH / 2, by: 166, scale: 1.7, horizon: 110, colour: item.colour,
    lit: true, doors: {}, speed: 0, time: 0, options: item.options || {},
    shade, rect, poly });
  return retroCanvas.toDataURL('image/png');
}

async function createRenderer() {
  if (renderer) return;
  three = await import('../lib/three.module.js');
  // A single shared renderer handles every card sequentially. Never create one
  // WebGL context per model: Android head units have tight GPU memory budgets.
  renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.toneMapping = three.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  scene = new three.Scene();
  scene.background = new three.Color(0x26384b);
  scene.add(new three.HemisphereLight(0xf3f6ff, 0x526071, 2.0));
  const key = new three.DirectionalLight(0xfff4df, 3.2);
  key.position.set(-3, 7, -5); scene.add(key);
  const fill = new three.DirectionalLight(0xb8d6ff, 1.5);
  fill.position.set(5, 4, 4); scene.add(fill);
  camera = new three.PerspectiveCamera(37, WIDTH / HEIGHT, 0.08, 120);
}

async function renderModern(item) {
  await createRenderer();
  const mod = await import(item.url);
  const build = mod.build || mod.default?.build;
  if (!build) throw new Error('No three-pbr vehicle build function');
  const vehicle = build({ THREE: three, colour: item.colour, options: item.options || {} });
  if (!vehicle?.group) throw new Error('Vehicle did not build a group');
  const root = vehicle.group;
  scene.add(root);
  try {
    vehicle.setColour?.(item.colour);
    vehicle.setLights?.(true);
    vehicle.update?.(0, 0);
    const len = vehicle.length || item.options?.length || 4.5;
    const h = item.options?.height || (item.options?.roofHeight ?? 1.6);
    // Fixed rear three-quarter studio view: show the rear lights, side and roof.
    camera.position.set(-len * 0.68, Math.max(2.6, h * 1.65), -len * 0.78);
    camera.lookAt(len * 0.47, Math.max(0.6, h * 0.50), 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    scene.remove(root);
    const geometries = new Set(), materials = new Set();
    root.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) {
        for (const m of (Array.isArray(obj.material) ? obj.material : [obj.material])) materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
}

async function renderList(message, requestId) {
  const items = Array.isArray(message.items) ? message.items.slice(0, 40) : [];
  for (const item of items) {
    if (requestId !== generation) return; // user changed theme/colour while rendering
    if (!item || typeof item.key !== 'string' || typeof item.url !== 'string') continue;
    // Defence in depth: reject installed user/ packages and remote URL schemes.
    if (!item.url.startsWith('../vehicles/') || item.url.includes('://')) continue;
    try {
      let url = cached.get(item.key);
      if (!url) {
        url = item.family === 'pixel-16bit' ? await renderRetro(item) : await renderModern(item);
        cached.set(item.key, url);
        if (cached.size > 55) cached.delete(cached.keys().next().value);
      }
      if (requestId === generation) post({ type: 'image', key: item.key, image: url });
    } catch (error) {
      if (requestId === generation) post({ type: 'error', key: item.key, detail: String(error).slice(0, 160) });
    }
    // Yield to the UI and limit GPU contention with the main animated scene.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
window.addEventListener('message', (e) => {
  if (e.source !== parent || e.data?.type !== 'render') return;
  const message = e.data, requestId = ++generation;
  // Do not draw two models into the same WebGL renderer at once when a colour
  // change or search starts before an older dynamic import has finished.
  renderQueue = renderQueue.catch(() => {}).then(() => renderList(message, requestId));
});
post({ type: 'ready' });
