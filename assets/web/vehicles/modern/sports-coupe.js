// SPDX-License-Identifier: GPL-3.0-or-later
// Two-door fastback coupe: wide rear haunches, a long low bonnet, a roof that flows in one line down to a
// short ducktail, full-width rear light bar and twin exhausts.
import { buildModern } from './common.js';

const profile = {
  belt: [[0, 0.93], [0.05, 1.02], [0.17, 1.06], [0.3, 1.02], [0.55, 0.97], [0.76, 0.94], [0.9, 0.86], [0.97, 0.76], [1, 0.68]],
  corners: { rear: [0.38, 0.82], front: [0.55, 0.68] },
  square: 4.2, tumble: 0.64, hips: 0.05, cPillar: 0.6, hatch: false, lamps: 'bar', grille: 0.55, spokes: 6,
  rearDrop: 0.05, lampDrop: 0.1,
  details({ M, W, rearTop, rearBot, halfW, box, panel }) {
    // ducktail lip along the back of the boot lid
    box(0.16, 0.03, halfW(0.1) * 1.7, M.paint, 0.08, rearTop + 0.012, 0);
    // black diffuser with twin round exhausts
    panel(-0.008, rearBot + 0.07, 0, W * 0.3, 0.05, M.trim, { square: 7 });
    for (const sd of [-1, 1]) {
      const pipe = box(0.12, 0.07, 0.09, M.chrome, -0.03, rearBot + 0.08, sd * W * 0.36);
      pipe.scale.set(1, 1, 1);
    }
  },
};
export function build(ctx) { return buildModern(ctx, profile); }
export default { build };
