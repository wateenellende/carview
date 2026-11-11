// SPDX-License-Identifier: GPL-3.0-or-later
// Dependency-free catalogue validation; run: node tools/check-vehicles.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(project, 'assets', 'web');
const vehicleRoot = path.join(web, 'vehicles');
const failures = [];
function check(ok, message) { if (!ok) failures.push(message); }
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

const sandbox = { window: {} };
vm.runInNewContext(read(path.join(web, 'packages.js')), sandbox, { filename: 'packages.js' });
const catalogue = sandbox.window.CARVIEW_BUILTIN;
check(Array.isArray(catalogue), 'packages.js must define CARVIEW_BUILTIN');
const rows = Array.isArray(catalogue) ? catalogue : [];
const seen = new Set();
const checkedJs = new Set();
const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
const isId = (value) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(value || '');

for (const item of rows) {
  const m = item?.manifest;
  check(!!m, 'Catalogue entry is missing a manifest');
  if (!m) continue;
  const key = m.type + '/' + m.id;
  check(!seen.has(key), 'Duplicate catalogue entry: ' + key);
  seen.add(key);
  check(isId(m.id), 'Invalid id: ' + key);
  check(item.base === (m.type === 'theme' ? 'themes/' : 'vehicles/') + m.id + '/',
    'Incorrect base path: ' + key);

  const folder = path.resolve(web, item.base || '');
  check(folder.startsWith(web + path.sep), 'Package escapes assets/web: ' + key);
  if (!folder.startsWith(web + path.sep)) continue;
  const mfPath = path.join(folder, m.type === 'theme' ? 'theme.json' : 'vehicle.json');
  check(exists(mfPath), 'Missing manifest file: ' + mfPath);
  if (exists(mfPath)) {
    try {
      const fileManifest = JSON.parse(read(mfPath));
      check(JSON.stringify(fileManifest) === JSON.stringify(m),
        'packages.js manifest differs from ' + path.relative(project, mfPath));
    } catch (e) { failures.push('Invalid JSON: ' + mfPath + ' (' + e.message + ')'); }
  }
  const source = path.resolve(folder, m.entry || '');
  check(source.startsWith(web + path.sep) && exists(source), 'Missing or unsafe entry: ' + key);
  if (exists(source) && !checkedJs.has(source)) {
    checkedJs.add(source);
    try { execFileSync(process.execPath, ['--check', '--input-type=module'], { input: read(source) }); }
    catch (e) { failures.push('JavaScript parse error in ' + path.relative(project, source) + ': ' + String(e.stderr || e.message)); }
  }
  if (m.type !== 'vehicle') continue;
  check(['three-pbr', 'pixel-16bit'].includes(m.family), 'Unknown vehicle family: ' + key);
  check(isHex(m.defaultColour), 'Missing/invalid defaultColour: ' + key);
  for (const field of ['name', 'make', 'model', 'body', 'years', 'author', 'version', 'license']) {
    check(typeof m[field] === 'string' && m[field].trim().length > 0, 'Missing ' + field + ': ' + key);
  }
  check(m.license === 'GPL-3.0-or-later', 'Incompatible licence declaration: ' + key);
  check(Array.isArray(m.tags) && m.tags.length > 0 && m.tags.every((t) => typeof t === 'string'),
    'Missing searchable tags: ' + key);
  const o = m.options || {};
  const classModules = {
    hatchback: 'city-hatch', coupe: 'sports-coupe', saloon: 'family-saloon',
    suv: 'trail-suv', pickup: 'work-pickup', van: 'cargo-van'
  };
  const classModule = m.entry.startsWith('../modern/');
  const generic = m.entry === '../model-builder/vehicle.js' || classModule;
  if (classModule) {
    check(m.entry === '../modern/' + classModules[m.options?.bodyStyle] + '.js',
      'Modern class module does not match its body style: ' + key);
  }
  if (generic) {
    check(['hatchback', 'coupe', 'saloon', 'suv', 'pickup', 'van'].includes(o.bodyStyle),
      'Unknown bodyStyle: ' + key);
    for (const field of ['length', 'width', 'height', 'rearOverhang', 'wheelbase', 'wheelRadius',
      'groundClearance', 'beltHeight', 'cabinRear', 'cabinFront', 'roofFlatStart', 'roofFlatEnd']) {
      check(Number.isFinite(o[field]) && o[field] > 0, 'Invalid dimension ' + field + ': ' + key);
    }
    check(o.rearOverhang + o.wheelbase < o.length - 0.25,
      'Wheelbase and axle location exceed body length: ' + key);
    check(o.cabinRear < o.roofFlatStart && o.roofFlatStart < o.roofFlatEnd && o.roofFlatEnd < o.cabinFront,
      'Cabin/roof position order invalid: ' + key);
    check(o.beltHeight < o.height, 'Belt must be below roof: ' + key);
    check(o.doors === 2 || o.doors === 4, 'doors must be 2 or 4: ' + key);
  }
}


const sharedModern = path.join(vehicleRoot, 'modern', 'common.js');
check(exists(sharedModern), 'Missing shared Modern body-construction module');
if (exists(sharedModern)) {
  try { execFileSync(process.execPath, ['--check', '--input-type=module'], { input: read(sharedModern) }); }
  catch (e) { failures.push('JavaScript parse error in Modern common.js: ' + String(e.stderr || e.message)); }
}

const vehicles = rows.filter((x) => x?.manifest?.type === 'vehicle');
const themes = rows.filter((x) => x?.manifest?.type === 'theme');
for (const theme of themes) {
  check(vehicles.some((v) => v.manifest.family === theme.manifest.family),
    'Theme has no compatible vehicle: ' + theme.manifest.id);
}
if (failures.length) {
  for (const error of failures) console.error('FAIL ' + error);
  process.exitCode = 1;
} else {
  console.log('OK: ' + vehicles.length + ' vehicle manifests, ' + themes.length +
    ' themes, ' + checkedJs.size + ' script entry points');
}
