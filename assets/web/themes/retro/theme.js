// SPDX-License-Identifier: GPL-3.0-or-later
// CarView theme "Retro 16-bit": a 320x180 pixel road scene, scaled up. Vehicle family: pixel-16bit (see THEMES.md).

const W = 320, H = 180, HZ = 90;
const SKIES = {
  day:   ['#2b5fb8', '#356fc6', '#4380d2', '#5292dc', '#64a4e4', '#7ab6ea', '#93c7ee'],
  dusk:  ['#1b1446', '#2c1a5e', '#4b2270', '#7b2d74', '#b9436f', '#e8725a', '#f6a35e'],
  night: ['#05061a', '#080b26', '#0c1132', '#10173f', '#151d4c', '#1b2558', '#222d63'],
};
const HILLS = { day: ['#3f6f8f', '#2f5a52'], dusk: ['#3a1f52', '#2a1840'], night: ['#0a0d24', '#070916'] };
const GRASS = { day: ['#2f7a3a', '#37894a'], dusk: ['#1e4a2a', '#265c33'], night: ['#0b1a14', '#0f2219'] };
const ROAD = { day: ['#55556a', '#5e5e75'], dusk: ['#3b3b4a', '#44445a'], night: ['#22222c', '#282834'] };
const STARS = [[30,10],[80,22],[200,14],[260,30],[300,8],[120,6],[170,26],[230,40],[60,44],[150,36],[285,52],[12,58]];

/** Lighten (f > 0) or darken (f < 0) a #rrggbb colour. Also handed to pixel vehicles. */
export function shade(hex, f) {
  const n = parseInt(String(hex).slice(1), 16);
  let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); gg = Math.round((t - gg) * p + gg); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
}

