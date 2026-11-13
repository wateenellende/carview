// SPDX-License-Identifier: GPL-3.0-or-later
// CarView theme "Modern 3D": smooth three.js scene. Vehicle family: three-pbr (see THEMES.md).
// The runtime (sdk/runtime.js) calls frame(dt, state) about 30 times a second and hands over the vehicle module.
import * as THREE from '../../lib/three.module.js';
import { RoomEnvironment } from '../../lib/RoomEnvironment.js';

// Colours for each kind of sky. The scene glides between them, so dusk → night is a smooth fade.
const SKY = {
  day:   { top: 0x2f6fd0, mid: 0x6fa6e6, hor: 0xd7e6f2, fog: 0xa9c4dc, ground: 0x2a4024, hill: 0x5d7a8f,
           hemiS: 0xdfeeff, hemiG: 0x2a3a22, hemi: 0.9, sunC: 0xfff1dc, sun: 2.2, env: 1.0, exp: 1.0, lamp: 0x8892a8 },
  dusk:  { top: 0x0c1d3d, mid: 0x5a3c78, hor: 0xf08a5d, fog: 0x3a2a55, ground: 0x1a2418, hill: 0x241634,
           hemiS: 0xffd2b0, hemiG: 0x1a2418, hemi: 0.6, sunC: 0xffb27a, sun: 1.6, env: 0.9, exp: 1.05, lamp: 0xc9a98a },
  night: { top: 0x02040b, mid: 0x060b1a, hor: 0x0d1730, fog: 0x070c1a, ground: 0x06090f, hill: 0x050812,
           hemiS: 0x223355, hemiG: 0x05070c, hemi: 0.25, sunC: 0x7f9fff, sun: 0.35, env: 0.35, exp: 0.9, lamp: 0xffd9a0 },
};

// Camera poses: driving (behind the car) and parked-with-something-open (rear corner view).
const POSE = {
  drive: { pos: new THREE.Vector3(0.6, 3.6, 9.2), look: new THREE.Vector3(1.6, 0.2, -12) },   // a little above: shows the road ahead
  open:  { pos: new THREE.Vector3(-3.6, 3.0, 7.4), look: new THREE.Vector3(2.1, 0.55, -0.2) },
};
const LANE_X = 1.9;          // the car drives in the right-hand lane

