// SPDX-License-Identifier: GPL-3.0-or-later
// Shared procedural three-pbr vehicle. Geometry is controlled by vehicle.json "options".
// Coordinates: x runs rear (0) to front (length); y up; z towards the right side.
// No external models or textures are needed.
const PI = Math.PI;

function bounded(value, fallback, min, max) {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function build({ THREE, colour = '#1f3a6e', options = {} }) {
  const o = options;
  const length = bounded(o.length, 4.3, 2.8, 6.0);
  const width = bounded(o.width, 1.78, 1.4, 2.3);
  const height = bounded(o.height, 1.55, 1.15, 2.4);
  const rearOverhang = bounded(o.rearOverhang, 0.8, 0.45, 1.45);
  const wheelbase = bounded(o.wheelbase, length - rearOverhang - 0.85, 1.8, length - rearOverhang - 0.45);
  const radius = bounded(o.wheelRadius, 0.31, 0.24, 0.44);
  const clearance = bounded(o.groundClearance, 0.18, 0.1, 0.4);
  const belt = bounded(o.beltHeight, height * 0.67, 0.78, Math.min(height - 0.24, 1.55));
  const cabinRear = bounded(o.cabinRear, 0.18, 0.05, length - 1.7);
  const cabinFront = bounded(o.cabinFront, length - 0.75, cabinRear + 1.25, length - 0.12);
  const flatStart = bounded(o.roofFlatStart, cabinRear + 0.28, cabinRear + 0.06, cabinFront - 0.35);
  const flatEnd = bounded(o.roofFlatEnd, cabinFront - 0.5, flatStart + 0.25, cabinFront - 0.06);
  const style = ['hatchback', 'coupe', 'saloon', 'suv', 'pickup', 'van'].includes(o.bodyStyle) ? o.bodyStyle : 'hatchback';
  const fourDoor = o.doors !== 2;
  const root = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.42, metalness: 0.18, clearcoat: 0.65, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x253d4d, roughness: 0.14, metalness: 0.1, side: THREE.DoubleSide });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 0.78, side: THREE.DoubleSide });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xbbc6ce, roughness: 0.28, metalness: 0.78 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.95 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8c1526, emissive: 0xff1729, emissiveIntensity: 0.45 });
  const head = new THREE.MeshStandardMaterial({ color: 0xdce5ec, emissive: 0xfff4ce, emissiveIntensity: 0.25 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xefe8d4, roughness: 0.65 });

  function box(w, h, d, x, y, z, mat, parent = root) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  // A shaped prism, instead of stacking boxes: the silhouette is driven by the
  // configurable rear glass, flat roof, bonnet and front glass positions.
  function prism(points, depth, mat, z = 0, parent = root) {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    s.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }), mat);
    mesh.position.z = z - depth / 2;
    parent.add(mesh);
    return mesh;
  }

  // Body shoulders, lowered bonnet and wheel-arch trim.
  prism([[0, clearance], [0, belt * 0.97], [Math.min(length * 0.13, cabinRear + 0.1), belt],
    [length * 0.80, belt * 0.98], [length, belt * 0.79], [length, clearance],
    [length * 0.96, clearance * 0.75], [length * 0.04, clearance * 0.75]], width, paint);
  box(0.10, 0.22, width * 0.95, 0.02, 0.42, 0, plastic);
  box(0.12, 0.24, width * 0.94, length - 0.03, 0.42, 0, plastic);
  for (const side of [-1, 1]) {
    box(length * 0.82, 0.09, 0.035, length * 0.51, clearance + 0.05, side * (width / 2 + 0.01), plastic);
  }

  // Cabin shape varies substantially among coupe, saloon, SUV, pickup, van, and hatchback.
  const top = height;
  const cabinShape = [[cabinRear, belt], [flatStart, top], [flatEnd, top], [cabinFront, belt]];
  prism(cabinShape, width * 0.84, paint);
  // Side glass on both flanks, with a visible dark pillar between the windows.
  const inset = 0.07;
  const glassShape = [[cabinRear + inset, belt + 0.045], [flatStart + inset * 0.25, top - inset],
    [flatEnd - inset * 0.25, top - inset], [cabinFront - inset, belt + 0.045]];
  for (const side of [-1, 1]) {
    const pane = prism(glassShape, 0.018, glass, side * (width * 0.42 + 0.018));
    pane.material = glass;
    const pillarX = fourDoor ? cabinRear + (cabinFront - cabinRear) * 0.55 : cabinRear + (cabinFront - cabinRear) * 0.28;
    box(0.065, top - belt - 0.025, 0.028, pillarX, (top + belt) / 2, side * (width * 0.43 + 0.025), plastic);
    // Door handles and mirrors stay visible while colours are changed.
    for (const px of (fourDoor ? [cabinRear + (cabinFront - cabinRear) * 0.42, cabinFront - 0.23] : [cabinFront - 0.23])) {
      box(0.14, 0.035, 0.035, px, belt - 0.18, side * (width / 2 + 0.034), chrome);
    }
    box(0.20, 0.10, 0.13, cabinFront - 0.12, belt + 0.08, side * (width / 2 + 0.09), paint);
  }
  // The broad roof and rear window are easy to recognize from CarView's rear camera angle.
  box(Math.max(0.25, flatEnd - flatStart), 0.035, width * 0.84, (flatStart + flatEnd) / 2, top, 0, paint);
  box(0.028, Math.max(0.16, top - belt - 0.12), width * 0.70, cabinRear + 0.055, (top + belt) / 2, 0, glass);
  box(0.025, Math.max(0.14, top - belt - 0.13), width * 0.71, cabinFront - 0.05, (top + belt) / 2, 0, glass);

  if (style === 'pickup') {
    // Open cargo bed behind the two-seat cabin: floor, bed liner and raised side rails.
    box(Math.max(0.35, cabinRear - 0.22), 0.035, width * 0.86, cabinRear / 2, belt - 0.07, 0, plastic);
    for (const side of [-1, 1]) box(Math.max(0.3, cabinRear - 0.12), 0.10, 0.07,
      cabinRear / 2, belt + 0.02, side * (width / 2 - 0.06), plastic);
  } else if (style === 'coupe') {
    box(0.29, 0.055, width * 0.84, 0.24, belt + 0.06, 0, paint); // rear wing
    box(0.05, 0.13, width * 0.63, 0.19, belt + 0.015, 0, plastic);
  } else if (style === 'suv' || style === 'van') {
    for (const side of [-1, 1]) {
      box(Math.max(0.4, flatEnd - flatStart), 0.05, 0.06,
        (flatStart + flatEnd) / 2, top + 0.06, side * width * 0.35, plastic);
    }
  } else if (style === 'saloon') {
    box(Math.max(0.25, cabinRear - 0.17), 0.035, width * 0.8, cabinRear / 2, belt + 0.02, 0, paint);
  }

  // Four wheels, hubs, and arched fenders (world dimensions, including wheelbase).
  const wheels = [];
  for (const x of [rearOverhang, rearOverhang + wheelbase]) for (const side of [-1, 1]) {
    const z = side * (width / 2 - 0.025);
    const pivot = new THREE.Group();
    pivot.position.set(x, radius, z);
    root.add(pivot);
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.19, 28), tyre);
    rubber.rotation.x = PI / 2;
    pivot.add(rubber);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, 0.202, 20), chrome);
    hub.rotation.x = PI / 2;
    pivot.add(hub);
    for (let spoke = 0; spoke < 5; spoke++) {
      const bar = box(radius * 0.1, radius * 1.16, 0.015, 0, 0, side * 0.108, plastic, pivot);
      bar.rotation.z = spoke * PI / 5;
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.22, 0.024, 6, 24, PI), plastic);
    arch.position.set(x, radius, side * (width / 2 + 0.018));
    root.add(arch);
    wheels.push(pivot);
  }

  // Rear lamps, reverse lights, front headlamps, number plate and exhaust.
  for (const side of [-1, 1]) {
    box(0.045, 0.23, 0.20, -0.022, belt - 0.19, side * (width / 2 - 0.16), tail);
    box(0.045, 0.12, 0.19, length + 0.025, belt - 0.20, side * (width / 2 - 0.17), head);
  }
  box(0.028, 0.13, 0.50, -0.045, 0.61, 0, plate);
  box(0.05, 0.08, 0.75, length + 0.06, 0.67, 0, plastic);

  // Detachable rear panel and physically opening side doors.
  const doors = {};
  for (const side of [-1, 1]) {
    const rearEdge = Math.max(0.12, cabinRear);
    const frontEdge = Math.min(length - 0.25, cabinFront - 0.04);
    const split = rearEdge + (frontEdge - rearEdge) * 0.52;
    const ranges = fourDoor
      ? [[rearEdge, split, side < 0 ? 'rearLeft' : 'rearRight'],
         [split, frontEdge, side < 0 ? 'frontLeft' : 'frontRight']]
      : [[rearEdge, frontEdge, side < 0 ? 'frontLeft' : 'frontRight']];
    for (const [a, b, name] of ranges) {
      const hinge = new THREE.Group();
      hinge.position.set(b, 0, side * (width / 2 + 0.027));
      box(Math.max(0.18, b - a - 0.03), Math.max(0.28, belt - clearance - 0.15), 0.025,
        -(b - a) / 2, (belt + clearance) / 2, 0, paint, hinge);
      root.add(hinge);
      doors[name] = { pivot: hinge, target: 0, side };
    }
  }
  const rearHinge = new THREE.Group();
  rearHinge.position.set(0, style === 'pickup' ? clearance + 0.09 : belt, 0);
  box(0.045, Math.max(0.30, belt - clearance - 0.06), width * 0.81,
    -0.040, -(belt - clearance) / 2 + 0.05, 0, paint, rearHinge);
  root.add(rearHinge);
  doors.tailgate = { pivot: rearHinge, target: 0 };

  return {
    group: root, length, width,
    doorNames: Object.keys(doors),
    setColour(hex) { paint.color.set(hex); },
    setLights(on) { tail.emissiveIntensity = on ? 3.0 : 0.45; head.emissiveIntensity = on ? 4.2 : 0.25; },
    setDoor(name, open) {
      const d = doors[name];
      if (d) d.target = open ? (name === 'tailgate' ? (style === 'pickup' ? 1.2 : -1.0) : (d.side < 0 ? -0.95 : 0.95)) : 0;
    },
    snapDoors() {
      for (const [name, d] of Object.entries(doors)) {
        if (name === 'tailgate') d.pivot.rotation.z = d.target;
        else d.pivot.rotation.y = d.target;
      }
    },
    update(dt, kmh = 0) {
      const k = Math.min(1, Math.max(0, dt) * 6);
      for (const [name, d] of Object.entries(doors)) {
        if (name === 'tailgate') d.pivot.rotation.z += (d.target - d.pivot.rotation.z) * k;
        else d.pivot.rotation.y += (d.target - d.pivot.rotation.y) * k;
      }
      const radians = (kmh / 3.6) * dt / radius;
      for (const wheel of wheels) wheel.rotation.z -= radians;
    },
  };
}

export default { build };