function create(canvas) {
  canvas.width = W; canvas.height = H;
  canvas.style.imageRendering = 'pixelated';
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const poly = (pts, c, a) => {
    g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); g.globalAlpha = 1;
  };

  let vehicle = null;
  let vehicleOptions = {};
  let travel = 0, tSec = 0, carScale = 1, swayX = 0, swayT = 0;
  let lastBox = null;                         // vehicle box in scene pixels, for tapping
  const DROPS = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 }));

  function drawSky(mode, bearing) {
    SKIES[mode].forEach((c, i) => rect(0, i * 13, W, 13, c));
    if (mode === 'dusk') {
      rect(140, 52, 40, 6, '#ffd27a'); rect(134, 60, 52, 5, '#ffc35c'); rect(132, 67, 56, 4, '#ffb347'); rect(134, 73, 52, 3, '#ff9f40');
    } else if (mode === 'day') {
      rect(250, 18, 16, 16, '#fff2b0'); rect(246, 22, 24, 8, '#fff2b0');
      rect(40, 24, 34, 6, '#e8f1fb'); rect(48, 18, 18, 6, '#e8f1fb'); rect(180, 40, 28, 5, '#e8f1fb');
    } else {
      STARS.forEach((s) => rect(s[0], s[1], 2, 2, (Math.floor(tSec * 2 + s[0]) % 7 === 0) ? '#8a8fb8' : '#fff8e7'));
      [[3,0,4],[1,1,8],[0,2,10],[0,3,10],[0,4,10],[0,5,10],[0,6,10],[0,7,10],[1,8,8],[3,9,4]]
        .forEach(([dx, dy, w]) => rect(50 + dx, 12 + dy, w, 1, '#f3edd8'));
      [[5,0,4],[4,1,6],[4,2,7],[5,3,6],[5,4,6],[5,5,6],[5,6,6],[4,7,7],[4,8,6],[5,9,4]]
        .forEach(([dx, dy, w]) => rect(50 + dx, 12 + dy, w, 1, SKIES.night[0]));
    }
    // two hill layers that slide when the car turns (parallax on compass heading)
    const hd = bearing == null ? 0 : bearing;
    const far = [0, 74, 30, 64, 70, 76, 110, 60, 150, 72, 190, 58, 230, 74, 270, 62, 320, 70];
    const near = [0, 82, 40, 70, 80, 84, 120, 66, 160, 80, 200, 68, 250, 84, 290, 72, 320, 80];
    [[far, HILLS[mode][0], 0.4], [near, HILLS[mode][1], 0.9]].forEach(([pts, col, k]) => {
      const off = -((hd * k * 2) % W);
      for (const base of [off, off + W, off - W]) {
        const p = [[base, HZ]];
        for (let i = 0; i < pts.length; i += 2) p.push([base + pts[i], pts[i + 1]]);
        p.push([base + W, HZ]);
        poly(p, col);
      }
    });
  }

  // Road bends, the classic 16-bit way: every row of the road is shifted sideways by the bend at its distance.
  // bend.k = real turn now (GPS turn rate / speed, or steering angle); the navigation turn starts bend.at metres ahead.
  const bend = { k: 0, at: 999, dir: 0, amount: 0 };
  function roadOffset(sAhead) {                  // metres, + = right
    let x = bend.k * sAhead * sAhead / 2;
    if (bend.amount > 0.01 && sAhead > bend.at) { const u = sAhead - bend.at; x += bend.dir * bend.amount * 0.045 * u * u; }
    return Math.max(-400, Math.min(400, x));
  }
  function updateBend(dt, st) {
    const v = (st.speed || 0) / 3.6, kb = Math.min(1, dt * 2);
    const kNow = st.steer != null ? Math.tan(st.steer * Math.PI / 180) / 2.6
      : (v > 2 ? ((st.turnRate || 0) * Math.PI / 180) / v : 0);
    bend.k += (Math.max(-0.08, Math.min(0.08, kNow)) - bend.k) * kb;
    const nav = st.nav && st.nav.distance != null && st.nav.dir ? st.nav : null;
    const near = nav ? Math.min(1, Math.max(0, (180 - nav.distance) / 60)) : 0;
    bend.amount += ((nav ? nav.amount * near : 0) - bend.amount) * kb;
    if (nav) { bend.dir = nav.dir; bend.at = nav.distance; }
  }

  function drawRoad(mode) {
    const grass = GRASS[mode], road = ROAD[mode];
    for (let y = HZ; y < H; y++) {
      const p = (y - HZ + 1) / (H - HZ);
      const z = 2.2 / p;
      const seg = Math.floor((z + travel) / 4) & 1;
      const half = 10 + p * 170;
      const cx = W / 2 + Math.max(-600, Math.min(600, roadOffset(z) * half / 4.5));   // 4.5 m = half the road
      rect(0, y, W, 1, grass[seg]);
      rect(cx - half, y, half * 2, 1, road[seg]);
      const kerb = 1 + p * 14, kc = seg ? '#e8e2d0' : '#d6303b';
      rect(cx - half - kerb, y, kerb, 1, kc);
      rect(cx + half, y, kerb, 1, kc);
      if (seg) rect(cx - 0.5 - p * 2, y, 1 + p * 4, 1, mode === 'night' ? '#cfc8b4' : '#fff8e7');
    }
  }

  function drawWeather(mode, wx, speed, dt) {
    swayT += dt * (1.3 + (wx.sway || 0));
    swayX = (wx.sway || 0) * (Math.sin(swayT * 1.7) * 3 + Math.sin(swayT * 4.3) * 1.2);
    if (!wx.kind) return;
    const n = Math.round(DROPS.length * wx.amount);
    const drift = (wx.cross || 0) / 10;
    for (let i = 0; i < n; i++) {
      const d = DROPS[i];
      if (wx.kind === 'rain') {
        d.y += (180 + speed * 2) * d.s * dt; d.x += (drift * 12 - 20) * dt;
        rect(d.x, d.y, 1, 4 + speed / 30, mode === 'night' ? '#6f86c6' : '#b9d4ff');
      } else {
        d.y += (28 + speed * 0.8) * d.s * dt; d.x += (Math.sin(tSec * 2 + i) * 10 + drift * 6) * dt;
        rect(d.x, d.y, 2, 2, '#f4f7ff');
      }
      if (d.y > H) { d.y = -4; d.x = Math.random() * 340 - 10; }
      if (d.x < -10) d.x += 340; else if (d.x > 330) d.x -= 340;
    }
  }

  return {
    setVehicle(mod, manifest) {
      vehicle = mod.default || mod;
      vehicleOptions = (manifest && manifest.options) || {};
    },
    vehicleRect() {
      if (!lastBox) return null;
      const fx = window.innerWidth / W, fy = window.innerHeight / H;
      return { x: lastBox.x * fx, y: lastBox.y * fy, w: lastBox.w * fx, h: lastBox.h * fy };
    },
    frame(dt, st) {
      tSec += dt;
      const speed = st.speed || 0, mode = st.sky || 'dusk';
      travel += (speed / 3.6) * dt;
      carScale += ((st.nav ? 0.72 : 1) - carScale) * Math.min(1, dt * 4);
      drawSky(mode, st.bearing);
      updateBend(dt, st);
      drawRoad(mode);
      if (vehicle && vehicle.draw) {
        const bounce = speed > 3 ? Math.round(Math.sin(tSec * 18) * 0.6) : 0;
        lastBox = vehicle.draw(g, {
          cx: W / 2 + swayX, by: 132 + 40 * carScale + bounce, scale: carScale, horizon: HZ,
          colour: st.colour || '#1f3a6e', lit: st.lights === true, doors: st.doors || {}, speed, time: tSec,
          shade, rect, poly, options: vehicleOptions,
        }) || null;
      }
      drawWeather(mode, st.wx || {}, speed, dt);
    },
  };
}

export default { create };
