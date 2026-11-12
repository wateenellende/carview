// SPDX-License-Identifier: GPL-3.0-or-later
// Blended RAV4 / CR-V / Model Y crossover. The distinctive high shoulder,
// broad rear haunch, black cladding and curved five-door roof are intentional.
import { buildModern } from './common.js';
const profile={
  body:[
    [0,.97,.88],[.055,1.02,.95],[.16,1.07,1.07],
    [.28,1.08,1.07],[.48,1.045,1.025],[.76,1.06,1.03],
    [.86,1.045,1.055],[.95,.94,.91],[1,.89,.82],
  ],
  roof:[
    [0,.045,.74],[.08,.71,.77],[.24,.96,.79],
    [.46,1,.80],[.75,.96,.79],[.88,.72,.76],[1,.02,.74],
  ],
  backGlass:.21,frontGlass:.23,lamps:'wrap',
  details({THREE,M,options:o,detail,line,shoulder,halfW,roofY}){
    // Thicker wheel-arch / rocker trim and protective bumper skid plates.
    for(const side of [-1,1]){
      detail(new THREE.BoxGeometry(o.wheelbase*.75,.11,.083),M.black,
        (o.rearOverhang+o.rearOverhang+o.wheelbase)*.5,
        o.groundClearance+.17,side*(o.width*.49));
      const railZ=side*o.width*.35;
      line([[o.cabinRear+.31,o.height+.055,railZ],
        [o.cabinRear+.60,o.height+.070,railZ],
        [o.cabinFront-.55,o.height+.070,railZ],
        [o.cabinFront-.30,o.height+.045,railZ]],.022,M.rim);
    }
    detail(new THREE.BoxGeometry(.054,.13,o.width*.63),M.rim,
      -.055,o.groundClearance+.20,0);
    detail(new THREE.BoxGeometry(.056,.14,o.width*.63),M.black,
      o.length+.024,o.groundClearance+.26,0);
    // Sharp upper shoulder crease helps establish the high crossover waist.
    for(const side of [-1,1])
      line([[.22,shoulder(.22)-.035,side*(halfW(.22)+.014)],
        [o.rearOverhang+.35,shoulder(o.rearOverhang+.35)-.032,
          side*(halfW(o.rearOverhang+.35)+.018)],
        [o.cabinFront-.30,shoulder(o.cabinFront-.30)-.06,
          side*(halfW(o.cabinFront-.30)+.015)]],.011,M.rim);
  },
};
export function build(ctx){return buildModern(ctx,profile);}
export default {build};
