// THIS IS LAGOS v0.12 — road-aware city, markings and street lighting
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const mount=document.querySelector('#game');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9fc9d4);
scene.fog=new THREE.Fog(0x9fc9d4,520,2100);
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,4200);
camera.position.set(0,5,9);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;mount.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe7fff0,0x71856d,2));
const sun=new THREE.DirectionalLight(0xfff2d5,2.5);sun.position.set(-35,55,25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;scene.add(sun);
const mat=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
const grass=mat(0x7eaa78),road=mat(0x343d3b),sidewalk=mat(0xc9d2c8),white=mat(0xf1f5e9),green=mat(0x18824a),glassMat=new THREE.MeshStandardMaterial({color:0x8eb8b4,roughness:.25,metalness:.15}),dark=mat(0x263a31);
function block(w,h,d,m,x,y,z){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y+h/2,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}
block(300,.2,300,grass,0,-.2,0);
block(18,.12,260,road,0,0,0);block(1.8,.15,260,sidewalk,-10,0,0);block(1.8,.15,260,sidewalk,10,0,0);
block(260,.12,15,road,0,.01,-22);block(260,.15,1.5,sidewalk,0,.01,-30);block(260,.15,1.5,sidewalk,0,.01,-14);
for(let x=-120;x<=120;x+=12){block(.12,.025,260,mat(0xe5e9df),x,.08,0)}
// lane dashes
for(let z=-125;z<130;z+=9)block(.18,.025,3,white,0,.09,z);
const buildingMats=[0xe7e8d9,0xd7e2d9,0xd8d8cf,0xe8dfce,0xc7d9d0].map(c=>mat(c));
function building(x,z,w,d,h,idx){const m=buildingMats[idx%buildingMats.length];block(w,h,d,m,x,0,z);block(w+.15,.3,d+.15,green,x,h-.15,z);for(let y=2;y<h-1;y+=2.6){for(let xx=-w/2+1;xx<w/2-.5;xx+=2){const win=new THREE.Mesh(new THREE.BoxGeometry(.85,1.15,.08),glassMat);win.position.set(x+xx,y,z+d/2+.045);scene.add(win);const win2=win.clone();win2.position.z=z-d/2-.045;scene.add(win2)}}}
for(let i=0;i<9;i++){const z=-65+i*16;building(-20,z,8,10,12+(i%3)*5,i);building(20,z,9,11,16+(i%4)*6,i+1)}
// farther skyline
for(let i=0;i<34;i++){let x=(Math.random()-.5)*125,z=-100+Math.random()*180;if(Math.abs(x)<27)continue;building(x,z,7+Math.random()*8,7+Math.random()*8,8+Math.random()*28,i+2)}
// palm trees
function palm(x,z){const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.28,5,7),mat(0x80613d));trunk.position.set(x,2.5,z);trunk.castShadow=true;scene.add(trunk);for(let i=0;i<7;i++){let a=i*Math.PI*2/7;const leaf=new THREE.Mesh(new THREE.ConeGeometry(.34,4,5),mat(0x237a43));leaf.position.set(x+Math.cos(a)*1.2,5.1,z+Math.sin(a)*1.2);leaf.rotation.z=-Math.cos(a)*.9;leaf.rotation.x=Math.sin(a)*.9;scene.add(leaf)}}
for(let z=-65;z<80;z+=17){palm(-12,z);palm(12,z)}

// -----------------------------------------------------------------------------
// v0.10 EXPANDED LAGOS WORLD: approx. 2.1 km x 2.1 km playable city footprint.
// The original compact prototype remains as the central starter district; this
// generator adds connected Lagos-inspired districts, arterials, compounds,
// markets, civic buildings, sports venues, waterfront and recognizable signage.
// -----------------------------------------------------------------------------
const CITY_HALF=1050;
const cityGroundMat=mat(0x789b70), asphaltMat=mat(0x303735), laneMat=mat(0xe8dfc4),
      curbMat=mat(0xbfc8b9), sandMat=mat(0xc7ad83), lagoonMat=new THREE.MeshStandardMaterial({color:0x3f8f9a,roughness:.35,metalness:.12}),
      roofMat=mat(0x8e5140), concreteMat=mat(0xb9b7a9), marketMat=mat(0xd5b46e),
      sportGreen=mat(0x287b43), sportBlue=mat(0x276a9a), sportRed=mat(0xb74b3b);
block(2100,.35,2100,cityGroundMat,0,-.42,0);

// Lagos-style lagoon/waterfront on the south-eastern edge with a sandy shore.
block(690,.5,230,lagoonMat,610,-.28,930);
block(720,.12,34,sandMat,590,-.12,805);
for(let i=0;i<18;i++){
  const x=280+i*38;
  block(1.4,.22,22,mat(0x806d52),x,-.02,820);
}
// Dense connected road grid. Main avenues every 210m, secondary streets every 70m.
for(let p=-900;p<=900;p+=210){
  block(24,.18,2100,asphaltMat,p,-.12,0);
  block(2100,.18,22,asphaltMat,0,-.12,p);
  block(1,.025,1980,laneMat,p-5,.0,0);
  block(1,.025,1980,laneMat,p+5,.0,0);
  block(1980,.025,1,laneMat,0,.0,p-5);
  block(1980,.025,1,laneMat,0,.0,p+5);
}
for(let p=-980;p<=980;p+=70){
  if(Math.abs(p%210)<1) continue;
  block(8,.12,2100,asphaltMat,p,-.16,0);
  block(2100,.12,8,asphaltMat,0,-.16,p);
}
// Road-reservation system: every generated building must fit inside a plot.
// Major avenues are 24m wide; local streets are 8m wide. A 5m setback keeps
// walls, porches and building corners out of the carriageway.
function roadHalfWidthAt(value){
 const grid=Math.round(value/70)*70;
 return Math.abs(grid%210)===0?12:4;
}
function clearBuildingPlot(x,z,w,d,extra=5){
 const nx=Math.round(x/70)*70, nz=Math.round(z/70)*70;
 const dx=Math.abs(x-nx), dz=Math.abs(z-nz);
 if(dx < roadHalfWidthAt(nx)+w/2+extra) return false;
 if(dz < roadHalfWidthAt(nz)+d/2+extra) return false;
 return true;
}

