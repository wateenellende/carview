// SPDX-License-Identifier: GPL-3.0-or-later
// Panel van: a tall box with softened corners, windows only in the cab, a sliding side door, split rear doors
// with small windows, tall upright rear lights and a high stop lamp.
import { buildModern } from './common.js';

const profile = {
  belt: [[0, 1.0], [0.04, 1.0], [0.6, 1.0], [0.82, 0.99], [0.9, 0.95], [0.96, 0.82], [1, 0.7]],
  corners: { rear: [0.16, 0.92], front: [0.4, 0.8] },
  square: 8, tumble: 0.9, cPillar: 0.06, hatch: true, lamps: 'vertical', grille: 0.6,
  rearDrop: 0.01, panelTo: 0, split: 0,
  details({ M, o, L, H, belt, halfW, box, panel, rearTop, rearBot }) {
    // split line of the two rear doors, their handle and the high stop lamp
    box(0.012, rearTop - rearBot - 0.12, 0.012, M.trim, -0.006, (rearTop + rearBot) / 2 + 0.04, 0);
    box(0.02, 0.03, 0.16, M.chrome, -0.012, (rearTop + rearBot) / 2 + 0.05, 0.1);
    box(0.02, 0.04, 0.3, M.tail, o.cabinRear - 0.02, H - 0.06, 0);
    // sliding-door rail along the right flank
    const xr = o.cabinFront - 1.1;
    box(1.2, 0.02, 0.012, M.trim, xr - 0.6, belt(xr) - 0.04, halfW(xr) + 0.008);
  },
};

// The cab is the only glazed part: panel sides from the rear pillar to just behind the front doors.
export function build(ctx) {
  const o = ctx.options || {};
  return buildModern(ctx, Object.assign({}, profile, { panelTo: o.cabinFront - 1.05, split: o.cabinFront - 1.05 }));
}
export default { build };
