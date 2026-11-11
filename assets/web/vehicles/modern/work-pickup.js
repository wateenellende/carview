// SPDX-License-Identifier: GPL-3.0-or-later
// Full-size crew-cab pickup: F-150/Silverado/Ram-inspired proportions,
// separate load bed, upright tailgate, blocky-but-rounded cab and robust trim.
import { buildModern } from './common.js';
const profile = {
  body: [
    [0, 1.01, .97], [.035,1.04,1.0], [.16,1.05,1.07],
    [.24,1.05,1.07], [.40,1.04,1.00], [.65,1.05,1.00],
    [.76,1.08,1.06], [.88,1.03,1.06], [.98,.94,.96],[1,.91,.94],
  ],
  roof: [
    [0,.035,.77],[.035,.75,.79],[.13,.99,.80],
    [.80,1.00,.80],[.92,.92,.79],[1,.015,.78],
  ],
  backGlass:.16, frontGlass:.18, lamps:'vertical', bed:true,
  details({THREE,root,M,options:o,detail,line,roofY,shoulder,halfW}){
    const bedLength=o.cabinRear-.10, floorY=o.beltHeight-.23;
    // Recessed load floor, tread ribs and separate interior wheel tubs.
    const floor=detail(new THREE.BoxGeometry(bedLength-.11,.05,o.width*.83),
      M.black,bedLength*.5,floorY,0);
    for(let k=-5;k<=5;k++) detail(new THREE.BoxGeometry(bedLength-.22,.017,.017),
      M.rim,bedLength*.5,floorY+.033,k*o.width*.067);
    for(const side of [-1,1]){
      // Thick load-bed rim, actual three-dimensional sides, not lines.
      detail(new THREE.BoxGeometry(bedLength-.04,.095,.082),M.paint,
        bedLength*.5,o.beltHeight+.018,side*(o.width*.5-.055));
      const tub=detail(new THREE.BoxGeometry(.72,.22,.16),M.black,
        o.rearOverhang,floorY+.15,side*(o.width*.5-.20));
      // Continuous running board beneath the crew cab.
      detail(new THREE.BoxGeometry(o.cabinFront-o.cabinRear,.045,.17),M.black,
        (o.cabinRear+o.cabinFront)*.5,o.groundClearance+.07,
        side*(o.width*.50-.05));
    }
    // Cab-to-bed bulkhead and squared-off but rounded tailgate rail.
    detail(new THREE.BoxGeometry(.07,o.beltHeight-floorY+.09,o.width*.86),M.paint,
      bedLength-.05,(floorY+o.beltHeight)/2,0);
    line([[-.038,o.beltHeight+.015,-o.width*.43],
      [-.050,o.beltHeight+.016,0],[-.038,o.beltHeight+.015,o.width*.43]],.03,M.rim);
    detail(new THREE.BoxGeometry(.043,.06,.30),M.black,-.067,o.beltHeight-.17,0);
    // Upright heavy-duty grille: black slats + chrome surround.
    detail(new THREE.BoxGeometry(.055,.38,o.width*.68),M.black,
      o.length+.022,o.beltHeight-.31,0);
    for(let i=-2;i<=2;i++)
      detail(new THREE.BoxGeometry(.059,.016,o.width*.56),M.rim,
        o.length+.060,o.beltHeight-.33+i*.064,0);
    // Roof marker lights are subtle and physically separated.
    for(const z of [-.61,0,.61])detail(new THREE.SphereGeometry(1,10,6),
      M.head,o.cabinFront-.68,o.height+.015,z).scale.set(.060,.020,.034);
  },
};
export function build(ctx){return buildModern(ctx,profile);}
export default {build};
