// SPDX-License-Identifier: GPL-3.0-or-later
// Shared construction and animation for individually designed Modern bodies.
// X runs rear -> nose, Y is vertical, Z is the vehicle's right side.
// The per-class modules supply their own lengthwise body and roof surfaces.
const PI = Math.PI, TAU = 2 * PI;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const signed = (v, power) => Math.sign(v) * Math.pow(Math.abs(v), power);

// Smoothly interpolate the production-inspired x/y stations. Unlike a scaled
// rectangle or a single superellipse, these independently define the shoulder,
// bonnet, rear deck, side taper and roof for each class.
function station(knots, u, component) {
  u = clamp(u);
  let j = 1;
  while (j < knots.length - 1 && knots[j][0] < u) j++;
  const a = knots[j - 1], b = knots[j];
  const t = clamp((u - a[0]) / (b[0] - a[0]));
  const prev = knots[Math.max(0, j - 2)], next = knots[Math.min(knots.length - 1, j + 1)];
  // Hermite derivatives respect nonuniform station spacing.
  const m0 = (b[0] - a[0]) * (b[component] - prev[component]) / Math.max(0.001, b[0] - prev[0]);
  const m1 = (b[0] - a[0]) * (next[component] - a[component]) / Math.max(0.001, next[0] - a[0]);
  return (2*t*t*t - 3*t*t + 1)*a[component] + (t*t*t - 2*t*t + t)*m0
    + (-2*t*t*t + 3*t*t)*b[component] + (t*t*t - t*t)*m1;
}
function mesh(THREE, sample, nx, ny, material, omit) {
  const points = [], faces = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    const p = sample(i/nx, j/ny);
    if (p.some(v => !Number.isFinite(v))) throw Error('Invalid body control point');
    points.push(...p);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const u = (i + .5)/nx, v = (j + .5)/ny;
    if (omit && omit(u, v)) continue;
    const k = i * (ny+1)+j, l = k+ny+1;
    faces.push(k,l,k+1,l,l+1,k+1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points,3));
  g.setIndex(faces); g.computeVertexNormals();
  return new THREE.Mesh(g,material);
}
function line(THREE, parent, points, diameter, material) {
  const c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(12, points.length*7), diameter, 6, false), material);
  parent.add(m); return m;
}
function shapeMaterial(THREE, colour) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: colour, metalness: .19, roughness: .33,
      clearcoat: .72, clearcoatRoughness: .17, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x1b3040, roughness: .13, metalness: .10,
      transparent: true, opacity: .88, depthWrite: false, side: THREE.DoubleSide }),
    black: new THREE.MeshStandardMaterial({ color: 0x111419, roughness: .73, side: THREE.DoubleSide }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc0c9d4, metalness: .85, roughness: .21 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xc22132, emissive: 0xff2233, emissiveIntensity: .24 }),
    head: new THREE.MeshStandardMaterial({ color: 0xe8f4fd, emissive: 0xfff1c7, emissiveIntensity: .20 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xece7d8, roughness: .75 }),
  };
}
function detail(THREE, parent, geometry, material, x,y,z, ry=0, rz=0) {
  const m = new THREE.Mesh(geometry,material);
  m.position.set(x,y,z);m.rotation.y=ry;m.rotation.z=rz;parent.add(m);return m;
}