// Realistic road paint: avenue centre lines, broken lane dividers, edge lines,
// turn arrows and stop bars. All paint sits slightly above the asphalt.
const paintWhite=new THREE.MeshBasicMaterial({color:0xf4f2df});
const paintYellow=new THREE.MeshBasicMaterial({color:0xf1c84b});
const paintArrow=new THREE.MeshBasicMaterial({color:0xf4f2df,side:THREE.DoubleSide});
function roadPaint(w,d,x,z,material=paintWhite,y=.018){
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,.035,d),material);m.position.set(x,y,z);scene.add(m);return m;
}
// Main avenues: double yellow centre lines and broken white lane separators.
for(let p=-900;p<=900;p+=210){
 for(const offset of [-.42,.42]){
  roadPaint(.22,2100,p+offset,-0,paintYellow,.012);
  roadPaint(2100,.22,0,p+offset,paintYellow,.012);
 }
 for(let q=-990;q<990;q+=18){
  roadPaint(.16,7,p-5.5,q,paintWhite,.02);roadPaint(.16,7,p+5.5,q,paintWhite,.02);
  roadPaint(7,.16,q,p-5.5,paintWhite,.02);roadPaint(7,.16,q,p+5.5,paintWhite,.02);
 }
 // Kerb/edge lines on both sides of each main avenue.
 for(const side of [-1,1]){
  roadPaint(.18,2100,p+side*11.2,0,paintWhite,.014);
  roadPaint(2100,.18,0,p+side*11.2,paintWhite,.014);
 }
}
// Local streets receive short broken centre markings and painted junction bars.
for(let p=-980;p<=980;p+=70){
 if(Math.abs(p%210)<1) continue;
 for(let q=-980;q<980;q+=28){
  roadPaint(.12,4,p,q,paintWhite,.018);
  roadPaint(4,.12,q,p,paintWhite,.018);
 }
}
// Direction arrows at regular approach points.
function addRoadArrow(x,z,rotation=0){
 const shape=new THREE.Shape();shape.moveTo(0,3.2);shape.lineTo(-1.1,1.2);shape.lineTo(-.38,1.2);shape.lineTo(-.38,-2.2);shape.lineTo(.38,-2.2);shape.lineTo(.38,1.2);shape.lineTo(1.1,1.2);shape.closePath();
 const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),paintArrow);mesh.rotation.x=-Math.PI/2;mesh.rotation.z=rotation;mesh.position.set(x,.035,z);scene.add(mesh);
}
for(let p=-840;p<=840;p+=210){for(let q=-840;q<=840;q+=210){addRoadArrow(p-7,q-28,0);addRoadArrow(p+7,q+28,Math.PI);}}

// Lagos-style streetlights: galvanized poles, outreach arms and warm LED heads.
// The lamps are placed on verges, never in driving lanes or building plots.
const poleMat=mat(0x59645e,.55), lampGlow=new THREE.MeshStandardMaterial({color:0xffe7ad,emissive:0xffc66b,emissiveIntensity:1.6,roughness:.3});
function streetlight(x,z,rotation=0,scale=1){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;scene.add(g);
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.13*scale,.2*scale,8*scale,9),poleMat);pole.position.y=4*scale;pole.castShadow=true;g.add(pole);
 const arm=new THREE.Mesh(new THREE.CylinderGeometry(.075*scale,.09*scale,2.2*scale,8),poleMat);arm.rotation.z=Math.PI/2;arm.position.set(.88*scale,7.65*scale,0);g.add(arm);
 const head=new THREE.Mesh(new THREE.BoxGeometry(1.25*scale,.22*scale,.48*scale),lampGlow);head.position.set(1.85*scale,7.55*scale,0);g.add(head);
 const hood=new THREE.Mesh(new THREE.BoxGeometry(1.45*scale,.12*scale,.62*scale),poleMat);hood.position.set(1.85*scale,7.72*scale,0);g.add(hood);
 return g;
}
for(let p=-900;p<=900;p+=210){
 for(let q=-945;q<=945;q+=105){streetlight(p-15,q,0,.9);streetlight(q,p+15,Math.PI/2,.9);}
}
// A smaller number of lights on local streets, alternating sides to reduce clutter.
for(let p=-980;p<=980;p+=140){if(Math.abs(p%210)<1)continue;for(let q=-910;q<=910;q+=210){streetlight(p-6,q,0,.68);streetlight(q,p+6,Math.PI/2,.68);}}

// Intersections and zebra crossing bars at selected major junctions.
for(let x=-840;x<=840;x+=210){
 for(let z=-840;z<=840;z+=210){
  for(let n=-3;n<=3;n++){
   block(1.2,.035,9,white,x+n*2.3,.025,z-17);
   block(9,.035,1.2,white,x-17,.025,z+n*2.3);
  }
 }
}

