// SPDX-License-Identifier: GPL-3.0-or-later
// Smooth, low-poly-count procedural three-pbr cars. Dimensions are supplied by vehicle.json.
// Coordinate system: x = rear (0) toward nose (+length), y = up, z = right.
// All painted surfaces are curved/lofted, not stacks of rectangular boxes.
const PI = Math.PI, TAU = 2 * PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const interp = (a, b, k) => a + (b - a) * k;

function dimension(v, fallback, lo, hi) {
  return Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
}

// Every category blends the proportions and distinctive details of three
// familiar production vehicles, never their logos or trademarked ornament.
// These are *shape recipes*, rather than one generic body with different sizes.
// The style references and selection rationale are in docs/VEHICLE_DESIGN.md.
const SHAPES = {
  hatchback: { rear: 0.18, nose: 0.20, haunch: 0.046, shoulders: 0.036, crown: 0.055, rocker: 0.075, rearLamp: 'wrap' },
  coupe:     { rear: 0.09, nose: 0.30, haunch: 0.090, shoulders: 0.055, crown: 0.035, rocker: 0.040, rearLamp: 'bar' },
  saloon:    { rear: 0.14, nose: 0.20, haunch: 0.035, shoulders: 0.020, crown: 0.042, rocker: 0.060, rearLamp: 'split' },
  suv:       { rear: 0.11, nose: 0.16, haunch: 0.075, shoulders: 0.040, crown: 0.055, rocker: 0.120, rearLamp: 'wrap' },
  pickup:    { rear: 0.04, nose: 0.13, haunch: 0.085, shoulders: 0.065, crown: 0.025, rocker: 0.140, rearLamp: 'vertical' },
  van:       { rear: 0.04, nose: 0.08, haunch: 0.015, shoulders: 0.012, crown: 0.032, rocker: 0.110, rearLamp: 'vertical' },
};
const gaussian = (x, center, width) => Math.exp(-Math.pow((x - center) / width, 2));

