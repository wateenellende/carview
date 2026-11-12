// SPDX-License-Identifier: GPL-3.0-or-later
// Golf / Corolla / Civic-inspired compact: short rear overhang, pronounced
// shoulder and practical hatchback glass with a narrow integrated roof spoiler.
import { buildModern } from './common.js';
const profile={
  body:[
    [0,.92,.78],[.045,.99,.91],[.17,1.04,1.035],
    [.28,1.045,1.035],[.53,1.01,1.0],[.75,1.03,1.02],
    [.89,.99,.98],[.98,.88,.82],[1,.84,.78],
  ],
  roof:[
    [0,.06,.69],[.10,.64,.72],[.20,.94,.75],
    [.39,1,.76],[.73,.99,.75],[.88,.81,.72],[1,.025,.70],
  ],
  backGlass:.19,frontGlass:.27,lamps:'wrap',
  details({THREE,M,options:o,detail,line,roofY,halfW,shoulder}){
    const x=o.cabinRear+.08,y=roofY(x);
    // Short spoiler and high-mounted stop lamp on the hatch.
    line([[x-.15,y-.03,-o.width*.35],[x-.19,y+.005,0],
      [x-.15,y-.03,o.width*.35]],.023,M.paint);
    line([[x-.16,y-.018,-.19],[x-.17,y-.008,0],
      [x-.16,y-.018,.19]],.012,M.tail);
    // Hatch handle and rear-window wiper sit on separate body components.
    detail(new THREE.BoxGeometry(.023,.027,.22),M.black,
      -.050,shoulder(0)-.19,0);
    line([[-.057,shoulder(0)+.13,-.21],
      [-.065,shoulder(0)+.11,.08]],.009,M.black);
    // Compact air intake, front grille and lower sill trim.
    detail(new THREE.BoxGeometry(.043,.15,o.width*.55),M.black,
      o.length+.028,o.beltHeight-.29,0);
    for(const side of [-1,1])
      line([[.5,shoulder(.5)-.36,side*(halfW(.5)+.01)],
        [o.rearOverhang+o.wheelbase-.32,shoulder(o.rearOverhang+o.wheelbase-.32)-.35,
          side*(halfW(o.rearOverhang+o.wheelbase-.32)+.01)]],.010,M.rim);
  },
};
export function build(ctx){return buildModern(ctx,profile);}
export default {build};
