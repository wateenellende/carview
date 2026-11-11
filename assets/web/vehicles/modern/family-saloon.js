// SPDX-License-Identifier: GPL-3.0-or-later
// Distinct three-box sedan, blending Camry / Accord proportions with the
// streamlined Model 3 shoulder and narrow split rear lamp signatures.
import { buildModern } from './common.js';
const profile={
  body:[
    [0,.94,.87],[.055,1.015,.95],[.20,1.035,1.02],
    [.34,1.01,1.015],[.59,1.02,1.005],[.77,1.045,1.035],
    [.89,.99,.98],[.98,.88,.83],[1,.85,.80],
  ],
  roof:[
    [0,.025,.66],[.13,.39,.70],[.27,.88,.72],[.41,1,.75],
    [.61,1,.76],[.79,.81,.72],[.94,.36,.69],[1,.015,.66],
  ],
  backGlass:.28,frontGlass:.26,lamps:'split',
  details({THREE,M,options:o,detail,line,shoulder,halfW}){
    // Independent boot-lid surface and a horizontal transverse crease define
    // the saloon's rear volume instead of extending hatchback roof glass.
    const deck=shoulder(.30)+.018;
    line([[.08,deck,-o.width*.40],[.13,deck+.025,-o.width*.18],
      [.13,deck+.029,0],[.13,deck+.025,o.width*.18],
      [.08,deck,o.width*.40]],.020,M.paint);
    line([[-.046,deck-.17,-o.width*.32],[-.050,deck-.18,0],
      [-.046,deck-.17,o.width*.32]],.008,M.rim);
    // The saloon's central number plate pocket and two low exhausts.
    detail(new THREE.BoxGeometry(.040,.18,.62),M.black,-.027,
      o.groundClearance+.37,0);
    for(const side of [-1,1]){
      detail(new THREE.TorusGeometry(.041,.010,7,18),M.rim,
        -.070,o.groundClearance+.15,side*o.width*.30,Math.PI/2);
      line([[.41,shoulder(.41)-.30,side*(halfW(.41)+.006)],
        [o.cabinRear+.26,shoulder(o.cabinRear+.26)-.25,
          side*(halfW(o.cabinRear+.26)+.006)]],.009,M.rim);
    }
  },
};
export function build(ctx){return buildModern(ctx,profile);}
export default {build};
