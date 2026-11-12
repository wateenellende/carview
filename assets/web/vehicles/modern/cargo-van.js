// SPDX-License-Identifier: GPL-3.0-or-later
// Spacious, functional Transit / Transporter / Vito blend: square usable rear
// volume with softened corners, tall glazing and recognizable sliding doors.
import { buildModern } from './common.js';
const profile={
  body:[
    [0,1,.93],[.035,1.02,.96],[.15,1.03,1.01],
    [.30,1.025,1.01],[.66,1.03,1.01],[.80,1.045,1.02],
    [.93,.99,.96],[1,.92,.89],
  ],
  roof:[
    [0,.03,.84],[.055,.86,.86],[.15,.99,.87],
    [.80,1,.87],[.91,.85,.86],[1,.025,.84],
  ],
  backGlass:.13,frontGlass:.17,lamps:'vertical',
  details({THREE,M,options:o,detail,line,shoulder,halfW}){
    const y=o.height-.17;
    // Rain gutter along tall roof and sliding side-door guides.
    for(const side of [-1,1]){
      const z=side*o.width*.43;
      line([[.20,y,z],[1.1,y+.018,z],
        [o.cabinFront-.55,y+.013,z],[o.cabinFront-.21,y-.05,z]],.020,M.black);
      const sideZ=side*(halfW(o.cabinRear+1.0)+.017);
      line([[o.cabinRear+.22,shoulder(o.cabinRear+.22)-.10,sideZ],
        [o.cabinRear+.83,shoulder(o.cabinRear+.83)-.10,sideZ],
        [o.cabinRear+1.57,shoulder(o.cabinRear+1.57)-.10,sideZ]],.012,M.black);
      detail(new THREE.BoxGeometry(.16,.028,.026),M.rim,
        o.cabinRear+1.30,o.beltHeight-.23,sideZ);
    }
    // Dual rear door centre seam / handles; cargo loading step underneath.
    line([[-.052,o.height-.20,0],[-.057,o.height*.65,0],
      [-.054,o.groundClearance+.30,0]],.014,M.black);
    detail(new THREE.BoxGeometry(.04,.17,.09),M.black,
      -.071,o.beltHeight-.38,-.06);
    detail(new THREE.BoxGeometry(.06,.16,o.width*.80),M.black,
      -.062,o.groundClearance+.13,0);
    // Upright van grille and utility front bumper.
    detail(new THREE.BoxGeometry(.051,.27,o.width*.62),M.black,
      o.length+.030,o.beltHeight-.30,0);
    for(let i=-2;i<=2;i++)
      detail(new THREE.BoxGeometry(.058,.014,o.width*.57),M.rim,
        o.length+.052,o.beltHeight-.29+i*.047,0);
  },
};
export function build(ctx){return buildModern(ctx,profile);}
export default {build};