export function buildModern({ THREE, colour = '#1f3a6e', options = {} }, profile) {
  const {length,width,height,rearOverhang,wheelbase,wheelRadius:radius,groundClearance:clearance,
    beltHeight:belt,cabinRear,cabinFront,doors:doorCount} = options;
  if (!THREE || !profile || !Number.isFinite(length) || !(wheelbase > 0)) throw Error('Invalid Modern vehicle parameters');
  const root = new THREE.Group(), M = shapeMaterial(THREE, colour);
  const rearAxle = rearOverhang, frontAxle = rearOverhang + wheelbase;
  const halfW = x => width*.5*station(profile.body,clamp(x/length),2);
  const shoulder = x => belt*station(profile.body,clamp(x/length),1);
  const lower = clearance*.68;
  const bodyPoint = (x,a) => {
    const v = signed(Math.sin(a),.34), z = signed(Math.cos(a),.38);
    const y = mix(lower,shoulder(x),(v+1)/2);
    const rocker = (1-Math.max(0,v))*.045;
    return [x,y,(halfW(x)-rocker)*z];
  };
  const bedEnd = profile.bed ? cabinRear-.10 : 0;
  const cutOut = (u,v) => {
    const x = length*u, a=TAU*v;
    // First, create a real load-bed opening in the upper skin.
    if (profile.bed && x < bedEnd && a > .14*PI && a < .86*PI) return true;
    // Rounded wheel well cuts on both flanks (in the body, not just black rings).
    const y = bodyPoint(x,a)[1];
    if (Math.abs(Math.cos(a)) < .52 || y > radius*2.12) return false;
    for (const axle of [rearAxle,frontAxle]) {
      const dx=x-axle, r=radius*1.08;
      if (Math.abs(dx)<r && y < radius+Math.sqrt(Math.max(0,r*r-dx*dx))) return true;
    }
    return false;
  };
  root.add(mesh(THREE,(u,v)=>bodyPoint(length*u,TAU*v),72,40,M.paint,cutOut));
  for (const x of [.003,length-.003]) {
    const verts=[x,(shoulder(x)+lower)/2,0], idx=[];
    for(let j=0;j<=48;j++) {
      verts.push(...bodyPoint(x,j*TAU/48));
      if(j>0)idx.push(0,j,j+1);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    g.setIndex(idx);g.computeVertexNormals();
    root.add(new THREE.Mesh(g,M.paint));
  }

  const roofY = x => belt + (height-belt)*station(profile.roof,clamp((x-cabinRear)/(cabinFront-cabinRear)),1);
  const roofW = x => width*.5*station(profile.roof,clamp((x-cabinRear)/(cabinFront-cabinRear)),2);
  const cabinZ = (x,v,side) => side*mix(halfW(x)-.065,roofW(x),v);
  const cabTop = (x,v) => mix(shoulder(x)+.018,roofY(x)-.028,v);
  const sideGlass = (x,v,side) => [x,cabTop(x,v),cabinZ(x,v,side)+side*.013];

  // A continuous roof panel, but individual shaped windows: rear quarter,
  // each door glass, windscreen and rear glass are physically separate meshes.
  const roofA=cabinRear + .02, roofB=cabinFront - .02;
  root.add(mesh(THREE,(u,v)=>{
    const x=mix(roofA,roofB,u), side=2*v-1;
    return [x,roofY(x)-.045*Math.pow(Math.abs(side),3),side*roofW(x)];
  },48,18,M.paint));
  const split = doorCount===2 ? .53 : .48;
  for (const side of [-1,1]) {
    const spans=doorCount===2 ? [[.08,.52],[.55,.92]] : [[.08,.38],[.42,.65],[.68,.94]];
    for (const [a,b] of spans) {
      root.add(mesh(THREE,(u,v)=>{
        const x=mix(cabinRear+(cabinFront-cabinRear)*a,cabinRear+(cabinFront-cabinRear)*b,u);
        return sideGlass(x,.12+.77*v,side);
      },13,9,M.glass));
    }
    for(const k of (doorCount===2?[split]:[.40,.66])) {
      const x=cabinRear+(cabinFront-cabinRear)*k;
      line(THREE,root,[sideGlass(x,0,side),sideGlass(x,.56,side),sideGlass(x,1,side)],.027,M.black);
    }
    // Visible window sill and wraparound chrome belt crease.
    line(THREE,root,Array.from({length:8},(_,i)=>{
      const x=mix(cabinRear+.10,cabinFront-.05,i/7);
      return [x,shoulder(x)-.028,side*(halfW(x)+.008)];
    }),.009,M.rim);
  }
  const backSpan=Math.min(.29,profile.backGlass??.30);
  const frontSpan=Math.min(.35,profile.frontGlass??.27);
  for(const [a,b] of [[.025,backSpan],[1-frontSpan,.975]]) {
    root.add(mesh(THREE,(u,v)=>{
      const x=mix(cabinRear+(cabinFront-cabinRear)*a,cabinRear+(cabinFront-cabinRear)*b,u);
      const side=2*v-1;
      return [x,roofY(x)+.016-.048*Math.pow(Math.abs(side),2),
        side*(roofW(x)-.025)];
    },18,16,M.glass));
  }

  // Side door skins hinge at the forward edge and keep the physical geometry
  // contract used by the main driving scene.
  const doors={};
  for(const side of [-1,1]){
    const spans=doorCount===2?[[.11,.94,'front']]:
      [[.10,.49,'rear'],[.49,.94,'front']];
    for(const [a,b,label] of spans){
      const x0=cabinRear+(cabinFront-cabinRear)*a,x1=cabinRear+(cabinFront-cabinRear)*b;
      const name=label+(side<0?'Left':'Right');
      const hinge=new THREE.Group();
      hinge.position.set(x1,0,side*halfW(x1));
      const panel=mesh(THREE,(u,v)=>{
        const x=mix(x0+.018,x1-.02,u);
        const y=mix(clearance+.12,shoulder(x)-.055,v);
        return [x,y,side*(halfW(x)+.012)];
      },18,9,M.paint);
      panel.position.set(-x1,0,-hinge.position.z);
      hinge.add(panel);
      // Small sculpted handle and its shadow socket.
      const handle=detail(THREE,hinge,new THREE.SphereGeometry(1,14,8),M.rim,
        x0+.22-x1,shoulder(x0+.22)-.18,side*(halfW(x0+.22)+.036)-hinge.position.z);
      handle.scale.set(.072,.021,.012);
      root.add(hinge);
      doors[name]={pivot:hinge,side,target:0};
    }
  }
  const rearLid=new THREE.Group();
  rearLid.position.set(.028,profile.bed ? belt : shoulder(.03),0);
  const lid=detail(THREE,rearLid,new THREE.BoxGeometry(.036,
    Math.max(.26,belt-clearance-.13),width*.77),M.paint,
    -.06,-(belt-clearance)/2,0);
  root.add(rearLid);doors.tailgate={pivot:rearLid,target:0};

  // Realistic track and black wheel wells. Tyres are half tucked into the
  // fenders (not attached as floating discs outside the body).
  const wheels=[];
  for(const axle of [rearAxle,frontAxle])for(const side of [-1,1]){
    const skin=halfW(axle), z=side*(skin-.025);
    const pivot=new THREE.Group();pivot.position.set(axle,radius,z);
    const rubber=detail(THREE,pivot,new THREE.CylinderGeometry(radius,radius,.21,36),M.black,0,0,0);
    rubber.rotation.x=PI/2;
    const wheel=detail(THREE,pivot,new THREE.CylinderGeometry(radius*.74,radius*.74,.225,30),M.rim,0,0,0);
    wheel.rotation.x=PI/2;
    const hub=detail(THREE,pivot,new THREE.CylinderGeometry(radius*.18,radius*.18,.24,18),M.black,0,0,0);
    hub.rotation.x=PI/2;
    for(let k=0;k<5;k++){
      const spoke=detail(THREE,pivot,new THREE.CapsuleGeometry(.014,radius*.54,3,6),M.rim,
        0,0,side*.120,0,k*TAU/5);
    }
    root.add(pivot);wheels.push(pivot);
    const arch=detail(THREE,root,new THREE.TorusGeometry(radius*1.095,.023,7,35,PI),
      M.black,axle,radius,side*(skin+.014));
    const well=detail(THREE,root,new THREE.CircleGeometry(radius*1.08,36,0,PI),M.black,
      axle,radius,side*(skin+.008));
    if(side<0)well.rotation.y=PI;
  }
  // Distinct fascia details and taillights: narrow ribbons for coupes/saloons,
  // upright corner lights for pickups/vans. No copied manufacturer badges.
  const lightKind=profile.lamps;
  for(const side of [-1,1]){
    const hw=halfW(0),outer=side*(hw-.07),inner=side*(hw-.34);
    const y=shoulder(0)-.16;
    const path=lightKind==='vertical'
      ?[[-.035,y+.17,outer],[-.055,y+.04,outer],[-.035,y-.23,outer]]
      :[[-.035,y+.06,outer],[-.055,y+.08,inner],[-.040,y-.02,inner]];
    line(THREE,root,path,.024,M.tail);
    const frontHW=halfW(length);
    line(THREE,root,[[length+.02,shoulder(length)-.09,side*(frontHW-.32)],
      [length+.035,shoulder(length)-.04,side*(frontHW-.07)]],.030,M.head);
  }
  if(lightKind==='bar'){
    line(THREE,root,Array.from({length:9},(_,i)=>{
      const z=mix(-halfW(0)*.76,halfW(0)*.76,i/8);
      return [-.056,shoulder(0)-.13+.025*(1-Math.pow(z/halfW(0),2)),z];
    }),.014,M.tail);
  }
  detail(THREE,root,new THREE.PlaneGeometry(.46,.12),M.plate,
    -.055,clearance+.37,0,-PI/2);
  for(const side of [-1,1]){
    const m=detail(THREE,root,new THREE.SphereGeometry(1,12,8),M.paint,
      cabinFront-.11,shoulder(cabinFront)+.05,side*(halfW(cabinFront)+.075));
    m.scale.set(.13,.07,.092);
  }
  // Class-specific trim can add spoilers, bed liners, rails, grilles, and
  // their own distinctive geometry without touching the animation contract.
  profile.details?.({THREE,root,M,options,detail:(g,mat,x,y,z,ry=0,rz=0)=>detail(THREE,root,g,mat,x,y,z,ry,rz),
    line:(points,width,mat)=>line(THREE,root,points,width,mat),
    roofY,roofW,halfW,shoulder});
  return {
    group:root,length,width,doorNames:Object.keys(doors),
    setColour(hex){M.paint.color.set(hex);},
    setLights(on){M.tail.emissiveIntensity=on?1.7:.24;M.head.emissiveIntensity=on?1.8:.20;},
    setDoor(name,open){
      const d=doors[name];if(!d)return;
      d.target=open?(name==='tailgate'?(profile.bed?.85:-1.04):(d.side<0?-1.02:1.02)):0;
    },
    snapDoors(){for(const [name,d] of Object.entries(doors))
      (name==='tailgate'?d.pivot.rotation.z=d.target:d.pivot.rotation.y=d.target);},
    update(dt,kmh=0){
      const rate=clamp(dt*6,0,1);
      for(const [name,d] of Object.entries(doors)){
        if(name==='tailgate')d.pivot.rotation.z+=(d.target-d.pivot.rotation.z)*rate;
        else d.pivot.rotation.y+=(d.target-d.pivot.rotation.y)*rate;
      }
      for(const w of wheels)w.rotation.z-=(kmh/3.6)*dt/radius;
    },
  };
}
