// SPDX-License-Identifier: GPL-3.0-or-later
// Shared construction for the Modern-theme cars (hatchback, coupe, saloon, SUV, pickup, van).
// Same technique as the detailed Logan model: a smooth lower body lofted from a few keyed curves
// (shoulder line, sill line, rounded plan view), a separate glasshouse that narrows toward the roof,
// wheel arches shaped into the body, and lamps, plate and bumpers that sit ON the body surface
// instead of slabs bolted onto it.
// Axes: +x forward (rear bumper at x = 0, nose at x = length), +y up, +z = right-hand side.
// Only plain arrays are used for the maths, so the CI smoke test can build cars without WebGL.
const PI = Math.PI, TAU = 2 * PI;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };

/** Smooth curve through [x, value] keys, eased between keys (keys must be in increasing x). */
export function keys(k) {
  return (x) => {
    if (x <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (x <= k[i][0]) return mix(k[i - 1][1], k[i][1], smooth((x - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
    }
    return k[k.length - 1][1];
  };
}

function materials(THREE, colour) {
  const side = THREE.DoubleSide;
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0.25, roughness: 0.32, clearcoat: 0.85,
      clearcoatRoughness: 0.12, envMapIntensity: 0.65, side }),
    // the roof faces the bright sky: same colour, less mirror, so it doesn't turn into a silver slab
    roof: new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0.15, roughness: 0.5, clearcoat: 0.3, envMapIntensity: 0.3, side }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x2b3b4c, metalness: 0.2, roughness: 0.05, clearcoat: 1,
      envMapIntensity: 0.85, transparent: true, opacity: 0.84, depthWrite: false, side }),
    black: new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.72, side }),       // textured plastic
    trim: new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.3, metalness: 0.2, side }), // gloss black
    chrome: new THREE.MeshStandardMaterial({ color: 0xdde3ea, metalness: 1, roughness: 0.16, side }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc8cfd8, metalness: 0.9, roughness: 0.24, side }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.5, roughness: 0.45, side }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.92 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5c0712, emissive: 0xff1a2e, emissiveIntensity: 0.5, roughness: 0.22, side }),
    head: new THREE.MeshStandardMaterial({ color: 0xdfe7f0, emissive: 0xfff3d6, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.1, side }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf1e39a, roughness: 0.5, side }),          // Dutch yellow plate
    interior: new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.95, side }),
  };
}

/**
 * Build a Modern car. `options` come from the vehicle manifest (all in metres):
 *   length, width, height, rearOverhang, wheelbase, wheelRadius, groundClearance, beltHeight,
 *   cabinRear (base of the rear glass), roofFlatStart, roofFlatEnd, cabinFront (base of the windscreen), doors (2|4).
 * `profile` (from the class module) shapes it:
 *   belt [[u, ×beltHeight]]   shoulder line from tail (u=0) to nose (u=1): boot deck, waist, bonnet
 *   corners {rear:[radius, pinch], front:[radius, pinch]}   how round the corners are seen from above
 *   square    cross-section squareness (4 = soft, 8 = boxy)   tumble  roof width ÷ body width
 *   hips      extra width over the rear wheels              cPillar width of the rearmost pillar (m)
 *   hatch     true: tailgate hinges at the roof; false: boot lid hinges at the rear screen
 *   bed       true: open load bed behind the cab (pickup)    panelTo  x up to which the sides are panels (van)
 *   lamps     'wrap' | 'bar' | 'vertical'                   cladding  dark plastic arches and sills
 *   details(ctx)  class-specific trim
 */
