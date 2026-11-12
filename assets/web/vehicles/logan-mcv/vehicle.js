// SPDX-License-Identifier: GPL-3.0-or-later
// Vehicle "Logan MCV" (family three-pbr): procedural Dacia Logan MCV II-style estate, built from lofted cross-sections.
// Local axes: +x = forward (rear bumper at x=0, front bumper at x=L), +y = up, +z = right side, -z = driver side.
// Everything here is generated in code: no external model, no licence strings attached.
// The reference shape is refined below by the options supplied for each build.
// smooth piecewise interpolation through [x, value] keys
function keys(k) {
  return (x) => {
    if (x <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (x <= k[i][0]) {
        let t = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
        t = t * t * (3 - 2 * t);
        return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * t;
      }
    }
    return k[k.length - 1][1];
  };
}

export function buildCar(opts = {}) {
  // Keep the detailed Logan mesh authored in its original 4.49 x 1.73 m reference
  // coordinates. The manifest defines the output dimensions and the lofted roof.
  // Profile helpers are scoped to each build, so two differently configured cars
  // cannot modify each other's surfaces or wheel radii.
  const THREE = opts.THREE;
  if (!THREE) throw new Error('A three.js instance is required');
  const o = opts.options || {};
  const dimension = (v, fallback, lo, hi) =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
  const L = 4.49, WIDTH = 1.73, BASE_ROOF = 1.525;
  const length = dimension(o.length, L, 3.9, 5.2);
  const width = dimension(o.width, WIDTH, 1.55, 2.05);
  const sx = length / L, sz = width / WIDTH;
  const WHEEL_R = dimension(o.wheelRadius, 0.31, 0.27, 0.40);
  const ride = dimension(o.rideHeight, 0, 0, 0.15);
  const archTube = dimension(o.archTube, 0.035, 0.02, 0.09);
  const rearAxle = dimension(o.rearOverhang, 0.8 * sx, 0.55, 1.1);
  const wheelbase = dimension(o.wheelbase, 2.88 * sx, 2.5, 3.15);
  if (rearAxle + wheelbase >= length - 0.40) throw new Error('Axles must fit within the vehicle length');
  const AXLE_R = rearAxle / sx, AXLE_F = (rearAxle + wheelbase) / sx;
  const roofHeight = dimension(o.roofHeight, BASE_ROOF, 1.36, 1.72);
  const roofWidth = dimension(o.roofWidth, 0.61, 0.51, 0.72);
  const G0 = dimension(o.rearRoofX, 0.035, 0.03, 0.14);
  const G1 = dimension(o.windscreenX, 3.47, 3.30, 3.60);
  const colour = opts.colour ?? 0x1b3a7a;

  // The fixed body and trim remain at high detail; the upper loft is driven
  // independently by roof, windscreen and rear-roof positions from vehicle.json.
// ---- lower body (everything below the window line) ----
const bodyTop = keys([[0, 0.98], [0.05, 1.03], [0.35, 1.05], [2.0, 1.03], [3.3, 1.01], [3.62, 0.99], [4.2, 0.94], [4.42, 0.88], [4.49, 0.74]]);
const bodyBot = keys([[0, 0.34], [0.12, 0.25], [0.5, 0.2], [3.95, 0.2], [4.34, 0.25], [4.49, 0.34]]);
function plan(x) {                 // rounded corners seen from above
  const rear = x < L / 2, r = rear ? 0.2 : 0.34, d = rear ? x : L - x;
  if (d >= r) return 1;
  const u = 1 - d / r;
  return (rear ? 0.86 : 0.8) + (rear ? 0.14 : 0.2) * Math.sqrt(1 - u * u);
}
const halfW = (x) => (WIDTH / 2) * plan(x);
const E = 5.5;                     // superellipse exponent: boxy with rounded edges
const se = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / E);

// theta: 0 = right side (+z) mid-height, PI/2 = top, PI = left side (-z), 3PI/2 = bottom
function bodySurf(x, th) {
  const yb = bodyBot(x), yt = bodyTop(x), hw = halfW(x);
  const yc = (yb + yt) / 2, hh = (yt - yb) / 2;
  return new THREE.Vector3(x, yc + hh * se(Math.sin(th)), hw * se(Math.cos(th)));
}