function create(canvas, api) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const s = new THREE.Scene();
  s.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // sky dome: a three-colour gradient whose colours can change every frame
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying float vy;
      void main(){ vec3 c = vy > 0.25 ? mix(mid, top, clamp((vy-0.25)/0.6,0.0,1.0)) : mix(hor, mid, clamp(vy/0.25,0.0,1.0));
      gl_FragColor = vec4(c,1.0);
      #include <colorspace_fragment>
      }`,
  }));
  s.add(sky);
  s.fog = new THREE.Fog(0x000000, 25, 140);

  const hillMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(160, 160, 14, 64, 1, true), hillMat);
  hill.position.y = 3; s.add(hill);

  // road: canvas texture with lane markings; it scrolls with the real speed
  const tc = document.createElement('canvas'); tc.width = 256; tc.height = 512; const t = tc.getContext('2d');
  t.fillStyle = '#23262d'; t.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 4000; i++) { t.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; t.fillRect(Math.random() * 256, Math.random() * 512, 1, 1); }
  t.fillStyle = '#d9dde6'; t.fillRect(10, 0, 6, 512); t.fillRect(240, 0, 6, 512); t.fillRect(124, 0, 8, 260);
  const tex = new THREE.CanvasTexture(tc);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 1); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // ---- Road: one continuous path, so it always connects and can turn a real corner ----
  // The main road follows how the car is actually driving: its bend right under the car comes from the GPS turn
  // rate (or a steering angle), the road behind curves the same way, and ahead it slowly straightens out.
  // A turn announced by navigation is a SIDE ROAD that splits off at the remaining distance; if the driver
  // takes it, GPS bends the main road the same way and the two merge; if not, it simply passes by.
  const SEG = 2, S_MIN = -30, ROAD_N = 150, HALF = 4.5, BRANCH_N = 70;
  const I0 = -S_MIN / SEG;                                          // index of the sample under the car
  const PX = new Float32Array(ROAD_N + 1), PZ = new Float32Array(ROAD_N + 1), PH = new Float32Array(ROAD_N + 1);
  const roadMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  function makeStrip(n, mat = roadMaterial) {
    const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), nrm = new Float32Array((n + 1) * 6), idx = [];
    for (let i = 0; i <= n; i++) {
      const v = i * SEG / 10;                                     // texture repeats every 10 m along the road
      uv.set([0, v, 1, v], i * 4); nrm.set([0, 1, 0, 0, 1, 0], i * 6);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; s.add(mesh);
    return { mesh, pos, geo };
  }
  // write a strip along centre points (x, z, heading h; h = 0 straight ahead, + = turning right)
  function writeStrip(strip, n, X, Z, H, half, y) {
    for (let i = 0; i <= n; i++) {
      const rx = Math.cos(H[i]) * half, rz = Math.sin(H[i]) * half;    // to the right of the road
      strip.pos.set([X[i] - rx, y, Z[i] - rz, X[i] + rx, y, Z[i] + rz], i * 6);
    }
    strip.geo.attributes.position.needsUpdate = true;
  }
  const road = makeStrip(ROAD_N), branch = makeStrip(BRANCH_N);
  // the navigation route: a blue line in our lane that follows the road and takes the announced turn, so the
  // turn can be seen ~20 s ahead (a bend far down the road alone is hard to see from behind the car)
  const ROUTE_N = 120;
  const routeMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const route = makeStrip(ROUTE_N, routeMat);
  const RX = new Float32Array(ROUTE_N + 1), RZ = new Float32Array(ROUTE_N + 1), RH = new Float32Array(ROUTE_N + 1);
  const BX = new Float32Array(BRANCH_N + 1), BZ = new Float32Array(BRANCH_N + 1), BH = new Float32Array(BRANCH_N + 1);
  // onMain: how much the navigation turn is part of the main road (far away); split: how much it is a side road
  // (close by, and the car is NOT turning that way). Close by and turning that way: the GPS bend alone (merged).
  const bend = { k: 0, at: 999, dir: 0, amount: 0, yaw: 0, onMain: 0, split: 0 };
  const TURN_R = 12;                                         // radius of a navigation turn, metres
  function navCurvature(sAt) {
    if (bend.onMain < 0.01 || !bend.dir) return 0;
    const u = sAt - bend.at, arc = bend.amount * Math.PI / 2 * TURN_R;
    return u >= 0 && u <= arc ? bend.onMain * bend.dir / TURN_R : 0;
  }
  const curvature = (sAt) => (sAt < 0 ? bend.k : bend.k * Math.max(0, 1 - sAt / 40)) + navCurvature(sAt);
  function layRoad(originZ) {
    PX[I0] = 0; PZ[I0] = originZ; PH[I0] = 0;
    for (let i = I0 + 1; i <= ROAD_N; i++) {              // forwards from the car
      const h = PH[i - 1] + curvature(S_MIN + (i - 0.5) * SEG) * SEG, hm = (PH[i - 1] + h) / 2;
      PX[i] = PX[i - 1] + Math.sin(hm) * SEG; PZ[i] = PZ[i - 1] - Math.cos(hm) * SEG; PH[i] = h;
    }
    for (let i = I0 - 1; i >= 0; i--) {                   // backwards: the road we came from
      const h = PH[i + 1] - curvature(S_MIN + (i + 0.5) * SEG) * SEG, hm = (PH[i + 1] + h) / 2;
      PX[i] = PX[i + 1] - Math.sin(hm) * SEG; PZ[i] = PZ[i + 1] + Math.cos(hm) * SEG; PH[i] = h;
    }
    writeStrip(road, ROAD_N, PX, PZ, PH, HALF, 0);
  }
  function pathAt(sAt) {                                  // centre point and heading sAt metres along the road
    const f = Math.max(0, Math.min(ROAD_N - 1e-3, (sAt - S_MIN) / SEG)), i = Math.floor(f), w = f - i;
    return { x: PX[i] + (PX[i + 1] - PX[i]) * w, z: PZ[i] + (PZ[i + 1] - PZ[i]) * w, h: PH[i] + (PH[i + 1] - PH[i]) * w };
  }
  function layBranch() {                                  // side road for the navigation turn
    const show = bend.split > 0.02 && bend.amount > 0.02 && bend.dir !== 0 && bend.at < 260;
    branch.mesh.visible = show;
    if (!show) return;
    const p0 = pathAt(bend.at), R = TURN_R, angle = bend.amount * bend.split * Math.PI / 2, arc = angle * R;
    BX[0] = p0.x; BZ[0] = p0.z; BH[0] = p0.h;
    for (let j = 1; j <= BRANCH_N; j++) {
      const u = (j - 0.5) * SEG, h = p0.h + bend.dir * Math.min(j * SEG, arc) / R;
      const hm = (BH[j - 1] + h) / 2;
      BX[j] = BX[j - 1] + Math.sin(hm) * SEG; BZ[j] = BZ[j - 1] - Math.cos(hm) * SEG; BH[j] = h;
    }
    writeStrip(branch, BRANCH_N, BX, BZ, BH, HALF * 0.9, 0.006);
  }
  // route line: along the main road in our lane up to the turn, then into the turn (main road bend far away,
  // side road when it splits off close by), then a little way beyond
  function layRoute(show) {
    routeMat.opacity += ((show ? 0.72 : 0) - routeMat.opacity) * 0.15;
    route.mesh.visible = routeMat.opacity > 0.02;
    if (!route.mesh.visible) return;
    const arc = bend.amount * Math.PI / 2 * TURN_R, useBranch = bend.split > 0.5 && branch.mesh.visible;
    const end = Math.min(ROAD_N * SEG + S_MIN - 2, bend.at + arc + 45), step = (end - 3) / ROUTE_N;
    for (let i = 0; i <= ROUTE_N; i++) {
      const sAt = 3 + i * step;
      let x, z, h;
      if (useBranch && sAt > bend.at) {
        const f = Math.min(BRANCH_N - 1e-3, (sAt - bend.at) / SEG), j = Math.floor(f), w = f - j;
        x = BX[j] + (BX[j + 1] - BX[j]) * w; z = BZ[j] + (BZ[j + 1] - BZ[j]) * w; h = BH[j] + (BH[j + 1] - BH[j]) * w;
      } else { const p = pathAt(sAt); x = p.x; z = p.z; h = p.h; }
      RX[i] = x + Math.cos(h) * LANE_X; RZ[i] = z + Math.sin(h) * LANE_X; RH[i] = h;   // our (right-hand) lane
    }
    writeStrip(route, ROUTE_N, RX, RZ, RH, 0.7, 0.02);
  }
  // ---- roundabout: when Maps announces one, the road ends at a real roundabout (ring road round a grass
  // island, with its other roads) and the route line goes anticlockwise round it to our exit and out.
  // Far away it sits at the (pulled-in) navigation distance; from 12 m before the entry it stays put in the
  // world and only moves by our own speed and GPS heading, so steering round it matches what we see.
  const RB_R = 14, RB_HW = 3.6;                                   // centre-line radius, half width of the ring road
  const rbTc = document.createElement('canvas'); rbTc.width = rbTc.height = 128; const rbT = rbTc.getContext('2d');
  rbT.fillStyle = '#23262d'; rbT.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { rbT.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.05 + ')'; rbT.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  const rbTex = new THREE.CanvasTexture(rbTc); rbTex.wrapS = rbTex.wrapT = THREE.RepeatWrapping; rbTex.repeat.set(6, 6);
  rbTex.colorSpace = THREE.SRGBColorSpace;
  const rbRoadMat = new THREE.MeshStandardMaterial({ map: rbTex, roughness: 0.55 });
  const armTex = tex.clone(); armTex.needsUpdate = true;                     // same markings as the road, not scrolling
  const armMat = new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.55 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9dde6 });
  const rb = new THREE.Group(); rb.visible = false; s.add(rb);
  const flat = (m, y) => { m.rotation.x = -Math.PI / 2; m.position.y = y; rb.add(m); return m; };
  flat(new THREE.Mesh(new THREE.RingGeometry(RB_R - RB_HW, RB_R + RB_HW, 96, 1), rbRoadMat), 0.012);
  flat(new THREE.Mesh(new THREE.RingGeometry(RB_R + RB_HW - 0.25, RB_R + RB_HW - 0.1, 96, 1), lineMat), 0.02);
  flat(new THREE.Mesh(new THREE.RingGeometry(RB_R - RB_HW - 0.35, RB_R - RB_HW, 96, 1), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.8 })), 0.07);
  flat(new THREE.Mesh(new THREE.CircleGeometry(RB_R - RB_HW - 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x5b8a45, roughness: 1 })), 0.08);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3, r = i % 3 === 0 ? 2 : 6.5, b = new THREE.Mesh(new THREE.SphereGeometry(i % 3 === 0 ? 1.6 : 1, 12, 8), bushMat);
    b.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r); b.scale.y = 0.75; rb.add(b);
  }
  const ARM_L = 70, arms = [];
  for (let i = 0; i < 6; i++) {                                     // the roads leaving the roundabout
    const g = new THREE.PlaneGeometry(HALF * 2, ARM_L), uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setY(j, uv.getY(j) * ARM_L / 10);   // markings repeat every 10 m
    const m = new THREE.Mesh(g, armMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.006;
    const holder = new THREE.Group(); holder.add(m); holder.visible = false; rb.add(holder); arms.push({ holder, m });
  }
  const rbState = { on: false, anchored: false, inside: false, cx: 0, cz: 0, h: 0, shape: null, entryS: 0 };
  const dirOf = (h) => [Math.sin(h), -Math.cos(h)];                  // heading -> (x, z); h = 0 straight ahead
  function setArms(shape) {
    arms.forEach((a, i) => {
      const deg = shape && shape.arms[i];
      a.holder.visible = deg != null;
      if (deg == null) return;
      const h = deg * Math.PI / 180, [dx, dz] = dirOf(h), d = RB_R + RB_HW - 0.5 + ARM_L / 2;
      a.holder.position.set(dx * d, 0, dz * d); a.holder.rotation.y = -h;
    });
  }
  // returns true while a roundabout is being shown
  function updateRoundabout(st, v, dt, lead) {
    const n = st.nav, want = n && n.roundabout && n.distance != null ? n : null;
    const S = rbState;
    if (want && !S.on) { S.on = true; S.anchored = false; S.inside = false; }
    if (S.on && want) S.shape = want.roundabout;
    if (!S.on) { rb.visible = false; return false; }
    if (want && !S.anchored) {
      const d = Math.max(0, want.distance);
      if (d <= 12 && S.placed) S.anchored = true;
      else {
        S.entryS = d <= 25 ? d : 25 + (Math.min(d, lead) - 25) * 45 / Math.max(1, lead - 25);   // pulled in, like turns
        const e = pathAt(S.entryS), [dx, dz] = dirOf(e.h);
        S.cx = e.x + dx * (RB_R + RB_HW); S.cz = e.z + dz * (RB_R + RB_HW); S.h = e.h; S.placed = true;
        rb.visible = want.distance < lead + 40;
      }
    }
    if (!want && !S.anchored) { S.on = false; S.placed = false; rb.visible = false; return false; }
    if (S.anchored) {
      // stay put in the world: the world moves toward us with our speed and turns against our own turning
      const dth = bend.k * v * dt, px = LANE_X, pz = carZ;
      const x = S.cx - px, z = S.cz - pz + v * dt;
      const c = Math.cos(dth), sn = Math.sin(dth);
      S.cx = px + x * c + z * sn; S.cz = pz - x * sn + z * c; S.h -= dth;
      const [dx, dz] = dirOf(S.h);
      const ez = S.cz - dz * (RB_R + RB_HW);
      S.entryS = Math.max(0, carZ - ez);                              // how far ahead the entry still is
      const far = Math.hypot(S.cx - px, S.cz - pz);
      S.inside = far < RB_R + RB_HW + 2;
      // done once Maps has moved on and the roundabout is well behind us
      if (!want && (S.cz - pz > RB_R + 25 || far > 140)) { S.on = false; S.placed = false; rb.visible = false; return false; }
      rb.visible = true;
    }
    rb.position.set(S.cx, 0, S.cz); rb.rotation.y = -S.h;
    setArms(S.shape);
    return true;
  }
  // route line round the roundabout: along the road to the entry, anticlockwise round the ring, out along the exit
  function layRouteRoundabout() {
    const S = rbState, pts = [];
    if (!S.shape || !rb.visible) return layRoute(false);
    for (let sAt = 3; sAt < S.entryS; sAt += 2) { const p = pathAt(sAt); pts.push([p.x + Math.cos(p.h) * LANE_X, p.z + Math.sin(p.h) * LANE_X]); }
    const exitA = S.shape.angle, steps = 40;
    for (let i = 0; i <= steps; i++) {                                 // from the entry (180 deg) down to the exit angle
      const a = (180 - (180 - exitA) * i / steps) * Math.PI / 180, [dx, dz] = dirOf(S.h + a);
      pts.push([S.cx + dx * RB_R, S.cz + dz * RB_R]);
    }
    const ha = S.h + exitA * Math.PI / 180, [ox, oz] = dirOf(ha), [rx, rz] = dirOf(ha + Math.PI / 2);
    for (let d = RB_R + RB_HW + 2; d < RB_R + 45; d += 3) pts.push([S.cx + ox * d + rx * LANE_X, S.cz + oz * d + rz * LANE_X]);
    // resample the polyline into the route strip
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = len[len.length - 1];
    if (total < 1) return layRoute(false);
    let j = 0;
    for (let i = 0; i <= ROUTE_N; i++) {
      const at = total * i / ROUTE_N;
      while (j < pts.length - 2 && len[j + 1] < at) j++;
      const w = Math.min(1, (at - len[j]) / Math.max(1e-6, len[j + 1] - len[j]));
      RX[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * w; RZ[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * w;
      RH[i] = Math.atan2(pts[j + 1][0] - pts[j][0], -(pts[j + 1][1] - pts[j][1]));
    }
    routeMat.opacity += (0.72 - routeMat.opacity) * 0.15; route.mesh.visible = true;
    writeStrip(route, ROUTE_N, RX, RZ, RH, 0.7, 0.03);
  }
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; s.add(ground);

  // street lights that stream past at the real speed
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial();
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 6, 8), armGeo = new THREE.BoxGeometry(0.6, 0.06, 0.06), headGeo = new THREE.SphereGeometry(0.22, 16, 8);
  const lamps = [];
  const SPACING = 16, COUNT = 12;
  for (let i = 0; i < COUNT; i++) for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(side * 6.2, 3, 0);
    const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(side * 5.9, 6, 0);
    const head = new THREE.Mesh(headGeo, lampMat); head.position.set(side * 5.6, 6, 0);
    g.add(pole, arm, head);
    g.userData.s = -8 + i * SPACING + (side > 0 ? SPACING / 2 : 0);   // metres along the road from the car
    s.add(g); lamps.push(g);
  }

  // the car
  // the vehicle comes from a separate package (family three-pbr); it is swapped in by setVehicle()
  let car = null;
  const carG = new THREE.Group();
  const sh = document.createElement('canvas'); sh.width = sh.height = 128; const shc = sh.getContext('2d');
  const rg = shc.createRadialGradient(64, 64, 8, 64, 64, 64); rg.addColorStop(0, 'rgba(0,0,0,0.8)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  shc.fillStyle = rg; shc.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; carG.add(shadow);
  carG.rotation.y = Math.PI / 2;               // nose points away from the camera
  carG.position.set(LANE_X, 0, 0);
  s.add(carG);

  // scene lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6); s.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(-6, 8, -12); s.add(sun);

  // headlight rig follows the car (not its rotation). Lights stay in the scene with intensity 0 when off,
  // so switching them never forces a shader rebuild (that would stutter).
  const rig = new THREE.Group(); s.add(rig);
  const spots = [];
  for (const xx of [-0.62, 0.62]) {
    const sp = new THREE.SpotLight(0xfff2d0, 0, 60, 0.38, 0.6, 1.4);
    sp.position.set(xx, 0.82, -2.3); sp.target.position.set(xx * 2, 0, -22);
    rig.add(sp, sp.target); spots.push(sp);
  }
  const red = new THREE.PointLight(0xff2030, 0, 4); red.position.set(0, 0.9, 2.6); rig.add(red);
  const pc = document.createElement('canvas'); pc.width = 128; pc.height = 256; const px = pc.getContext('2d');
  const gr = px.createRadialGradient(64, 230, 6, 64, 150, 150);
  gr.addColorStop(0, 'rgba(255,240,205,0.85)'); gr.addColorStop(0.45, 'rgba(255,236,196,0.35)'); gr.addColorStop(1, 'rgba(255,236,196,0)');
  px.fillStyle = gr; px.fillRect(0, 0, 128, 256);
  const poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  for (const xx of [-0.75, 0.75]) {               // pools of light the headlights throw on the road
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 15), poolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(xx, 0.02, -9.6); rig.add(pool);
  }

  // ---- weather: rain streaks (line segments) and snow flakes (points) in a box around the car ----
  const BOX = { x0: -14, x1: 16, y1: 12, z0: -45, z1: 9 };
  const RAIN_N = 1600, SNOW_N = 2400;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rainPos = new Float32Array(RAIN_N * 6), rainSeed = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    const x = rnd(BOX.x0, BOX.x1), y = rnd(0, BOX.y1), z = rnd(BOX.z0, BOX.z1);
    rainPos.set([x, y, z, x, y + 0.5, z], i * 6); rainSeed[i] = rnd(0.8, 1.2);
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd3f5, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.visible = false; s.add(rain);

  const snowPos = new Float32Array(SNOW_N * 3), snowSeed = new Float32Array(SNOW_N);
  for (let i = 0; i < SNOW_N; i++) { snowPos.set([rnd(BOX.x0, BOX.x1), rnd(0, BOX.y1), rnd(BOX.z0, BOX.z1)], i * 3); snowSeed[i] = Math.random() * 10; }
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const fc = document.createElement('canvas'); fc.width = fc.height = 32; const fx = fc.getContext('2d');
  const fg = fx.createRadialGradient(16, 16, 0, 16, 16, 16); fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
  fx.fillStyle = fg; fx.fillRect(0, 0, 32, 32);
  const snowMat = new THREE.PointsMaterial({ size: 0.2, map: new THREE.CanvasTexture(fc), transparent: true, opacity: 0, depthWrite: false });
  const snow = new THREE.Points(snowGeo, snowMat); snow.frustumCulled = false; snow.visible = false; s.add(snow);
  // ---- dry but windy: autumn leaves blow WITH the wind (rain and snow show the wind themselves) ----
  // Calm: none. Soft breeze: a few leaves skittering low over the road. Strong wind: many, lifted high.
  // They move the way the wind blows relative to the car (weather report direction + our compass heading).
  const LEAF_N = 120;
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const leafMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_N);
  leaves.frustumCulled = false; leaves.visible = false; s.add(leaves);
  const LEAF_COLOURS = [0xb5562a, 0xd08a2e, 0xe0b23c, 0x8a5a2b, 0x9c3b22, 0x7d8a3a].map((c) => new THREE.Color(c));
  const leafDummy = new THREE.Object3D();
  const placeLeaf = (l) => {
    l.x = rnd(BOX.x0, BOX.x1); l.z = rnd(BOX.z0, BOX.z1 - 4); l.y = 0.03; l.vy = 0;
    l.spin = rnd(3, 9); l.ax = rnd(0, 6.3); l.ay = rnd(0, 6.3); l.ph = rnd(0, 6.3);
    l.light = rnd(0.55, 1.1); l.eddy = rnd(0.6, 1.8); l.lift = rnd(0.4, 1);    // each leaf flies a little differently
    return l;
  };
  const leaf = Array.from({ length: LEAF_N }, (_, i) => { leaves.setColorAt(i, LEAF_COLOURS[i % LEAF_COLOURS.length]); return placeLeaf({}); });

  const roadMat = roadMaterial;
  const SNOW_GROUND = new THREE.Color(0xd9e2ec);
  let wet = 0, white = 0, fogK = 0, flash = 0, swayT = 0, rainAmt = 0, snowAmt = 0, leafAmt = 0, leafT = 0;

  // wx.side / wx.along: wind in km/h relative to the car (+ = blowing to the right / forward); wx.wind = strength
  function updateLeaves(dt, wx, v, gust) {
    const f = Math.max(0, Math.min(1, ((wx.wind || 0) - 8) / 45));          // 0 below 8 km/h … 1 at 53 km/h
    const want = rainAmt + snowAmt < 0.1 ? f : 0;
    leafAmt += (want - leafAmt) * (first ? 1 : Math.min(1, dt * 0.5));
    leaves.visible = leafAmt > 0.01;
    if (!leaves.visible) return;
    leafT += dt;
    const n = Math.max(1, Math.round(LEAF_N * Math.pow(leafAmt, 1.4)));      // a few in a breeze, many in a gale
    const ceiling = 0.2 + 3.8 * Math.pow(leafAmt, 1.3);                       // low in a breeze, high in a gale
    const wsx = (wx.side || 0) / 3.6, wsz = -(wx.along || 0) / 3.6;          // wind in m/s (scene: -z is forward)
    leaves.count = n;
    for (let i = 0; i < n; i++) {
      const l = leaf[i];
      // each leaf feels its own gusts and eddies; light leaves fly almost at wind speed
      const puff = gust * (0.75 + 0.35 * Math.sin(leafT * 0.8 * l.eddy + l.ph));
      const airborne = l.y > 0.06;
      const carry = (airborne ? 0.8 : 0.35) * l.light * puff;                // on the ground they only skitter
      const ex = Math.cos(leafT * l.eddy + l.ph) * 1.4 * leafAmt, ez = Math.sin(leafT * l.eddy * 1.3 + l.ph) * 1.4 * leafAmt;
      l.x += (wsx * carry + ex) * dt;
      l.z += (wsz * carry + ez + v) * dt;                                      // + v: the road streams past
      // gusts pick leaves up (higher with a stronger wind), gravity floats them down again
      if (!airborne && Math.random() < dt * (0.15 + 1.6 * leafAmt) * l.lift * puff) l.vy = rnd(1, 2.5) * (0.5 + leafAmt);
      l.vy -= 2.2 * dt; l.vy = Math.max(l.vy, -0.9);
      l.y = Math.max(0.03, Math.min(ceiling * l.lift + 0.1, l.y + l.vy * dt));
      if (l.y <= 0.03) l.vy = 0;
      // leaves leaving the patch around the car come back in on the upwind side
      if (l.z > BOX.z1) { l.z = BOX.z0 + rnd(0, 20); l.x = rnd(BOX.x0, BOX.x1); }
      else if (l.z < BOX.z0) { l.z = BOX.z1 - rnd(0, 6); l.x = rnd(BOX.x0, BOX.x1); }
      if (l.x > BOX.x1) l.x = BOX.x0 + rnd(0, 2); else if (l.x < BOX.x0) l.x = BOX.x1 - rnd(0, 2);
      const tumble = airborne ? leafT * l.spin * (0.4 + leafAmt) : 0;         // lying flat on the ground
      leafDummy.position.set(l.x, l.y, l.z);
      leafDummy.rotation.set(airborne ? l.ax + tumble : -Math.PI / 2, l.ay + tumble * 0.7, airborne ? Math.sin(leafT * 3 + l.ph) * 0.6 : l.ay);
      leafDummy.updateMatrix();
      leaves.setMatrixAt(i, leafDummy.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  function updateWeather(dt, st, v) {
    const wx = st.wx || {};
    const k = first ? 1 : Math.min(1, dt * 0.8);
    rainAmt += ((wx.kind === 'rain' ? wx.amount : 0) - rainAmt) * k;
    snowAmt += ((wx.kind === 'snow' ? wx.amount : 0) - snowAmt) * k;
    // side wind pushes rain, snow and leaves sideways (m/s); gusts come and go in step with the car's rocking
    const gust = 1 + 0.35 * (Math.sin(swayT * 0.9) * 0.6 + Math.sin(swayT * 2.3 + 0.7) * 0.4);
    const drift = (wx.side || 0) / 3.6 * 0.8 * gust;                 // m/s, + = toward the right
    const push = -(wx.along || 0) / 3.6 * 0.6 * gust;                 // m/s along the road (tail wind = forward)
    updateLeaves(dt, wx, v, gust);
    // rain: falls ~9 m/s, rushes toward the camera with the car's speed, streaks stretch with speed
    rain.visible = rainAmt > 0.02;
    if (rain.visible) {
      const n = Math.round(RAIN_N * rainAmt);
      rainGeo.setDrawRange(0, n * 2);
      const len = 0.35 + v * 0.025;
      for (let i = 0; i < n; i++) {
        const o = i * 6, f = rainSeed[i];
        let x = rainPos[o] + drift * dt, y = rainPos[o + 1] - 9 * f * dt, z = rainPos[o + 2] + (v + push) * dt;
        if (y < 0 || z > BOX.z1) { x = rnd(BOX.x0, BOX.x1); y = rnd(BOX.y1 * 0.5, BOX.y1); z = rnd(BOX.z0, BOX.z1 - 4); }
        else if (z < BOX.z0) z = BOX.z1 - rnd(0, 4);                    // blown forward by a tail wind
        if (x > BOX.x1) x -= BOX.x1 - BOX.x0; else if (x < BOX.x0) x += BOX.x1 - BOX.x0;
        rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
        rainPos[o + 3] = x - drift * len / (9 * f); rainPos[o + 4] = y + len;   // streaks lean into the wind
        rainPos[o + 5] = z - (v + push) * 0.02;
      }
      rainGeo.attributes.position.needsUpdate = true;
      rainMat.opacity = 0.18 + 0.32 * rainAmt;
      rainMat.color.set(st.sky === 'night' ? 0x7f95c8 : 0xbcd3f5);
    }
    // snow: drifts down ~1.2 m/s, wobbles, streams past with speed
    snow.visible = snowAmt > 0.02;
    if (snow.visible) {
      const n = Math.round(SNOW_N * snowAmt);
      snowGeo.setDrawRange(0, n);
      for (let i = 0; i < n; i++) {
        const o = i * 3, sd = snowSeed[i];
        let x = snowPos[o] + (Math.sin(swayT * 1.3 + sd) * 0.6 + drift) * dt;
        let y = snowPos[o + 1] - (1.0 + (sd % 1) * 0.6) * dt, z = snowPos[o + 2] + (v + push) * dt;
        if (y < 0 || z > BOX.z1) { x = rnd(BOX.x0, BOX.x1); y = rnd(BOX.y1 * 0.6, BOX.y1); z = rnd(BOX.z0, BOX.z1 - 4); }
        else if (z < BOX.z0) z = BOX.z1 - rnd(0, 4);
        if (x > BOX.x1) x -= BOX.x1 - BOX.x0; else if (x < BOX.x0) x += BOX.x1 - BOX.x0;
        snowPos[o] = x; snowPos[o + 1] = y; snowPos[o + 2] = z;
      }
      snowGeo.attributes.position.needsUpdate = true;
      snowMat.opacity = 0.55 + 0.4 * snowAmt;
    }
    // wet road gets shiny; snow whitens the fields; fog closes in
    wet += ((rainAmt > 0.05 ? 1 : 0) - wet) * Math.min(1, dt * 0.3);
    roadMat.roughness = 0.55 - 0.35 * wet;
    white += (((wx.kind === 'snow' ? wx.amount : 0)) - white) * Math.min(1, dt * 0.2);
    if (white > 0.01) groundMat.color.lerp(SNOW_GROUND, white * 0.85);
    fogK += ((wx.fog ? 1 : rainAmt * 0.5 + snowAmt * 0.6) - fogK) * k;
    s.fog.near = 40 - 33 * fogK; s.fog.far = 240 - 195 * fogK;      // clear air: turns 200+ m ahead stay visible
    // thunderstorm: an occasional lightning flash
    if (wx.thunder && Math.random() < dt * 0.12) flash = 1;
    flash = Math.max(0, flash - dt * 3.5);
    hemi.intensity += flash * 2.5;
    // side wind: the car drifts and rocks a little, more with gusts
    const sway = wx.sway || 0;
    swayT += dt * (1.2 + sway);
    const wob = Math.sin(swayT * 1.7) + 0.45 * Math.sin(swayT * 4.3 + 1.1);
    if (car) car.group.rotation.x = sway * 0.022 * wob;            // roll around the car's length
    return sway * 0.22 * wob;                              // sideways drift in metres
  }

  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 800);
  const camPos = POSE.drive.pos.clone(), camLook = POSE.drive.look.clone();

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // apply a sky palette instantly (first frame) or ease toward it
  const cur = {};
  const tmp = new THREE.Color();
  function easeSky(name, k) {
    const p = SKY[name] || SKY.dusk;
    for (const key of ['top', 'mid', 'hor', 'fog', 'ground', 'hill', 'hemiS', 'hemiG', 'sunC', 'lamp']) {
      if (!cur[key]) cur[key] = new THREE.Color(p[key]);
      cur[key].lerp(tmp.set(p[key]), k);
    }
    for (const key of ['hemi', 'sun', 'env', 'exp']) cur[key] = cur[key] == null ? p[key] : cur[key] + (p[key] - cur[key]) * k;
    skyU.top.value.copy(cur.top); skyU.mid.value.copy(cur.mid); skyU.hor.value.copy(cur.hor);
    s.fog.color.copy(cur.fog); groundMat.color.copy(cur.ground); hillMat.color.copy(cur.hill);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemi;
    sun.color.copy(cur.sunC); sun.intensity = cur.sun;
    s.environmentIntensity = cur.env; renderer.toneMappingExposure = cur.exp;
    lampMat.color.copy(cur.lamp);
  }

  // build every shader now (lights included) so switching the headlights on never stutters
  cam.position.copy(camPos); cam.lookAt(camLook); cam.updateMatrixWorld();
  renderer.compile(s, cam);

  let first = true, beam = 0, scale = 1, carZ = 0;
  let colourNow = null, vehicleMod = null, vehicleManifest = null;
  const box = new THREE.Box3(), corner = new THREE.Vector3();

  function buildVehicle() {
    if (car) { carG.remove(car.group); car.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); car = null; }
    if (!vehicleMod) return;
    const build = vehicleMod.build || (vehicleMod.default && vehicleMod.default.build);
    car = build({ THREE, colour: colourNow || (vehicleManifest && vehicleManifest.defaultColour) || '#1f3a6e', options: (vehicleManifest && vehicleManifest.options) || {} });
    car.group.position.x = -car.length / 2;
    carG.add(car.group);
    for (const n of car.doorNames || []) car.setDoor(n, false);
    first = true;                                       // snap doors/lights straight to the current state
    renderer.compile(s, cam);
  }

  return {
    setVehicle(mod, manifest) { vehicleMod = mod; vehicleManifest = manifest; buildVehicle(); },
    /** Screen rectangle of the vehicle (CSS pixels), so the dashboard knows where a tap means "next vehicle". */
    vehicleRect() {
      if (!car) return null;
      box.setFromObject(carG);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        const x = (corner.x + 1) / 2 * window.innerWidth, y = (1 - corner.y) / 2 * window.innerHeight;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    /** state: see THEMES.md (speed, lights, doors, nav {distance, dir, amount}, turnRate, steer, sky, openView, wx, colour, bearing) */
    frame(dt, st) {
      if (st.colour && st.colour !== colourNow) { colourNow = st.colour; if (car) car.setColour(colourNow); }
      const k = first ? 1 : Math.min(1, dt * 1.2);
      easeSky(st.sky, k);
      const v = (st.speed || 0) / 3.6;             // metres per second

      // road and street lights move toward the camera
      tex.offset.y = (tex.offset.y + v * dt / 10) % 1;
      // bends: steering angle if a car ever provides one, else the real turn rate from the GPS heading;
      // the navigation turn (distance counted down by the dashboard from the speed) becomes a side road
      const kb = first ? 1 : Math.min(1, dt * 2);
      const kNow = st.steer != null ? Math.tan(st.steer * Math.PI / 180) / 2.6
        : (v > 2 ? ((st.turnRate || 0) * Math.PI / 180) / v : 0);
      bend.k += (Math.max(-0.09, Math.min(0.09, kNow)) - bend.k) * kb;
      // show the turn ~20 s ahead at the current speed (at least 120 m; the road ahead is 270 m long)
      const lead = Math.max(120, Math.min(260, v * 20));
      const rbOn = updateRoundabout(st, v, dt, lead);                  // a roundabout replaces the bend/side road
      const nav = !rbOn && st.nav && st.nav.distance != null && st.nav.dir ? st.nav : null;
      const near = nav ? Math.min(1, Math.max(0, (lead + 40 - nav.distance) / 40)) : 0;
      bend.amount += ((nav ? nav.amount * near : 0) - bend.amount) * kb;
      // where the turn is DRAWN: its true distance when close (under 25 m); further away it is pulled in, so a turn
      // 20 s ahead already shows about 70 m down the road instead of as a speck at the horizon (like the Retro theme)
      if (nav) {
        const d = Math.max(0, nav.distance);
        bend.dir = nav.dir;
        bend.at = d <= 25 ? d : 25 + (Math.min(d, lead) - 25) * 45 / Math.max(1, lead - 25);
      }
      // far away: the turn is a bend in the main road; close by (about 2.5 s of driving, 15-40 m): merge if the
      // car is turning the same way (GPS), otherwise split it off as a side road
      const mergeDist = Math.max(15, Math.min(40, v * 2.5));
      const close = !!nav && nav.distance < mergeDist;
      const agree = close && Math.abs(bend.k) > 0.008 && Math.sign(bend.k) === nav.dir;
      bend.onMain += ((nav && !close ? 1 : 0) - bend.onMain) * kb;
      bend.split += ((close && !agree ? 1 : 0) - bend.split) * kb;
      layRoad(carZ);
      layBranch();
      // with a roundabout the road stops at its entry (the ring and its roads take over from there) until we
      // have left it again
      const cut = rbOn && rb.visible && (!rbState.anchored || rbState.inside || rbState.entryS > 0 || (st.nav && st.nav.roundabout));
      road.geo.setDrawRange(0, (cut ? Math.min(ROAD_N, I0 + Math.max(2, Math.ceil(rbState.entryS / SEG) + 1)) : ROAD_N) * 6);
      if (rbOn) layRouteRoundabout(); else layRoute(!!nav && bend.amount > 0.05);
      for (const g of lamps) {                            // street lights stand along the main road
        g.userData.s -= v * dt;
        if (g.userData.s < -14) g.userData.s += COUNT * SPACING;
        const p = pathAt(g.userData.s);
        g.position.set(p.x, 0, p.z); g.rotation.y = -p.h;
        g.visible = !cut || g.userData.s < rbState.entryS - 3;       // none standing in the roundabout
      }
      // the car sits on the road, its nose following the road just ahead (right turn = negative yaw)
      bend.yaw += (-pathAt(4).h - bend.yaw) * kb;

      // car: shrinks and moves ahead while navigating; doors, lights, wheels
      const kk = first ? 1 : Math.min(1, dt * 3);
      scale += ((st.nav ? 0.8 : 1) - scale) * kk;
      carZ += ((st.nav ? -3 : 0) - carZ) * kk;
      const drift = updateWeather(dt, st, v);
      carG.scale.setScalar(scale); carG.position.z = carZ; carG.position.x = LANE_X + drift;
      carG.rotation.y = Math.PI / 2 + bend.yaw;
      rig.position.set(LANE_X, 0, carZ); rig.scale.setScalar(scale); rig.rotation.y = bend.yaw;   // beams turn too
      const on = st.lights === true;
      if (car) {
        for (const n of car.doorNames || []) car.setDoor(n, !!(st.doors && st.doors[n]));
        if (first && car.snapDoors) car.snapDoors();
        car.update(dt, st.speed || 0);
        car.setLights(on);
      }
      beam += ((on ? 1 : 0) - beam) * (first ? 1 : Math.min(1, dt * 4));
      for (const sp of spots) sp.intensity = 900 * beam;
      red.intensity = 2.5 * beam;
      poolMat.opacity = 0.55 * beam * (st.sky === 'day' ? 0.35 : 1);

      // camera glides between the driving view and the "something is open" view
      const pose = st.openView ? POSE.open : POSE.drive;
      const kc = first ? 1 : Math.min(1, dt * 1.6);
      camPos.lerp(pose.pos, kc); camLook.lerp(pose.look, kc);
      cam.position.copy(camPos); cam.lookAt(camLook);

      renderer.render(s, cam);
      first = false;
    },
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}

export default { create };
