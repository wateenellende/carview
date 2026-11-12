// SPDX-License-Identifier: GPL-3.0-or-later
// Original grand-touring fastback: 911-like roof/rear hips, Mustang-style
// long low nose, and the restrained glazing of a modern Mercedes coupe.
import { buildModern } from './common.js';

const profile = {
  // [longitudinal fraction, belt-height multiplier, half-width multiplier]
  // Broad rear-engine haunches taper into a low, smooth front bonnet.
  body: [
    [0, .91, .84], [.06, .97, .94], [.15, 1.06, 1.07], [.24, 1.07, 1.09],
    [.37, 1.02, 1.01], [.66, 1.02, .99], [.80, .98, 1.04],
    [.91, .91, .92], [1, .79, .73],
  ],
  // [fraction of greenhouse, height above shoulder, roof half-width scale]
  // The unusually long rear glass is deliberately not a hatchback roof.
  roof: [
    [0, .04, .55], [.12, .36, .60], [.26, .80, .68],
    [.42, 1.00, .73], [.58, 1.00, .75], [.74, .93, .72],
    [.91, .56, .70], [1, .02, .72],
  ],
  backGlass: .38,
  frontGlass: .25,
  lamps: 'bar',
  details({ THREE, root, M, options:o, detail, line, shoulder, halfW, roofY }) {
    const w=o.width, rear=shoulder(.15);
    // Low integrated ducktail is part of the rear body, not a huge toy wing.
    line([[.08,rear+.025,-w*.38],[.06,rear+.053,-w*.20],
      [.055,rear+.060,0],[.06,rear+.053,w*.20],[.08,rear+.025,w*.38]],.020,M.paint);
    // Louvered engine cover below the steep rear glass; subtle, horizontal.
    const top=roofY(o.cabinRear+.36);
    for(let k=-3;k<=3;k++){
      detail(new THREE.BoxGeometry(.30,.011,.017),M.black,
        o.cabinRear+.35,Math.max(rear+.018,top-.080),k*.083);
    }
    // Shaped lower rear diffuser and twin exhaust outlets.
    detail(new THREE.BoxGeometry(.062,.085,w*.70),M.black,-.035,o.groundClearance+.15,0);
    for(const side of [-1,1]){
      const pipe=detail(new THREE.TorusGeometry(.052,.010,7,18),M.rim,
        -.088,o.groundClearance+.17,side*w*.25,Math.PI/2);
    }
    // Deep side character crease follows the tapered quarter-panel and sill.
    for(const side of [-1,1]){
      const z=side*(halfW(o.rearOverhang)+.007);
      line([[.43,rear-.22,z],[o.rearOverhang,rear-.24,z],
        [o.rearOverhang+1.15,shoulder(o.rearOverhang+1.15)-.27,
          side*(halfW(o.rearOverhang+1.15)+.006)]],.008,M.rim);
    }
  },
};
export function build(ctx) { return buildModern(ctx, profile); }
export default { build };
