// SPDX-License-Identifier: GPL-3.0-or-later
// Dependency-free smoke tests for the two configurable built-in vehicle renderers.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(project, 'assets/web');
const read = (file) => fs.readFileSync(path.join(web, file), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(read('packages.js'), sandbox);
const vehicles = sandbox.window.CARVIEW_BUILTIN.filter((p) => p.manifest.type === 'vehicle');
async function moduleFrom(file) {
  return import('data:text/javascript;base64,' + Buffer.from(read(file), 'utf8').toString('base64'));
}

// Minimal three.js construction double. Checks API and object construction without WebGL.
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Group {
  constructor() {
    this.children = []; this.position = new Vec(); this.rotation = new Vec(); this.scale = new Vec(1, 1, 1);
  }
  add(...objects) { this.children.push(...objects); }
}
class Mesh extends Group {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class Shape {
  constructor() { this.points = []; }
  moveTo(x, y) { this.points.push([x, y]); }
  lineTo(x, y) { this.points.push([x, y]); }
  closePath() {}
}
class Material {
  constructor(props = {}) { this.color = { set(value) { this.value = value; } }; this.emissiveIntensity = props.emissiveIntensity || 0; }
}
class Geometry { constructor(...args) { this.args = args; } }
class BufferGeometry extends Geometry {
  constructor() { super(); this.attributes = {}; }
  setAttribute(name, data) { this.attributes[name] = data; }
  setIndex(data) { this.indices = data; }
  computeVertexNormals() {}
}
class Float32BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
}
const THREE = { Group, Mesh, Shape, ExtrudeGeometry: Geometry, BoxGeometry: Geometry,
  CylinderGeometry: Geometry, TorusGeometry: Geometry, CircleGeometry: Geometry, SphereGeometry: Geometry,
  CapsuleGeometry: Geometry, TubeGeometry: Geometry, PlaneGeometry: Geometry,
  CatmullRomCurve3: Geometry, BufferGeometry, Float32BufferAttribute,
  MeshPhysicalMaterial: Material, MeshStandardMaterial: Material, Vector3: Vec, DoubleSide: 2 };

const modern = (await moduleFrom('vehicles/model-builder/vehicle.js')).build;
const retro = (await moduleFrom('vehicles/pixel-builder/vehicle.js')).draw;
let checked = 0;
for (const { manifest: m } of vehicles) {
  if (m.entry === '../model-builder/vehicle.js') {
    const car = modern({ THREE, colour: m.defaultColour, options: m.options });
    if (car.length !== m.options.length || car.width !== m.options.width || !car.group.children.length)
      throw new Error(m.id + ': wrong body geometry');
    // Body and windows must actually be curved lofts, not rectangular box placeholders.
    const curved = car.group.children.filter((part) => part.geometry instanceof BufferGeometry);
    if (curved.length < 8) throw new Error(m.id + ': expected curved body, window and lamp meshes');
    if (m.options.bodyStyle === 'pickup') {
      // The pickup bed must actually be open in the upper body mesh, not
      // a dark plane painted over an otherwise solid slab.
      const bodyTriangles = curved[0].geometry.indices.length / 3;
      if (!(bodyTriangles < 52 * 30 * 2))
        throw new Error(m.id + ': load-bed opening is covered by body skin');
    }
    for (const part of curved) for (const x of part.geometry.attributes.position.array)
      if (!Number.isFinite(x)) throw new Error(m.id + ': invalid loft vertex');
    // Closed, filled front/rear sections are essential; an uncapped body looks
    // like a hollow tube in the studio picker (caught by browser screenshot QA).
    const caps = curved.filter((part) => {
      const v = part.geometry.attributes.position.array;
      const face = part.geometry.indices || [];
      if (face.length < 120) return false;
      const x0 = v[0];
      for (let i = 3; i < v.length; i += 3) if (Math.abs(v[i] - x0) > 1e-5) return false;
      return true;
    });
    if (caps.length < 2) throw new Error(m.id + ': missing solid front or rear body cap');
    const expected = m.options.doors === 2 ? 3 : 5; // side doors + tailgate
    if (car.doorNames.length !== expected) throw new Error(m.id + ': incorrect door count');
    car.setColour('#ff1122');
    car.setLights(true);
    for (const name of car.doorNames) car.setDoor(name, true);
    car.snapDoors();
    car.update(1 / 30, 65);
    for (const name of car.doorNames) car.setDoor(name, false);
    car.update(1 / 30, 0);
    checked++;
  }
  if (m.entry === '../pixel-builder/vehicle.js') {
    for (const state of [
      { lit: false, doors: {} },
      { lit: true, doors: { frontLeft: true, frontRight: true, tailgate: true } }
    ]) {
      let paintCalls = 0;
      const bounds = retro({}, {
        cx: 160, by: 172, scale: 1, horizon: 90, colour: m.defaultColour,
        lit: state.lit, doors: state.doors, options: m.options,
        shade: (hex) => hex,
        rect: (x, y, w, h) => { if (!(w >= 0 && h >= 0)) throw new Error(m.id + ': negative rectangle'); paintCalls++; },
        poly: () => { paintCalls++; }
      });
      if (!bounds || bounds.w <= 0 || bounds.h <= 0 || paintCalls < 12)
        throw new Error(m.id + ': invalid sprite or empty drawing');
    }
    checked++;
  }
}
if (checked !== 12) throw new Error('Expected twelve configurable models, got ' + checked);
console.log('OK: six smoothly lofted 3D bodies and six Retro sprites smoke-tested');
