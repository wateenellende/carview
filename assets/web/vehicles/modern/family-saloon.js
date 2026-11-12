// SPDX-License-Identifier: GPL-3.0-or-later
// Four-door saloon: a three-box shape with a short, neat boot, a long cabin, a straight shoulder line,
// slim rear lights joined by a chrome strip.
import { buildModern } from './common.js';

const profile = {
  belt: [[0, 0.95], [0.04, 1.01], [0.16, 1.02], [0.45, 1.0], [0.75, 0.985], [0.87, 0.95], [0.96, 0.85], [1, 0.76]],
  corners: { rear: [0.34, 0.84], front: [0.5, 0.72] },
  square: 5, tumble: 0.7, cPillar: 0.36, hatch: false, lamps: 'bar', grille: 0.5,
  details({ M, rearTop, rearBot, box, panel, lampY }) {
    panel(-0.009, lampY - 0.07, 0, 0.42, 0.01, M.chrome, { square: 10 });   // chrome strip across the boot
    box(0.1, 0.05, 0.08, M.chrome, -0.02, rearBot + 0.07, 0.5);              // exhaust tip
    box(0.012, 0.035, 0.5, M.trim, -0.004, rearTop - 0.02, 0);               // boot-lid edge
  },
};
export function build(ctx) { return buildModern(ctx, profile); }
export default { build };