export function buildModern({ THREE, colour = '#1f3a6e', options = {} }, profile) {
  const o = options;
  const L = o.length, W = o.width, H = o.height, R = o.wheelRadius, belt0 = o.beltHeight;
  const rearAxle = o.rearOverhang, frontAxle = o.rearOverhang + o.wheelbase;
  if (!THREE || !profile || !Number.isFinite(L) || !(o.wheelbase > 0) || !(R > 0)) throw Error('Invalid Modern vehicle parameters');
  const clr = o.groundClearance;
  const M = materials(THREE, colour);
  const deepenRoof = () => { if (M.roof.color.multiplyScalar) M.roof.color.multiplyScalar(0.8); };   // catches the most sky
  deepenRoof();
  const root = new THREE.Group();
  const P = profile;

  // ---------- lower body ----------
  const belt = keys(P.belt.map(([u, m]) => [u * L, m * belt0]));
  const sill = keys(P.sill || [[0, clr + 0.2], [0.14, clr + 0.07], [L - 0.24, clr + 0.07], [L, clr + 0.18]]);
  const archR = R * 1.24, archY = R * 0.86;       // wheel arch: a circle a little lower than the hub
  const arch = (x) => {
    let y = 0;
    for (const a of [rearAxle, frontAxle]) {
      const dx = Math.abs(x - a);
      if (dx < archR) y = Math.max(y, archY + Math.sqrt(archR * archR - dx * dx));
    }
    return y;
  };
  const bottom = (x) => Math.max(sill(x), arch(x));
  const [rr, rp] = (P.corners && P.corners.rear) || [0.26, 0.86];
  const [fr, fp] = (P.corners && P.corners.front) || [0.42, 0.78];
  const plan = (x) => {
    const rear = x < L / 2, r = rear ? rr : fr, pinch = rear ? rp : fp, d = rear ? x : L - x;
    if (d >= r) return 1;
    const u = 1 - d / r;
    return pinch + (1 - pinch) * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const hips = P.hips || 0;
  const halfW = (x) => (W / 2) * plan(x) * (1 + hips * Math.exp(-Math.pow((x - rearAxle) / 0.75, 2)) - hips * 0.5);
  const E = P.square || 5.5;
  const se = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / E);
  // th: 0 = right flank mid-height, PI/2 = top, PI = left flank, 3PI/2 = underside
  const bodySurf = (x, th) => {
    x = clamp(x, 0, L);
    const yb = bottom(x), yt = belt(x), yc = (yb + yt) / 2, hh = (yt - yb) / 2;
    const s = Math.sin(th), tuck = 1 - 0.07 * Math.pow(Math.max(0, -s), 2);   // sides tuck under at the sill
    return [x, yc + hh * se(s), halfW(x) * tuck * se(Math.cos(th))];
  };

  // ---------- glasshouse ----------
  const H0 = o.cabinRear, H1 = o.cabinFront, F0 = o.roofFlatStart, F1 = o.roofFlatEnd;
  const roofY = keys([[H0, belt(H0) + 0.004], [F0, H - (P.rearDrop ?? 0.025)], [(F0 + F1) / 2, H],
    [F1, H - 0.012], [H1, belt(H1) + 0.003]]);
  const tumble = P.tumble || 0.72;
  const roofHW = keys([[H0, 0.9], [F0, 0.97], [(F0 + F1) / 2, 1], [F1, 0.99], [H1, 1.1]]);
  // s: 0 = right belt line, 0.5 = middle of the roof, 1 = left belt line
  const glassSurf = (x, s) => {
    x = clamp(x, H0, H1);
    const yb = belt(x) - 0.012, yr = Math.max(yb + 0.002, roofY(x));
    const hwb = halfW(x) - 0.035, hwt = Math.min(hwb, (W / 2) * tumble * roofHW(x));
    const a = PI * s, sn = Math.max(0, Math.sin(a));
    const w = hwb + (hwt - hwb) * Math.pow(sn, 0.45);
    return [x, yb + (yr - yb) * Math.pow(sn, 0.22), w * Math.cos(a)];
  };

  // ---------- mesh helpers ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function geometry(pos, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // a surface patch over x0..x1 and t0..t1, optionally pushed out along its normal by `off`
  function patch(surf, x0, x1, t0, t1, nx, nt, off, mat, opt = {}) {
    const pos = [], idx = [], e = 0.002;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, x = x0 + (x1 - x0) * (opt.ease ? (1 - Math.cos(PI * u)) / 2 : u);
      for (let j = 0; j <= nt; j++) {
        const t = t0 + (t1 - t0) * (j / nt);
        let p = surf(x, t);
        if (off) {
          const n = cross(sub(surf(x + e, t), surf(x - e, t)), sub(surf(x, t + e), surf(x, t - e)));
          const l = Math.hypot(n[0], n[1], n[2]) || 1;
          p = [p[0] + n[0] / l * off, p[1] + n[1] / l * off, p[2] + n[2] / l * off];
        }
        pos.push(p[0], p[1], p[2]);
      }
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
      if (opt.omit && opt.omit(x0 + (x1 - x0) * (i + 0.5) / nx, t0 + (t1 - t0) * (j + 0.5) / nt)) continue;
      const a = i * (nt + 1) + j, b = a + nt + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const m = new THREE.Mesh(geometry(pos, idx), mat);
    (opt.parent || root).add(m);
    return m;
  }
  // a flat fan that closes the end of the body loft
  function cap(x) {
    const ring = [];
    for (let j = 0; j <= 64; j++) ring.push(bodySurf(x, (j / 64) * TAU));
    const c = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / ring.length);
    const pos = [...c], idx = [];
    ring.forEach((p, j) => { pos.push(p[0], p[1], p[2]); if (j > 0) idx.push(0, j, j + 1); });
    root.add(new THREE.Mesh(geometry(pos, idx), M.paint));
  }
  // a flat rounded-rectangle "badge" facing ±x (dir -1 = rear face, +1 = front face): lamps, plates, grilles
  function panel(x, cy, cz, hz, hy, mat, opt = {}) {
    const pos = [x, cy, cz], idx = [], n = 40, sq = opt.square || 6;
    const ss = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / sq);
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * TAU;
      pos.push(x, cy + hy * ss(Math.sin(a)), cz + hz * ss(Math.cos(a)));
      if (j > 0) idx.push(0, j, j + 1);
    }
    const m = new THREE.Mesh(geometry(pos, idx), mat);
    (opt.parent || root).add(m);
    return m;
  }
  function box(w, h, d, mat, x, y, z, parent = root) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }
  function tube(points, radius, mat) {
    const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(16, points.length * 8), radius, 8, false), mat);
    root.add(m); return m;
  }

  // ---------- body shell (always the first mesh: the CI test inspects it for the open pickup bed) ----------
  const bedEnd = P.bed ? H0 - 0.1 : 0;
  const bedOpen = (x, th) => P.bed && x > 0.06 && x < bedEnd && th > 0.15 * PI && th < 0.85 * PI;
  const res = P.bed ? [72, 40] : [110, 64];
  patch(bodySurf, 0, L, 0, TAU, res[0], res[1], 0, M.paint, { ease: true, omit: bedOpen });
  cap(0.0005); cap(L - 0.0005);

  // dark wheel-well liners behind each arch, so you don't see daylight through the body
  for (const a of [rearAxle, frontAxle]) for (const sd of [-1, 1]) {
    const well = new THREE.Mesh(new THREE.CircleGeometry(archR, 32, 0, PI), M.black);
    well.position.set(a, archY, sd * (halfW(a) - 0.3));
    if (sd < 0) well.rotation.y = PI;
    root.add(well);
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(archR * 2, halfW(a) * 2 - 0.5), M.black);
    lid.rotation.x = -PI / 2; lid.position.set(a, archY + archR * 0.98, 0); root.add(lid);
  }

  // ---------- glass, roof and pillars ----------
  patch(glassSurf, H0, H1, 0, 1, 90, 40, 0, M.glass);
  // interior seen through the glass: headliner, cabin floor and seats
  patch(glassSurf, H0 + 0.05, H1 - 0.05, 0.2, 0.8, 40, 12, -0.035, M.interior);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.4, H1 - H0 - 0.3), W - 0.25), M.interior);
  floor.rotation.x = -PI / 2; floor.position.set((H0 + H1) / 2, belt((H0 + H1) / 2) - 0.03, 0); root.add(floor);
  const seatRows = o.doors === 2 ? [mix(F0, F1, 0.62)] : [mix(F0, F1, 0.32), mix(F0, F1, 0.78)];
  for (const x of seatRows) for (const z of [-0.37, 0.37]) {
    if (x < H0 + 0.2 || x > H1 - 0.3) continue;
    box(0.12, 0.17, 0.26, M.black, x, roofY(x) - 0.3, z * W / 1.8);
  }
  const C = P.cPillar ?? 0.28;
  // roof skin in body colour, from the top of the rear glass to the top of the windscreen
  patch(glassSurf, F0 - 0.04, F1 + 0.04, 0.17, 0.83, 50, 26, 0.012, M.roof);
  for (const [s0, s1] of [[0, 0.185], [0.815, 1]]) {
    patch(glassSurf, H0, H0 + C, s0, s1, 10, 10, 0.006, M.paint);                    // rear pillar
    patch(glassSurf, F1 - 0.08, H1, s0 < 0.5 ? 0.09 : 0.83, s0 < 0.5 ? 0.17 : 0.91, 20, 4, 0.007, M.paint); // A-pillar
    patch(glassSurf, H0 + C, F1, s0 < 0.5 ? 0.165 : 0.815, s0 < 0.5 ? 0.185 : 0.835, 40, 1, 0.009, M.trim); // frame
    patch(glassSurf, H0 + C, H1 - 0.12, s0 < 0.5 ? 0 : 0.988, s0 < 0.5 ? 0.012 : 1, 40, 1, 0.008, M.trim);  // waist strip
    if (P.panelTo) patch(glassSurf, H0 + C, P.panelTo, s0, s1, 30, 8, 0.006, M.paint);  // van: panel sides
  }

  // ---------- doors (skins hinge at their front edge) ----------
  const doors = {};
  const doorTop = 0.98, doorBot = -0.42;       // band of the body cross-section the door skin covers
  function door(name, x0, x1, sd) {
    const left = sd < 0;
    const lo = left ? PI - doorTop : doorBot, hi = left ? PI - doorBot : doorTop;
    const hinge = bodySurf(x1, left ? PI : 0);
    const pivot = new THREE.Group(); pivot.position.set(hinge[0], hinge[1], hinge[2]);
    const g = new THREE.Group(); g.position.set(-hinge[0], -hinge[1], -hinge[2]); pivot.add(g);
    patch(bodySurf, x0, x1, lo, hi, 20, 14, 0.007, M.paint, { parent: g });
    if (!P.panelTo || x0 >= P.panelTo - 0.05)
      patch(glassSurf, x0 + 0.03, x1 - 0.03, left ? 0.82 : 0.0, left ? 1.0 : 0.18, 12, 8, 0.009, M.glass, { parent: g });
    const hp = bodySurf(x0 + 0.2, left ? PI - 0.62 : 0.62);
    box(0.17, 0.03, 0.025, M.chrome, hp[0], hp[1], hp[2] + sd * 0.012, g);
    patch(bodySurf, x0 + 0.01, x1 - 0.01, lo + 0.03, hi - 0.03, 10, 8, 0.003, M.interior);   // opening behind the door
    for (const xs of [x0, x1]) patch(bodySurf, xs - 0.004, xs + 0.004, lo, hi, 1, 12, 0.0075, M.trim); // shut lines
    root.add(pivot);
    doors[name] = { pivot, side: sd, target: 0 };
  }
  const xf1 = H1 - 0.1, xr0 = H0 + C + 0.02;
  if (o.doors === 2) {
    for (const sd of [-1, 1]) door(sd < 0 ? 'frontLeft' : 'frontRight', mix(xr0, xf1, 0.25), xf1, sd);
  } else {
    const split = P.split ?? mix(xr0, xf1, 0.47);
    for (const sd of [-1, 1]) {
      door(sd < 0 ? 'frontLeft' : 'frontRight', split, xf1, sd);
      door(sd < 0 ? 'rearLeft' : 'rearRight', Math.max(xr0, split - (xf1 - split) * 0.95), split, sd);
      // black B-pillar between the two side windows
      patch(glassSurf, split - 0.045, split + 0.045, sd < 0 ? 0.815 : 0, sd < 0 ? 1 : 0.185, 3, 8, 0.01, M.trim);
    }
  }

  // ---------- tailgate / boot lid / bed tailgate ----------
  const rearTop = belt(0), rearBot = bottom(0);
  const bumperTop = mix(rearBot, rearTop, 0.36);
  const lid = new THREE.Group();
  if (P.bed) {
    lid.position.set(0, bumperTop, 0);                 // drops down, hinged at the bottom
    const g = new THREE.Group(); g.position.set(0, -bumperTop, 0); lid.add(g);
    panel(-0.006, mix(bumperTop, rearTop, 0.5), 0, halfW(0) * 0.86, (rearTop - bumperTop) / 2 - 0.02, M.paint, { parent: g, square: 9 });
    panel(-0.012, mix(bumperTop, rearTop, 0.62), 0, 0.12, 0.03, M.black, { parent: g });
  } else if (P.hatch) {
    lid.position.set(0, rearTop, 0);                   // lifts up, hinged at the top of the rear face
    const g = new THREE.Group(); g.position.set(0, -rearTop, 0); lid.add(g);
    panel(-0.004, mix(bumperTop, rearTop, 0.55), 0, halfW(0) * 0.72, (rearTop - bumperTop) * 0.42, M.paint, { parent: g, square: 7 });
    box(0.02, 0.03, 0.22, M.chrome, -0.012, mix(bumperTop, rearTop, 0.72), 0, g);              // handle / badge bar
  } else {
    lid.position.set(H0 - 0.04, belt(H0 - 0.04), 0);   // boot lid: hinged at the base of the rear screen
    const g = new THREE.Group(); g.position.set(-(H0 - 0.04), -belt(H0 - 0.04), 0); lid.add(g);
    patch(bodySurf, 0.0, H0 - 0.04, 0.2 * PI, 0.8 * PI, 16, 16, 0.005, M.paint, { parent: g });
    box(0.02, 0.025, 0.24, M.chrome, -0.01, rearTop - 0.12, 0, g);
  }
  root.add(lid);
  doors.tailgate = { pivot: lid, target: 0 };

  // ---------- rear face: lamps, plate, bumper ----------
  const hw0 = halfW(0) * 0.92;
  const lampY = rearTop - (P.lampDrop ?? 0.13);
  for (const sd of [-1, 1]) {
    // lamp lens wrapping round the corner
    const th0 = sd > 0 ? 0.22 : PI - 0.62, th1 = sd > 0 ? 0.62 : PI - 0.22;
    if (P.lamps === 'vertical') {
      patch(bodySurf, 0, 0.06, sd > 0 ? -0.3 : PI - 0.8, sd > 0 ? 0.8 : PI + 0.3, 3, 10, 0.006, M.tail);
      panel(-0.006, lampY - 0.18, sd * (hw0 - 0.07), 0.065, 0.26, M.tail, { square: 5 });
    } else {
      patch(bodySurf, 0, 0.17, th0, th1, 6, 8, 0.006, M.tail);
      panel(-0.006, lampY, sd * (hw0 - 0.16), 0.17, P.lamps === 'bar' ? 0.045 : 0.07, M.tail, { square: 5 });
    }
  }
  if (P.lamps === 'bar') panel(-0.007, lampY + 0.01, 0, hw0 * 0.62, 0.016, M.tail, { square: 10 });
  // plate in a dark recess, lower bumper in textured plastic, reflectors
  const plateY = P.plateY ?? mix(bumperTop, lampY, 0.42);
  panel(-0.007, plateY, 0, 0.3, 0.085, M.trim, { square: 8 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), M.plate);
  plate.rotation.y = -PI / 2; plate.position.set(-0.012, plateY, 0); root.add(plate);
  panel(-0.005, rearBot + 0.08, 0, hw0 * 0.94, 0.075, M.black, { square: 9 });
  for (const sd of [-1, 1]) panel(-0.008, rearBot + 0.1, sd * hw0 * 0.8, 0.07, 0.022, M.tail, { square: 6 });

  // ---------- front: headlamps, grille, bumper ----------
  const frontTop = belt(L), frontBot = bottom(L), hwF = halfW(L) * 0.92;
  for (const sd of [-1, 1]) {
    patch(bodySurf, L - 0.3, L, sd > 0 ? 0.24 : PI - 0.6, sd > 0 ? 0.6 : PI - 0.24, 10, 8, 0.006, M.head);
    panel(L + 0.006, frontTop - 0.1, sd * (hwF - 0.2), 0.19, 0.05, M.head, { square: 5 });
  }
  panel(L + 0.005, mix(frontBot, frontTop, 0.55), 0, hwF * (P.grille ?? 0.5), (frontTop - frontBot) * 0.17, M.trim, { square: 6 });
  panel(L + 0.005, frontBot + 0.1, 0, hwF * 0.7, 0.07, M.black, { square: 8 });

  // ---------- wheels ----------
  const wheels = [];
  for (const a of [rearAxle, frontAxle]) for (const sd of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(a, R, sd * (halfW(a) - 0.125));
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.23, 40), M.tyre); tyre.rotation.x = PI / 2; w.add(tyre);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.7, 0.236, 32), M.rimDark); disc.rotation.x = PI / 2; w.add(disc);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.69, 0.018, 8, 40), M.rim); lip.position.z = sd * 0.118; w.add(lip);
    const spokes = P.spokes || 5;
    for (let k = 0; k < spokes; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, R * 1.34, 0.02), M.rim);
      sp.position.z = sd * 0.12; sp.rotation.z = (k / spokes) * PI; w.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.16, 0.25, 16), M.rim); hub.rotation.x = PI / 2; w.add(hub);
    root.add(w); wheels.push(w);
  }

  // ---------- mirrors, cladding ----------
  for (const sd of [-1, 1]) {
    const mx = H1 - 0.2, mirror = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.paint);
    mirror.scale.set(0.1, 0.07, 0.11); mirror.position.set(mx, belt(mx) + 0.08, sd * (halfW(mx) + 0.08)); root.add(mirror);
    box(0.07, 0.035, 0.09, M.black, mx + 0.02, belt(mx) + 0.04, sd * (halfW(mx) + 0.01));
  }
  if (P.cladding) {
    for (const sd of [-1, 1]) {
      patch(bodySurf, 0.15, L - 0.15, sd > 0 ? -0.75 : PI + 0.3, sd > 0 ? -0.3 : PI + 0.75, 60, 4, 0.004, M.black);
      for (const a of [rearAxle, frontAxle]) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(archR + 0.02, 0.04, 8, 32, PI), M.black);
        t.position.set(a, archY, sd * (halfW(a) - 0.01)); root.add(t);
      }
    }
  }

  P.details?.({ THREE, root, M, o, L, W, H, R, belt, bottom, halfW, roofY, glassSurf, bodySurf,
    rearTop, rearBot, bumperTop, lampY, frontTop, frontBot, bedEnd,
    patch, panel, box, tube });

  return {
    group: root, length: L, width: W, materials: M, doorNames: Object.keys(doors),
    setColour(hex) { M.paint.color.set(hex); M.roof.color.set(hex); deepenRoof(); },
    setLights(on) { M.tail.emissiveIntensity = on ? 2.6 : 0.5; M.head.emissiveIntensity = on ? 4 : 0.35; },
    setDoor(name, open) {
      const d = doors[name]; if (!d) return;
      d.target = open ? (name === 'tailgate' ? (P.bed ? 0.85 : -1.04) : (d.side < 0 ? -1.02 : 1.02)) : 0;
    },
    snapDoors() {
      for (const [name, d] of Object.entries(doors)) {
        if (name === 'tailgate') d.pivot.rotation.z = d.target; else d.pivot.rotation.y = d.target;
      }
    },
    update(dt, kmh = 0) {
      const k = clamp(dt * 6);
      for (const [name, d] of Object.entries(doors)) {
        if (name === 'tailgate') d.pivot.rotation.z += (d.target - d.pivot.rotation.z) * k;
        else d.pivot.rotation.y += (d.target - d.pivot.rotation.y) * k;
      }
      for (const w of wheels) w.rotation.z -= (kmh / 3.6) * dt / R;
    },
  };
}
