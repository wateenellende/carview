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
  const LEAF_COLOURS = ['#b5562a', '#d08a2e', '#e0b23c', '#8a5a2b', '#9c3b22', '#7d8a3a'];
  const LEAVES = Array.from({ length: 60 }, (_, i) => ({ x: Math.random() * W, gy: HZ + 4 + Math.random() * (H - HZ - 4), h: 0, vh: 0,
    c: LEAF_COLOURS[i % LEAF_COLOURS.length], light: 0.7 + Math.random() * 0.45, ph: Math.random() * 6.3, spin: 2 + Math.random() * 5 }));
  let leafAmt = 0;

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

  // Road bends, the classic 16-bit way: every row of the road is shifted sideways. The main road follows how the
  // car is really driving (GPS turn rate or steering angle: bent under the car, straightening out ahead), so the
  // car is always on it. A navigation turn is a side road that forks off at the remaining distance.
  const bend = { k: 0, at: 999, dir: 0, amount: 0, onMain: 0, split: 0 };   // see the Modern theme for the rules
  const TURN_R = 12;
  const STEP = 2, MAXS = 220, MX = new Float32Array(MAXS / STEP + 2), MH = new Float32Array(MAXS / STEP + 2);
  const BXS = new Float32Array(MAXS / STEP + 2);
  function updateBend(dt, st) {
    const v = (st.speed || 0) / 3.6, kb = Math.min(1, dt * 2);
    const kNow = st.steer != null ? Math.tan(st.steer * Math.PI / 180) / 2.6
      : (v > 2 ? ((st.turnRate || 0) * Math.PI / 180) / v : 0);
    bend.k += (Math.max(-0.09, Math.min(0.09, kNow)) - bend.k) * Math.min(1, dt * 5);   // follows the GPS quickly
    // a roundabout replaces the bend / side road: drawn as a ring with its roads (see drawRoad)
    const rbNav = st.nav && st.nav.roundabout && st.nav.distance != null ? st.nav : null;
    rbDraw = rbNav && rbNav.distance < 450 ? { at: Math.max(0, rbNav.distance) * 0.25, shape: rbNav.roundabout } : null;
    const nav = !rbDraw && st.nav && st.nav.distance != null && st.nav.dir ? st.nav : null;
    const near = nav ? Math.min(1, Math.max(0, (450 - nav.distance) / 80)) : 0;   // drawn at 40% distance: visible from ~450 m
    bend.amount += ((nav ? nav.amount * near : 0) - bend.amount) * kb;
    // the flat pixel road squeezes everything past ~30 m into a few rows: show the fork closer than it really is
    if (nav) { bend.dir = nav.dir; bend.at = Math.max(0, nav.distance) * 0.4; }
    // far: the turn bends the main road; close (~2.5 s of driving): merge if turning that way, else split off
    const mergeDist = Math.max(15, Math.min(40, v * 2.5));
    const close = !!nav && nav.distance < mergeDist;
    const agree = close && Math.abs(bend.k) > 0.008 && Math.sign(bend.k) === nav.dir;
    bend.onMain += ((nav && !close ? 1 : 0) - bend.onMain) * kb;
    bend.split += ((close && !agree ? 1 : 0) - bend.split) * kb;
    const arc = bend.amount * Math.PI / 2 * TURN_R;
    const navK = (sAt) => (bend.dir && sAt >= bend.at && sAt <= bend.at + arc ? bend.onMain * bend.dir / TURN_R : 0);
    // main road: heading added up every 2 m (one continuous road)
    MX[0] = 0; MH[0] = 0;
    for (let i = 1; i < MX.length; i++) {
      const sAt = (i - 0.5) * STEP, h = MH[i - 1] + (bend.k * Math.max(0, 1 - sAt / 40) + navK(sAt)) * STEP;
      MX[i] = MX[i - 1] + Math.tan(Math.max(-1.2, Math.min(1.2, (MH[i - 1] + h) / 2))) * STEP; MH[i] = h;
    }
    // side road: leaves the main road at bend.at and turns away (max ~70°, a flat screen can't show more)
    const j0 = Math.min(MX.length - 1, Math.round(bend.at / STEP)), turnTo = bend.dir * Math.min(1.2, bend.amount * bend.split * Math.PI / 2);
    let h = MH[j0];
    for (let i = 0; i < MX.length; i++) {
      if (i <= j0) { BXS[i] = MX[i]; continue; }
      h += (MH[j0] + turnTo - h) * 0.25;                 // eases into the new direction over ~10 m
      BXS[i] = BXS[i - 1] + Math.tan(Math.max(-1.2, Math.min(1.2, h))) * STEP;
    }
  }
  // roundabout (when Maps announces one): ring of RB_R (centre line) +- RB_HW, entry at rbDraw.at metres ahead
  let rbDraw = null;
  const RB_R = 6.5, RB_HW = 3, RB_OUT = RB_R + RB_HW, RB_IN = RB_R - RB_HW;   // small: the flat road squeezes depth
  const sample = (arr, sAt) => { const f = Math.max(0, Math.min(arr.length - 1.001, sAt / STEP)), i = Math.floor(f); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };

  function drawRoad(mode) {
    const grass = GRASS[mode], road = ROAD[mode];
    for (let y = HZ; y < H; y++) {
      const p = (y - HZ + 1) / (H - HZ);
      const z = 2.2 / p;
      const seg = Math.floor((z + travel) / 4) & 1;
      const half = 10 + p * 170;
      const pxPerM = half / 4.5;                                                       // 4.5 m = half the road
      const cx = W / 2 + Math.max(-900, Math.min(900, sample(MX, z) * pxPerM));
      rect(0, y, W, 1, grass[seg]);
      if (bend.split > 0.02 && bend.amount > 0.02 && bend.dir && z > bend.at) {                            // the side road (drawn first)
        const bx = W / 2 + Math.max(-900, Math.min(900, sample(BXS, z) * pxPerM)), bh = half * 0.9;
        rect(bx - bh, y, bh * 2, 1, road[seg]);
        if (seg) rect(bx - 0.5 - p * 2, y, 1 + p * 4, 1, mode === 'night' ? '#cfc8b4' : '#fff8e7');
      }
      if (rbDraw && z > rbDraw.at + 0.5) { drawRoundaboutRow(y, z, pxPerM, seg, road, grass, mode); continue; }
      rect(cx - half, y, half * 2, 1, road[seg]);
      const kerb = 1 + p * 14, kc = seg ? '#e8e2d0' : '#d6303b';
      rect(cx - half - kerb, y, kerb, 1, kc);
      rect(cx + half, y, kerb, 1, kc);
      if (seg) rect(cx - 0.5 - p * 2, y, 1 + p * 4, 1, mode === 'night' ? '#cfc8b4' : '#fff8e7');
      if (rbDraw) rect(cx + 1.9 * pxPerM - 0.35 * pxPerM, y, Math.max(1, 0.7 * pxPerM), 1, ROUTE);   // route to the ring
    }
  }
  const ROUTE = '#4aa8ff';
  // one screen row of the roundabout: its roads, the ring, the island and the route line (angles: 0 = straight on,
  // 90 = right, -90 = left, 180 = where we come from; anticlockwise round the ring, so the 1st exit is on the right)
  function drawRoundaboutRow(y, z, pxPerM, seg, road, grass, mode) {
    const zc = rbDraw.at + RB_OUT, dz = z - zc, xc = W / 2 + Math.max(-900, Math.min(900, sample(MX, rbDraw.at) * pxPerM));
    const X = (m) => xc + m * pxPerM, sh = rbDraw.shape, exitA = sh.angle * Math.PI / 180;
    // the other roads, out from the ring
    for (const deg of sh.arms) {
      const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      if (Math.abs(ca) < 0.2) {                                         // to the side: a band across these rows
        if (Math.abs(dz) < 4.5) { if (sa > 0) rect(X(0), y, W, 1, road[seg]); else rect(0, y, X(0), 1, road[seg]); }
        continue;
      }
      const t = dz / ca;                                                  // how far along this road the row is
      if (t > RB_R) { const hw = 4.5 / Math.abs(ca); rect(X(t * sa - hw), y, 2 * hw * pxPerM, 1, road[seg]); }
    }
    // the ring and the island
    if (Math.abs(dz) <= RB_OUT) {
      const co = Math.sqrt(RB_OUT * RB_OUT - dz * dz);
      rect(X(-co), y, 2 * co * pxPerM, 1, road[seg]);
      if (Math.abs(dz) < RB_IN) {
        const ci = Math.sqrt(RB_IN * RB_IN - dz * dz), kerb = Math.max(1, 0.4 * pxPerM);
        rect(X(-ci) - kerb, y, 2 * ci * pxPerM + 2 * kerb, 1, seg ? '#e8e2d0' : '#d6303b');
        rect(X(-ci), y, 2 * ci * pxPerM, 1, grass[seg ^ 1]);
      }
    }
    // route: round the ring from where we enter (180) down to the exit angle, then out along the exit road
    const lane = Math.max(1, 0.8 * pxPerM);
    if (Math.abs(dz) <= RB_R) {
      const c = Math.sqrt(RB_R * RB_R - dz * dz);
      for (const xm of [-c, c]) {
        const phi = Math.atan2(xm, dz);
        if (phi >= exitA - 0.05 || phi <= -Math.PI + 0.05 && exitA <= -Math.PI + 0.1) rect(X(xm) - lane / 2, y, lane, 1, ROUTE);
      }
    }
    const ca = Math.cos(exitA), sa = Math.sin(exitA);
    if (Math.abs(ca) < 0.2) {
      if (Math.abs(dz - (-1.9 * sa)) < 0.7) { if (sa > 0) rect(X(RB_OUT), y, W, 1, ROUTE); else rect(0, y, X(-RB_OUT), 1, ROUTE); }
    } else {
      const t = dz / ca;
      if (t > RB_OUT) rect(X(t * sa + 1.9 * ca) - lane / 2, y, lane, 1, ROUTE);
    }
  }

  // dry but windy: chunky autumn leaves tumble across the screen (rain and snow show the wind themselves)
  // Calm: none. Breeze: a few leaves skittering low. Gale: many, lifted high. They blow the way the wind blows
  // relative to the car (wx.side: + = to the right; wx.along: + = forward). Each leaf has a spot on the ground
  // (gy: a screen row, i.e. a depth) and a height above it, both scaled by perspective.
  function drawLeaves(mode, wx, speed, dt, gust) {
    const want = Math.max(0, Math.min(1, ((wx.wind || 0) - 8) / 45));
    leafAmt += (want - leafAmt) * Math.min(1, dt * 0.5);
    if (leafAmt < 0.01) return;
    const n = Math.max(1, Math.round(LEAVES.length * Math.pow(leafAmt, 1.4)));
    const ceiling = 4 + 46 * Math.pow(leafAmt, 1.3);                    // pixels at the front of the screen
    const dim = mode === 'night' ? 0.45 : 1;
    for (let i = 0; i < n; i++) {
      const l = LEAVES[i];
      const p = (l.gy - HZ) / (H - HZ);                                    // 0 at the horizon … 1 at the bottom
      const puff = gust * (0.75 + 0.35 * Math.sin(tSec * 0.8 * l.light + l.ph));
      const air = l.h > 0.5;
      l.x += ((wx.side || 0) * 2.6 * (air ? 1 : 0.45) * l.light * puff + Math.cos(tSec * l.light * 1.5 + l.ph) * 14 * leafAmt) * (0.25 + p) * dt;
      l.gy += ((speed * 0.35 - (wx.along || 0) * 0.5 * l.light) * (0.15 + p) + Math.sin(tSec * 1.3 + l.ph) * 4 * leafAmt) * dt;
      if (!air && Math.random() < dt * (0.15 + 1.6 * leafAmt) * puff) l.vh = (20 + Math.random() * 30) * (0.5 + leafAmt);
      l.vh = Math.max(-25, (l.vh || 0) - 45 * dt);
      l.h = Math.max(0, Math.min(ceiling * l.light, l.h + l.vh * dt));
      if (l.h <= 0) l.vh = 0;
      if (l.gy > H + 2) { l.gy = HZ + 4 + Math.random() * 20; l.x = Math.random() * W; }
      else if (l.gy < HZ + 2) { l.gy = H - Math.random() * 10; l.x = Math.random() * W; }
      if (l.x > W + 6) l.x = -4; else if (l.x < -6) l.x = W + 4;
      const y = l.gy - l.h * (0.3 + p), c = dim === 1 ? l.c : shadeLeaf(l.c, dim);
      const big = p > 0.45;                                                // nearer leaves are bigger
      if (!air) rect(l.x, y, big ? 4 : 2, 1, c);                           // lying on the road
      else if (Math.abs(Math.sin(tSec * l.spin + l.ph)) > 0.5) { rect(l.x, y, big ? 4 : 3, big ? 3 : 2, c); if (big) rect(l.x + 1, y - 1, 2, 1, c); }
      else rect(l.x + 1, y - 1, big ? 2 : 1, big ? 4 : 3, c);              // edge-on while tumbling
    }
  }
  function shadeLeaf(hex, f) {
    const v = parseInt(hex.slice(1), 16);
    return 'rgb(' + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.round(x * f)).join(',') + ')';
  }

  function drawWeather(mode, wx, speed, dt) {
    swayT += dt * (1.3 + (wx.sway || 0));
    swayX = (wx.sway || 0) * (Math.sin(swayT * 1.7) * 3 + Math.sin(swayT * 4.3) * 1.2);
    // side wind in pixels per second, with gusts that come and go in step with the car's rocking
    const gust = 1 + 0.35 * (Math.sin(swayT * 0.9) * 0.6 + Math.sin(swayT * 2.3 + 0.7) * 0.4);
    const drift = (wx.side || 0) * 2.2 * gust;                        // + = blowing to the right
    if (!wx.kind) { drawLeaves(mode, wx, speed, dt, gust); return; }
    leafAmt = 0;
    const n = Math.round(DROPS.length * wx.amount);
    for (let i = 0; i < n; i++) {
      const d = DROPS[i];
      if (wx.kind === 'rain') {
        const fall = (180 + speed * 2) * d.s, len = 4 + speed / 30;
        d.y += fall * dt; d.x += drift * dt;
        const lean = Math.round(drift / fall * len);                        // streaks lean into the wind
        const c = mode === 'night' ? '#6f86c6' : '#b9d4ff';
        rect(d.x, d.y + len / 2, 1, len / 2, c); rect(d.x - lean, d.y, 1, len / 2, c);
      } else {
        d.y += (28 + speed * 0.8) * d.s * dt; d.x += (Math.sin(tSec * 2 + i) * 10 + drift) * dt;
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
