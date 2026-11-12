// SPDX-License-Identifier: GPL-3.0-or-later
// Compact hatchback: short overhangs, a shoulder line that rises gently toward the tail, a steep rear screen
// under a small roof spoiler and a tailgate that lifts from the roof.
import { buildModern } from './common.js';

const profile = {
  // [fraction of length from the tail, × belt height]: low bumper, rising waist, short sloping bonnet
  belt: [[0, 0.9], [0.05, 0.99], [0.18, 1.02], [0.5, 0.99], [0.78, 0.975], [0.88, 0.94], [0.96, 0.84], [1, 0.76]],
  corners: { rear: [0.3, 0.84], front: [0.45, 0.74] },
  square: 5, tumble: 0.72, hips: 0.02, cPillar: 0.34, hatch: true, lamps: 'wrap', grille: 0.42,
  details({ M, o, W, H, roofY, rearTop, bumperTop, box, panel }) {
    // roof spoiler over the rear screen, with the high stop lamp under its lip
    box(0.2, 0.035, W * 0.66, M.paint, o.roofFlatStart - 0.06, roofY(o.roofFlatStart - 0.06) + 0.012, 0);
    box(0.02, 0.025, 0.3, M.tail, o.roofFlatStart - 0.16, roofY(o.roofFlatStart - 0.06) - 0.012, 0);
    // rear wiper on the screen and a single exhaust tip
    box(0.012, 0.012, 0.4, M.black, o.cabinRear + 0.12, rearTop + 0.22, 0.05);
    box(0.1, 0.05, 0.08, M.chrome, -0.02, o.groundClearance + 0.12, 0.45);
    panel(-0.009, bumperTop - 0.04, 0, 0.36, 0.012, M.chrome, { square: 10 });
  },
};
export function build(ctx) { return buildModern(ctx, profile); }
export default { build };