// District palette and building families.
const wallPalette=[0xd9d1bd,0xe2dfd1,0xc8d3c9,0xd6c3a8,0xbfc9c4,0xe8e2d2,0xc7b8a5,0xd7d9cf].map(c=>mat(c));
const roofPalette=[0x9a5544,0x9c674b,0x6d7770,0x8b4e3f,0xb5a18a].map(c=>mat(c));
const glassBlue=new THREE.MeshStandardMaterial({color:0x5e9295,roughness:.24,metalness:.25});
const trimMat=mat(0xeee8d8), darkMetal=mat(0x303b36), rustRoof=mat(0x765044);
function addWaterTank(parent,x,y,z,scale=1){
 const tank=new THREE.Mesh(new THREE.CylinderGeometry(.85*scale,.85*scale,1.7*scale,12),mat(0x263f48));
 tank.position.set(x,y+1.05*scale,z);parent.add(tank);
 const lid=new THREE.Mesh(new THREE.CylinderGeometry(.88*scale,.88*scale,.12*scale,12),darkMetal);
 lid.position.set(x,y+1.92*scale,z);parent.add(lid);
 const legs=new THREE.Mesh(new THREE.BoxGeometry(1.8*scale,.16*scale,1.8*scale),darkMetal);
 legs.position.set(x,y+.12*scale,z);parent.add(legs);
}
function makeBuilding(x,z,w,d,h,kind='residential',seed=0){
 if(!clearBuildingPlot(x,z,w,d,5)) return null;
 const wall=wallPalette[Math.abs(seed)%wallPalette.length];
 const obj=new THREE.Group();obj.position.set(x,0,z);scene.add(obj);
 const main=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wall);main.position.y=h/2;main.castShadow=true;main.receiveShadow=true;obj.add(main);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(w+.35,.5,d+.35),roofPalette[Math.abs(seed+2)%roofPalette.length]);roof.position.y=h+.18;roof.castShadow=true;obj.add(roof);
 // Lagos residential facades: recessed-looking windows, balcony slabs,
 // painted fascia bands, security grilles and rooftop water storage.
 if(kind==='residential'||kind==='mixed'||kind==='tenement'||kind==='bungalow'||kind==='duplex'){
  const floors = Math.max(1,Math.floor(h/3));
  for(let floor=2.0;floor<h-1.2;floor+=2.8){
   const balcony=new THREE.Mesh(new THREE.BoxGeometry(w+.35,.16,.9),concreteMat);
   balcony.position.set(0,floor,d/2+.42);obj.add(balcony);
   const rail=new THREE.Mesh(new THREE.BoxGeometry(w*.82,.72,.10),darkMetal);
   rail.position.set(0,floor+.43,d/2+.82);obj.add(rail);
   for(let wx=-w/2+1.25;wx<w/2-.55;wx+=2.55){
    const win=new THREE.Mesh(new THREE.BoxGeometry(1.12,1.28,.10),glassBlue);
    win.position.set(wx,floor+.62,d/2+.07);obj.add(win);
    const grille=new THREE.Mesh(new THREE.BoxGeometry(1.22,1.38,.07),darkMetal);
    grille.position.set(wx,floor+.62,d/2+.13);obj.add(grille);
   }
  }
  const fascia=new THREE.Mesh(new THREE.BoxGeometry(w+.22,.28,d+.22),trimMat);
  fascia.position.y=Math.min(h-1.2,3.0);obj.add(fascia);
  if(h>7) addWaterTank(obj,w*.24,h+.35,-d*.18,Math.min(1.25,Math.max(.7,w/18)));
  // External stair/service core on one side, common in walk-up blocks.
  if(kind==='tenement'||kind==='residential'){
   const stair=new THREE.Mesh(new THREE.BoxGeometry(1.5,Math.min(h,10),d*.58),concreteMat);
   stair.position.set(-w*.36,Math.min(h,10)/2,d*.18);obj.add(stair);
  }
 }
 if(kind==='bungalow'||kind==='duplex'){
  // Pitched roof, deep veranda, porch columns and a visible front entrance.
  const roofMesh=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.72,Math.max(2.2,h*.22),4),rustRoof);
  roofMesh.position.set(0,h+1.0,0);roofMesh.rotation.y=Math.PI/4;obj.add(roofMesh);
  const porch=new THREE.Mesh(new THREE.BoxGeometry(w*.72,.25,2.4),concreteMat);
  porch.position.set(0,1.5,d/2+1.1);obj.add(porch);
  for(const px of [-w*.32,w*.32]){
   const col=new THREE.Mesh(new THREE.BoxGeometry(.32,2.8,.32),trimMat);
   col.position.set(px,1.4,d/2+1.9);obj.add(col);
  }
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.35,2.35,.12),darkMetal);
  door.position.set(0,1.18,d/2+.09);obj.add(door);
 }
 if(kind==='tenement'){
  // Repeated narrow door bays and shared frontage typical of dense compounds.
  for(let dx=-w/2+1.5;dx<w/2-1;dx+=3.2){
   const door=new THREE.Mesh(new THREE.BoxGeometry(1.05,2.15,.12),darkMetal);
   door.position.set(dx,1.08,d/2+.12);obj.add(door);
  }
 }
 if(kind==='shop'||kind==='market'){
  const awning=new THREE.Mesh(new THREE.BoxGeometry(w+.3,.35,d*.28),marketMat);awning.position.set(0,2.6,d/2+.35);obj.add(awning);
  for(let wx=-w/2+1;wx<w/2;wx+=2.2){const shutter=new THREE.Mesh(new THREE.BoxGeometry(1.5,2,.08),mat(0x6e756d));shutter.position.set(wx,1.2,d/2+.08);obj.add(shutter)}
 }
 if(kind==='office'){
  for(let floor=2.2;floor<h;floor+=2.4){const band=new THREE.Mesh(new THREE.BoxGeometry(w+.1,.85,d+.1),glassBlue);band.position.y=floor;obj.add(band)}
 }
 return obj;
}
function signBoard(text,x,z,width=22,color=0x176b43){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillRect(0,0,512,128);
 ctx.fillStyle='#ffffff';ctx.font='bold 42px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,480);
 const tex=new THREE.CanvasTexture(canvas);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,5),new THREE.MeshBasicMaterial({map:tex,transparent:false,side:THREE.DoubleSide}));
 mesh.position.set(x,7,z);scene.add(mesh);return mesh;
}
function palmTree(x,z,scale=1){
 const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22*scale,.34*scale,6*scale,7),mat(0x795b3b));trunk.position.set(x,3*scale,z);scene.add(trunk);
 for(let k=0;k<8;k++){const a=k*Math.PI/4;const leaf=new THREE.Mesh(new THREE.ConeGeometry(.42*scale,5.2*scale,5),mat(0x287642));leaf.position.set(x+Math.cos(a)*1.5*scale,6*scale,z+Math.sin(a)*1.5*scale);leaf.rotation.z=-Math.cos(a)*.9;leaf.rotation.x=Math.sin(a)*.9;scene.add(leaf)}
}
function fencedPitch(cx,cz,name='FOOTBALL PITCH',surface=sportGreen){
 const g=new THREE.Group();g.position.set(cx,0,cz);scene.add(g);
 const field=new THREE.Mesh(new THREE.BoxGeometry(82,.22,48),surface);field.position.y=.04;g.add(field);
 const lineMat=new THREE.MeshBasicMaterial({color:0xffffff});
 function line(w,h,x,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,.035,h),lineMat);m.position.set(x,.17,z);g.add(m)}
 line(78,.35,0,-23.5);line(78,.35,0,23.5);line(.35,47,-40,0);line(.35,47,40,0);line(.3,47,0,0);
 const circle=new THREE.Mesh(new THREE.RingGeometry(7.6,7.9,48),lineMat);circle.rotation.x=-Math.PI/2;circle.position.y=.18;g.add(circle);
 for(const x of [-40,40]){const goal=new THREE.Mesh(new THREE.BoxGeometry(.6,5,12),white);goal.position.set(x,2.5,0);g.add(goal)}
 // Simple perimeter fence and floodlights.
 const fenceMat=mat(0x87958b);
 for(const x of [-44,44]){const f=new THREE.Mesh(new THREE.BoxGeometry(.25,3,58),fenceMat);f.position.set(x,1.5,0);g.add(f)}
 for(const z of [-29,29]){const f=new THREE.Mesh(new THREE.BoxGeometry(92,3,.25),fenceMat);f.position.set(0,1.5,z);g.add(f)}
 for(const x of [-48,48])for(const z of [-31,31]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,13,8),dark);pole.position.set(x,6.5,z);g.add(pole);const lamp=new THREE.Mesh(new THREE.BoxGeometry(2,.4,1),white);lamp.position.set(x,13,z);g.add(lamp)}
 signBoard(name,cx,cz-34,26,0x176b43);
}
function tennisCentre(cx,cz){
 const g=new THREE.Group();g.position.set(cx,0,cz);scene.add(g);
 for(let c=0;c<3;c++){const z=(c-1)*30;const court=new THREE.Mesh(new THREE.BoxGeometry(22,.2,12),sportBlue);court.position.set(0,.06,z);g.add(court);
  const ln=new THREE.MeshBasicMaterial({color:0xffffff});
  for(const x of [-10.5,10.5]){const m=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,11),ln);m.position.set(x,.19,z);g.add(m)}
  const net=new THREE.Mesh(new THREE.BoxGeometry(.15,1,12),mat(0xe8e8df));net.position.set(0,.65,z);g.add(net)}
 signBoard('LAGOS TENNIS CENTRE',cx,cz-65,28,0x245f94);
}
function basketballCentre(cx,cz){
 const court=new THREE.Mesh(new THREE.BoxGeometry(38,.2,23),sportRed);court.position.set(cx,.05,cz);scene.add(court);
 const ring=new THREE.Mesh(new THREE.RingGeometry(5,5.3,32),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(cx,.18,cz);scene.add(ring);
 signBoard('COMMUNITY BASKETBALL COURT',cx,cz-22,25,0x9b4036);
}
function marketCluster(cx,cz,label='LOCAL MARKET'){
 for(let i=0;i<7;i++){const x=cx+(i%4)*13-20,z=cz+Math.floor(i/4)*15;makeBuilding(x,z,10,10,4,'market',i);const canopy=new THREE.Mesh(new THREE.BoxGeometry(10,.35,10),marketMat);canopy.position.set(x,4.4,z);scene.add(canopy)}
 signBoard(label,cx,cz-18,30,0x9a5b23);
}
function compound(cx,cz,kind='residential',seed=0){
 if(!clearBuildingPlot(cx,cz,62,50,7)) return;
 // Walled family compounds with gate, small yard and several low-rise blocks.
 const wall=mat(0xb6ad9a),g=new THREE.Group();g.position.set(cx,0,cz);scene.add(g);
 for(const [x,z,w,d] of [[0,-25,62,.7],[0,25,62,.7],[-31,0,.7,50],[31,0,.7,50]]){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,2.2,d),wall);m.position.set(x,1.1,z);g.add(m)
 }
 const gate=new THREE.Mesh(new THREE.BoxGeometry(8,2.4,.5),mat(0x354c40));gate.position.set(0,1.2,25);g.add(gate);
 const gateHeader=new THREE.Mesh(new THREE.BoxGeometry(10,.45,.8),trimMat);gateHeader.position.set(0,2.55,25);g.add(gateHeader);
 // Two low-rise buildings create the familiar shared-yard compound layout.
 makeBuilding(cx-12,cz-8,22,17,10,kind,seed);makeBuilding(cx+13,cz-7,18,16,8,kind,seed+1);
 const gen=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.1,1.1),darkMetal);gen.position.set(cx+22,.55,cz+16);scene.add(gen);
 const yard=new THREE.Mesh(new THREE.BoxGeometry(20,.12,16),grass);yard.position.set(cx,0,cz+13);scene.add(yard);
}
function buildDistrict(name,cx,cz,type,seed){
 // arterial frontage, varied block fabric and a signature landmark per district.
 if(type==='island'){
  for(let i=0;i<10;i++){makeBuilding(cx+(i%5)*34-68,cz+Math.floor(i/5)*45-18,24,25,24+(i%4)*13,'office',seed+i)}
  makeBuilding(cx,cz+90,70,34,68,'office',seed+20);signBoard(name.toUpperCase(),cx,cz-80,34,0x145b3c);
 }else if(type==='market'){
  marketCluster(cx,cz,name.toUpperCase());
  for(let i=0;i<12;i++)makeBuilding(cx+(i%4)*29-44,cz+70+Math.floor(i/4)*25,18,18,8+(i%3)*3,'shop',seed+i);
 }else if(type==='sports'){
  fencedPitch(cx,cz,name.toUpperCase()+' FOOTBALL ARENA');
  tennisCentre(cx+135,cz+5);basketballCentre(cx-135,cz+8);
  makeBuilding(cx,cz+110,55,32,12,'mixed',seed);signBoard('SPORTS & RECREATION COMPLEX',cx,cz+88,35,0x176b43);
 }else if(type==='civic'){
  makeBuilding(cx-35,cz,45,38,22,'office',seed);makeBuilding(cx+35,cz,42,36,18,'office',seed+1);
  makeBuilding(cx,cz+58,88,28,8,'mixed',seed+2);signBoard(name.toUpperCase(),cx,cz-48,34,0x205c82);
 }else{
  const isMainland=/YABA|SURULERE|OSHODI|MUSHIN|AGEGE|FESTAC/i.test(name);
  const isLuxury=/LEKKI|AJAH|IKOYI/i.test(name);
  const houseKind=isMainland?'tenement':(isLuxury?'duplex':'bungalow');
  const count=isMainland?24:18;
  for(let i=0;i<count;i++){
   const x=cx+(i%6)*28-70,z=cz+Math.floor(i/6)*34-35;
   if(isMainland){
    compound(x,z,'tenement',seed+i);
    if(i%3===0)makeBuilding(x+4,z+30,18,12,12,'tenement',seed+i+30);
   }else if(isLuxury){
    // Larger gated plots with detached duplexes and landscaped setbacks.
    const yard=new THREE.Mesh(new THREE.BoxGeometry(34,.12,30),grass);yard.position.set(x,.02,z);scene.add(yard);
    compound(x,z,'duplex',seed+i);
    for(const sx of [-12,12]){
     const hedge=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.5,25),mat(0x326b3c));hedge.position.set(x+sx, .75,z);scene.add(hedge);
    }
   }else compound(x,z,houseKind,seed+i);
  }
  for(let i=0;i<7;i++)makeBuilding(cx+(i%4)*36-54,cz-100+Math.floor(i/4)*28,24,18,5+(i%2)*2,'shop',seed+i);
  signBoard(name.toUpperCase(),cx,cz-135,28,0x24613d);
 }
}
// Districts distributed around the enlarged, connected city. Names are inspired
// by real Lagos urban character; this is a stylised game map, not an exact survey.
const districtDefs=[
 ['VICTORIA ISLAND',0,-420,'island'],['IKOYI',420,-420,'island'],['LEKKI PHASE 1',760,-120,'residential'],
 ['YABA',-420,-120,'civic'],['SURULERE',-700,260,'sports'],['IKEJA',-180,520,'civic'],
 ['OSHODI MARKET',-780,-360,'market'],['MUSHIN',-470,650,'market'],['AJAH',720,520,'residential'],
 ['EPE WATERFRONT',930,760,'civic'],['MAINLAND SPORTS PARK',-70,120,'sports'],['AGEGE',-880,20,'residential'],
 ['FESTAC TOWN',-760,760,'residential'],['APAPA PORT',-980,520,'civic']
];
districtDefs.forEach((d,i)=>buildDistrict(d[0],d[1],d[2],d[3],i*13));