// Surface mesher with shared vertices, triangle indices and computed smooth normals.
// Offsets are used for body seams, glass and doors without hard edged cuboids.
function surface(THREE, fn, u0, u1, v0, v1, nu, nv, material, offset = 0, skipFace = null) {
  const vertices = [], indices = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = interp(u0, u1, i / nu), v = interp(v0, v1, j / nv);
    const p = fn(u, v);
    // Offset in the cross-section's outward direction: upward at the roof
    // centre, sideways on the flanks. Offsetting z alone caused roof z-fighting.
    vertices.push(p[0], p[1] + offset * Math.sin(v), p[2] + offset * Math.cos(v));
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const midU = interp(u0, u1, (i + 0.5) / nu);
    const midV = interp(v0, v1, (j + 0.5) / nv);
    if (skipFace && skipFace(midU, midV)) continue;
    const a = i * (nv + 1) + j, b = a + nv + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function ellipse(v, power) {
  return Math.sign(v) * Math.pow(Math.abs(v), power);
}

// Close the rounded front and rear cross-sections with filled triangle fans.
// Without these caps the loft is an open tube: its interior shows up as a
// glaring hole in three-quarter views and in the vehicle picker thumbnails.
function endCap(THREE, surfacePoint, x, material) {
  const count = 48;
  const centre = surfacePoint(x, 0);
  const vertices = [x, centre[1], 0], indices = [];
  for (let i = 0; i <= count; i++) {
    vertices.push(...surfacePoint(x, i * TAU / count));
    if (i > 0) indices.push(0, i, i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function build({ THREE, colour = '#1f3a6e', options = {} }) {
  const o = options;
  const length = dimension(o.length, 4.3, 2.8, 6.0);
  const width = dimension(o.width, 1.78, 1.4, 2.3);
  const height = dimension(o.height, 1.55, 1.15, 2.4);
  const rearOverhang = dimension(o.rearOverhang, 0.8, 0.45, 1.45);
  const wheelbase = dimension(o.wheelbase, length - rearOverhang - 0.85, 1.8, length - rearOverhang - 0.45);
  const radius = dimension(o.wheelRadius, 0.31, 0.24, 0.44);
  const clearance = dimension(o.groundClearance, 0.18, 0.1, 0.4);
  const belt = dimension(o.beltHeight, height * 0.67, 0.78, Math.min(height - 0.24, 1.55));
  const rear = dimension(o.cabinRear, 0.18, 0.05, length - 1.7);
  const front = dimension(o.cabinFront, length - 0.75, rear + 1.25, length - 0.12);
  const flatStart = dimension(o.roofFlatStart, rear + 0.28, rear + 0.06, front - 0.35);
  const flatEnd = dimension(o.roofFlatEnd, front - 0.5, flatStart + 0.25, front - 0.06);
  const style = ['hatchback', 'coupe', 'saloon', 'suv', 'pickup', 'van'].includes(o.bodyStyle) ? o.bodyStyle : 'hatchback';
  const fourDoor = o.doors !== 2;
  const shape = SHAPES[style];
  const root = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({ color: colour, metalness: 0.18, roughness: 0.37,
    clearcoat: 0.72, clearcoatRoughness: 0.22, side: THREE.DoubleSide });
  const roofPaint = paint; // every painted panel uses the same colour, including opening doors
  const glazing = new THREE.MeshPhysicalMaterial({ color: 0x253b52, metalness: 0.04, roughness: 0.12,
    transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x171b21, roughness: 0.8, side: THREE.DoubleSide });
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x0e1a22, roughness: 0.35, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0x929ba4, metalness: 0.65, roughness: 0.3, side: THREE.DoubleSide });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.78, roughness: 0.24 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x721622, emissive: 0xff2634, emissiveIntensity: 0.55,
    roughness: 0.29, side: THREE.DoubleSide });
  const head = new THREE.MeshStandardMaterial({ color: 0xdbebfa, emissive: 0xfff1d0, emissiveIntensity: 0.32,
    roughness: 0.18, side: THREE.DoubleSide });
  const plate = new THREE.MeshStandardMaterial({ color: 0xe7e5d5, roughness: 0.7, side: THREE.DoubleSide });
  const accessories = [];

  const rearAxle = rearOverhang, frontAxle = rearOverhang + wheelbase;
  const hoodDip = style === 'coupe' ? 0.22 : style === 'van' ? 0.035 : style === 'pickup' ? 0.045 : 0.10;
  // The body has separate rear shoulders, wheel haunches, waist, bonnet and
  // rear-fascia shaping. A uniform oval tube was the cause of the toy appearance.
  const shoulderY = (x) => belt
    - hoodDip * smooth((x - (front - 0.12)) / Math.max(0.12, length - front))
    - (style === 'coupe' ? 0.085 * smooth((rear + 0.35 - x) / Math.max(0.25, rear + 0.35)) : 0)
    + shape.shoulders * gaussian(x, rearAxle + 0.17, 0.54);
  const halfWidth = (x) => {
    const taperRear = smooth((rearAxle * 0.50 - x) / Math.max(0.1, rearAxle * 0.50));
    const taperFront = smooth((x - (length - (length - frontAxle) * 0.65)) / Math.max(0.12, (length - frontAxle) * 0.65));
    const flare = shape.haunch * (gaussian(x, rearAxle + 0.07, 0.40) +
      0.85 * gaussian(x, frontAxle - 0.05, 0.40));
    return width * 0.5 * (1 - shape.rear * taperRear - shape.nose * taperFront) + flare;
  };

  // A smooth superellipse, not a circular pipe. Cars have flatter vertical
  // tailgates, more upright sides and softly rounded corners.
  const sectionY = style === 'coupe' ? 0.47 : style === 'saloon' ? 0.40 : 0.34;
  const sectionZ = style === 'coupe' ? 0.54 : style === 'saloon' ? 0.42 : 0.38;
  // V is an angle around x: 0 = right flank, PI/2 = bonnet, PI = left flank.
  function bodyPoint(x, v) {
    const bottom = clearance * 0.67;
    const upper = shoulderY(x);
    const mid = (upper + bottom) * 0.5, halfH = (upper - bottom) * 0.5;
    const sy = ellipse(Math.sin(v), sectionY);
    // Upper shoulder stays broad while the rocker is pinched inward, making a
    // recognisable door/wing transition instead of a uniformly rounded capsule.
    const sidePinch = shape.rocker * (1 - smooth((sy + 0.50) / 1.30));
    const waist = 0.030 * gaussian(sy, 0.12, 0.35);
    return [x, mid + halfH * sy,
      (halfWidth(x) - sidePinch + waist) * ellipse(Math.cos(v), sectionZ)];
  }
  // The pickup bed needs a real opening: skip the upper shell triangles over
  // the load floor. Otherwise a body-coloured deck hides its ribbed liner.
  const bedOpening = style === 'pickup'
    ? (x, angle) => x < rear - 0.10 && angle > PI * 0.15 && angle < PI * 0.85
    : null;
  root.add(surface(THREE, bodyPoint, 0, length, 0, TAU, 52, 30, paint, 0, bedOpening));
  root.add(endCap(THREE, bodyPoint, 0, paint));
  root.add(endCap(THREE, bodyPoint, length, paint));

  // Curve the front/rear fascia across the car width, avoiding the slab appearance.
  function fascia(x, mat, v0 = 0, v1 = TAU) {
    return surface(THREE, bodyPoint, x, x + 0.022, v0, v1, 1, 26, mat);
  }
  root.add(fascia(0.008, paint), fascia(length - 0.03, paint));

  // Greenhouse profile: smooth rear glass, gently crowned roof, raked windscreen.
  function roofLevel(x) {
    const rearProgress = (x - rear) / Math.max(0.1, flatStart - rear);
    // Coupe: long gradual 911-like sloping rear roof/fastback; other bodies
    // have different slopes rather than sharing an identical vertical hatch.
    const rearRise = style === 'coupe' ? Math.pow(clamp(rearProgress, 0, 1), 0.75) : smooth(rearProgress);
    const frontFall = smooth((front - x) / Math.max(0.1, front - flatEnd));
    const crown = shape.crown * Math.sin(PI * clamp((x - rear) / (front - rear), 0, 1));
    return shoulderY(x) + Math.max(0.004, height + crown - shoulderY(x)) * Math.min(rearRise, frontFall);
  }
  function glassPoint(x, v) {
    const blend = Math.pow(Math.max(0, Math.sin(v)), 0.55);
    const roofZ = width * (style === 'van' ? 0.405 : style === 'suv' ? 0.39 : 0.34);
    const sideZ = halfWidth(x) - 0.065;
    const y = shoulderY(x) + (roofLevel(x) - shoulderY(x)) * Math.pow(Math.max(0, Math.sin(v)), 0.58);
    const z = interp(sideZ, roofZ, blend) * Math.cos(v);
    return [x, y + 0.006, z];
  }
  root.add(surface(THREE, glassPoint, rear, front, 0.05, PI - 0.05, 48, 22, glazing));
  // Continuous coloured roof, with no visible squared-off cabin box.
  root.add(surface(THREE, glassPoint, flatStart + 0.02, flatEnd - 0.02, 0.46, PI - 0.46,
    24, 10, roofPaint, 0.013));
  // Smooth windshield and rear glass share the same continuous greenhouse surface.
  for (const [a, b] of [[rear + 0.045, flatStart - 0.035], [flatEnd + 0.035, front - 0.045]]) {
    if (b > a) root.add(surface(THREE, glassPoint, a, b, 0.24, PI - 0.24, 16, 15, glazing, 0.016));
  }
  // Roof's thick central bar plus B/C-pillars anchor the side glazing to the body.
  for (const side of [-1, 1]) {
    const a = side > 0 ? 0.055 : PI - 0.49;
    const b = side > 0 ? 0.49 : PI - 0.055;
    const pillarPositions = fourDoor
      ? [rear + (front - rear) * 0.49, rear + (front - rear) * 0.74]
      : [rear + (front - rear) * 0.20];
    for (const px of pillarPositions) {
      root.add(surface(THREE, glassPoint, px - 0.032, px + 0.032, a, b, 2, 8, black, 0.026));
    }
    // Chrome belt line follows the tapered body, including the curving rear quarter.
    const beltLine = new THREE.CatmullRomCurve3(Array.from({ length: 8 }, (_, i) => {
      const x = interp(rear + 0.10, front - 0.06, i / 7);
      return new THREE.Vector3(x, shoulderY(x) - 0.025, side * (halfWidth(x) - 0.012));
    }));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(beltLine, 28, 0.009, 5, false), trim));
  }

  // Curved side doors move about their front vertical hinges.
  const doors = {};
  const aSide = (side) => side > 0 ? [-1.03, 1.12] : [PI - 1.12, PI + 1.03];
  const hingeRanges = fourDoor
    ? [[rear + 0.10, rear + (front - rear) * 0.49, 'rear'],
       [rear + (front - rear) * 0.49, front - 0.10, 'front']]
    : [[rear + 0.11, front - 0.09, 'front']];
  for (const side of [-1, 1]) for (const [x0, x1, tag] of hingeRanges) {
    if (x1 - x0 < 0.22) continue;
    const which = tag + (side < 0 ? 'Left' : 'Right');
    const pivot = new THREE.Group();
    pivot.position.set(x1, 0, side * (halfWidth(x1) - 0.04));
    const panel = surface(THREE, bodyPoint, x0 + 0.016, x1 - 0.02,
      ...aSide(side), 16, 14, paint, 0.02);
    panel.position.set(-x1, 0, -pivot.position.z);
    pivot.add(panel);
    // Small metallic handle instead of a square cutout.
    const handle = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), trim);
    handle.scale.set(0.095, 0.020, 0.018);
    handle.position.set(x0 + 0.22 - x1, belt - 0.23, side * (halfWidth(x0 + 0.22) + 0.023) - pivot.position.z);
    pivot.add(handle);
    root.add(pivot);
    doors[which] = { pivot, side, target: 0 };
    // A thin black seam defines closed doors without sharp rectangular outline.
    root.add(surface(THREE, bodyPoint, x0, x0 + 0.012, ...aSide(side), 1, 16, black, 0.017));
  }

  // Liftback, boot lid or pickup tailgate. The panel follows the same body profile
  // and rotates as a single surface rather than becoming a disconnected box.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.025, style === 'pickup' ? shoulderY(0) : roofLevel(Math.min(flatStart, rear + 0.15)), 0);
  const tailPanel = surface(THREE, bodyPoint, 0.008, 0.12, 0.05, PI - 0.05, 4, 22, paint, 0.014);
  tailPanel.position.set(-tailPivot.position.x, -tailPivot.position.y, 0);
  tailPivot.add(tailPanel);
  if (style !== 'pickup') {
    const backGlass = surface(THREE, glassPoint, rear + 0.015, Math.min(flatStart - 0.04, rear + 0.20),
      0.26, PI - 0.26, 8, 18, glazing, 0.019);
    backGlass.position.set(-tailPivot.position.x, -tailPivot.position.y, 0);
    tailPivot.add(backGlass);
  }
  root.add(tailPivot);
  doors.tailgate = { pivot: tailPivot, target: 0 };

  // Wheels: round rubber, alloy discs, curved arch lips and five radial spokes.
  const wheels = [];
  for (const axle of [rearAxle, frontAxle]) for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const z = side * (width * 0.5 - 0.04);
    g.position.set(axle, radius, z);
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.22, 36), tyre);
    rubber.rotation.x = PI / 2; g.add(rubber);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.69, radius * 0.69, 0.227, 32), rim);
    face.rotation.x = PI / 2; g.add(face);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.232, 16), black);
    hub.rotation.x = PI / 2; g.add(hub);
    const spokes = new THREE.Group();
    spokes.position.z = side * 0.118;
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.075, radius * 0.65, 3, 6), trim);
      spoke.rotation.z = i * TAU / 5;
      spokes.add(spoke);
    }
    g.add(spokes);
    root.add(g); wheels.push(g);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.14, 0.032, 8, 36, PI), black);
    arch.position.set(axle, radius, side * (halfWidth(axle) + 0.019));
    root.add(arch);
  }

  // Body-class details are independent of the main loft and of the vehicle's paint.
  // References: Civic/Golf/Corolla; 911/Mustang/CLE; Camry/Accord/Model 3;
  // RAV4/CR-V/Model Y; F-150/Silverado/Ram; Transit/Transporter/Vito.
  const tube = (points, width, mat) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 8),
      width, 6, false), mat);
    root.add(mesh);
    return mesh;
  };
  if (style === 'hatchback') {
    // Short roof spoiler, wrapped hatch-glass edge and a subtle high stop lamp.
    const tip = rear + 0.04;
    const roofY = height * 0.99;
    const roofW = width * 0.35;
    tube([[tip - 0.16, roofY - 0.04, -roofW],
      [tip - 0.18, roofY + 0.01, 0], [tip - 0.16, roofY - 0.04, roofW]], 0.023, paint);
    tube([[tip - 0.19, roofY - 0.01, -0.20], [tip - 0.20, roofY - 0.01, 0],
      [tip - 0.19, roofY - 0.01, 0.20]], 0.012, tail);
  } else if (style === 'coupe') {
    // Tapered 911-like ducktail integrated into the rear deck, with a broad
    // sculpted air-exit panel and a strong shoulder line over the rear wheels.
    const rearDeck = shoulderY(0.18) + 0.012;
    tube([[0.12, rearDeck - 0.035, -width * 0.38],
      [0.09, rearDeck + 0.012, -width * 0.18],
      [0.08, rearDeck + 0.02, 0],
      [0.09, rearDeck + 0.012, width * 0.18],
      [0.12, rearDeck - 0.035, width * 0.38]], 0.022, paint);
    const vents = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.41, 0.17), black);
    vents.rotation.x = -PI / 2; vents.position.set(rear + 0.24, roofLevel(rear + 0.24) + 0.027, 0);
    root.add(vents);
    for (let z = -2; z <= 2; z++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.013, 0.018), trim);
      fin.position.set(rear + 0.24, roofLevel(rear + 0.24) + 0.040, z * width * 0.07);
      root.add(fin);
    }
  } else if (style === 'saloon') {
    // A three-box boot deck and crisp transverse crease, not a hatchback rear.
    const deckY = shoulderY(rear * 0.5) + 0.025;
    tube([[0.1, deckY, -width * 0.40], [0.11, deckY + 0.028, 0],
      [0.1, deckY, width * 0.40]], 0.018, paint);
    tube([[0.10, deckY - 0.16, -width * 0.32], [0.09, deckY - 0.16, 0],
      [0.10, deckY - 0.16, width * 0.32]], 0.008, trim);
  } else if (style === 'suv') {
    // Body-coloured clamshell roof with proper black arch and sill protection.
    for (const side of [-1, 1]) {
      const sill = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, length * 0.64, 4, 6), black);
      sill.rotation.z = PI / 2; sill.position.set(length * 0.50, clearance + 0.15, side * width * 0.47);
      root.add(sill);
    }
  } else if (style === 'pickup') {
    // The F-150/Ram/Silverado-like load bed is genuinely recessed and open,
    // with side rails, dark ribbed liner and a prominent flat tailgate.
    const bedEnd = Math.max(0.5, rear - 0.12);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.35, bedEnd - 0.18),
      width * 0.82), darkGlass);
    bed.rotation.x = -PI / 2;
    bed.position.set(bedEnd * 0.52, belt - 0.15, 0);
    root.add(bed);
    for (let rib = -4; rib <= 4; rib++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(bedEnd * 0.77, 0.014, 0.017), black);
      line.position.set(bedEnd * 0.5, belt - 0.135, rib * width * 0.075); root.add(line);
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, bedEnd - 0.22, 4, 6), trim);
      rail.rotation.z = PI / 2; rail.position.set(bedEnd * 0.5, belt + 0.018, side * (width / 2 - 0.075));
      root.add(rail);
    }
    const rearHandle = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.042, 0.27), black);
    rearHandle.position.set(-0.047, belt - 0.15, 0); root.add(rearHandle);
  } else if (style === 'van') {
    // A tall Transporter/Transit-like sliding-door guide and split rear doors.
    for (const side of [-1, 1]) {
      const z = side * (width / 2 - 0.022);
      tube([[rear + 0.44, belt - 0.14, z], [rear + 0.97, belt - 0.14, z],
        [rear + 1.75, belt - 0.14, z]], 0.014, black);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.026, 0.022), trim);
      handle.position.set(rear + 1.4, belt - 0.28, z); root.add(handle);
    }
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.02, height * 0.72, 0.023), black);
    divider.position.set(-0.035, height * 0.52, 0); root.add(divider);
  }
  if (style === 'suv' || style === 'van') {
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.020,
        Math.max(0.15, flatEnd - flatStart - 0.12), 4, 5), trim);
      rail.rotation.z = PI / 2;
      rail.position.set((flatStart + flatEnd) / 2, height + 0.045,
        side * width * 0.32);
      root.add(rail);
    }
  }

  // Lamp graphics, not giant glowing pink ellipsoids. The profile echoes the
  // characteristic lighting *types* of current production cars, not a brand.
  const rearY = shoulderY(0) - 0.17;
  const rearWide = halfWidth(0);
  const lightBase = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.32 });
  const makeStrip = (points, thickness, material, parent = root) => {
    const points3d = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(points3d);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 9), thickness, 6, false), material);
    parent.add(mesh);
    return mesh;
  };
  // Wide black lower diffuser, real-world scale (less than one tenth of height).
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.095, width * 0.80), black);
  rearBumper.position.set(-0.037, clearance + 0.15, 0);
  root.add(rearBumper);
  if (shape.rearLamp === 'bar') {
    // 911 / contemporary EV sports rear: narrow continuous LED ribbon.
    const pts = [-.80, -.5, 0, .5, .80].map(t => [-0.052, rearY + 0.022 * (1 - t*t), t * rearWide]);
    makeStrip(pts, 0.042, lightBase);
    makeStrip(pts.map(([x, y, z]) => [x - 0.016, y + 0.006, z]), 0.015, tail);
  }
  for (const side of [-1, 1]) {
    const outer = side * (rearWide - 0.10), inner = side * (rearWide - (style === 'coupe' ? 0.32 : 0.38));
    let signature;
    if (shape.rearLamp === 'vertical') {
      signature = [[-0.042, rearY + 0.15, outer], [-0.048, rearY + 0.07, outer],
        [-0.052, rearY - 0.12, outer], [-0.044, rearY - 0.27, outer]];
    } else if (shape.rearLamp === 'wrap') {
      signature = [[-0.025, rearY + 0.13, outer], [-0.058, rearY + 0.09, outer],
        [-0.065, rearY + 0.065, inner], [-0.050, rearY - 0.045, inner]];
    } else {
      signature = [[-0.048, rearY + 0.065, inner], [-0.061, rearY + 0.075, outer],
        [-0.051, rearY - 0.018, outer]];
    }
    makeStrip(signature, style === 'coupe' ? 0.025 : 0.043, lightBase);
    makeStrip(signature.map(([x,y,z]) => [x - 0.016, y, z]), style === 'coupe' ? 0.012 : 0.022, tail);
    // Front lighting uses a thin swept headlamp and secondary LED strip.
    const frontY = shoulderY(length) - (style === 'pickup' || style === 'van' ? 0.14 : 0.09);
    const frontWide = halfWidth(length);
    const fOuter = side * (frontWide - 0.09), fInner = side * (frontWide - 0.37);
    const line = [[length + 0.018, frontY + 0.045, fInner],
      [length + 0.035, frontY + 0.06, fOuter], [length + 0.018, frontY - 0.055, fOuter]];
    makeStrip(line, 0.037, lightBase);
    makeStrip(line.map(([x,y,z]) => [x + 0.012, y, z]), 0.021, head);
  }
  if (style === 'coupe') {
    // Twin low exhausts and an integrated dark rear valance.
    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.060, 0.012, 7, 20), trim);
      pipe.rotation.y = PI / 2;
      pipe.position.set(-0.060, clearance + 0.16, side * width * 0.27);
      root.add(pipe);
    }
  }
  if (style === 'pickup' || style === 'suv') {
    // Raised rocker and robust textured bumper; subtle on the SUV, bold on truck.
    for (const side of [-1, 1]) {
      const rocker = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, length * 0.51, 4, 6), black);
      rocker.rotation.z = PI / 2;
      rocker.position.set(length * 0.50, clearance + 0.16, side * (width * 0.48));
      root.add(rocker);
    }
  }
  const recess = new THREE.Mesh(new THREE.PlaneGeometry(0.61, 0.19), black);
  recess.position.set(-0.049, 0.53, 0); recess.rotation.y = -PI / 2;
  root.add(recess);
  const licence = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.12), plate);
  licence.position.set(-0.061, 0.53, 0); licence.rotation.y = -PI / 2;
  root.add(licence);
  const lidCrease = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.050, belt - 0.12, -halfWidth(0) * 0.72),
    new THREE.Vector3(-0.062, belt - 0.14, 0),
    new THREE.Vector3(-0.050, belt - 0.12, halfWidth(0) * 0.72)
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(lidCrease, 20, 0.012, 6, false), trim));
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.38, 0.17), black);
  grille.position.set(length + 0.025, 0.58, 0); grille.rotation.y = PI / 2;
  root.add(grille);
  // Mirrors follow the front side windows. Their rounded shells match the body paint.
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), paint);
    mirror.scale.set(0.14, 0.075, 0.095);
    mirror.position.set(front - 0.13, belt + 0.05, side * (halfWidth(front - 0.13) + 0.07));
    root.add(mirror);
  }

  return {
    group: root, length, width, doorNames: Object.keys(doors),
    setColour(hex) { paint.color.set(hex); },
    setLights(on) {
      tail.emissiveIntensity = on ? 1.45 : 0.14;
      head.emissiveIntensity = on ? 1.8 : 0.18;
    },
    setDoor(name, open) {
      const d = doors[name];
      if (d) d.target = open ? (name === 'tailgate' ? (style === 'pickup' || style === 'saloon' ? 0.95 : -1.0) :
        d.side < 0 ? -0.93 : 0.93) : 0;
    },
    snapDoors() {
      for (const [name, d] of Object.entries(doors)) {
        if (name === 'tailgate') d.pivot.rotation.z = d.target;
        else d.pivot.rotation.y = d.target;
      }
    },
    update(dt, kmh = 0) {
      const k = clamp(dt * 6, 0, 1);
      for (const [name, d] of Object.entries(doors)) {
        if (name === 'tailgate') d.pivot.rotation.z += (d.target - d.pivot.rotation.z) * k;
        else d.pivot.rotation.y += (d.target - d.pivot.rotation.y) * k;
      }
      const angle = (kmh / 3.6) * dt / radius;
      for (const wheel of wheels) wheel.rotation.z -= angle;
    },
  };
}
export default { build };
