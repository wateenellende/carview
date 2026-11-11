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
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Group {
  constructor() { this.children = []; this.position = new Vec(); this.rotation = new Vec(); this.scale = new Vec(); }
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
const THREE = { Group, Mesh, Shape, ExtrudeGeometry: Geometry, BoxGeometry: Geometry,
  CylinderGeometry: Geometry, TorusGeometry: Geometry, MeshPhysicalMaterial: Material,
  MeshStandardMaterial: Material, DoubleSide: 2 };

const modern = (await moduleFrom('vehicles/model-builder/vehicle.js')).build;
const retro = (await moduleFrom('vehicles/pixel-builder/vehicle.js')).draw;
let checked = 0;
for (const { manifest: m } of vehicles) {
  if (m.entry === '../model-builder/vehicle.js') {
    const car = modern({ THREE, colour: m.defaultColour, options: m.options });
    if (car.length !== m.options.length || car.width !== m.options.width || !car.group.children.length)
      throw new Error(m.id + ': wrong body geometry');
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
console.log('OK: six 3D geometry models and six Retro sprites smoke-tested');