// Additional dense mixed-use urban fabric in every remaining block to avoid
// a sparse "island of buildings" effect, with yards, kiosks and roadside palms.
let citySeed=0;
for(let gx=-900;gx<=900;gx+=210){
 for(let gz=-900;gz<=900;gz+=210){
  const nearLandmark=districtDefs.some(d=>Math.hypot(gx-d[1],gz-d[2])<155);
  if(nearLandmark)continue;
  for(let n=0;n<5;n++){
   const x=gx+(n%3)*48-48+(Math.random()-.5)*10;
   const z=gz+Math.floor(n/3)*54-20+(Math.random()-.5)*10;
   if(Math.abs(x)<35&&Math.abs(z)<35)continue;
   const h=7+Math.random()*22;
   makeBuilding(x,z,12+Math.random()*10,12+Math.random()*10,h,n%4===0?'shop':'residential',citySeed++);
  }
  if((Math.round((gx+900)/210)+Math.round((gz+900)/210))%3===0){
   for(let t=0;t<3;t++)palmTree(gx-55+t*55,gz+65,0.8+Math.random()*.25);
  }
 }
}
// Industrial port yards, container stacks and cranes near Apapa.
for(let i=0;i<24;i++){
 const x=-930+(i%6)*32,z=570+Math.floor(i/6)*34;
 const c=[0xb54e35,0x2f6788,0xd0a447,0x4c735c][i%4];
 block(25,7,12,mat(c),x,0,z);
}
for(let i=0;i<3;i++){
 const x=-1020+i*65;block(2,48,2,dark,x,0,650);block(46,2,2,mat(0x58645e),x,46,650);
}

