// SPDX-License-Identifier: GPL-3.0-or-later
// Full-size crew-cab pickup: square, upright cab, an open load bed with a drop-down tailgate, tall upright
// rear lights, chunky dark arches and a big grille.
import { buildModern } from './common.js';

const profile = {
  belt: [[0, 1.0], [0.04, 1.01], [0.4, 1.01], [0.8, 1.0], [0.9, 0.97], [0.97, 0.9], [1, 0.84]],
  corners: { rear: [0.12, 0.94], front: [0.35, 0.82] },
  square: 8, tumble: 0.84, cPillar: 0.1, bed: true, lamps: 'vertical', cladding: true, grille: 0.72, spokes: 6,
  rearDrop: 0.01,
  details({ THREE, root, M, o, W, belt, bedEnd, halfW, box, tube }) {
    // load floor and the front wall of the bed (the back of the cab)
    const floorY = belt(bedEnd / 2) - 0.48;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(bedEnd - 0.08, W - 0.22), M.black);
    floor.rotation.x = -Math.PI / 2; floor.position.set(bedEnd / 2, floorY, 0); root.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.48), M.black);
    wall.rotation.y = Math.PI / 2; wall.position.set(bedEnd - 0.01, floorY + 0.24, 0); root.add(wall);
    // bed rails along the top of the sides, and a tow hitch
    for (const sd of [-1, 1]) {
      tube([[0.08, belt(0.08) + 0.01, sd * (halfW(0.08) - 0.05)], [bedEnd - 0.05, belt(bedEnd) + 0.01, sd * (halfW(bedEnd) - 0.05)]], 0.022, M.black);
    }
    box(0.18, 0.08, 0.1, M.black, -0.08, o.groundClearance + 0.18, 0);
  },
};
export function build(ctx) { return buildModern(ctx, profile); }
export default { build };