// ---- greenhouse (glass + roof) ----
const deltaRoof = roofHeight - BASE_ROOF;
const roofY = keys([[G0, 1.42 + deltaRoof * 0.75], [0.15, 1.49 + deltaRoof * 0.9],
  [0.45, roofHeight - 0.015], [1.6, roofHeight], [2.55, roofHeight - 0.020],
  [Math.max(2.65, G1 - 0.65), roofHeight - 0.075], [G1, bodyTop(G1) + 0.002]]);
const roofHW = keys([[G0, roofWidth * 0.934], [0.3, roofWidth * 0.984],
  [2.6, roofWidth], [G1, roofWidth * 1.082]]);
// s: 0 = right belt line, 0.5 = roof centre, 1 = left belt line
function glassSurf(x, s) {
  const yb = bodyTop(x) - 0.012, yr = Math.max(yb + 0.002, roofY(x));
  const hwb = halfW(x) - 0.035, hwt = roofHW(x);
  const a = Math.PI * s, sn = Math.max(0, Math.sin(a));
  const w = hwb + (hwt - hwb) * Math.pow(sn, 0.45);
  return new THREE.Vector3(x, yb + (yr - yb) * Math.pow(sn, 0.22), w * Math.cos(a));
}

// ---- generic surface patch builder ----
function patch(surf, x0, x1, t0, t1, nx, nt, off, mat, cap) {
  const pos = [], idx = [];
  const n = new THREE.Vector3(), du = new THREE.Vector3(), dv = new THREE.Vector3();
  for (let i = 0; i <= nx; i++) {
    const u = i / nx, x = x0 + (x1 - x0) * (cap === 'cos' ? (1 - Math.cos(Math.PI * u)) / 2 : u);
    for (let j = 0; j <= nt; j++) {
      const t = t0 + (t1 - t0) * (j / nt);
      const p = surf(x, t);
      if (off) {
        du.subVectors(surf(Math.min(L, x + 0.002), t), surf(Math.max(0, x - 0.002), t));
        dv.subVectors(surf(x, t + 0.002), surf(x, t - 0.002));
        n.crossVectors(du, dv).normalize();
        p.addScaledVector(n, off);
      }
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
    const a = i * (nt + 1) + j, b = a + nt + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// flat fan that closes an open end of a loft
function capAt(surf, x, t0, t1, nt, mat, flip) {
  const pos = [], idx = [];
  const ring = [];
  for (let j = 0; j <= nt; j++) ring.push(surf(x, t0 + (t1 - t0) * (j / nt)));
  const c = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  pos.push(c.x, c.y, c.z);
  ring.forEach((p) => pos.push(p.x, p.y, p.z));
  for (let j = 1; j <= nt; j++) flip ? idx.push(0, j + 1, j) : idx.push(0, j, j + 1);
  flip ? idx.push(0, 1, nt + 1) : idx.push(0, nt + 1, 1);   // close the last gap (open arches)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

const TAU = Math.PI * 2;


  const M = {
    // less metallic + softer clearcoat: the roof stays blue instead of mirroring the sky as a silver slab
    paint: new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0.2, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.18, specularIntensity: 0.55, envMapIntensity: 0.45, side: THREE.DoubleSide }),
    // tinted but see-through glass (a hearse has black/covered windows; a family estate doesn't)
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3a4b5e, metalness: 0.1, roughness: 0.03, clearcoat: 1, envMapIntensity: 0.55,
      transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }),
    // the roof faces the bright sky/studio light: same blue, but far less mirror so it doesn't read as a silver top
    roof: new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0.1, roughness: 0.55, clearcoat: 0, specularIntensity: 0.2, envMapIntensity: 0.2, side: THREE.DoubleSide }),
    headliner: new THREE.MeshStandardMaterial({ color: 0x33373e, roughness: 0.95, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.85 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.75, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 1, roughness: 0.15, side: THREE.DoubleSide }),
    tail: new THREE.MeshStandardMaterial({ color: 0x3a0006, emissive: 0xff1030, emissiveIntensity: 0.6, roughness: 0.25, side: THREE.DoubleSide }),
    head: new THREE.MeshStandardMaterial({ color: 0xcfd6e0, emissive: 0xfff3d6, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.1, side: THREE.DoubleSide }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc3cad4, metalness: 1, roughness: 0.28 }),
    cabin: new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 0.9, side: THREE.DoubleSide }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf2e9a0, roughness: 0.5, side: THREE.DoubleSide }),
  };
  M.roof.color.multiplyScalar(0.75);      // the roof catches the most sky light: a deeper shade looks like the same paint
  const car = new THREE.Group();

  // body shell + end caps
  car.add(patch(bodySurf, 0, L, 0, TAU, 110, 72, 0, M.paint, 'cos'));
  car.add(capAt(bodySurf, 0.0005, 0, TAU, 72, M.paint, true));
  car.add(capAt(bodySurf, L - 0.0005, 0, TAU, 72, M.paint, false));

  // greenhouse glass + rear window cap
  car.add(patch(glassSurf, G0, G1, 0, 1, 90, 40, 0, M.glass));
  // roof skin and pillars in body colour
  car.add(patch(glassSurf, 0.06, 2.8, 0.17, 0.83, 60, 30, 0.012, M.roof));
  // D-pillar and C-pillar in body colour; B-pillar black like the real car (splits the long glass area)
  for (const [a, b, mat] of [[0.035, 0.3, M.paint], [1.09, 1.18, M.paint], [1.95, 2.08, M.plastic]]) {
    car.add(patch(glassSurf, a, b, 0.0, 0.18, 6, 10, 0.006, mat));
    car.add(patch(glassSurf, a, b, 0.82, 1.0, 6, 10, 0.006, mat));
  }
  // black window frames along the top edge of the side glass
  car.add(patch(glassSurf, 0.3, 3.38, 0.165, 0.185, 50, 1, 0.009, M.plastic));
  car.add(patch(glassSurf, 0.3, 3.38, 0.815, 0.835, 50, 1, 0.009, M.plastic));

  // interior seen through the glass: light headliner, dark cabin floor, four headrests and seat backs
  car.add(patch(glassSurf, 0.08, 3.3, 0.2, 0.8, 50, 14, -0.035, M.headliner));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, WIDTH - 0.2), M.cabin);
  floor.rotation.x = -Math.PI / 2; floor.position.set(1.75, 1.058, 0); car.add(floor);
  const rest = new THREE.BoxGeometry(0.12, 0.17, 0.25), back = new THREE.BoxGeometry(0.1, 0.32, 0.5);
  for (const [x, y] of [[2.55, 1.22], [1.62, 1.2]]) for (const z of [-0.36, 0.36]) {
    const r = new THREE.Mesh(rest, M.seat); r.position.set(x, y, z); r.rotation.z = 0.15; car.add(r);
    const s = new THREE.Mesh(back, M.seat); s.position.set(x + 0.05, y - 0.22, z); s.rotation.z = 0.2; car.add(s);
  }
  car.add(patch(glassSurf, 2.6, 3.44, 0.08, 0.17, 24, 4, 0.007, M.paint));   // A-pillars
  car.add(patch(glassSurf, 2.6, 3.44, 0.83, 0.92, 24, 4, 0.007, M.paint));
  // chrome window line
  car.add(patch(glassSurf, 0.3, 3.38, 0.0, 0.012, 50, 1, 0.008, M.chrome));
  car.add(patch(glassSurf, 0.3, 3.38, 0.988, 1.0, 50, 1, 0.008, M.chrome));

  // plastic: sill cladding, rear + front bumper lower halves
  car.add(patch(bodySurf, 0.55, 3.95, -0.62, -0.18, 40, 6, 0.004, M.plastic));
  car.add(patch(bodySurf, 0.55, 3.95, Math.PI + 0.18, Math.PI + 0.62, 40, 6, 0.004, M.plastic));
  car.add(patch(bodySurf, 0.0, 0.55, Math.PI + 0.3, TAU - 0.3, 14, 24, 0.005, M.plastic));
  car.add(patch(bodySurf, 3.95, L, Math.PI + 0.3, TAU - 0.3, 14, 24, 0.005, M.plastic));

  // rear face details (tail lights wrap round the corners, plate, light bar)
  const tailL = [], tailR = [];
  tailR.push(patch(bodySurf, 0.0, 0.12, 0.35, 0.75, 6, 8, 0.006, M.tail), patch(glassSurf, 0.035, 0.1, 0.0, 0.12, 4, 8, 0.012, M.tail));
  tailL.push(patch(bodySurf, 0.0, 0.12, Math.PI - 0.75, Math.PI - 0.35, 6, 8, 0.006, M.tail), patch(glassSurf, 0.035, 0.1, 0.88, 1.0, 4, 8, 0.012, M.tail));
  tailL.concat(tailR).forEach((m) => car.add(m));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), M.plate);
  plate.position.set(-0.022, 0.64, 0); plate.rotation.y = -Math.PI / 2;
  // chrome strip across the tailgate above the plate (with the badge in the middle), like the real MCV
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.78), M.chrome);
  handle.position.set(-0.024, 0.79, 0);

  // ---- tailgate: rear glass + rear panel, hinged at the back of the roof ----
  const hingeT = new THREE.Vector3(G0, roofY(G0) + 0.01, 0);
  const tgPivot = new THREE.Group(); tgPivot.position.copy(hingeT);
  const tg = new THREE.Group();
  tg.add(capAt(glassSurf, G0 + 0.0005, 0, 1, 40, M.glass, true));
  tg.add(patch(glassSurf, 0.0, 0.09, 0.12, 0.88, 4, 20, 0.02, M.plastic));           // spoiler
  const hw0 = halfW(0) - 0.04, y0 = 0.56, y1 = bodyTop(0) + 0.02, rr = 0.08;
  const sp = new THREE.Shape();
  sp.moveTo(-hw0 + rr, y0); sp.lineTo(hw0 - rr, y0); sp.quadraticCurveTo(hw0, y0, hw0, y0 + rr);
  sp.lineTo(hw0, y1 - rr); sp.quadraticCurveTo(hw0, y1, hw0 - rr, y1); sp.lineTo(-hw0 + rr, y1);
  sp.quadraticCurveTo(-hw0, y1, -hw0, y1 - rr); sp.lineTo(-hw0, y0 + rr); sp.quadraticCurveTo(-hw0, y0, -hw0 + rr, y0);
  // a thin skin flush with the body (it used to be a 6 cm slab that buried the plate, handle and badge)
  const panelG = new THREE.ExtrudeGeometry(sp, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.01, bevelSegments: 2 });
  const panel = new THREE.Mesh(panelG, M.paint);
  panel.rotation.y = -Math.PI / 2; panel.position.x = 0.002;
  tg.add(panel, plate, handle);
  // Rear-window wiper, high-mounted stop lamp and a raised chrome badge: visible in the driving view.
  const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.48), M.plastic);
  wiper.position.set(-0.024, 1.16, -0.08); wiper.rotation.x = 0.10; tg.add(wiper);
  const thirdLamp = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.045, 0.34), M.tail);
  thirdLamp.position.set(-0.023, 1.435, 0); tg.add(thirdLamp);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.22), M.chrome);
  badge.position.set(-0.03, 0.79, 0); badge.scale.set(1, 1.6, 0.5); tg.add(badge);
  // tall rear light clusters on the tailgate corners, wrapping into the body-side lamps
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.3, 0.15), M.tail);
    lens.position.set(-0.016, 0.86, side * (halfW(0) - 0.12)); tg.add(lens);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.11), M.chrome);
    inner.position.set(-0.02, 0.8, side * (halfW(0) - 0.12)); tg.add(inner);   // reversing-lamp section
  }
  // dark lower bumper across the rear
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, halfW(0) * 1.9), M.plastic);
  bumper.position.set(-0.008, 0.4, 0); car.add(bumper);
  tg.position.sub(hingeT);
  tgPivot.add(tg);
  car.add(tgPivot);
  // luggage space revealed when the tailgate lifts
  const boot = new THREE.Mesh(new THREE.ShapeGeometry(sp), M.cabin);
  boot.rotation.y = -Math.PI / 2; boot.position.x = -0.003; car.add(boot);
  const bootGlass = capAt(glassSurf, G0 + 0.004, 0, 1, 40, M.cabin, true); car.add(bootGlass);
  const tailgate = { pivot: tgPivot, axis: 'z' };
  // front: headlights, grille, lower intake
  car.add(patch(bodySurf, 4.12, 4.47, 0.2, 0.62, 10, 8, 0.006, M.head));
  car.add(patch(bodySurf, 4.12, 4.47, Math.PI - 0.62, Math.PI - 0.2, 10, 8, 0.006, M.head));
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.16), M.plastic);
  grille.position.set(L + 0.004, 0.68, 0); grille.rotation.y = Math.PI / 2; car.add(grille);
  const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.74), M.chrome);
  grilleBar.position.set(L + 0.008, 0.72, 0); car.add(grilleBar);
  // Fog lights, rear reflectors and exhaust complete the front/rear bumper geometry.
  for (const side of [-1, 1]) {
    const fog = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.075, 0.13), M.head);
    fog.position.set(L + 0.012, 0.42, side * 0.58); car.add(fog);
    const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.06, 0.17), M.tail);
    reflector.position.set(-0.014, 0.37, side * 0.61); car.add(reflector);
  }
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 12), M.chrome);
  exhaust.rotation.z = Math.PI / 2; exhaust.position.set(-0.075, 0.29, 0.53); car.add(exhaust);
  if (o.cladding) {
    // Stepway-style raised sill protection and satin skid plates distinguish the crossover.
    for (const side of [-1, 1]) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.14, 0.05), M.plastic);
      sill.position.set(2.25, 0.31, side * (WIDTH / 2 + 0.015)); car.add(sill);
    }
    for (const xx of [0.003, L + 0.003]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.17, 0.85), M.chrome);
      skid.position.set(xx, 0.39, 0); car.add(skid);
    }
  }

  // wheels and arches
  const wheels = [];
  for (const ax of [AXLE_R, AXLE_F]) for (const side of [-1, 1]) {
    const z = side * (halfW(ax) - 0.07);
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.2, 40), M.tyre);
    tyre.rotation.x = Math.PI / 2; w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.205, 28), M.rim);
    rim.rotation.x = Math.PI / 2; w.add(rim);
    for (let k = 0; k < 5; k++) {           // five spokes
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.01), M.plastic);
      sp.position.z = side * 0.104; sp.rotation.z = (k / 5) * Math.PI; w.add(sp);
    }
    w.position.set(ax, WHEEL_R - ride, z);   // wheels stay on the ground when the body is raised
    w.scale.x = 1 / sx;                    // keep tyres circular after body length scaling
    w.scale.z = 1 / sz;                    // wheel width does not grow with vehicle width
    car.add(w); wheels.push(w);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.08, archTube, 8, 32, Math.PI), M.plastic);
    arch.position.set(ax, WHEEL_R, side * (halfW(ax) + 0.004));
    arch.scale.x = 1 / sx; car.add(arch);
    const well = new THREE.Mesh(new THREE.CircleGeometry(WHEEL_R + 0.075, 32, 0, Math.PI), M.cabin);
    well.position.set(ax, WHEEL_R, side * (halfW(ax) + 0.002));
    well.scale.x = 1 / sx;
    if (side < 0) well.rotation.y = Math.PI;
    car.add(well);
  }

  // mirrors
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.paint); m.scale.set(0.09, 0.065, 0.1);
    m.position.set(3.22, 1.08, side * (halfW(3.22) + 0.05)); car.add(m);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.08), M.plastic); stalk.position.set(3.25, 1.05, side * (halfW(3.22) - 0.02)); car.add(stalk);
  }

  // Roof rails are optional for themes that reuse the builder, and thicker on the crossover.
  if (o.roofRails !== false) for (const s of [0.24, 0.76]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const x = 0.35 + (2.25 * i) / 12; pts.push(glassSurf(x, s).add(new THREE.Vector3(0, 0.06, 0))); }
    car.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.017, 8), M.plastic));
    for (const x of [0.4, 2.55]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.04), M.plastic);
      f.position.copy(glassSurf(x, s)).add(new THREE.Vector3(0, 0.035, 0)); car.add(f);
    }
  }
  if (o.cladding) for (const x of [0.8, 2.3]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.035, 0.95), M.plastic);
    bar.position.copy(glassSurf(x, 0.5)).add(new THREE.Vector3(0, 0.11, 0)); car.add(bar);
  }

  // doors: skins that sit on the body and hinge at their front edge
  const TH0 = Math.PI - 0.98, TH1 = Math.PI + 0.42;     // left (driver) side band
  function door(x0, x1, left) {
    const t0 = left ? TH0 : TAU - TH1 - Math.PI + Math.PI, t1 = left ? TH1 : 0.98;
    const lo = left ? TH0 : -0.42, hi = left ? TH1 : 0.98;
    const hingeP = bodySurf(x1, left ? Math.PI : 0);
    const pivot = new THREE.Group(); pivot.position.copy(hingeP);
    const g = new THREE.Group();
    const skin = patch(bodySurf, x0, x1, lo, hi, 20, 14, 0.007, M.paint);
    const win = patch(glassSurf, x0 + 0.03, x1 - 0.03, left ? 0.82 : 0.0, left ? 1.0 : 0.18, 12, 8, 0.009, M.glass);
    const handleD = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), M.chrome);
    handleD.position.copy(bodySurf(x0 + 0.18, left ? Math.PI - 0.62 : 0.62)).add(new THREE.Vector3(0, 0, left ? -0.012 : 0.012));
    g.add(skin, win, handleD);
    g.position.sub(hingeP);
    pivot.add(g);
    // the opening behind the door (only visible when it swings open)
    car.add(patch(bodySurf, x0 + 0.01, x1 - 0.01, lo + 0.03, hi - 0.03, 10, 8, 0.003, M.cabin));
    // shut lines
    for (const xs of [x0, x1]) car.add(patch(bodySurf, xs - 0.004, xs + 0.004, lo, hi, 1, 14, 0.0075, M.plastic));
    car.add(pivot);
    return { pivot, left };
  }
  const doors = {
    frontLeft: door(2.05, 3.17, true), rearLeft: door(1.18, 2.05, true),
    frontRight: door(2.05, 3.17, false), rearRight: door(1.18, 2.05, false),
  };

  // tailgate opening is shown as a raised angle on the whole rear glass + panel? kept simple: flag only
  car.position.y = ride;
  car.scale.set(sx, 1, sz);
  const api = {
    group: car,
    materials: M,
    setColour(hex) { M.paint.color.set(hex); M.roof.color.set(hex).multiplyScalar(0.75); },
    setLights(on) {
      M.tail.emissiveIntensity = on ? 2.6 : 0.6;
      M.head.emissiveIntensity = on ? 4.5 : 0.4;
    },
    setDoor(name, open) {
      if (name === 'tailgate') { tailgate.target = open ? -1.25 : 0; return; }
      const d = doors[name]; if (!d) return;
      d.target = open ? (d.left ? -1.05 : 1.05) : 0;
    },
    update(dt, kmh = 0) {
      const spin = (kmh / 3.6) * dt / WHEEL_R;          // wheels roll with the real speed
      for (const w of wheels) w.rotation.z -= spin;
      if (tailgate.target != null) tailgate.pivot.rotation.z += (tailgate.target - tailgate.pivot.rotation.z) * Math.min(1, dt * 5);
      for (const d of Object.values(doors)) {
        if (d.target == null) continue;
        d.pivot.rotation.y += (d.target - d.pivot.rotation.y) * Math.min(1, dt * 6);
      }
    },
    isOpen(name) {
      if (name === 'tailgate') return !!tailgate.target;
      return !!(doors[name] && doors[name].target);
    },
    snapDoors() { for (const d of Object.values(doors)) if (d.target != null) d.pivot.rotation.y = d.target; if (tailgate.target != null) tailgate.pivot.rotation.z = tailgate.target; },
    doorNames: ['frontLeft', 'rearLeft', 'frontRight', 'rearRight', 'tailgate'],
    length, width,
  };
  return api;
}

/** Standard entry point for three-pbr vehicles (see THEMES.md). */
export function build(opts) { return buildCar(opts); }

export default { build };