// Customizable human avatar: varied skin tones, face, hair and clothing.
const player=new THREE.Group();scene.add(player);
let body;
const avatarDefaults={skin:"#70452f",hair:"#171513",style:"Low cut",top:"#16834a",bottom:"#263d35",shoes:"#f3f3e9",name:"New Lagosian"};
let avatarSettings={...avatarDefaults};
function part(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function rebuildAvatar(opts=avatarSettings){
  avatarSettings={...opts};while(player.children.length)player.remove(player.children[0]);
  const skin=new THREE.MeshStandardMaterial({color:avatarSettings.skin,roughness:.72});
  const hairMat=new THREE.MeshStandardMaterial({color:avatarSettings.hair,roughness:.92});
  const shirt=mat(avatarSettings.top),trousers=mat(avatarSettings.bottom),shoe=mat(avatarSettings.shoes);
  const joint=mat(avatarSettings.skin);
  // Natural human proportions: torso, neck, shoulders, arms, hands, legs and shoes.
  body=part(player,new THREE.CapsuleGeometry(.34,.72,7,14),shirt,0,1.08,0,1.05,1,0.72);
  part(player,new THREE.CylinderGeometry(.105,.12,.22,16),skin,0,1.72,0);
  const head=part(player,new THREE.SphereGeometry(.29,32,24),skin,0,2.02,0,.88,1.12,.9);
  // Ears
  for(const x of [-.255,.255])part(player,new THREE.SphereGeometry(.075,16,12),skin,x,2.01,0,.72,1.15,.7);
  // Eyes, irises and eyebrows
  for(const x of [-.105,.105]){
    part(player,new THREE.SphereGeometry(.047,16,12),mat(0xf5eee2),x,2.075,.239,.95,.7,.5);
    part(player,new THREE.SphereGeometry(.022,12,10),mat(0x24160f),x,2.075,.26);
    part(player,new THREE.BoxGeometry(.095,.018,.025),hairMat,x,2.145,.24,1,1,1);
  }
  // Nose bridge and nostrils; proportions remain editable through the future face controls.
  part(player,new THREE.SphereGeometry(.07,16,12),skin,0,2.005,.265,.72,1.05,.75);
  part(player,new THREE.SphereGeometry(.055,16,12),skin,0,1.968,.285,1.05,.58,.72);
  // Lips
  part(player,new THREE.SphereGeometry(.066,16,10),mat(0x713d36),0,1.91,.253,1.15,.34,.45);
  // Hair styles
  if(avatarSettings.style==="Afro"){
    part(player,new THREE.SphereGeometry(.315,24,18),hairMat,0,2.22,-.005,1.08,.82,1.02);
    for(let i=0;i<18;i++){const a=i*Math.PI*2/18;part(player,new THREE.SphereGeometry(.075,10,8),hairMat,Math.cos(a)*.24,2.27+Math.sin(i*2)*.025,Math.sin(a)*.23,.9,.9,.9)}
  }else if(avatarSettings.style==="Braids"){
    part(player,new THREE.SphereGeometry(.29,20,14),hairMat,0,2.19,0,1,.65,1);
    for(let i=0;i<9;i++){const x=(i-4)*.055;const braid=part(player,new THREE.CylinderGeometry(.025,.025,.42,8),hairMat,x,2.15,.12,1,1,1);braid.rotation.z=-.18}
    for(let i=0;i<5;i++)part(player,new THREE.CylinderGeometry(.023,.023,.45,8),hairMat,-.24+i*.12,1.98,.08);
  }else if(avatarSettings.style==="Locs"){
    part(player,new THREE.SphereGeometry(.30,20,14),hairMat,0,2.2,0,1,.72,1);
    for(let i=0;i<11;i++){const a=i*Math.PI*2/11;const loc=part(player,new THREE.CylinderGeometry(.027,.032,.38,7),hairMat,Math.cos(a)*.24,2.05,Math.sin(a)*.23);loc.rotation.z=Math.cos(a)*.35;loc.rotation.x=Math.sin(a)*.3}
  }else if(avatarSettings.style==="Headwrap"){
    part(player,new THREE.SphereGeometry(.32,24,16),mat(avatarSettings.hair),0,2.24,0,1.12,.62,1.05);
    part(player,new THREE.TorusGeometry(.27,.055,8,24),mat(avatarSettings.top),0,2.18,0,1,1,.9);
  }else{
    part(player,new THREE.SphereGeometry(.295,24,14,0,Math.PI*2,0,Math.PI/2),hairMat,0,2.18,-.005,1,.7,1);
  }
  // Arms and hands
  for(const side of [-1,1]){
    const arm=part(player,new THREE.CapsuleGeometry(.105,.53,5,10),joint,side*.39,1.12,0,1,1,.95);arm.rotation.z=side*-.12;
    part(player,new THREE.SphereGeometry(.095,14,10),skin,side*.43,.78,.015,.85,1.1,.8);
    // Legs and footwear
    part(player,new THREE.CapsuleGeometry(.135,.52,5,10),trousers,side*.16,.39,0,1,1,.9);
    part(player,new THREE.BoxGeometry(.22,.13,.38),shoe,side*.16,.105,-.075);
  }
}
let avatarReady=false, avatarMixer=null, avatarModel=null, avatarActions={}, activeAvatarAction=null;
player.visible=false; // Avoid showing the old placeholder while the detailed character loads.
try{const saved=JSON.parse(localStorage.getItem('til-character')||'null');if(saved){avatarSettings={...avatarDefaults,...saved};document.querySelector('.player-name').textContent=saved.name||'New Lagosian'}}catch(e){}
player.position.set(0,0,5);
const loadingBadge=document.createElement('div');loadingBadge.id='modelLoading';loadingBadge.textContent='Loading your character…';document.body.appendChild(loadingBadge);
const gltfLoader=new GLTFLoader();
gltfLoader.load('./models/The_Miami_Dealer.glb',gltf=>{
  avatarModel=gltf.scene;avatarModel.position.set(0,0,0);avatarModel.scale.setScalar(1);
  const box=new THREE.Box3().setFromObject(avatarModel);const size=box.getSize(new THREE.Vector3());
  const height=size.y||2.3;avatarModel.scale.setScalar(2.35/height);
  const scaledBox=new THREE.Box3().setFromObject(avatarModel);avatarModel.position.y-=scaledBox.min.y;
  avatarModel.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  player.add(avatarModel);player.visible=true;avatarReady=true;
  if(gltf.animations?.length){avatarMixer=new THREE.AnimationMixer(avatarModel);for(const clip of gltf.animations)avatarActions[clip.name.toLowerCase()]=avatarMixer.clipAction(clip);const idle=Object.keys(avatarActions).find(n=>n.includes('idle'))||Object.keys(avatarActions)[0];activeAvatarAction=avatarActions[idle];activeAvatarAction?.play();}
  loadingBadge.remove();toast('Character loaded');
},undefined,error=>{
  console.warn('Detailed character could not load:',error);rebuildAvatar(avatarSettings);player.visible=true;avatarReady=true;loadingBadge.textContent='Using local character preview';setTimeout(()=>loadingBadge.remove(),2600);
});
const rainGroup=new THREE.Group();scene.add(rainGroup);const drops=[];
for(let i=0;i<500;i++){const d=new THREE.Mesh(new THREE.BoxGeometry(.025,.45,.025),new THREE.MeshBasicMaterial({color:0xd9efff,transparent:true,opacity:.55}));d.position.set((Math.random()-.5)*180,Math.random()*35,(Math.random()-.5)*180);rainGroup.add(d);drops.push(d)}
rainGroup.visible=false;
let cameraMode=0,weather='Clear',worldMinutes=12*60,daySpeed=3,lookAngle=0,lookPitch=.12,cameraDistance=157.5;
const modes=['THIRD PERSON','FIRST PERSON','ISOMETRIC'];
const keys={};let moving=false;
function updateCamera(){
  const targetY=player.position.y+(cameraMode===1?1.68:1.18);
  if(cameraMode===0){
    const horizontal=Math.cos(lookPitch)*cameraDistance;
    camera.position.set(player.position.x+Math.sin(lookAngle)*horizontal,player.position.y+1.18+Math.sin(lookPitch)*cameraDistance,player.position.z+Math.cos(lookAngle)*horizontal);
    camera.lookAt(player.position.x,targetY,player.position.z);
  }else if(cameraMode===1){
    camera.position.set(player.position.x,player.position.y+1.68,player.position.z);
    camera.rotation.set(0,lookAngle+Math.PI,0);camera.rotateX(-lookPitch);
  }else{
    camera.position.set(player.position.x+12,player.position.y+15,player.position.z+12);
    camera.lookAt(player.position.x,player.position.y+0.8,player.position.z);
  }
}
function setDay(){let hour=worldMinutes/60;let daylight=Math.max(0,Math.sin((hour-6)/12*Math.PI));let night=1-daylight;let sky=new THREE.Color().lerpColors(new THREE.Color(0x101d37),new THREE.Color(0x9fc9d4),daylight);if(hour>17||hour<6)sky.lerp(new THREE.Color(0x25324c),.3);scene.background=sky;scene.fog.color.copy(sky);sun.intensity=.25+daylight*2.3;sun.color.setHex(daylight>.3?0xffe7c2:0x9bb8ed);renderer.toneMappingExposure=.55+daylight*.55;document.querySelector('#worldTime').textContent=hour<6||hour>=19?'Night':hour<12?'Morning':hour<17?'Afternoon':'Evening';}
function toast(s){const t=document.querySelector('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}
function modal(title,body,actions=[]){document.querySelector('#modalTitle').textContent=title;document.querySelector('#modalBody').innerHTML=body;const a=document.querySelector('#modalActions');a.innerHTML='';actions.forEach(([label,fn,secondary])=>{const b=document.createElement('button');b.textContent=label;if(secondary)b.className='secondary';b.onclick=()=>{closeModal();fn?.()};a.appendChild(b)});document.querySelector('#modalBackdrop').classList.remove('hidden')}
function closeModal(){document.querySelector('#modalBackdrop').classList.add('hidden')}
document.querySelector('#closeModal').onclick=closeModal;
document.querySelector('#cameraBtn').onclick=()=>{cameraMode=(cameraMode+1)%3;document.querySelector('#cameraBtn small').textContent=modes[cameraMode];toast('Camera: '+modes[cameraMode].toLowerCase());updateCamera()};
document.querySelector('#weatherBtn').onclick=()=>{weather=weather==='Clear'?'Rain':'Clear';rainGroup.visible=weather==='Rain';document.querySelector('#weatherLabel').textContent=weather==='Rain'?'🌧 Rain':'☀ Clear';toast('Weather changed to '+weather.toLowerCase())};
document.querySelector('#activityBtn').onclick=()=>{document.querySelector('#activityPanel').classList.toggle('panel-open')};
document.querySelector('#feedClose').onclick=()=>document.querySelector('#activityPanel').classList.remove('panel-open');
document.querySelector('#feedCreate').onclick=()=>openCreateActivity();
document.querySelectorAll('[data-feed-action]').forEach(b=>b.addEventListener('click',()=>handleFeedAction(b.dataset.feedAction)));
document.querySelector('#transportBtn').onclick=()=>openTransport();
document.querySelector('#dealerBtn').onclick=()=>openDealer();
document.querySelector('#vehiclesBtn').onclick=()=>openGarage();

const demoActivities=[
 {id:1,title:'12 vs 12 Football Match',place:'Lagos Football Arena',kind:'Football',joined:15,total:24,fee:'Free',status:'Recruiting'},
 {id:2,title:'Tennis Singles Challenge',place:'Victoria Island Tennis Club',kind:'Tennis',joined:1,total:2,fee:'Free',status:'Recruiting'},
 {id:3,title:'Lagos City Meetup',place:'Tafawa Balewa Square',kind:'Meetup',joined:8,total:20,fee:'Free',status:'Recruiting'}
];
function handleFeedAction(action){
 if(action==='competitions')openCompetitions();
 else if(action==='transport')openTransport();
 else if(action==='dealer')openDealer();
 else if(action==='garage')openGarage();
 else if(action==='police')toast('Police and theft reports are planned; online police players are not connected yet.');
}
function openCompetitions(){
 const rows=demoActivities.map(a=>`<div class="activity-row"><b>${a.title}</b><span>${a.place}</span><span>${a.joined}/${a.total} players · ${a.fee}</span><small>${a.status}</small><button class="panel-button" data-join="${a.id}">Join activity</button></div>`).join('');
 modal('Competitions at Lagos venues',`<p>Demo recruitment board. Players can discover a competition here or visit its venue in the city.</p>${rows}<p class="small-note">Joining and readiness are simulated on this device. Live invitations to online players need the multiplayer server.</p>`,[['Close',null,true]]);
 document.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>{const a=demoActivities.find(x=>x.id===Number(b.dataset.join));if(a.joined<a.total){a.joined++;toast('Joined: '+a.title);openCompetitions()}else toast('This activity is full')});
}
function openCreateActivity(){
 modal('Create a venue competition',`<p>Choose a venue and recruit players. Real-money entry and prize pools remain disabled until the required legal and payment approvals are in place.</p><div class="creator-grid"><label>Activity<input id="newActivity" value="Football match"></label><label>Venue<select id="newVenue"><option>Lagos Football Arena</option><option>Victoria Island Tennis Club</option><option>Lagos Racing Circuit</option><option>Lagos Marina</option></select></label><label>Players needed<input id="newCapacity" type="number" min="2" max="44" value="24"></label><label>Entry type<select id="newFee"><option>Free</option><option disabled>Real-money (not enabled)</option></select></label></div><p class="small-note">The creator sets the rules, capacity, venue and schedule. When full, all participants must confirm readiness before the match begins.</p>`,[['Post activity',()=>{const title=document.querySelector('#newActivity')?.value||'New activity';toast('Local demo activity created: '+title)}],['Cancel',null,true]]);
}
function openTransport(){
 modal('Get to the venue',`<p>Choose transport for a demo fare estimate. Fare depends on distance and vehicle type.</p><div class="creator-grid"><label>Destination<select id="tripPlace"><option value="2">Nearby venue · 2 km</option><option value="5">Mid-distance venue · 5 km</option><option value="10">Far venue · 10 km</option><option value="15">Distant venue · 15 km</option></select></label><label>Transport<select id="tripType"><option value="taxi">Taxi</option><option value="danfo">Danfo</option><option value="bike">Okada / bike</option><option value="boat">Boat</option></select></label></div><div id="fareQuote" class="fare-quote">Estimated fare: ₦—</div><p class="small-note">Demo estimate only. No wallet is charged and no real driver is connected.</p>`,[['Close',null,true]]);
 const calc=()=>{const km=Number(document.querySelector('#tripPlace')?.value||2),type=document.querySelector('#tripType')?.value||'taxi';const rate={taxi:180,danfo:55,bike:110,boat:220}[type];document.querySelector('#fareQuote').textContent='Estimated fare: ₦'+Math.max(100,Math.round(km*rate/50)*50).toLocaleString('en-NG')+' · '+km+' km'};
 document.querySelector('#tripPlace').onchange=calc;document.querySelector('#tripType').onchange=calc;calc();
}
const demoStock=[['City compact car','Car','₦8,500,000'],['Family SUV','Car','₦18,000,000'],['Commercial danfo','Bus','₦12,000,000'],['Okada motorcycle','Bike','₦1,200,000'],['Passenger speedboat','Boat','₦25,000,000']];
function openDealer(){const items=demoStock.map((v,i)=>`<div class="activity-row"><b>${v[0]}</b><span>${v[1]} · ${v[2]}</span><button class="panel-button" data-vehicle="${i}">View purchase</button></div>`).join('');modal('Official vehicle dealership',`<p>Vehicles and prices are set by the game operator. A player may buy for themselves or choose another player as recipient.</p>${items}<p class="small-note">Catalogue prices are illustrative placeholders. Purchases and real-money payment are not enabled in this prototype.</p>`,[['Close',null,true]]);document.querySelectorAll('[data-vehicle]').forEach(b=>b.onclick=()=>{const v=demoStock[Number(b.dataset.vehicle)];modal('Vehicle purchase preview',`<p><b>${v[0]}</b></p><p>Listed demo price: ${v[2]}</p><label class="recipient-label">Recipient player<input id="vehicleRecipient" placeholder="Enter player name" value="Your character"></label><p class="small-note">No payment will be taken in this preview.</p>`,[['Confirm preview',()=>toast('Purchase flow previewed; no charge made.')],['Back',()=>openDealer(),true]])})}
function openGarage(){modal('Vehicle garage & security',`<p><b>Your demo garage</b></p><p>No vehicles are registered to this local preview yet.</p><p>Each owned vehicle will have a unique unlock code. Owners must physically touch the vehicle to lock or unlock it; remote locking is not available.</p><p>Unlocked vehicles or vehicles with the owner inside can be targeted for theft. A successful theft may trigger an owner report and a player-police pursuit.</p><p class="small-note">Theft, arrests, fixed penalties and negative real-money balances are design concepts only. They are not active or connected to a real wallet.</p>`,[['Close',null,true]])}

document.querySelector('#profileBtn').onclick=()=>{
  const swatches=["#4b2d20","#70452f","#8a563b","#a86f4e","#c58a65"];
  const opts=(values,current)=>values.map(v=>`<option ${v===current?"selected":""}>${v}</option>`).join("");
  modal('Create your character',`
    <p>Build a Lagosian who looks and dresses the way you choose. These are prototype customizations saved in this browser.</p>
    <div class="creator-grid">
      <label>Display name<input id="nameInput" value="${avatarSettings.name}" maxlength="24"></label>
      <label>Skin tone<select id="skinInput">${swatches.map(v=>`<option value="${v}" ${v===avatarSettings.skin?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Hairstyle<select id="hairStyleInput">${opts(["Low cut","Afro","Braids","Locs","Headwrap"],avatarSettings.style)}</select></label>
      <label>Hair colour<select id="hairInput">${["#171513","#24180f","#392317","#5a3925","#171d18"].map(v=>`<option value="${v}" ${v===avatarSettings.hair?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Top / shirt<select id="topInput">${["#16834a","#f2f4ec","#172c55","#a83232","#d18b22","#5b477c"].map(v=>`<option value="${v}" ${v===avatarSettings.top?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Trousers<select id="bottomInput">${["#263d35","#20252c","#253b66","#6b6a62","#34243c"].map(v=>`<option value="${v}" ${v===avatarSettings.bottom?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Shoes<select id="shoesInput">${["#f3f3e9","#171717","#b83b2e","#e1b33e"].map(v=>`<option value="${v}" ${v===avatarSettings.shoes?"selected":""}>${v}</option>`).join("")}</select></label>
    </div>
    <p class="small-note">Next character update: more face-shape controls, body types, gender presentation, detailed Nigerian outfits and high-quality rigged 3D models.</p>`,
    [['Save character',()=>{
      const val=id=>document.getElementById(id)?.value;
      const settings={name:val('nameInput')||'New Lagosian',skin:val('skinInput'),style:val('hairStyleInput'),hair:val('hairInput'),top:val('topInput'),bottom:val('bottomInput'),shoes:val('shoesInput')};
      avatarSettings={...settings};if(!avatarModel)rebuildAvatar(settings);localStorage.setItem('til-character',JSON.stringify(settings));
      document.querySelector('.player-name').textContent=settings.name;toast(avatarModel?'Profile saved. Detailed model appearance controls are coming next.':'Character updated!');
    }],['Cancel',null,true]]
  );
};
document.querySelector('#menuBtn').onclick=()=>modal('THIS IS LAGOS','<p>Welcome to the Lagos city prototype.</p><p><b>Prototype controls</b><br>WASD / arrow keys: move<br>Drag: look around<br>C: switch camera<br>Weather button: clear / rain</p><p>This v0.5 build is a local interface prototype. Online accounts, live multiplayer, real-money wallet payments, police services and vehicle ownership records still require a secure online backend.</p>',[['Continue',null]]);
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='c')document.querySelector('#cameraBtn').click()});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
// Reliable camera controls: capture drag on the canvas and track globally.
let pointer=null;
renderer.domElement.style.touchAction='none';
renderer.domElement.style.cursor='grab';
renderer.domElement.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  pointer={x:e.clientX,y:e.clientY,id:e.pointerId};
  renderer.domElement.style.cursor='grabbing';
  try{renderer.domElement.setPointerCapture(e.pointerId)}catch(_e){}
  e.preventDefault();
});
window.addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  lookAngle-=dx*.008;
  lookPitch=Math.max(-.18,Math.min(.72,lookPitch+dy*.006));
  pointer.x=e.clientX;pointer.y=e.clientY;
  updateCamera();
});
function stopCameraDrag(e){
  if(pointer&&(!e||e.pointerId===undefined||pointer.id===e.pointerId)){
    try{renderer.domElement.releasePointerCapture(pointer.id)}catch(_e){}
    pointer=null;renderer.domElement.style.cursor='grab';
  }
}
window.addEventListener('pointerup',stopCameraDrag);
window.addEventListener('pointercancel',stopCameraDrag);
window.addEventListener('blur',()=>stopCameraDrag());
window.addEventListener('wheel',e=>{
  if(!document.querySelector('#game').contains(e.target)||cameraMode!==0)return;
  e.preventDefault();
  cameraDistance=Math.max(90,Math.min(240,cameraDistance+Math.sign(e.deltaY)*5));
  updateCamera();
},{passive:false});
const touchDirs={};document.querySelectorAll('.mobile-pad button').forEach(b=>{const d=b.dataset.dir;b.addEventListener('pointerdown',e=>{e.preventDefault();touchDirs[d]=true});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>touchDirs[d]=false))});
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);worldMinutes=(worldMinutes+dt*daySpeed)%1440;let h=Math.floor(worldMinutes/60),m=Math.floor(worldMinutes%60);document.querySelector('#clock').textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');setDay();let forward=(keys.w||keys.arrowup||touchDirs.up?1:0)-(keys.s||keys.arrowdown||touchDirs.down?1:0);let side=(keys.d||keys.arrowright||touchDirs.right?1:0)-(keys.a||keys.arrowleft||touchDirs.left?1:0);moving=!!(forward||side);const districtEl=document.querySelector('.stat-row b');if(districtEl){let nearest=districtDefs.reduce((best,d)=>{const dist=Math.hypot(player.position.x-d[1],player.position.z-d[2]);return dist<best.dist?{name:d[0],dist}:best},{name:'Lagos Mainland',dist:1e9});districtEl.textContent=nearest.dist<260?nearest.name:'Lagos';}if(avatarMixer){const desired=Object.keys(avatarActions).find(n=>moving?n.includes('walk-loop'):n.includes('idle'))||Object.keys(avatarActions)[0];const next=avatarActions[desired];if(next&&next!==activeAvatarAction){next.reset().fadeIn(.2).play();activeAvatarAction?.fadeOut(.2);activeAvatarAction=next;}avatarMixer.update(dt)}if(moving){const speed=dt*13;const dx=(Math.sin(lookAngle)*forward+Math.cos(lookAngle)*side)*speed;const dz=(Math.cos(lookAngle)*forward-Math.sin(lookAngle)*side)*speed;player.position.x+=dx;player.position.z+=dz;player.rotation.y=Math.atan2(dx,dz);player.position.x=Math.max(-1010,Math.min(1010,player.position.x));player.position.z=Math.max(-1010,Math.min(1010,player.position.z));if(body)body.position.y=1.05+Math.sin(performance.now()*.012)*.045}if(weather==='Rain'){for(const d of drops){d.position.y-=dt*18;if(d.position.y<0){d.position.y=35;d.position.x=player.position.x+(Math.random()-.5)*180;d.position.z=player.position.z+(Math.random()-.5)*180}}}updateCamera();renderer.render(scene,camera)}
updateCamera();
const clock=new THREE.Clock();animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
toast('Lagos city update v0.12 loaded');
