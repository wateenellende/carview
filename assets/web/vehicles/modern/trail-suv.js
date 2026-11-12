// SPDX-License-Identifier: GPL-3.0-or-later
// Mid-size SUV: tall and square-shouldered, dark plastic arches and sills, roof rails, a near-upright
// tailgate with wrap-around lights and a silver skid plate.
import { buildModern } from './common.js';

const profile = {
  belt: [[0, 0.95], [0.05, 1.0], [0.3, 1.0], [0.72, 0.985], [0.86, 0.97], [0.94, 0.91], [1, 0.82]],
  corners: { rear: [0.3, 0.86], front: [0.42, 0.78] },
  square: 6.5, tumble: 0.8, cPillar: 0.22, hatch: true, lamps: 'wrap', cladding: true, grille: 0.58, spokes: 6,
  rearDrop: 0.03,
  details({ M, o, rearBot, glassSurf, box, tube, panel }) {
    // roof rails on short feet
    for (const s of [0.27, 0.73]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const p = glassSurf(o.roofFlatStart + 0.05 + (o.roofFlatEnd - o.roofFlatStart - 0.1) * i / 10, s);
        pts.push([p[0], p[1] + 0.06, p[2]]);
      }
      tube(pts, 0.018, M.black);
      for (const i of [1, 9]) box(0.08, 0.06, 0.04, M.black, pts[i][0], pts[i][1] - 0.03, pts[i][2]);
    }
    panel(-0.01, rearBot + 0.09, 0, 0.42, 0.04, M.chrome, { square: 8 });   // skid plate
  },
};
export function build(ctx) { return buildModern(ctx, profile); }
export default { build };
