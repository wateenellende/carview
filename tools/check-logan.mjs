// SPDX-License-Identifier: GPL-3.0-or-later
// Geometry, proportional scaling and state regressions for the high-detail Logan model.
// Run with: node tools/check-logan.mjs (no Android SDK, DOM or GPU required).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/web');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const { build } = await import('data:text/javascript;base64,' +
  Buffer.from(read('vehicles/logan-mcv/vehicle.js'), 'utf8').toString('base64'));

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
  multiplyScalar(n) { return this.set(this.x * n, this.y * n, this.z * n); }
  subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  crossVectors(a, b) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  normalize() { return this.multiplyScalar(1 / (Math.hypot(this.x, this.y, this.z) || 1)); }
  addScaledVector(v, n) { return this.set(this.x + v.x * n, this.y + v.y * n, this.z + v.z * n); }
}
class Object3D {
  constructor() {
    this.children = []; this.position = new Vec(); this.rotation = new Vec();
    this.scale = new Vec(1, 1, 1);
  }
  add(...objects) { this.children.push(...objects); }
}
class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class Shape {
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
}
class Geometry {
  constructor(...args) { this.args = args; }
}
class CylinderGeometry extends Geometry {}
class BufferGeometry extends Geometry {
  constructor() { super(); this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; }
  setIndex(indices) { this.indices = indices; }
  computeVertexNormals() {}
}
class Float32BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
}
class Material {
  constructor(properties = {}) {
    this.color = { set(value) { this.value = value; return this; },
      multiplyScalar() { return this; } };
    this.emissiveIntensity = properties.emissiveIntensity ?? 0;
  }
}
const THREE = {
  Group: Object3D, Mesh, Vector3: Vec, Shape, CylinderGeometry, BufferGeometry, Float32BufferAttribute,
  PlaneGeometry: Geometry, BoxGeometry: Geometry, SphereGeometry: Geometry, TubeGeometry: Geometry,
  CatmullRomCurve3: Geometry, ExtrudeGeometry: Geometry, ShapeGeometry: Geometry, TorusGeometry: Geometry,
  CircleGeometry: Geometry, MeshStandardMaterial: Material, MeshPhysicalMaterial: Material,
  DoubleSide: 2,
};
const almost = (a, b) => Math.abs(a - b) < 1e-4;
function assert(ok, message) { if (!ok) throw new Error(message); }

function test(name, opts) {
  const model = build({ THREE, colour: '#1f3a6e', options: opts });
  assert(almost(model.length, opts.length), name + ': wrong length');
  assert(almost(model.width, opts.width), name + ': wrong width');
  assert(model.doorNames.length === 5, name + ': missing door/tailgate');
  assert(model.group.children.length > 75, name + ': missing high-detail components');

  const meshArrays = model.group.children
    .filter((node) => node.geometry instanceof BufferGeometry)
    .map((node) => node.geometry.attributes.position.array);
  assert(meshArrays.length >= 35, name + ': lofted body/glass is missing');
  for (const array of meshArrays) for (const v of array)
    assert(Number.isFinite(v), name + ': invalid surface vertex');

  // The detailed body is scaled to requested dimensions, but the four wheel
  // pivots are explicitly placed at the manifest axle positions.
  const wheels = model.group.children.filter((node) =>
    node.children.some((child) => child.geometry instanceof CylinderGeometry));
  assert(wheels.length === 4, name + ': expected four wheels');
  const positions = wheels.map((w) => w.position.x * model.group.scale.x).sort((a, b) => a - b);
  assert(almost(positions[0], opts.rearOverhang) &&
    almost(positions[1], opts.rearOverhang) &&
    almost(positions[2], opts.rearOverhang + opts.wheelbase) &&
    almost(positions[3], opts.rearOverhang + opts.wheelbase),
    name + ': manifest wheelbase/overhang not applied');
  for (const w of wheels) {
    assert(almost(w.scale.x * model.group.scale.x, 1), name + ': distorted tyre in x');
    assert(almost(w.scale.z * model.group.scale.z, 1), name + ': distorted tyre in z');
  }

  model.setColour('#e4e4de');
  model.setLights(true);
  for (const n of model.doorNames) model.setDoor(n, true);
  model.snapDoors();
  model.update(1 / 30, 80);
  for (const n of model.doorNames) model.setDoor(n, false);
  model.update(1 / 30, 0);
  return model;
}

const mcv = JSON.parse(read('vehicles/logan-mcv/vehicle.json')).options;
const crossover = JSON.parse(read('vehicles/logan-crossover/vehicle.json')).options;
const a = test('Logan MCV', mcv);
const b = test('Logan Crossover', crossover);
const custom = {
  ...mcv, length: 4.72, width: 1.84, rearOverhang: 0.9, wheelbase: 2.99,
  roofHeight: 1.64, roofWidth: 0.67, rearRoofX: 0.075, windscreenX: 3.56
};
const c = test('Custom high-roof estate', custom);
assert(almost(a.length, 4.49) && almost(b.width, 1.73) && almost(c.length, 4.72),
  'Building another profile changed an existing model');
console.log('OK: detailed MCV, Crossover and custom geometry profiles, doors, lights and four wheel pivots');
