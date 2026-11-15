// THIS IS LAGOS v0.68 — v0.67 plus: every building / sports centre / landmark fitted inside its city block (nothing on roads or pavements); view-only rendering (chunked instancing + distance/frustum cell culling). Earlier notes: v0.67 — v0.66 startup and shelter-placement performance fixes; 25x city land area and 25x city content quantity — 100 sports centres, existing two-pole district gateways retained — Lagos street names, physical street signs and Grand Dealership on Isaac Uwadiale Road — detailed live city map with exact generated building and facility footprints — tall palm trees along both sides of every road with ground shade; cleared 48m avenues, unified road markings
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const mount=document.querySelector('#game');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9fc9d4);
scene.fog=new THREE.Fog(0x9fc9d4,700,3200);   // v0.68: haze now closes in before the far-cull distance so distant cells never visibly pop
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.3,4500);
camera.position.set(0,5,9);
const renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
// Start crisp, then reduce resolution only when sustained low FPS requires it.
// A modest DPR increase sharpens edges on modern displays without the cost of native 2x/3x DPR.
// Adaptive renderScale reduces GPU load only after sustained slow frames.
let renderScale=1.0;const maxDevicePixelRatio=Math.min(devicePixelRatio||1,1.15);renderer.setPixelRatio(maxDevicePixelRatio*renderScale);renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=false;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;mount.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe7fff0,0x71856d,2));
const sun=new THREE.DirectionalLight(0xfff2d5,2.5);sun.position.set(-35,55,25);sun.castShadow=false;scene.add(sun);
const mat=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
const grass=mat(0x7eaa78),road=mat(0x343d3b),sidewalk=mat(0xc9d2c8),white=mat(0xf1f5e9),green=mat(0x18824a),glassMat=new THREE.MeshStandardMaterial({color:0x8eb8b4,roughness:.25,metalness:.15}),dark=mat(0x263a31);
function block(w,h,d,m,x,y,z){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y+h/2,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}
block(300,.2,300,grass,0,-.2,0);
// Obsolete compact starter roads and markings removed; the unified 48m road grid below is authoritative.
const buildingMats=[0xe7e8d9,0xd7e2d9,0xd8d8cf,0xe8dfce,0xc7d9d0].map(c=>mat(c));
const buildingColliders=[];
// Exact world-space footprints used by the live 2D map.
const cityMapBuildings=[];
const cityMapFacilities=[];
// v0.60: named Lagos street grid. The same registry drives street signs and map labels.
const verticalStreetNames=[
 'Badagry Expressway','Murtala Muhammed Way','Agege Motor Road','Ikorodu Road','Herbert Macaulay Way',
 'Yaba Road','Oshodi-Apapa Expressway','Western Avenue','Funsho Williams Avenue','Eko Bridge Approach',
 'Marina Street','Broad Street','Nnamdi Azikiwe Street','Idumagbo Avenue','Balogun Street',
 'Isaac Uwadiale Road','Igbosere Road','Bourdillon Road','Alexander Road','Awolowo Road',
 'Adeola Odeku Street','Ahmadu Bello Way','Ozumba Mbadiwe Avenue','Akin Adesola Street','Ligali Ayorinde Street',
 'Ajose Adeogun Street','Sanusi Fafunwa Street','Bishop Oluwole Street','Admiralty Way','Fola Osibo Road','Lekki-Epe Expressway'
];
const horizontalStreetNames=[
 'Ojo-Igbede Road','Festac Link Road','Amuwo Odofin Road','Mile 2 Road','Apapa-Oshodi Expressway',
 'Ijora Causeway','Eko Bridge Road','Carter Bridge Road','Tinubu Street','Martins Street',
 'Lagos Island Road','Campbell Street','Kofo Abayomi Street','Onikan Road','King George V Road',
 'Oniru Estate Road','Thompson Avenue','Gerrard Road','Ikoyi Crescent','Queens Drive',
 'Admiralty Road','Freedom Way','Jakande Roundabout Road','Chevron Drive','Orchid Road',
 'Allen Avenue','Opebi Road','Obafemi Awolowo Way','Adeniyi Jones Avenue','Mobolaji Bank Anthony Way','Ikeja Along Road'
];
function streetName(axis,index){const names=axis==='x'?verticalStreetNames:horizontalStreetNames;if(index>=-15&&index<=15)return names[index+15];return `${axis==='x'?'Lagos North-South':'Lagos East-West'} Street ${String(index+75).padStart(3,'0')}`;}
function recordCityFacility(type,x,z,w,d,label){cityMapFacilities.push({type,x,z,w,d,label:label||type.toUpperCase()});}
// Shared reserved footprints prevent later buildings from occupying sports courts or amenities.
const amenityColliders=[];
// Road reservations include the asphalt, kerbs and full pedestrian pavement.
const ROAD_EDGE_CLEARANCE=4.8;
// Check the expanded 70m road grid and the original starter-district roads
// before creating legacy starter buildings or skyline blocks.
function legacyBuildingPlotClear(x,z,w,d,extra=1){
 const halfW=w/2+extra, halfD=d/2+extra;
 // Vertical streets: 48m avenues every 210m and 8m local roads every 70m.
 const minGX=Math.floor((x-halfW)/70)-1, maxGX=Math.ceil((x+halfW)/70)+1;
 for(let k=minGX;k<=maxGX;k++){
  const roadX=k*70, roadHalf=(k%3===0)?24:4;
  if(Math.abs(x-roadX)<halfW+roadHalf+ROAD_EDGE_CLEARANCE) return false;
 }
 // Horizontal streets on the same grid.
 const minGZ=Math.floor((z-halfD)/70)-1, maxGZ=Math.ceil((z+halfD)/70)+1;
 for(let k=minGZ;k<=maxGZ;k++){
  const roadZ=k*70, roadHalf=(k%3===0)?24:4;
  if(Math.abs(z-roadZ)<halfD+roadHalf+ROAD_EDGE_CLEARANCE) return false;
 }
 // The original compact starter area has an additional north-south road
 // at x=0 and an east-west road centred at z=-22.
 if(Math.abs(x)<halfW+11.5 || (Math.abs(x)<130+halfW && Math.abs(z+22)<halfD+8.75)) return false;
 return true;
}
function building(x,z,w,d,h,idx){
 const scale=4,sw=w*scale,sd=d*scale,sh=h*scale;
 if(!legacyBuildingPlotClear(x,z,sw,sd,2)) return;
 const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);
 const m=buildingMats[idx%buildingMats.length];const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);body.position.y=h/2;g.add(body);const cap=new THREE.Mesh(new THREE.BoxGeometry(w+.15,.3,d+.15),green);cap.position.y=h-.15;g.add(cap);
 for(let y=2;y<h-1;y+=2.6){for(let xx=-w/2+1;xx<w/2-.5;xx+=2){const win=new THREE.Mesh(new THREE.BoxGeometry(.85,1.15,.08),glassMat);win.position.set(xx,y,d/2+.045);g.add(win);const win2=win.clone();win2.position.z=-d/2-.045;g.add(win2)}}
 buildingColliders.push({minX:x-sw/2-1,maxX:x+sw/2+1,minZ:z-sd/2-1,maxZ:z+sd/2+1});
 cityMapBuildings.push({x,z,w:sw,d:sd,kind:'legacy'});
}
for(let i=0;i<9;i++){const z=-65+i*16;building(-20,z,8,10,12+(i%3)*5,i);building(20,z,9,11,16+(i%4)*6,i+1)}
// farther skyline
for(let i=0;i<34;i++){let x=(Math.random()-.5)*125,z=-100+Math.random()*180;if(Math.abs(x)<27)continue;building(x,z,7+Math.random()*8,7+Math.random()*8,8+Math.random()*28,i+2)}
// ============================================================================
// TREES (v0.55): leafy palm trees lining BOTH sides of every avenue and local street, end to end.
// Trees are twice the previous height. Each species is a vertex-coloured archetype: ringed trunk, arching
// fronds of paired leaflets and a coconut cluster. Because there are thousands of trees, every chunk of the city has two
// levels of detail: full leafy trees up close, and a cheap simplified tree further away. Each tree also casts a
// soft dappled shade patch on the ground, offset away from the sun. Trees never stand on a carriageway or pavement.
// ============================================================================
const TREE_SUN=new THREE.Vector3(-35,55,25);
const treeRand=(()=>{let s=20260512;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}})();
const treeHash=(x,z,k=0)=>{const v=Math.sin(x*127.1+z*311.7+k*74.7)*43758.5453;return v-Math.floor(v)};
const tcol=hex=>new THREE.Color(hex);
function TreePart(){return {pos:[],nor:[],col:[],idx:[]}}
function treeVert(part,px,py,pz,nx,ny,nz,c){
 const l=Math.hypot(nx,ny,nz)||1;
 part.pos.push(px,py,pz);part.nor.push(nx/l,ny/l,nz/l);part.col.push(c.r,c.g,c.b);
 return part.pos.length/3-1;
}
// Lumpy leaf mass: displaced sphere, normals blended with the whole-crown direction so the canopy shades as one soft form.
function treeBlob(part,cx,cy,cz,rx,ry,rz,dark,light,crown,lump=.24,ws=7,hs=4){
 const g=new THREE.SphereGeometry(1,ws,hs),P=g.attributes.position,I=g.index.array,base=part.pos.length/3;
 const ph=treeRand()*50,tint=.9+treeRand()*.2,c=new THREE.Color();
 for(let i=0;i<P.count;i++){
  const ux=P.getX(i),uy=P.getY(i),uz=P.getZ(i);
  const n=Math.sin(ux*3.3+ph)*Math.cos(uz*2.9+ph*1.7)+Math.sin(uy*4.1+ph*.6)*.7;
  const r=1+n*lump*.45;
  const px=cx+ux*rx*r,py=cy+uy*ry*r,pz=cz+uz*rz*r;
  const t=Math.min(1,Math.max(0,(uy*.5+.5)*.8+n*.08+.08));
  c.copy(dark).lerp(light,t*t*.6+t*.4).multiplyScalar(tint);
  const k=.45/crown[3];
  treeVert(part,px,py,pz,ux*.55+(px-crown[0])*k,uy*.55+(py-crown[1])*k,uz*.55+(pz-crown[2])*k,c);
 }
 for(let i=0;i<I.length;i++)part.idx.push(I[i]+base);
 g.dispose();
}
// Individual leaves: small tilted, drooping kite-shaped cards scattered over the surface of a leaf mass.
const LEAF_YELLOW=tcol(0xa3b83c);
function treeLeaves(part,cx,cy,cz,rx,ry,rz,dark,light,count,size){
 const c=new THREE.Color(),N=new THREE.Vector3(),U=new THREE.Vector3(),V=new THREE.Vector3(),U2=new THREE.Vector3(),V2=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 for(let i=0;i<count;i++){
  const th=treeRand()*Math.PI*2,yy=Math.min(1,-.6+treeRand()*1.65),rho=Math.sqrt(1-yy*yy);
  N.set(Math.cos(th)*rho,yy,Math.sin(th)*rho);
  const k=.9+treeRand()*.2,px=cx+N.x*rx*k,py=cy+N.y*ry*k,pz=cz+N.z*rz*k;
  U.crossVectors(N,up);if(U.lengthSq()<.01)U.set(1,0,0);U.normalize();V.crossVectors(N,U).normalize();
  const ro=treeRand()*Math.PI*2,co=Math.cos(ro),so=Math.sin(ro);
  U2.copy(U).multiplyScalar(co).addScaledVector(V,so);V2.copy(V).multiplyScalar(co).addScaledVector(U,-so);
  const sz=size*(.8+treeRand()*.5);
  const t=Math.min(1,treeRand()*.55+(N.y*.5+.5)*.45);
  c.copy(dark).lerp(light,t).multiplyScalar(.88+treeRand()*.24);
  if(treeRand()<.08)c.lerp(LEAF_YELLOW,.55);
  const nx=N.x,ny=N.y*.6+.5,nz=N.z;
  const a=treeVert(part,px+V2.x*sz*.6,py+V2.y*sz*.6-sz*.18,pz+V2.z*sz*.6,nx,ny,nz,c);
  const b=treeVert(part,px+U2.x*sz*.32,py+U2.y*sz*.32,pz+U2.z*sz*.32,nx,ny,nz,c);
  const d=treeVert(part,px-V2.x*sz*.45,py-V2.y*sz*.45,pz-V2.z*sz*.45,nx,ny,nz,c);
  const e=treeVert(part,px-U2.x*sz*.32,py-U2.y*sz*.32,pz-U2.z*sz*.32,nx,ny,nz,c);
  part.idx.push(a,b,d,a,d,e);
 }
}
// Tapered tube along a polyline: trunks and limbs.
function treeTube(part,pts,radii,sides,colorAt){
 const base=part.pos.length/3,T=new THREE.Vector3(),S=new THREE.Vector3(),U=new THREE.Vector3(),c=new THREE.Color();
 const up=new THREE.Vector3(0,1,0),side=new THREE.Vector3(1,0,0);
 for(let i=0;i<pts.length;i++){
  const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
  T.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
  S.crossVectors(T,Math.abs(T.y)>.95?side:up).normalize();U.crossVectors(S,T).normalize();
  colorAt(i/(pts.length-1),i,c);
  for(let k=0;k<=sides;k++){
   const an=k/sides*Math.PI*2,ca=Math.cos(an),sa=Math.sin(an);
   const dx=ca*S.x+sa*U.x,dy=ca*S.y+sa*U.y,dz=ca*S.z+sa*U.z;
   treeVert(part,pts[i][0]+dx*radii[i],pts[i][1]+dy*radii[i],pts[i][2]+dz*radii[i],dx,dy,dz,c);
  }
 }
 for(let i=0;i<pts.length-1;i++)for(let k=0;k<sides;k++){
  const a=base+i*(sides+1)+k,b=a+1,c2=a+sides+1,d=c2+1;
  part.idx.push(a,c2,b,b,c2,d);
 }
}
function treeGeo(part){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(part.pos,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(part.nor,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(part.col,3));
 g.setIndex(part.idx);return g;
}
// Palms: ringed leaning trunk, arching fronds made of dense paired leaflets, coconut cluster.
// 0 = royal-style (14.5 m before scaling), 1 = taller coconut-style (17 m).
function buildPalm(v){
 const part=TreePart(),H=v===0?14.5:17,lean=v===0?1.6:-2.1,N=14,pts=[],rad=[];
 const b0=tcol(0x8b7b66),b1=tcol(0x5f5342);
 for(let i=0;i<=N;i++){const t=i/N;pts.push([lean*t*t,H*t,Math.sin(t*Math.PI)*.35*(v?1:-1)]);rad.push(.36+.34*Math.pow(1-t,2.2)+(i===0?.1:0))}
 treeTube(part,pts,rad,7,(t,i,c)=>c.copy(b0).lerp(b1,t*.5).multiplyScalar(i%2?.86:1.04));
 const top=pts[N],leafDark=tcol(0x2a6a2c),leafLight=tcol(0x86bb4c),c=new THREE.Color(),FR=16,NS=12;
 for(let f=0;f<FR;f++){
  const a=f/FR*Math.PI*2+treeRand()*.3,L=5.6+treeRand()*1.6,pitch0=.95-(f%4)*.45+(treeRand()-.5)*.3;
  const dx=Math.cos(a),dz=Math.sin(a),sx=-dz,sz=dx,sp=[[top[0],top[1]+.2,top[2]]];
  let px=top[0],py=top[1]+.2,pz=top[2];
  for(let j=1;j<=NS;j++){const t=j/NS,pitch=pitch0-t*2.5,dl=L/NS;px+=dx*Math.cos(pitch)*dl;pz+=dz*Math.cos(pitch)*dl;py+=Math.sin(pitch)*dl;sp.push([px,py,pz])}
  for(let j=1;j<NS;j++){
   const t=j/NS,ll=(.55+1.7*Math.sin(Math.PI*Math.min(1,t*1.05+.05)))*(L/6),p0=sp[j],p1=sp[j+1];
   for(const sd of [-1,1])for(const off of [0,.5]){
    const f0=off,f1=off+.5;
    const b0x=p0[0]+(p1[0]-p0[0])*f0,b0y=p0[1]+(p1[1]-p0[1])*f0,b0z=p0[2]+(p1[2]-p0[2])*f0;
    const b1x=p0[0]+(p1[0]-p0[0])*f1,b1y=p0[1]+(p1[1]-p0[1])*f1,b1z=p0[2]+(p1[2]-p0[2])*f1;
    const mx=(b0x+b1x)/2,my=(b0y+b1y)/2,mz=(b0z+b1z)/2;
    c.copy(leafDark).lerp(leafLight,.25+.55*t+treeRand()*.15);
    const i0=treeVert(part,b0x,b0y,b0z,0,1,0,c),i1=treeVert(part,b1x,b1y,b1z,0,1,0,c);
    c.lerp(leafLight,.35);
    const i2=treeVert(part,mx+sx*sd*ll*.9+dx*ll*.25,my-ll*.55,mz+sz*sd*ll*.9+dz*ll*.25,sx*sd*.35,1,sz*sd*.35,c);
    part.idx.push(i0,i1,i2);
   }
  }
 }
 const nutD=tcol(0x4e5d22),nutL=tcol(0x8a9a3a);
 for(let k=0;k<3;k++){const a=k*Math.PI*2/3+.4;treeBlob(part,top[0]+Math.cos(a)*.5,top[1]-.15,top[2]+Math.sin(a)*.5,.32,.36,.32,nutD,nutL,[top[0],top[1],top[2],1],.1)}
 return {geo:treeGeo(part),shade:3.8,crownY:H,base:1.6};
}
// Cheap distant palm (about 50 triangles): straight trunk and ten leaf blades.
const FAR_PALM_H=15.7;
function buildFarPalm(){
 const part=TreePart(),H=FAR_PALM_H,tr=tcol(0x7a6c58),dk=tcol(0x2a6a2c),lt=tcol(0x7cb34a),c=new THREE.Color();
 treeTube(part,[[0,0,0],[0,H*.5,0],[0,H,0]],[.62,.45,.34],5,(t,i,cc)=>cc.copy(tr));
 for(let f=0;f<10;f++){
  const a=f/10*Math.PI*2+(f%2)*.2,dx=Math.cos(a),dz=Math.sin(a),sx=-dz,sz=dx,L=6.2,w=1.5,u=f%2?.9:.5;
  const y0=H+.2,x1=dx*L*.55,z1=dz*L*.55,y1=y0+L*.35*u+.6,x2=dx*L,z2=dz*L,y2=y0-L*.25;
  const i0=treeVert(part,0,y0,0,0,1,0,c.copy(dk));
  const i1=treeVert(part,x1+sx*w,y1,z1+sz*w,0,1,0,c.copy(dk).lerp(lt,.5));
  const i2=treeVert(part,x1-sx*w,y1,z1-sz*w,0,1,0,c);
  const i3=treeVert(part,x2,y2,z2,0,1,0,c.copy(lt));
  part.idx.push(i0,i1,i2,i1,i3,i2);
 }
 return treeGeo(part);
}
const TREE_TYPES=[buildPalm(0),buildPalm(1)];
const TREE_FAR_GEO=buildFarPalm(),TREE_FAR_STRETCH=[[1,14.5/FAR_PALM_H],[1,17/FAR_PALM_H]];
const treeMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0,side:THREE.DoubleSide});
// Dappled shade decal (soft edge with light gaps where sun filters through the leaves). Kept faint because
// neighbouring canopies overlap and their shade accumulates.
const shadeTex=(()=>{
 const cv=document.createElement('canvas');cv.width=cv.height=128;const g=cv.getContext('2d');
 const gr=g.createRadialGradient(64,64,6,64,64,62);
 gr.addColorStop(0,'rgba(8,16,10,.3)');gr.addColorStop(.55,'rgba(8,16,10,.24)');gr.addColorStop(1,'rgba(8,16,10,0)');
 g.fillStyle=gr;g.fillRect(0,0,128,128);
 g.globalCompositeOperation='destination-out';
 for(let i=0;i<46;i++){const a=treeRand()*Math.PI*2,r=Math.sqrt(treeRand())*50;g.fillStyle='rgba(0,0,0,'+(.18+treeRand()*.3)+')';g.beginPath();g.arc(64+Math.cos(a)*r,64+Math.sin(a)*r,1.5+treeRand()*3.5,0,Math.PI*2);g.fill()}
 return new THREE.CanvasTexture(cv);
})();
const shadeMat=new THREE.MeshBasicMaterial({map:shadeTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
const shadePlane=new THREE.PlaneGeometry(2,2);shadePlane.rotateX(-Math.PI/2);

const TREE_CHUNK=160,TREE_CHUNK_R=144,TREE_NEAR_DIST=110,TREE_VIEW_DIST=900,TREE_SHADE_DIST=500;
const treeChunks=new Map(),treeSpots=[];
// True when (x,z) lies on any carriageway or its pavement (plus a trunk margin). Trees are rejected there.
function treeOnRoad(x,z,margin=3.4){
 const gx=Math.max(-5180,Math.min(5180,Math.round(x/70)*70)),gz=Math.max(-5180,Math.min(5180,Math.round(z/70)*70));
 const hx=Math.abs(gx%210)<1?24:4,hz=Math.abs(gz%210)<1?24:4;
 return Math.abs(x-gx)<hx+margin||Math.abs(z-gz)<hz+margin;
}
// Every tree is a palm (the kind argument is kept for older call sites). Returns false on a road.
function addTree(x,z,scale=1,kind='palm',margin=3.4){
 if(treeOnRoad(x,z,margin))return false;
 const h=treeHash(x,z),type=Math.floor(h*2)%2;
 treeSpots.push({x,z,type,s:scale*(.88+treeHash(x,z,3)*.28),rot:treeHash(x,z,4)*Math.PI*2,tr:.9+treeHash(x,z,5)*.14,tg:.92+treeHash(x,z,6)*.14,tb:.88+treeHash(x,z,7)*.16});
 return true;
}
// Continuous rows of palms on BOTH sides of every avenue and every local street, for the full length of each road.
// The only gaps are where another road crosses; trees also keep clear of the very few streetlight poles and of
// any building or amenity footprint.
function addStreetTrees(){
 const CS=40,idx=new Map();
 for(const list of [buildingColliders,amenityColliders])for(const c of list){
  for(let ix=Math.floor((c.minX-2)/CS);ix<=Math.floor((c.maxX+2)/CS);ix++)for(let iz=Math.floor((c.minZ-2)/CS);iz<=Math.floor((c.maxZ+2)/CS);iz++){
   const k=ix+','+iz;let a=idx.get(k);if(!a)idx.set(k,a=[]);a.push(c);
  }
 }
 const free=(x,z,m)=>{const a=idx.get(Math.floor(x/CS)+','+Math.floor(z/CS));if(!a)return true;for(const c of a)if(x+m>c.minX&&x-m<c.maxX&&z+m>c.minZ&&z-m<c.maxZ)return false;return true};
 for(let g=-5180;g<=5180;g+=70){
  const avenue=Math.abs(g%210)<1,half=avenue?24:4,SP=avenue?6.5:7.5;
  for(const side of [-1,1]){
   for(let q=-5140+(side>0?SP/2:0);q<=5140;q+=SP){
    if(avenue){const r=((q+5145)%105+105)%105;if(Math.min(r,105-r)<1.5)continue}   // streetlight poles
    for(const axis of ['z','x']){
     const jq=q+(treeHash(g,q,11+side)-.5)*1.6,off=g+side*(half+3.5+treeHash(q,g,13)*.4);
     const x=axis==='z'?off:jq,z=axis==='z'?jq:off;
     if(treeOnRoad(x,z,3.5)||!free(x,z,.6)||nearStreetlight(x,z,1.8))continue;
     addTree(x,z,.8+treeHash(x,z,9)*.35,'palm',3.5);
    }
   }
  }
 }
}
function finalizeTrees(){
 addStreetTrees();
 for(const t of treeSpots){
  const key=Math.floor(t.x/TREE_CHUNK)+','+Math.floor(t.z/TREE_CHUNK);
  let ch=treeChunks.get(key);
  if(!ch){const cx=(Math.floor(t.x/TREE_CHUNK)+.5)*TREE_CHUNK,cz=(Math.floor(t.z/TREE_CHUNK)+.5)*TREE_CHUNK;ch={cx,cz,trees:TREE_TYPES.map(()=>[]),all:[],sphere:new THREE.Sphere(new THREE.Vector3(cx,12,cz),TREE_CHUNK_R),near:null,far:null,decals:null};treeChunks.set(key,ch)}
  ch.trees[t.type].push(t);ch.all.push(t);
  const tr=.55*t.s*TREE_TYPES[t.type].base+.35;   // trunk collider
  buildingColliders.push({minX:t.x-tr,maxX:t.x+tr,minZ:t.z-tr,maxZ:t.z+tr});
 }
 const dummy=new THREE.Object3D(),col=new THREE.Color();
 for(const ch of treeChunks.values()){
  const near=new THREE.Group(),decals=[];
  TREE_TYPES.forEach((T,ti)=>{
   const list=ch.trees[ti];if(!list.length)return;
   const mesh=new THREE.InstancedMesh(T.geo,treeMat,list.length);
   list.forEach((t,i)=>{
    const sc=t.s*T.base;
    dummy.position.set(t.x,0,t.z);dummy.rotation.set(0,t.rot,0);dummy.scale.setScalar(sc);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    col.setRGB(t.tr,t.tg,t.tb);mesh.setColorAt(i,col);
    const h=T.crownY*sc,ox=-TREE_SUN.x/TREE_SUN.y*h,oz=-TREE_SUN.z/TREE_SUN.y*h;
    decals.push({x:t.x+ox,z:t.z+oz,r:T.shade*sc*.75,rot:Math.atan2(-oz,ox)});
   });
   mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;near.add(mesh);
  });
  const far=new THREE.InstancedMesh(TREE_FAR_GEO,treeMat,ch.all.length);
  ch.all.forEach((t,i)=>{
   const sc=t.s*TREE_TYPES[t.type].base,st=TREE_FAR_STRETCH[t.type];
   dummy.position.set(t.x,0,t.z);dummy.rotation.set(0,t.rot,0);dummy.scale.set(sc*st[0],sc*st[1],sc*st[0]);dummy.updateMatrix();far.setMatrixAt(i,dummy.matrix);
   col.setRGB(t.tr,t.tg,t.tb);far.setColorAt(i,col);
  });
  far.instanceMatrix.needsUpdate=true;if(far.instanceColor)far.instanceColor.needsUpdate=true;far.frustumCulled=false;
  const dm=new THREE.InstancedMesh(shadePlane,shadeMat,decals.length);
  decals.forEach((d,i)=>{dummy.position.set(d.x,.16,d.z);dummy.rotation.set(0,d.rot,0);dummy.scale.set(d.r*1.2,1,d.r);dummy.updateMatrix();dm.setMatrixAt(i,dummy.matrix)});
  dm.instanceMatrix.needsUpdate=true;dm.frustumCulled=false;dm.renderOrder=2;
  near.visible=far.visible=dm.visible=false;
  ch.near=near;ch.far=far;ch.decals=dm;scene.add(near);scene.add(far);scene.add(dm);
 }
}
// Chunk-level frustum + distance culling with two levels of detail (called with the building culling pass).
function updateTreeVisibility(){
 const px=player.position.x,pz=player.position.z;
 for(const ch of treeChunks.values()){
  const d=Math.hypot(ch.cx-px,ch.cz-pz),inView=viewFrustum.intersectsSphere(ch.sphere);
  const isNear=d<TREE_NEAR_DIST;
  ch.near.visible=inView&&isNear;
  ch.far.visible=inView&&!isNear&&d<TREE_VIEW_DIST;
  ch.decals.visible=inView&&d<TREE_SHADE_DIST;
 }
}
// Starter-avenue palms were removed: some stood on the cross-avenue and local street. Street trees are now placed by addStreetTrees().

// -----------------------------------------------------------------------------
// v0.10 EXPANDED LAGOS WORLD: approx. 10.5 km x 10.5 km playable city footprint (25x land area).
// The original compact prototype remains as the central starter district; this
// generator adds connected Lagos-inspired districts, arterials, compounds,
// markets, civic buildings, sports venues, waterfront and recognizable signage.
// -----------------------------------------------------------------------------
const CITY_HALF=5250;
const cityGroundMat=mat(0x789b70), asphaltMat=mat(0x303735), laneMat=mat(0xe8dfc4),
      curbMat=mat(0xbfc8b9), sandMat=mat(0xc7ad83), lagoonMat=new THREE.MeshStandardMaterial({color:0x3f8f9a,roughness:.35,metalness:.12}),
      roofMat=mat(0x8e5140), concreteMat=mat(0xb9b7a9), marketMat=mat(0xd5b46e),
      sportGreen=mat(0x287b43), sportBlue=mat(0x276a9a), sportRed=mat(0xb74b3b);
// v0.69 z-fight fix: ground pushed back, asphalt pulled forward. (The laneMat blocks below are buried 3.5cm under the asphalt and are deliberately NOT offset, or they poke through at grazing angles.)
cityGroundMat.polygonOffset=true;cityGroundMat.polygonOffsetFactor=2;cityGroundMat.polygonOffsetUnits=2;
asphaltMat.polygonOffset=true;asphaltMat.polygonOffsetFactor=-1;asphaltMat.polygonOffsetUnits=-1;
block(10500,.35,10500,cityGroundMat,0,-.42,0);

// Lagos-style lagoon/waterfront on the south-eastern edge with a sandy shore.
block(690,.5,230,lagoonMat,610,-.28,930);
block(720,.12,34,sandMat,590,-.12,805);
for(let i=0;i<18;i++){
  const x=280+i*38;
  block(1.4,.22,22,mat(0x806d52),x,-.02,820);
}
// Dense connected road grid. Main avenues are 48m wide; secondary streets remain 8m.
// Junction helpers: every road crossing is a clear box (no paint inside it).
// Grid lines sit every 70m; every third one (multiples of 210) is a 48m avenue,
// the rest are 8m local streets.
// Stop line sits STOP_OFF metres outside the junction box; the zebra crossing fills the gap before the box.
// Zebra: bars 2x wider (1.2m) and 3x longer (9.6m); it starts ZEBRA_IN from the junction box and extends backwards,
// and the stop line (plus all other markings) sits behind it so nothing enters the box.
const ZEBRA_IN=.8, ZEBRA_DEPTH=9.6, ZEBRA_BAR=1.2, STOP_OFF=ZEBRA_IN+ZEBRA_DEPTH+1.1;
const JUNC_GRID=[];for(let g=-5180;g<=5180;g+=70)JUNC_GRID.push({g,half:Math.abs(g%210)<1?24:4});
// kind 'avenue' = crossings with other avenues only (plus local-street mouths when mouths=true);
// kind 'local' = crossings with every road. pad widens each clear zone.
function junctionSpans(kind,mouths=false,pad=0,padLocal=pad){
 const out=[];
 for(const {g,half} of JUNC_GRID){
  if(kind==='avenue'&&half===4&&!mouths)continue;
  const pd=half===24?pad:padLocal;out.push([g-half-pd,g+half+pd]);
 }
 return out;
}
function freeRuns(from,to,spans){
 const sorted=spans.slice().sort((a,b)=>a[0]-b[0]),runs=[];let cur=from;
 for(const [a,b] of sorted){if(a>cur)runs.push([cur,Math.min(a,to)]);cur=Math.max(cur,b);if(cur>=to)break}
 if(cur<to)runs.push([cur,to]);
 return runs.filter(r=>r[1]-r[0]>.5);
}
function dashClear(c,len,spans){return !spans.some(([a,b])=>c+len/2>a&&c-len/2<b)}
// All avenue/local paint ends at the stop lines (STOP_OFF outside each junction box).
const aveSpans=junctionSpans('avenue',false,STOP_OFF), aveDashSpans=junctionSpans('avenue',false,STOP_OFF+.3), aveEdgeSpans=junctionSpans('avenue',true,STOP_OFF,0), localSpans=junctionSpans('local',true,STOP_OFF+.3);
for(let p=-5040;p<=5040;p+=210){
  block(48,.18,10500,asphaltMat,p,-.12,0);
  block(10500,.18,48,asphaltMat,0,-.12,p);
  // v0.69: removed the old 1m laneMat strips at p+-12. They sat 3.5cm UNDER the asphalt (top .025 vs asphalt .06), so they only ever
  // showed as z-fighting streaks / flashing white lines. The lane dividers are the painted dashes in the paint section below.
}
for(let p=-5180;p<=5180;p+=70){
  if(Math.abs(p%210)<1) continue;
  block(8,.12,10500,asphaltMat,p,-.16,0);
  block(10500,.12,8,asphaltMat,0,-.16,p);
}
// Road-reservation system: every generated building must fit inside a plot.
// Major avenues are 48m wide; local streets are 8m wide. A 5m setback keeps
// walls, porches and building corners out of the carriageway.
function roadHalfWidthAt(value){
 const grid=Math.round(value/70)*70;
 return Math.abs(grid%210)===0?24:4;
}
// v0.68 BLOCK FITTING: every city block lies between two parallel roads. Anything built in a block is
// fitted into the free ground between the two roads, held back 5.6m from each asphalt edge (kerb + 2.5m pavement
// + the row of street palms), and centred in that free ground, so nothing touches a carriageway, pavement or tree.
const BLOCK_SETBACK=5.6;
function blockSpan(v){
 const a=Math.floor(v/70)*70,b=a+70;
 return [a+roadHalfWidthAt(a)+BLOCK_SETBACK,b-roadHalfWidthAt(b)-BLOCK_SETBACK];
}
function fitToBlock(x,z,w,d){
 const [x0,x1]=blockSpan(x),[z0,z1]=blockSpan(z);
 const fw=Math.min(w,x1-x0),fd=Math.min(d,z1-z0);
 return {x:(x0+x1)/2,z:(z0+z1)/2,w:fw,d:fd};
}
// Blocks claimed by fixed landmarks (pitch, tennis, basketball) so filler buildings never share them.
const claimedBlocks=new Set(),sportsLayout=new Map();
function claimOpenBlock(x,z,minW,minD){
 const bx0=Math.floor(x/70),bz0=Math.floor(z/70),cands=[];
 for(let i=-7;i<=7;i++)for(let j=-7;j<=7;j++){
  const bx=bx0+i,bz=bz0+j,key=bx+','+bz;
  if(claimedBlocks.has(key))continue;
  const [x0,x1]=blockSpan(bx*70+35),[z0,z1]=blockSpan(bz*70+35);
  if(x1-x0<minW||z1-z0<minD)continue;
  const cx=(x0+x1)/2,cz=(z0+z1)/2;
  cands.push({key,cx,cz,x0,x1,z0,z1,w:x1-x0,d:z1-z0,dist:Math.hypot(cx-x,cz-z)});
 }
 cands.sort((a,b)=>a.dist-b.dist);
 const c=cands[0];if(!c)return null;
 claimedBlocks.add(c.key);return c;
}
function clearBuildingPlot(x,z,w,d,extra=1){
 // Reserve the complete footprint plus kerbs and pavements, not just asphalt.
 const halfW=w/2+extra, halfD=d/2+extra;
 const minGX=Math.floor((x-halfW)/70)-1, maxGX=Math.ceil((x+halfW)/70)+1;
 for(let k=minGX;k<=maxGX;k++){
  const roadX=k*70, roadHalf=(k%3===0)?24:4;
  if(Math.abs(x-roadX)<halfW+roadHalf+ROAD_EDGE_CLEARANCE) return false;
 }
 const minGZ=Math.floor((z-halfD)/70)-1, maxGZ=Math.ceil((z+halfD)/70)+1;
 for(let k=minGZ;k<=maxGZ;k++){
  const roadZ=k*70, roadHalf=(k%3===0)?24:4;
  if(Math.abs(z-roadZ)<halfD+roadHalf+ROAD_EDGE_CLEARANCE) return false;
 }
 // The original starter district also has a short cross-street at z=-22,
 // with pavements, which is not part of the expanded 70m grid.
 const overlapsStarterRoadLength=(x-halfW)<130 && (x+halfW)>-130;
 if(overlapsStarterRoadLength && Math.abs(z+22)<halfD+8.75) return false;
 return true;
}

// Build continuous pedestrian pavements between junctions. Instancing keeps
// thousands of short pavement/kerb segments to just two draw calls.
const pavementMat=mat(0xcbd1c7), kerbEdgeMat=mat(0xaeb8ad);
function addRoadsideInstances(records,material){
 if(!records.length)return;
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,records.length);
 const dummy=new THREE.Object3D();
 records.forEach((r,i)=>{
  dummy.position.set(r.x,r.y,r.z);dummy.scale.set(r.w,r.h,r.d);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
 });
 mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
}
function buildSidewalkNetwork(){
 const pavements=[],kerbs=[];
 const grid=[];for(let v=-5180;v<=5180;v+=70)grid.push(v);
 for(const p of grid){
  const roadHalf=roadHalfWidthAt(p);
  for(let i=0;i<grid.length-1;i++){
   const a=grid[i],b=grid[i+1];
   const start=a+roadHalfWidthAt(a)+.55,end=b-roadHalfWidthAt(b)-.55,len=end-start;
   if(len<5)continue;
   const mid=(start+end)/2;
   for(const side of [-1,1]){
    const offset=side*(roadHalf+.12);
    // North-south street: kerb beside asphalt, pavement behind it.
    kerbs.push({x:p+offset,y:.05,z:mid,w:.24,h:.18,d:len});
    pavements.push({x:p+side*(roadHalf+.24+1.25),y:.02,z:mid,w:2.5,h:.12,d:len});
    // East-west street: same layout rotated by 90 degrees.
    kerbs.push({x:mid,y:.05,z:p+offset,w:len,h:.18,d:.24});
    pavements.push({x:mid,y:.02,z:p+side*(roadHalf+.24+1.25),w:len,h:.12,d:2.5});
   }
  }
 }
 addRoadsideInstances(pavements,pavementMat);addRoadsideInstances(kerbs,kerbEdgeMat);
}
buildSidewalkNetwork();

// Realistic road paint: avenue centre lines, broken lane dividers, edge lines,
// turn arrows and stop bars. All paint sits slightly above the asphalt.
const PAINT_OFFSET={polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2};
const paintWhite=new THREE.MeshBasicMaterial({color:0xf4f2df,...PAINT_OFFSET});
const paintYellow=new THREE.MeshBasicMaterial({color:0xf1c84b,...PAINT_OFFSET});
const paintArrow=new THREE.MeshBasicMaterial({color:0xf4f2df,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
const roadPaintBatches=new Map(),roadArrowRecords=[];
function roadPaint(w,d,x,z,material=paintWhite,y=.018){
 let batch=roadPaintBatches.get(material);if(!batch){batch=[];roadPaintBatches.set(material,batch)}
 batch.push({w,d,x,z,y:y>.05?y+.015:y+.012});   // lift paint clear of the asphalt top (avenue .06 / street -.04)
}
function flushRoadPaint(){
 for(const [material,records] of roadPaintBatches){
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,records.length);
  const dummy=new THREE.Object3D();
  records.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.scale.set(r.w,.035,r.d);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});
  mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
 }
}
// Main avenues: double yellow centre lines and broken white lane separators.
// All paint stops short of every junction box so crossings are left clear.
for(let p=-5040;p<=5040;p+=210){
 for(const offset of [-.42,.42]){
  for(const [a,b] of freeRuns(-5250,5250,aveSpans)){
   const m=(a+b)/2,l=b-a;
   roadPaint(.22,l,p+offset,m,paintYellow,.08);
   roadPaint(l,.22,m,p+offset,paintYellow,.08);
  }
 }
 // Lane dividers: thin (.15m) BROKEN white lines, 4m dash then 10m gap.
 const DASH_LEN=4,DASH_PERIOD=14;
 for(let q=-5190;q<5190;q+=DASH_PERIOD){
  if(!dashClear(q,DASH_LEN,aveDashSpans))continue;
  roadPaint(.15,DASH_LEN,p-12,q,paintWhite,.08);roadPaint(.15,DASH_LEN,p+12,q,paintWhite,.08);
  roadPaint(DASH_LEN,.15,q,p-12,paintWhite,.08);roadPaint(DASH_LEN,.15,q,p+12,paintWhite,.08);
 }
 // Kerb/edge lines on both sides of each main avenue; gaps at junctions and side-street mouths.
 for(const side of [-1,1]){
  for(const [a,b] of freeRuns(-5250,5250,aveEdgeSpans)){
   const m=(a+b)/2,l=b-a;
   roadPaint(.18,l,p+side*23.2,m,paintWhite,.08);
   roadPaint(l,.18,m,p+side*23.2,paintWhite,.08);
  }
 }
}
// Local streets receive short broken centre markings, never inside a junction.
for(let p=-5180;p<=5180;p+=70){
 if(Math.abs(p%210)<1) continue;
 for(let q=-5180;q<5180;q+=28){
  if(!dashClear(q,4,localSpans))continue;
  roadPaint(.12,4,p,q,paintWhite,.018);
  roadPaint(4,.12,q,p,paintWhite,.018);
 }
}
// Direction arrows at regular approach points.
function addRoadArrow(x,z,rotation=0){roadArrowRecords.push({x,z,rotation});}
function flushRoadArrows(){
 if(!roadArrowRecords.length)return;
 const shape=new THREE.Shape();shape.moveTo(0,3.2);shape.lineTo(-1.1,1.2);shape.lineTo(-.38,1.2);shape.lineTo(-.38,-2.2);shape.lineTo(.38,-2.2);shape.lineTo(.38,1.2);shape.lineTo(1.1,1.2);shape.closePath();
 const mesh=new THREE.InstancedMesh(new THREE.ShapeGeometry(shape),paintArrow,roadArrowRecords.length);
 const dummy=new THREE.Object3D();
 roadArrowRecords.forEach((r,i)=>{dummy.position.set(r.x,.115,r.z);dummy.rotation.set(-Math.PI/2,r.rotation,0);dummy.scale.set(1,1,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});
 mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);
}
// Add clear directional arrows on the four approaches to every major junction (kept behind the stop line).
const AO=32+(STOP_OFF-5)+1;
for(let p=-5040;p<=5040;p+=210){for(let q=-5040;q<=5040;q+=210){
 addRoadArrow(p-6,q-AO,Math.PI);      // approach from the north, travel south-to-north
 addRoadArrow(p+6,q+AO,0);            // approach from the south, travel north-to-south
 addRoadArrow(p-AO,q+6,-Math.PI/2);   // approach from the west, travel west-to-east
 addRoadArrow(p+AO,q-6,Math.PI/2);    // approach from the east, travel east-to-west
}}

// Lagos-style streetlights (v0.63): tall galvanized poles (1.5x the bus-shelter height) with long outreach arms that
// hold the lamp head out over the edge of the carriageway. Poles stand on the pavement verge, never on the road.
// All lamps are drawn as instanced meshes; at night each one gets a bright light pool on the road, a halo, and the
// lamps nearest the player also cast real light onto buildings, cars and people.
const BUS_SHELTER_HEIGHT=18.33;                          // addBusStop roof: base 18.15 + 0.18 thickness
const STREETLIGHT_HEIGHT=BUS_SHELTER_HEIGHT*1.5;         // ~27.5 units
const poleMat=mat(0x59645e,.55), lampGlow=new THREE.MeshStandardMaterial({color:0xffe7ad,emissive:0xffc66b,emissiveIntensity:.15,roughness:.3});
const avenueLamps=[];                                    // every lamp; a bus shelter removes any lamp inside its footprint
const slCells=new Map();                                 // spatial hash so street trees keep clear of the poles
const slMeshes=[];
let slPools=null,slPoolMat=null,slGlow=null,slGlowMat=null,slGlowAttr=null;
const slRealLights=[];
function nearStreetlight(x,z,m){
 const cx=Math.floor(x/16),cz=Math.floor(z/16);
 for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=slCells.get((cx+i)+','+(cz+j));if(a)for(const l of a)if(Math.abs(l.x-x)<m&&Math.abs(l.z-z)<m)return true;}
 return false;
}
function removeStreetlight(l){
 if(l.removed)return;l.removed=true;
 const zero=new THREE.Matrix4().makeScale(0,0,0);
 for(const m of slMeshes){m.setMatrixAt(l.i,zero);m.instanceMatrix.needsUpdate=true;}
 slGlowAttr.setY(l.i,-5000);slGlowAttr.needsUpdate=true;
}
function removeStreetlightsInRect(x,z,halfX,halfZ){
 const minX=Math.floor((x-halfX)/16),maxX=Math.floor((x+halfX)/16);
 const minZ=Math.floor((z-halfZ)/16),maxZ=Math.floor((z+halfZ)/16);
 for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){
  const cell=slCells.get(ix+','+iz);if(!cell)continue;
  for(const lamp of cell)if(!lamp.removed&&Math.abs(lamp.x-x)<halfX&&Math.abs(lamp.z-z)<halfZ)removeStreetlight(lamp);
 }
}
{
 const H=STREETLIGHT_HEIGHT,specs=[];
 const roadHalf=c=>(Math.round(c/70)%3===0)?24:4;      // every 3rd road is a 48m avenue, the rest are 8m streets
 const onCarriageway=(x,z)=>{const rx=Math.round(x/70)*70,rz=Math.round(z/70)*70;return Math.abs(x-rx)<roadHalf(rx)+1.2||Math.abs(z-rz)<roadHalf(rz)+1.2;};
 // Any lamp whose pole would stand on asphalt (or its kerb) is simply not built.
 const add=(x,z,rot,arm)=>{if(Math.abs(x)>5200||Math.abs(z)>5200||onCarriageway(x,z))return;specs.push({x,z,rot,arm});};
 // Avenues: both verges, every 105 units (spots that fall inside a crossing avenue are dropped by the filter).
 for(let p=-5040;p<=5040;p+=210)for(let q=-5145;q<=5145;q+=105){
  add(p-27.2,q,0,5.8);add(p+27.2,q,Math.PI,5.8);                  // north-south avenue
  add(q,p+27.2,Math.PI/2,5.8);add(q,p-27.2,-Math.PI/2,5.8);       // east-west avenue
 }
 // Local streets: lamps on the pavement beside the street, alternating sides, mid-block every 210 units.
 let li=0;
 for(let c=-5180;c<=5180;c+=70){
  if(Math.round(c/70)%3===0)continue;
  for(let n=-74;n<=73;n++){
   if(((n%3)+3)%3!==0)continue;
   const q=35+70*n;if(Math.abs(q)>5145)continue;
   const side=(li++%2)?1:-1;
   add(c+side*6.2,q,side<0?0:Math.PI,5.2);
   add(q,c+side*6.2,side<0?-Math.PI/2:Math.PI/2,5.2);
  }
 }
 const N=specs.length;
 const poleGeo=new THREE.CylinderGeometry(.3,.52,H,10);poleGeo.translate(0,H/2,0);
 const armGeo=new THREE.CylinderGeometry(.16,.22,1,8);armGeo.rotateZ(-Math.PI/2);armGeo.translate(.5,H-.7,0);   // unit arm, scaled per lamp
 const headGeo=new THREE.BoxGeometry(2.6,.42,1.0);headGeo.translate(0,H-.5,0);
 const hoodGeo=new THREE.BoxGeometry(2.9,.22,1.2);hoodGeo.translate(0,H-.2,0);
 const mk=(geo,material)=>{const m=new THREE.InstancedMesh(geo,material,N);m.frustumCulled=false;scene.add(m);slMeshes.push(m);return m;};
 const poles=mk(poleGeo,poleMat),arms=mk(armGeo,poleMat),heads=mk(headGeo,lampGlow),hoods=mk(hoodGeo,poleMat);
 // Soft radial texture for the light pool and halo.
 const rcv=document.createElement('canvas');rcv.width=rcv.height=256;const rc=rcv.getContext('2d');
 const rg=rc.createRadialGradient(128,128,0,128,128,128);
 rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.22,'rgba(255,255,255,.6)');rg.addColorStop(.55,'rgba(255,255,255,.2)');rg.addColorStop(1,'rgba(255,255,255,0)');
 rc.fillStyle=rg;rc.fillRect(0,0,256,256);const radialTex=new THREE.CanvasTexture(rcv);
 slPoolMat=new THREE.MeshBasicMaterial({map:radialTex,color:0xffc46e,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
 const poolGeo=new THREE.PlaneGeometry(1,1);poolGeo.rotateX(-Math.PI/2);
 slPools=new THREE.InstancedMesh(poolGeo,slPoolMat,N);slPools.frustumCulled=false;slPools.renderOrder=2;slPools.visible=false;scene.add(slPools);slMeshes.push(slPools);
 const glowPos=new Float32Array(N*3);
 slGlowAttr=new THREE.BufferAttribute(glowPos,3);
 const glowGeo=new THREE.BufferGeometry();glowGeo.setAttribute('position',slGlowAttr);
 slGlowMat=new THREE.PointsMaterial({map:radialTex,color:0xffd8a0,size:10,sizeAttenuation:true,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
 slGlow=new THREE.Points(glowGeo,slGlowMat);slGlow.frustumCulled=false;slGlow.visible=false;scene.add(slGlow);
 const d=new THREE.Object3D();
 specs.forEach((sp,i)=>{
  const hOff=sp.arm-.6,hx=sp.x+Math.cos(sp.rot)*hOff,hz=sp.z-Math.sin(sp.rot)*hOff;
  d.rotation.set(0,sp.rot,0);d.scale.set(1,1,1);
  d.position.set(sp.x,0,sp.z);d.updateMatrix();poles.setMatrixAt(i,d.matrix);
  d.scale.set(sp.arm,1,1);d.updateMatrix();arms.setMatrixAt(i,d.matrix);
  d.scale.set(1,1,1);d.position.set(hx,0,hz);d.updateMatrix();heads.setMatrixAt(i,d.matrix);hoods.setMatrixAt(i,d.matrix);
  const D=sp.arm>5.5?130:96;                                       // avenues get wider pools than local streets
  d.scale.set(D,1,D);d.position.set(hx,.1,hz);d.updateMatrix();slPools.setMatrixAt(i,d.matrix);
  slGlowAttr.setXYZ(i,hx,H-.6,hz);
  const rec={x:sp.x,z:sp.z,hx,hz,i,removed:false};avenueLamps.push(rec);
  const key=Math.floor(sp.x/16)+','+Math.floor(sp.z/16);let cell=slCells.get(key);if(!cell)slCells.set(key,cell=[]);cell.push(rec);
 });
 for(const m of slMeshes)m.instanceMatrix.needsUpdate=true;
 // A handful of real point lights follow the player and are moved onto the nearest lamps each update.
 const physical=parseInt(THREE.REVISION,10)>=155;
 for(let i=0;i<8;i++){
  const L=new THREE.PointLight(0xffd28a,0,170,physical?1:1.5);
  L.userData.peak=physical?120:2.2;scene.add(L);slRealLights.push(L);
 }
}
// Called from setDay(): lamps come on at dusk, are fully bright at night and fade out at dawn.
function updateStreetLighting(night){
 const level=Math.max(0,Math.min(1,(night-.45)/.35));
 lampGlow.emissiveIntensity=.12+level*3.4;
 slPoolMat.opacity=level*.85;slPools.visible=level>.01;
 slGlowMat.opacity=level*.95;slGlow.visible=level>.01;
 if(level>.01)renderer.toneMappingExposure+=level*.2;
 const best=[];
 if(level>.01){
  const px=player.position.x,pz=player.position.z;
  for(const l of avenueLamps){
   if(l.removed)continue;
   const dd=(l.hx-px)*(l.hx-px)+(l.hz-pz)*(l.hz-pz);
   if(best.length<slRealLights.length||dd<best[best.length-1].dd){
    best.push({l,dd});best.sort((u,v)=>u.dd-v.dd);if(best.length>slRealLights.length)best.pop();
   }
  }
 }
 slRealLights.forEach((L,i)=>{
  if(best[i]){L.position.set(best[i].l.hx,STREETLIGHT_HEIGHT-1,best[i].l.hz);L.intensity=L.userData.peak*level;}
  else L.intensity=0;
 });
}

// Stop lines on every avenue arm entering an avenue/avenue junction.
function addStopLine(direction,centerX,centerZ,approachSide){
 const d=24+STOP_OFF;
 if(direction==='north-south') roadPaint(48,.45,centerX,centerZ+approachSide*d,paintWhite,.085);
 else roadPaint(.45,48,centerX+approachSide*d,centerZ,paintWhite,.085);
}
// Zebra crossing: bars run PARALLEL to the road (along its direction of travel), spaced across its width,
// sitting between the stop line and the junction box. roadAxis 'z' = road runs north-south at x=roadPos.
function addZebra(roadAxis,roadPos,g,gHalf,side,roadHalf,y){
 const n=Math.floor((2*roadHalf-1+ZEBRA_BAR)/(2*ZEBRA_BAR)),total=n*ZEBRA_BAR+(n-1)*ZEBRA_BAR;
 const along=g+side*(gHalf+ZEBRA_IN+ZEBRA_DEPTH/2);
 for(let i=0;i<n;i++){
  const across=roadPos-total/2+ZEBRA_BAR/2+i*ZEBRA_BAR*2;
  if(roadAxis==='z') roadPaint(ZEBRA_BAR,ZEBRA_DEPTH,across,along,paintWhite,y);
  else roadPaint(ZEBRA_DEPTH,ZEBRA_BAR,along,across,paintWhite,y);
 }
}
for(let x=-5040;x<=5040;x+=210){
 for(let z=-5040;z<=5040;z+=210){
  for(const side of [-1,1]){
   addStopLine('north-south',x,z,side);
   addStopLine('east-west',x,z,side);
   addZebra('z',x,z,24,side,24,.085);   // north-south avenue arm
   addZebra('x',z,x,24,side,24,.085);   // east-west avenue arm
  }
 }
}
// Every local street entering ANY junction (avenue or local crossing) gets a
// stop line and a zebra crossing.
for(let local=-5180;local<=5180;local+=70){
 if(Math.abs(local%210)<1)continue;
 for(const {g,half} of JUNC_GRID){
  for(const side of [-1,1]){
   const d=g+side*(half+STOP_OFF);
   roadPaint(7.6,.45,local,d,paintWhite,.018);   // north-south street, bar across its width
   roadPaint(.45,7.6,d,local,paintWhite,.018);   // east-west street
   addZebra('z',local,g,half,side,4,.018);
   addZebra('x',local,g,half,side,4,.018);
  }
 }
}
// Submit all flat road paint and arrows as instanced batches to limit draw calls.
flushRoadPaint();flushRoadArrows();

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
const viewCulledBuildings=[];
const BUILDING_SCALE=4;
function findBuildingPosition(x,z,w,d){
 // Try the full 4x footprint first. If a plot is too small, step down the
 // building template size (never the 4x architectural multiplier) so the
 // city can remain dense without pushing buildings onto roads.
 const fitFactors=[1,.85,.7,.58,.48,.38,.30,.24];
 const candidates=[[x,z]];
 // Search the surrounding city in 35m increments, then progressively wider rings.
 for(let r=35;r<=5180;r+=35){
  for(let a=0;a<8;a++){
   const ang=a*Math.PI/4;
   candidates.push([x+Math.cos(ang)*r,z+Math.sin(ang)*r]);
  }
 }
 for(const factor of fitFactors){
  const fw=w*factor,fd=d*factor;
  for(const [px,pz] of candidates){
   if(!clearBuildingPlot(px,pz,fw,fd,2))continue;
   const overlapsBuilding=buildingColliders.some(c=>px+fw/2+2>c.minX&&px-fw/2-2<c.maxX&&pz+fd/2+2>c.minZ&&pz-fd/2-2<c.maxZ);
   const overlapsReservedAmenity=amenityColliders.some(c=>px+fw/2+2>c.minX&&px-fw/2-2<c.maxX&&pz+fd/2+2>c.minZ&&pz-fd/2-2<c.maxZ);
   if(!overlapsBuilding&&!overlapsReservedAmenity)return {x:px,z:pz,fit:factor};
  }
 }
 return null;
}
function makeBuilding(x,z,w,d,h,kind='residential',seed=0){
 // Larger footprints and realistic floor-count families. Heights use an
 // approximately 3.2m floor-to-floor scale so the avatar remains proportionate.
 const sizeFactor=kind==='office'?1.22:(kind==='apartment'?1.20:(kind==='residential'||kind==='mixed'||kind==='tenement'?1.14:(kind==='shop'||kind==='market'?1.10:1.08))); // v0.29 footprint sizes restore density and keep road plots clear
 w*=sizeFactor;d*=sizeFactor;
 // v0.33: every building and its architectural details are enlarged exactly 4x.
 const scaledW=w*BUILDING_SCALE,scaledD=d*BUILDING_SCALE;
 const towerFloors=[20,25,30,35,40];
 if(kind==='office') h=towerFloors[Math.abs(seed)%towerFloors.length]*3.2;
 else if(kind==='apartment') h=([25,30,35,40][Math.abs(seed)%4])*3.2;
 else if(kind==='residential'||kind==='mixed') h=([5,7,10,12][Math.abs(seed)%4])*3.1;
 else if(kind==='tenement') h=([3,4,5][Math.abs(seed)%3])*3.0;
 else if(kind==='shop'||kind==='market') h=([1,2][Math.abs(seed)%2])*3.0;
 else if(kind==='duplex') h=([2,3][Math.abs(seed)%2])*3.1;
 const placed=findBuildingPosition(x,z,scaledW,scaledD);if(!placed)return null;x=placed.x;z=placed.z;w*=placed.fit;d*=placed.fit;
 const wall=wallPalette[Math.abs(seed)%wallPalette.length];
 const obj=new THREE.Group();obj.position.set(x,0,z);obj.scale.setScalar(BUILDING_SCALE);scene.add(obj);
 // Keep the complete building in memory, but skip drawing it when outside the camera view.
 const visibilityRadius=Math.sqrt(scaledW*scaledW+scaledD*scaledD+(h*BUILDING_SCALE)*(h*BUILDING_SCALE))*0.62;
 viewCulledBuildings.push({group:obj,sphere:new THREE.Sphere(new THREE.Vector3(x,h/2,z),visibilityRadius),detailChildren:null,detailDistance:420,maxDistance:2100});
 buildingColliders.push({minX:x-scaledW/2-1,maxX:x+scaledW/2+1,minZ:z-scaledD/2-1,maxZ:z+scaledD/2+1});
 cityMapBuildings.push({x,z,w:scaledW*placed.fit,d:scaledD*placed.fit,kind});
 const main=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wall);main.position.y=h/2;main.castShadow=false;main.receiveShadow=false;obj.add(main);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(w+.35,.5,d+.35),roofPalette[Math.abs(seed+2)%roofPalette.length]);roof.position.y=h+.18;roof.castShadow=false;obj.add(roof);
 // Lagos residential facades: recessed-looking windows, balcony slabs,
 // painted fascia bands, security grilles and rooftop water storage.
 if(kind==='residential'||kind==='mixed'||kind==='tenement'||kind==='apartment'||kind==='bungalow'||kind==='duplex'){
  // Ground-floor clear opening matches the normalized avatar height (2.35 units).
  // Use four narrow frame bars; a solid overlay would hide most of the glass.
  const groundWindowHeight=2.35, groundWindowWidth=1.65, frameThickness=.09;
  for(let wx=-w/2+1.25;wx<w/2-.55;wx+=2.85){
   const frontZ=d/2+.07;
   const groundWin=new THREE.Mesh(new THREE.BoxGeometry(groundWindowWidth,groundWindowHeight,.07),glassBlue);
   groundWin.position.set(wx,groundWindowHeight/2+.04,frontZ);obj.add(groundWin);
   const frameZ=frontZ+.055;
   const bars=[
    [frameThickness,groundWindowHeight+.12,wx-groundWindowWidth/2-frameThickness/2,groundWindowHeight/2+.04],
    [frameThickness,groundWindowHeight+.12,wx+groundWindowWidth/2+frameThickness/2,groundWindowHeight/2+.04],
    [groundWindowWidth+frameThickness*2,frameThickness,wx,groundWindowHeight+.04],
    [groundWindowWidth+frameThickness*2,frameThickness,wx,.04]
   ];
   for(const [bw,bh,bx,by] of bars){const bar=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,.08),darkMetal);bar.position.set(bx,by,frameZ);obj.add(bar)}
  }
  for(let floor=3.2;floor<h-1.2;floor+=3.2){
   const balcony=new THREE.Mesh(new THREE.BoxGeometry(w+.35,.16,.9),concreteMat);
   balcony.position.set(0,floor,d/2+.42);obj.add(balcony);
   const rail=new THREE.Mesh(new THREE.BoxGeometry(w*.82,.72,.10),darkMetal);
   rail.position.set(0,floor+.43,d/2+.82);obj.add(rail);
   for(let wx=-w/2+1.25;wx<w/2-.55;wx+=2.85){
    const upperWindowHeight=2.35, upperWindowWidth=1.65;
    const win=new THREE.Mesh(new THREE.BoxGeometry(upperWindowWidth,upperWindowHeight,.07),glassBlue);
    const windowCenterY=floor+upperWindowHeight/2;
    win.position.set(wx,windowCenterY,d/2+.07);obj.add(win);
    const fz=d/2+.125, fy=windowCenterY, ft=.08, halfW=upperWindowWidth/2;
    for(const [bw,bh,bx,by] of [[ft,upperWindowHeight+.16,wx-halfW-ft/2,fy],[ft,upperWindowHeight+.16,wx+halfW+ft/2,fy],[upperWindowWidth+ft*2,ft,wx,fy+upperWindowHeight/2+ft/2],[upperWindowWidth+ft*2,ft,wx,fy-upperWindowHeight/2-ft/2]]){
     const frame=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,.07),darkMetal);frame.position.set(bx,by,fz);obj.add(frame);
    }
   }
  }
  const fascia=new THREE.Mesh(new THREE.BoxGeometry(w+.22,.28,d+.22),trimMat);
  fascia.position.y=2.55;obj.add(fascia);
  if(h>7) addWaterTank(obj,w*.24,h+.35,-d*.18,Math.min(1.25,Math.max(.7,w/18)));
  // External stair/service core on one side, common in walk-up blocks.
  if(kind==='tenement'||kind==='residential'||kind==='apartment'){
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
  // Office glazing belongs on the designated front facade only.
  // Keep the rear and side walls solid rather than wrapping glass around the whole shell.
  const officeWindowHeight=2.35;
  const officeWindowWidth=Math.max(1.4,Math.min(3.2,w*.22));
  const officeFrontZ=d/2+.075;
  for(let floor=1.6;floor<h-1.2;floor+=3.2){
   for(let wx=-w/2+officeWindowWidth*.7;wx<w/2-officeWindowWidth*.45;wx+=officeWindowWidth*1.35){
    const pane=new THREE.Mesh(new THREE.BoxGeometry(officeWindowWidth,officeWindowHeight,.08),glassBlue);
    pane.position.set(wx,floor+officeWindowHeight/2,officeFrontZ);obj.add(pane);
   }
  }
 }
 // Keep the main shell and roof as the far-distance representation;
 // facade pieces are switched off at a distance to reduce draw work.
 const cullRecord=viewCulledBuildings[viewCulledBuildings.length-1];
 if(cullRecord && cullRecord.group===obj) cullRecord.detailChildren=obj.children.slice(2);
 return obj;
}
function signBoard(text,x,z,width=22,color=0x176b43){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillRect(0,0,512,128);
 ctx.fillStyle='#ffffff';ctx.font='bold 42px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,480);
 const tex=new THREE.CanvasTexture(canvas);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,5),new THREE.MeshBasicMaterial({map:tex,transparent:false,side:THREE.DoubleSide}));
 mesh.position.set(x,7,z);scene.add(mesh);return mesh;
}
// Physical street-name signs (v0.61): modern two-line boards, 60% smaller than before, mounted parallel to the
// street they name on two poles (0.25x the bus-shelter height) so nothing hangs over the carriageway.
const STREET_SIGN_POLE_HEIGHT=BUS_SHELTER_HEIGHT*.25;    // two poles, 0.25x the shelter height (~4.6 units)
const STREET_SIGN_SCALE=.4;                              // 60% reduction of the old board (was 10-17 x 5)
const STREET_SUFFIXES=['Road','Street','Avenue','Expressway','Way','Causeway','Drive','Crescent','Approach'];
const streetSignPoleGeo=new THREE.CylinderGeometry(.11,.15,STREET_SIGN_POLE_HEIGHT,10);
const streetSignPoleMat=mat(0x2b3640);
const streetSignFrameMat=mat(0x1b242c);
// Splits "Herbert Macaulay Way" into ["HERBERT MACAULAY","WAY"] so the street name itself can be set large.
function splitStreetName(name){
 const words=name.split(' ');
 if(words.length>1&&STREET_SUFFIXES.includes(words[words.length-1]))
  return [words.slice(0,-1).join(' ').toUpperCase(),words[words.length-1].toUpperCase()];
 return [name.toUpperCase(),''];
}
function makeStreetSignTexture(name,aspect){
 const [main,suffix]=splitStreetName(name);
 const cw=1024,ch=Math.round(cw/aspect);
 const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
 const c=cv.getContext('2d');
 // Deep navy panel with a crisp white inset border and a cyan accent rail on the left.
 const bg=c.createLinearGradient(0,0,0,ch);bg.addColorStop(0,'#10446f');bg.addColorStop(1,'#0a2c4b');
 c.fillStyle=bg;c.fillRect(0,0,cw,ch);
 c.strokeStyle='#ffffff';c.lineWidth=Math.max(5,ch*.025);
 c.beginPath();c.roundRect(ch*.06,ch*.06,cw-ch*.12,ch*.88,ch*.09);c.stroke();
 c.fillStyle='#35c4ff';c.fillRect(ch*.14,ch*.2,ch*.035,ch*.6);
 c.textAlign='center';c.textBaseline='middle';
 const hasSuffix=suffix.length>0,maxW=cw-ch*.5;
 // Street name: largest bold size that fits the board, so it stays readable at small board sizes.
 let size=ch*(hasSuffix?.46:.56);
 const fam='"Segoe UI","Helvetica Neue",Arial,sans-serif';
 c.font=`800 ${size}px ${fam}`;
 while(c.measureText(main).width>maxW&&size>10){size-=2;c.font=`800 ${size}px ${fam}`;}
 c.fillStyle='#ffffff';c.fillText(main,cw/2+ch*.05,ch*(hasSuffix?.42:.52));
 if(hasSuffix){
  c.font=`600 ${ch*.2}px ${fam}`;c.fillStyle='#8fdcff';
  if('letterSpacing' in c)c.letterSpacing=`${ch*.035}px`;
  c.fillText(suffix,cw/2+ch*.05,ch*.74);
 }
 const tex=new THREE.CanvasTexture(cv);
 tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
 return tex;
}
// axis 'x' = a north-south street (runs along Z); axis 'z' = an east-west street (runs along X).
function addStreetNameSign(name,x,z,axis){
 const boardW=Math.min(17,Math.max(10,name.length*.48))*STREET_SIGN_SCALE;
 const boardH=5*STREET_SIGN_SCALE;
 const g=new THREE.Group();g.position.set(x,0,z);
 // Board faces are flat to the kerb, with the long side PARALLEL to the road it names.
 g.rotation.y=axis==='x'?Math.PI/2:0;
 scene.add(g);
 const topY=STREET_SIGN_POLE_HEIGHT,boardY=topY-boardH/2-.12;
 // Two poles at the ends of the board, running the full 0.25x-shelter height.
 for(const sx of [-1,1]){
  const pole=new THREE.Mesh(streetSignPoleGeo,streetSignPoleMat);
  pole.position.set(sx*(boardW/2-.28),STREET_SIGN_POLE_HEIGHT/2,0);g.add(pole);
 }
 const frame=new THREE.Mesh(new THREE.BoxGeometry(boardW+.14,boardH+.14,.1),streetSignFrameMat);
 frame.position.set(0,boardY,0);g.add(frame);
 const tex=makeStreetSignTexture(name,boardW/boardH);
 const faceMat=new THREE.MeshBasicMaterial({map:tex});
 const front=new THREE.Mesh(new THREE.PlaneGeometry(boardW,boardH),faceMat);
 front.position.set(0,boardY,.056);g.add(front);
 const back=new THREE.Mesh(new THREE.PlaneGeometry(boardW,boardH),faceMat);
 back.rotation.y=Math.PI;back.position.set(0,boardY,-.056);g.add(back);   // reads correctly from both sides
 return g;
}
function buildStreetNameSigns(){
 for(let k=-75;k<=75;k++){
  const road=k*70,half=(k%3===0)?24:4;
  // One sign per street, standing on the pavement beside the road (never over the carriageway).
  const vx=road+half+2.0,vz=-2455;
  addStreetNameSign(streetName('x',k),vx,vz,'x');
  const hx=-2455,hz=road+half+2.0;
  addStreetNameSign(streetName('z',k),hx,hz,'z');
 }
}
buildStreetNameSigns();

// District gateways (v0.62): the blue district name board (Victoria Island, Yaba, ...) now spans the full width of
// the nearest 48m avenue, carried high above the carriageway on two poles, one on each side of the road.
const DISTRICT_POLE_HEIGHT=BUS_SHELTER_HEIGHT*1.5;       // 1.5x the bus-shelter height (~27.5 units)
const DISTRICT_POLE_OFFSET=27.6;                          // pavement strip just outside the 24m half-width of an avenue
const DISTRICT_BOARD_H=6;
const districtPoleGeo=new THREE.CylinderGeometry(.5,.7,DISTRICT_POLE_HEIGHT,12);
const districtPoleMat=mat(0x2b3640);
const districtFrameMat=mat(0x16202a);
function makeDistrictTexture(name,aspect){
 const cw=512,ch=Math.round(cw/aspect);
 const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
 const c=cv.getContext('2d');
 const bg=c.createLinearGradient(0,0,0,ch);bg.addColorStop(0,'#2a72a8');bg.addColorStop(1,'#16456c');
 c.fillStyle=bg;c.fillRect(0,0,cw,ch);
 c.strokeStyle='#ffffff';c.lineWidth=Math.max(5,ch*.03);
 c.beginPath();c.roundRect(ch*.07,ch*.07,cw-ch*.14,ch*.86,ch*.12);c.stroke();
 c.fillStyle='#35c4ff';c.fillRect(ch*.2,ch*.22,cw*.012,ch*.56);c.fillRect(cw-ch*.2-cw*.012,ch*.22,cw*.012,ch*.56);
 c.textAlign='center';c.textBaseline='middle';
 const fam='"Segoe UI","Helvetica Neue",Arial,sans-serif',text=name.toUpperCase();
 let size=ch*.62;c.font=`800 ${size}px ${fam}`;
 if('letterSpacing' in c)c.letterSpacing=`${size*.06}px`;
 while(c.measureText(text).width>cw*.7&&size>10){size-=2;c.font=`800 ${size}px ${fam}`;if('letterSpacing' in c)c.letterSpacing=`${size*.06}px`;}
 c.fillStyle='#ffffff';c.fillText(text,cw/2,ch*.53);
 const tex=new THREE.CanvasTexture(cv);tex.anisotropy=renderer.capabilities.getMaxAnisotropy();return tex;
}
function districtGatewayPlacement(cx,cz){
 const mod=(a,n)=>((a%n)+n)%n;
 const avenueNear=v=>Math.max(-5040,Math.min(5040,Math.round(v/210)*210));   // outermost avenue of the grid is at +/-840
 const midBlock=v=>{   // mid-block points (35 + 70n) that are not on a streetlight spot (multiples of 105)
  let best=null;
  for(let n=Math.floor(v/70)-4;n<=Math.floor(v/70)+4;n++){
   const q=n*70+35,r=mod(q,105);
   if(Math.min(r,105-r)<6)continue;
   if(best===null||Math.abs(q-v)<Math.abs(best-v))best=q;
  }
  return best;
 };
 const ax=avenueNear(cx),az=avenueNear(cz);
 // Choose the avenue closest to the district centre; the gateway crosses it at right angles.
 return Math.abs(ax-cx)<=Math.abs(az-cz)
  ?{x:ax,z:midBlock(cz),alongZ:true}      // north-south avenue: board runs along X
  :{x:midBlock(cx),z:az,alongZ:false};    // east-west avenue: board runs along Z
}
function addDistrictGateway(name,cx,cz){
 const pl=districtGatewayPlacement(cx,cz);
 const span=DISTRICT_POLE_OFFSET*2,boardW=span-1.4;
 const g=new THREE.Group();g.position.set(pl.x,0,pl.z);g.rotation.y=pl.alongZ?0:Math.PI/2;scene.add(g);
 for(const sx of [-1,1]){
  const pole=new THREE.Mesh(districtPoleGeo,districtPoleMat);
  pole.position.set(sx*DISTRICT_POLE_OFFSET,DISTRICT_POLE_HEIGHT/2,0);g.add(pole);
  const base=new THREE.Mesh(new THREE.BoxGeometry(2.2,.5,2.2),districtFrameMat);base.position.set(sx*DISTRICT_POLE_OFFSET,.25,0);g.add(base);
 }
 const boardY=DISTRICT_POLE_HEIGHT-DISTRICT_BOARD_H/2-.4;
 const frame=new THREE.Mesh(new THREE.BoxGeometry(boardW+.3,DISTRICT_BOARD_H+.3,.4),districtFrameMat);frame.position.set(0,boardY,0);g.add(frame);
 const faceMat=new THREE.MeshBasicMaterial({map:makeDistrictTexture(name,boardW/DISTRICT_BOARD_H)});
 const front=new THREE.Mesh(new THREE.PlaneGeometry(boardW,DISTRICT_BOARD_H),faceMat);front.position.set(0,boardY,.22);g.add(front);
 const back=new THREE.Mesh(new THREE.PlaneGeometry(boardW,DISTRICT_BOARD_H),faceMat);back.rotation.y=Math.PI;back.position.set(0,boardY,-.22);g.add(back);
 // Keep bus shelters and street trees away from the two pole bases.
 for(const sx of [-1,1]){
  const px=pl.alongZ?pl.x+sx*DISTRICT_POLE_OFFSET:pl.x,pz=pl.alongZ?pl.z:pl.z+sx*DISTRICT_POLE_OFFSET;
  amenityColliders.push({minX:px-2,maxX:px+2,minZ:pz-2,maxZ:pz+2});
 }
}
function buildDistrictGateways(){for(const d of districtDefs)addDistrictGateway(d[0],d[1],d[2]);}
function palmTree(x,z,scale=1){addTree(x,z,scale*1.15,'palm')}
function fencedPitch(cx,cz,name='FOOTBALL PITCH',surface=sportGreen,s=1){
 const g=new THREE.Group();g.position.set(cx,0,cz);g.scale.setScalar(s);scene.add(g);
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
 signBoard(name,cx,cz-34*s,26*Math.max(.6,s),0x176b43);
 recordCityFacility('football',cx,cz,92*s,58*s,name);
}
function tennisCentre(cx,cz,s=1){
 const g=new THREE.Group();g.position.set(cx,0,cz);g.scale.setScalar(s);scene.add(g);
 for(let c=0;c<3;c++){const z=(c-1)*30;const court=new THREE.Mesh(new THREE.BoxGeometry(22,.2,12),sportBlue);court.position.set(0,.06,z);g.add(court);
  const ln=new THREE.MeshBasicMaterial({color:0xffffff});
  for(const x of [-10.5,10.5]){const m=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,11),ln);m.position.set(x,.19,z);g.add(m)}
  const net=new THREE.Mesh(new THREE.BoxGeometry(.15,1,12),mat(0xe8e8df));net.position.set(0,.65,z);g.add(net)}
 signBoard('LAGOS TENNIS CENTRE',cx,cz-Math.min(36*s+4,24),28*Math.max(.6,s),0x245f94);
 recordCityFacility('tennis',cx,cz,30*s,72*s,'Tennis centre');
}
function basketballCentre(cx,cz){
 const court=new THREE.Mesh(new THREE.BoxGeometry(38,.2,23),sportRed);court.position.set(cx,.05,cz);scene.add(court);
 const ring=new THREE.Mesh(new THREE.RingGeometry(5,5.3,32),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(cx,.18,cz);scene.add(ring);
 signBoard('COMMUNITY BASKETBALL COURT',cx,cz-22,25,0x9b4036);
 recordCityFacility('basketball',cx,cz,38,23,'Basketball court');
}
function marketCluster(cx,cz,label='LOCAL MARKET'){
 // v0.68: canopies follow the road-safe position each shop was actually given.
 const placed=[];
 for(let i=0;i<7;i++){const x=cx+(i%4)*13-20,z=cz+Math.floor(i/4)*15;const shop=makeBuilding(x,z,10,10,4,'market',i);if(shop){const canopy=new THREE.Mesh(new THREE.BoxGeometry(10,.35,10),marketMat);canopy.position.set(shop.position.x,4.4,shop.position.z);scene.add(canopy);placed.push(shop.position)}}
 // Shops that had to be pushed far away (no room nearby) are not part of the cluster's sign/map footprint.
 const near=placed.filter(p=>Math.hypot(p.x-cx,p.z-cz)<170);
 let mx=cx,mz=cz,w=78,d=30;
 if(near.length){
  const x0=Math.min(...near.map(p=>p.x)),x1=Math.max(...near.map(p=>p.x)),z0=Math.min(...near.map(p=>p.z)),z1=Math.max(...near.map(p=>p.z));
  mx=(x0+x1)/2;mz=(z0+z1)/2;w=x1-x0+24;d=z1-z0+24;
 }else{const f=fitToBlock(cx,cz,40,24);mx=f.x;mz=f.z;w=f.w;d=f.d}
 signBoard(label,mx,mz-18,30,0x9a5b23);
 recordCityFacility('market',mx,mz,w,d,label);
}
function compound(cx,cz,kind='residential',seed=0){
 if(!clearBuildingPlot(cx,cz,42,42,1)) return;
 // Walled family compounds with gate, small yard and several low-rise blocks.
 const wall=mat(0xb6ad9a),g=new THREE.Group();g.position.set(cx,0,cz);scene.add(g);
 for(const [x,z,w,d] of [[0,-21,42,.7],[0,21,42,.7],[-21,0,.7,42],[21,0,.7,42]]){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,2.2,d),wall);m.position.set(x,1.1,z);g.add(m)
 }
 const gate=new THREE.Mesh(new THREE.BoxGeometry(7,2.4,.5),mat(0x354c40));gate.position.set(0,1.2,21);g.add(gate);
 const gateHeader=new THREE.Mesh(new THREE.BoxGeometry(9,.45,.8),trimMat);gateHeader.position.set(0,2.55,21);g.add(gateHeader);
 // Two low-rise buildings create the familiar shared-yard compound layout.
 makeBuilding(cx-9,cz-7,15,14,10,kind,seed);makeBuilding(cx+9,cz-7,14,13,8,kind,seed+1);
 const gen=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.1,1.1),darkMetal);gen.position.set(cx+15,.55,cz+14);scene.add(gen);
 const yard=new THREE.Mesh(new THREE.BoxGeometry(14,.12,10),grass);yard.position.set(cx,0,cz+11);scene.add(yard);
}
function buildDistrict(name,cx,cz,type,seed){
 // arterial frontage, varied block fabric and a signature landmark per district.
 if(type==='island'){
  for(let i=0;i<10;i++){makeBuilding(cx+(i%5)*34-68,cz+Math.floor(i/5)*45-18,27,29,32,'office',seed+i)}
  makeBuilding(cx,cz+90,76,40,64,'office',seed+20);
 }else if(type==='market'){
  marketCluster(cx,cz,name.toUpperCase());
  for(let i=0;i<12;i++)makeBuilding(cx+(i%4)*29-44,cz+70+Math.floor(i/4)*25,18,18,8+(i%3)*3,'shop',seed+i);
 }else if(type==='sports'){
  const L=sportsLayout.get(name);
  if(L){fencedPitch(L.pitch.cx,L.pitch.cz,name.toUpperCase()+' FOOTBALL ARENA',sportGreen,L.pitch.s);tennisCentre(L.tennis.cx,L.tennis.cz,L.tennis.s);basketballCentre(L.basket.cx,L.basket.cz);}
  const hall=makeBuilding(cx,cz+110,55,32,12,'mixed',seed);if(hall)signBoard('SPORTS & RECREATION COMPLEX',hall.position.x,hall.position.z-28,35,0x176b43);
 }else if(type==='civic'){
  makeBuilding(cx-35,cz,45,38,22,'office',seed);makeBuilding(cx+35,cz,42,36,18,'office',seed+1);
  makeBuilding(cx,cz+58,88,28,8,'mixed',seed+2);
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
    if(!clearBuildingPlot(x,z,42,42,1)) continue;
    const yard=new THREE.Mesh(new THREE.BoxGeometry(34,.12,30),grass);yard.position.set(x,.02,z);scene.add(yard);
    compound(x,z,'duplex',seed+i);
    for(const sx of [-12,12]){
     const hedge=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.5,25),mat(0x326b3c));hedge.position.set(x+sx, .75,z);scene.add(hedge);
    }
   }else compound(x,z,houseKind,seed+i);
  }
  for(let i=0;i<7;i++)makeBuilding(cx+(i%4)*36-54,cz-100+Math.floor(i/4)*28,24,18,5+(i%2)*2,'shop',seed+i);
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
// Repeat the original Lagos district plan across a 5x5 connected grid. Each tile
// retains normal-sized roads, buildings and facilities; only the city footprint
// and the count of districts/content increase. The centre tile keeps original names.
const baseDistrictDefs=districtDefs.slice();
for(let tx=-2;tx<=2;tx++)for(let tz=-2;tz<=2;tz++){
 if(tx===0&&tz===0)continue;
 const tileNo=(tz+2)*5+(tx+2)+1;
 for(const d of baseDistrictDefs)districtDefs.push([`${d[0]} DISTRICT ${String(tileNo).padStart(2,'0')}`,d[1]+tx*2100,d[2]+tz*2100,d[3]]);
}
// Reserve every fixed sports venue BEFORE any district buildings are generated.
// v0.68: each venue is placed in its own road-free city block (nearest open block to its district centre)
// and scaled down only if the block is smaller than the venue. Whole blocks are reserved.
for(const d of baseDistrictDefs){
 if(d[3]!=='sports')continue;
 const cx=d[1],cz=d[2],L={};
 const pitch=claimOpenBlock(cx,cz,50,50),tennis=claimOpenBlock(cx+135,cz+5,50,50),basket=claimOpenBlock(cx-135,cz+8,50,50);
 if(!pitch||!tennis||!basket)continue;
 L.pitch={cx:pitch.cx,cz:pitch.cz,s:Math.min(1,pitch.w/100,pitch.d/66)};
 L.tennis={cx:tennis.cx,cz:tennis.cz,s:Math.min(1,tennis.w/30,tennis.d/74)};
 L.basket={cx:basket.cx,cz:basket.cz,s:Math.min(1,basket.w/40,basket.d/28)};
 sportsLayout.set(d[0],L);
 for(const b of [pitch,tennis,basket])amenityColliders.push({minX:b.x0-1,maxX:b.x1+1,minZ:b.z0-1,maxZ:b.z1+1});
}
baseDistrictDefs.forEach((d,i)=>buildDistrict(d[0],d[1],d[2],d[3],i*13));
buildDistrictGateways();

// v0.35: denser city infill with a 60% tall-building target.
// One substantial building is placed near the centre of each available block;
// the placement routine retains full road/pavement and overlap protection.
// Expanded infill: one lightweight instanced building per available plot.
// 25x more grid plots are generated across the 5x-by-5x city footprint.
const expandedBuildingRecords=[];
let citySeed=1000;
for(let gx=-5145;gx<=5145;gx+=70){
 for(let gz=-5145;gz<=5145;gz+=70){
  const ix=Math.round((gx+5145)/70),iz=Math.round((gz+5145)/70);
  const blockIndex=ix*148+iz;
  // Reserve one in nine plots for the expanded sports-centre network.
  if(blockIndex%7===0)continue;
  const nearLandmark=baseDistrictDefs.some(d=>Math.hypot(gx-d[1],gz-d[2])<105);
  if(nearLandmark)continue;
  if(claimedBlocks.has(Math.floor(gx/70)+','+Math.floor(gz/70)))continue;
  const kind=(blockIndex%5)<3?((blockIndex%4===0)?'office':'apartment'):(['mixed','residential','tenement','shop'][Math.abs(blockIndex)%4]);
  const width=(kind==='shop'?8:10)*(kind==='office'?1.22:1.14)*4;
  const depth=(kind==='shop'?9:12)*(kind==='office'?1.22:1.14)*4;
  const height=(kind==='office'?([20,25,30,35,40][Math.abs(blockIndex)%5]*3.2):(kind==='apartment'?([25,30,35,40][Math.abs(blockIndex)%4]*3.2):([5,7,10,12][Math.abs(blockIndex)%4]*3.1)))*4;
  const color=kind==='office'?0x9ab8c4:(kind==='apartment'?0xc5b9a0:(kind==='shop'?0xd5a86c:(kind==='tenement'?0xb9a99a:0xb8c8b2)));
  // v0.68: shrink the footprint to the free ground of its block and centre it there (pushed clear of every road).
  const fit=fitToBlock(gx,gz,width,depth);
  expandedBuildingRecords.push({x:fit.x,z:fit.z,w:fit.w,d:fit.d,h:height,kind,color,seed:citySeed++});
  buildingColliders.push({minX:fit.x-fit.w/2-1,maxX:fit.x+fit.w/2+1,minZ:fit.z-fit.d/2-1,maxZ:fit.z+fit.d/2+1});
  cityMapBuildings.push({x:fit.x,z:fit.z,w:fit.w,d:fit.d,kind});
 }
}
// Split instanced buildings into 25 geographic chunks for frustum-friendly rendering.
for(let tx=-2;tx<=2;tx++)for(let tz=-2;tz<=2;tz++){
 const records=expandedBuildingRecords.filter(b=>Math.floor((b.x+5250)/2100)===tx+2&&Math.floor((b.z+5250)/2100)===tz+2);
 if(!records.length)continue;
 const group=new THREE.Group();scene.add(group);
 const body=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86}),records.length);
 const roof=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),roofMat,records.length);
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 records.forEach((b,i)=>{
  dummy.position.set(b.x,b.h/2,b.z);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();body.setMatrixAt(i,dummy.matrix);
  color.setHex(b.color);body.setColorAt(i,color);
  dummy.position.set(b.x,b.h+.25,b.z);dummy.scale.set(b.w+1,.5,b.d+1);dummy.updateMatrix();roof.setMatrixAt(i,dummy.matrix);
 });
 body.instanceMatrix.needsUpdate=true;roof.instanceMatrix.needsUpdate=true;body.frustumCulled=true;roof.frustumCulled=true;group.add(body,roof);
}
// Spatial hash for the enlarged building stock keeps amenity and shelter placement efficient.
const EXPANDED_COLLISION_CELL=100,expandedBuildingGrid=new Map();
for(const b of buildingColliders){
 const minX=Math.floor(b.minX/EXPANDED_COLLISION_CELL),maxX=Math.floor(b.maxX/EXPANDED_COLLISION_CELL),minZ=Math.floor(b.minZ/EXPANDED_COLLISION_CELL),maxZ=Math.floor(b.maxZ/EXPANDED_COLLISION_CELL);
 for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){const k=ix+','+iz;let a=expandedBuildingGrid.get(k);if(!a)expandedBuildingGrid.set(k,a=[]);a.push(b)}
}
function expandedBuildingOverlap(x,z,w,d,margin=0){
 const minX=Math.floor((x-w/2-margin)/EXPANDED_COLLISION_CELL),maxX=Math.floor((x+w/2+margin)/EXPANDED_COLLISION_CELL),minZ=Math.floor((z-d/2-margin)/EXPANDED_COLLISION_CELL),maxZ=Math.floor((z+d/2+margin)/EXPANDED_COLLISION_CELL);
 for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){const a=expandedBuildingGrid.get(ix+','+iz)||[];for(const b of a)if(x+w/2+margin>b.minX&&x-w/2-margin<b.maxX&&z+d/2+margin>b.minZ&&z-d/2-margin<b.maxZ)return true}
 return false;
}

// v0.37 COMMUNITY AMENITY INFILL
// Preserve every existing building. Add useful destinations only on vacant,
// road-safe plots, using the same city collision reservations as buildings.
// -----------------------------------------------------------------------------
const amenityMats={
  paving:mat(0xc8cec5), grass:mat(0x5f985b), dark:mat(0x263a31),
  glass:mat(0x75aeb9,.35), blue:mat(0x1769a6), red:mat(0xb64b38),
  yellow:mat(0xe8c34b), white:mat(0xf3f1e6), roof:mat(0x344d43)
};
function amenityPlotFree(x,z,w,d){
  if(!clearBuildingPlot(x,z,w,d,3)) return false;
  const overlaps=expandedBuildingOverlap(x,z,w,d,3);
  if(overlaps)return false;
  return !amenityColliders.some(c=>x+w/2+3>c.minX&&x-w/2-3<c.maxX&&z+d/2+3>c.minZ&&z-d/2-3<c.maxZ);
}
function reserveAmenity(x,z,w,d){
  amenityColliders.push({minX:x-w/2-2,maxX:x+w/2+2,minZ:z-d/2-2,maxZ:z+d/2+2});
}
function amenityBox(parent,w,h,d,material,x,y,z){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  m.position.set(x,y+h/2,z);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;
}
function addShopfront(x,z,label='SHOP',accent=0x176b43){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  amenityBox(g,22,6,13,mat(0xd9d9cf),0,0,0);
  amenityBox(g,22.5,.55,13.5,mat(0x7b5140),0,6,0);
  for(let i=0;i<4;i++){
    amenityBox(g,4.2,2.8,.12,amenityMats.glass,-8.1+i*5.4,1.1,6.62);
    amenityBox(g,4.5,.35,.55,mat(accent),-8.1+i*5.4,4.15,6.9);
  }
  signBoard(label,x,z-7,15,accent);reserveAmenity(x,z,25,17);recordCityFacility('shop',x,z,25,17,label);
}
function addPharmacy(x,z){
  // Pharmacy dimensions are scaled from the original shopfront: H x3, W x2, L x2.
  // Original shell: 22 wide x 6 high x 13 deep; new shell: 44 x 18 x 26.
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  amenityBox(g,44,18,26,mat(0xd9d9cf),0,0,0);
  amenityBox(g,45,1.1,27,mat(0x7b5140),0,18,0);
  for(let i=0;i<4;i++){
    const px=-16.2+i*10.8;
    amenityBox(g,8.4,8.4,.24,amenityMats.glass,px,3.3,13.12);
    amenityBox(g,9,.7,1.1,mat(0x16844b),px,12.45,13.8);
  }
  const sign=signBoard('PHARMACY',x,z-15,44,0x16844b);
  sign.position.y=19;
  // Reserve the full enlarged footprint plus clearance from roads and neighbours.
  reserveAmenity(x,z,50,32);recordCityFacility('pharmacy',x,z,50,32,'Pharmacy');
}
function addSupermarket(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  amenityBox(g,30,7,22,mat(0xe3e5df),0,0,0);
  amenityBox(g,31,.6,23,amenityMats.roof,0,7,0);
  amenityBox(g,27,3.6,.15,amenityMats.glass,0,1.2,11.1);
  amenityBox(g,29,.8,.6,mat(0x16844b),0,6.3,11.7);
  signBoard('SUPERMARKET',x,z-12,22,0x16844b);
  reserveAmenity(x,z,34,26);recordCityFacility('supermarket',x,z,34,26,'Supermarket');
}
function addFuelStation(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  amenityBox(g,28,.35,20,mat(0xbfc8c2),0,.1,0);
  amenityBox(g,23,.5,15,mat(0xe5e5dc),0,5,0);
  for(const px of [-10.5,10.5])for(const pz of [-7,7]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,5,8),amenityMats.white);
    post.position.set(px,2.5,pz);g.add(post);
  }
  amenityBox(g,27,.8,19,mat(0xd52f32),0,5.6,0);
  for(const px of [-7,0,7]){
    amenityBox(g,1.2,1.7,1.2,mat(0xe9e9e4),px,.35,2);
    amenityBox(g,.45,.25,.25,mat(0x252525),px,1.8,2.55);
  }
  signBoard('FUEL STATION',x,z-14,20,0xd52f32);
  reserveAmenity(x,z,36,29);recordCityFacility('fuel',x,z,36,29,'Fuel station');
}
function addTennisCourt(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  amenityBox(g,30,.18,19,sportBlue,0,.05,0);
  const line=new THREE.MeshBasicMaterial({color:0xffffff});
  for(const px of [-14.5,14.5]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,18),line);m.position.set(px,.17,0);g.add(m);
  }
  for(const pz of [-9,9]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(29,.04,.18),line);m.position.set(0,.17,pz);g.add(m);
  }
  const net=new THREE.Mesh(new THREE.BoxGeometry(.18,1,18),amenityMats.white);net.position.set(0,.7,0);g.add(net);
  signBoard('COMMUNITY TENNIS',x,z-12,20,0x245f94);reserveAmenity(x,z,34,25);recordCityFacility('tennis',x,z,34,25,'Tennis court');
}
function addGardenPark(x,z,large=false){
  const w=large?38:27,d=large?32:23;
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  amenityBox(g,w,.12,d,amenityMats.grass,0,.02,0);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,px=Math.cos(a)*w*.29,pz=Math.sin(a)*d*.29;
    addTree(x+px,z+pz,i%2?.8:1,'palm');
  }
  for(const bx of [-w*.22,w*.22]){
    const bench=amenityBox(g,4,.35,.8,mat(0x76513a),bx,.2,0);
    const back=amenityBox(g,4,1.1,.25,mat(0x76513a),bx,.5,-.48);
  }
  if(large){
    const fountain=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.8,.5,20),amenityMats.blue);
    fountain.position.set(0,.38,0);g.add(fountain);
    signBoard('COMMUNITY PARK',x,z-d/2-2,20,0x176b43);
  }else signBoard('GARDEN',x,z-d/2-2,13,0x176b43);
  reserveAmenity(x,z,w+3,d+3);recordCityFacility('park',x,z,w+3,d+3,large?'Community park':'Garden');
}
function addTableTennis(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  // Full table with four visible legs, a supporting underframe and a centre net.
  amenityBox(g,8.4,.22,4.6,mat(0x176b43),0,1.55,0);
  amenityBox(g,8.5,.12,4.7,amenityMats.white,0,1.77,0);
  amenityBox(g,8.1,.045,4.3,mat(0x176b43),0,1.84,0);
  for(const px of [-3.65,3.65])for(const pz of [-1.75,1.75]){
    amenityBox(g,.22,1.55,.22,amenityMats.dark,px,0,pz);
    amenityBox(g,.5,.12,.5,amenityMats.dark,px,.08,pz);
  }
  // Longitudinal and cross braces keep the tabletop visibly supported.
  amenityBox(g,7.5,.16,.18,amenityMats.dark,0,1.18,0);
  amenityBox(g,.18,.16,3.7,amenityMats.dark,0,1.18,0);
  amenityBox(g,.08,.08,4.45,amenityMats.white,0,1.9,0);
  amenityBox(g,.12,.48,.12,amenityMats.white,0,2.12,-2.22);
  amenityBox(g,.12,.48,.12,amenityMats.white,0,2.12,2.22);
  signBoard('TABLE TENNIS',x,z-6,14,0x176b43);
  reserveAmenity(x,z,14,11);recordCityFacility('tabletennis',x,z,14,11,'Table tennis');
}
// Road legend "BUS" painted in the kerb-side lane beside each shelter. Text reads from the driver's seat for that
// lane (right-hand traffic: the east/south half of an avenue flows north/east, the west/north half south/west).
let busMarkMat=null,busMarkGeo=null;
function addBusRoadMark(roadAxis,road,side,along){
  if(!busMarkMat){
    const cv=document.createElement('canvas');cv.width=cv.height=256;const g=cv.getContext('2d');
    g.fillStyle='#f4f2df';g.font='900 230px "Arial Black", Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('BUS',128,136,236);
    const tex=new THREE.CanvasTexture(cv);tex.anisotropy=4;
    busMarkMat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    busMarkGeo=new THREE.PlaneGeometry(4.4,9);busMarkGeo.rotateX(-Math.PI/2);
  }
  const lane=side*17.6;   // centre of the outer lane (between the lane divider at 12m and the edge line at 23.2m)
  const m=new THREE.Mesh(busMarkGeo,busMarkMat);
  m.position.set(roadAxis==='x'?road+lane:along,.115,roadAxis==='x'?along:road+lane);
  m.rotation.y=roadAxis==='x'?(side>0?0:Math.PI):(side>0?-Math.PI/2:Math.PI/2);
  m.renderOrder=3;scene.add(m);
}
function addBusStop(x,z,rotation=0,zScale=1){
  // zScale squashes the shelter's depth (local Z) so it fits on the pavement beside the road.
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;g.scale.set(1,1,zScale);scene.add(g);
  // Preserve the requested tall shelter and double its breadth from 4 to 8 units.
  // The 30-unit front remains parallel to the road.
  amenityBox(g,30,.16,8,amenityMats.paving,0,.08,0);
  for(const px of [-13.5,13.5]){
    for(const pz of [-3.25,3.25]){
      amenityBox(g,.54,18,.54,amenityMats.dark,px,.16,pz);
    }
  }
  amenityBox(g,27,.18,7.6,amenityMats.blue,0,18.15,0);
  // Transparent long-side screen and passenger bench.
  amenityBox(g,24,6.6,.12,amenityMats.glass,0,7.5,-3.55);
  // Removed the obstructing horizontal bar completely; keep the entrance open.
  // Replace the large rectangular BUS STOP board with a standard circular
  // blue bus-stop symbol mounted on a slim roadside pole. The sign is part
  // of the shelter group, so it follows the shelter's road-facing direction.
  const signPole=new THREE.Mesh(
    new THREE.CylinderGeometry(.09,.12,17.2,10),amenityMats.dark
  );
  // Stand the sign independently just outside the shelter's roadside edge;
  // the pole reaches approximately to roof level.
  signPole.position.set(17.2,8.6,4.8);g.add(signPole);
  const signCanvas=document.createElement('canvas');
  signCanvas.width=256;signCanvas.height=256;
  const signCtx=signCanvas.getContext('2d');
  signCtx.fillStyle='#1769a6';signCtx.beginPath();
  signCtx.arc(128,128,120,0,Math.PI*2);signCtx.fill();
  // Simple white front-view bus pictogram.
  signCtx.fillStyle='#ffffff';
  signCtx.beginPath();signCtx.roundRect(73,55,110,132,20);signCtx.fill();
  signCtx.fillStyle='#1769a6';
  signCtx.fillRect(86,70,84,43);
  signCtx.fillRect(86,121,36,28);signCtx.fillRect(134,121,36,28);
  signCtx.fillStyle='#ffffff';
  signCtx.beginPath();signCtx.arc(94,183,10,0,Math.PI*2);signCtx.arc(162,183,10,0,Math.PI*2);signCtx.fill();
  const signTexture=new THREE.CanvasTexture(signCanvas);
  const circularSign=new THREE.Mesh(
    new THREE.CircleGeometry(1.2,32),
    new THREE.MeshBasicMaterial({map:signTexture,side:THREE.DoubleSide})
  );
  circularSign.position.set(17.2,17.35,4.8);g.add(circularSign);
  const alongRoad=Math.abs(Math.sin(rotation))>.5;
  const depth=8*zScale+1;
  reserveAmenity(x,z,alongRoad?depth:36,alongRoad?36:depth);recordCityFacility('bus',x,z,alongRoad?depth:36,alongRoad?36:depth,'Bus stop');
}
function shelterSiteFree(x,z,plotW,plotD,roadAxis,roadCoord){
  // Unlike buildings, shelters intentionally sit beside a road. Check the
  // rotated shelter footprint against every road except its parallel frontage.
  const halfW=plotW/2+1,halfD=plotD/2+1;
  const minGX=Math.floor((x-halfW)/70)-1,maxGX=Math.ceil((x+halfW)/70)+1;
  for(let k=minGX;k<=maxGX;k++){
    const rx=k*70,half=(k%3===0)?24:4;
    if(roadAxis==='x'&&Math.abs(rx-roadCoord)<.01)continue;
    if(Math.abs(x-rx)<halfW+half+1)return false;
  }
  const minGZ=Math.floor((z-halfD)/70)-1,maxGZ=Math.ceil((z+halfD)/70)+1;
  for(let k=minGZ;k<=maxGZ;k++){
    const rz=k*70,half=(k%3===0)?24:4;
    if(roadAxis==='z'&&Math.abs(rz-roadCoord)<.01)continue;
    if(Math.abs(z-rz)<halfD+half+1)return false;
  }
  const overlapsBuildings=expandedBuildingOverlap(x,z,plotW,plotD,1);
  if(overlapsBuildings)return false;
  return !amenityColliders.some(c=>x+halfW>c.minX&&x-halfW<c.maxX&&z+halfD>c.minZ&&z-halfD<c.maxZ);
}
function addAmenityInfill(){
  let placedCount=0;
  // Scan the actual open land between streets instead of testing only block
  // centres. This finds usable corners and gaps around existing buildings.
  const types=[
    {kind:'fuel',w:36,d:29},
    {kind:'supermarket',w:34,d:26},
    {kind:'tennis',w:34,d:25},
    {kind:'tabletennis',w:14,d:11},
    {kind:'park',w:41,d:35},
    {kind:'shop',w:25,d:17},
    {kind:'garden',w:27,d:23},
    {kind:'pharmacy',w:50,d:32}
  ];
  const candidates=[];
  // One candidate per 70m city block keeps startup work bounded while
  // still sampling every available block across the expanded 25x footprint.
  for(let x=-5075;x<=5145;x+=70){
    for(let z=-5075;z<=5145;z+=70){
      if(x>650&&z>650)continue; // keep the waterfront/port zone reserved
      candidates.push([x,z]);
    }
  }
  // Deterministic shuffle-like ordering spreads facilities throughout the map.
  candidates.sort((a,b)=>(((a[0]*17+a[1]*31)%997)-((b[0]*17+b[1]*31)%997)));
  // Bus shelters (v0.57): 30 stops, each with a shelter on BOTH sides of an avenue directly opposite one another
  // (60 shelters in all), standing on the pavements beside the carriageway, never on it. Stops are chosen by
  // farthest-point sampling so they are spread evenly across the whole city, and each shelter has a "BUS" legend
  // painted on the road beside it. Sites keep clear of crossing roads (zebra and stop-line zones), buildings and
  // other amenities; a streetlight pole that stands inside a footprint is removed.
  let extraShelters=0;
  const shelterTarget=750,SH_LEN=36,SH_DEPTH=5,SH_HALF=SH_LEN/2;
  const avenueLines=[],gridLines=[];
  for(let p=-5040;p<=5040;p+=210)avenueLines.push(p);
  for(let p=-5180;p<=5180;p+=70)gridLines.push(p);
  const shelterSite=(roadAxis,road,side,along)=>{
    const off=24+.6+SH_DEPTH/2;   // front edge just behind the kerb, on the pavement
    const x=roadAxis==='x'?road+side*off:along,z=roadAxis==='x'?along:road+side*off;
    if(x>650&&z>650)return null;   // waterfront/port zone stays reserved
    for(const gl of gridLines){const half=Math.abs(gl%210)<1?24:4;if(Math.abs(along-gl)<SH_HALF+half+.8)return null}
    const hx=roadAxis==='x'?SH_DEPTH/2+.1:SH_HALF,hz=roadAxis==='x'?SH_HALF:SH_DEPTH/2+.1;
    if(expandedBuildingOverlap(x,z,hx*2,hz*2,-1))return null;
    if(amenityColliders.some(c=>x+hx>c.minX&&x-hx<c.maxX&&z+hz>c.minZ&&z-hz<c.maxZ))return null;
    return {x,z,roadAxis,road,side,along};
  };
  // A stop is valid only when BOTH facing sites are free.
  const shelterCands=[];
  for(const roadAxis of ['x','z'])for(const road of avenueLines)for(let along=-5100;along<=5100;along+=24){
    const a=shelterSite(roadAxis,road,-1,along),b=a&&shelterSite(roadAxis,road,1,along);
    if(a&&b)shelterCands.push({sites:[a,b],cx:roadAxis==='x'?road:along,cz:roadAxis==='x'?along:road});
  }
  const chosenStops=[];
  if(shelterCands.length){
    let first=shelterCands[0];
    for(const c of shelterCands)if(Math.hypot(c.cx,c.cz)<Math.hypot(first.cx,first.cz))first=c;
    chosenStops.push(first);
    const minDist=shelterCands.map(c=>Math.hypot(c.cx-first.cx,c.cz-first.cz));
    while(chosenStops.length<shelterTarget&&chosenStops.length<shelterCands.length){
      let best=0;for(let i=1;i<minDist.length;i++)if(minDist[i]>minDist[best])best=i;
      const pick=shelterCands[best];chosenStops.push(pick);
      for(let i=0;i<minDist.length;i++)minDist[i]=Math.min(minDist[i],Math.hypot(shelterCands[i].cx-pick.cx,shelterCands[i].cz-pick.cz));
    }
  }
  let minShelterGap=Infinity;
  for(const stop of chosenStops){
    for(const c of stop.sites){
      // Local +Z points toward the road, so the open passenger side faces the carriageway.
      const rotation=c.roadAxis==='x'?(c.side>0?-Math.PI/2:Math.PI/2):(c.side>0?Math.PI:0);
      addBusStop(c.x,c.z,rotation,SH_DEPTH/8);
      {const hx=c.roadAxis==='x'?SH_DEPTH/2+1:SH_HALF+1,hz=c.roadAxis==='x'?SH_HALF+1:SH_DEPTH/2+1;
       removeStreetlightsInRect(c.x,c.z,hx,hz);}   // use the streetlight spatial hash; shelter replaces lamps in its footprint
      addBusRoadMark(c.roadAxis,c.road,c.side,c.along);
      extraShelters++;placedCount++;
    }
  }
  for(let i=0;i<chosenStops.length;i++)for(let j=i+1;j<chosenStops.length;j++)minShelterGap=Math.min(minShelterGap,Math.hypot(chosenStops[i].cx-chosenStops[j].cx,chosenStops[i].cz-chosenStops[j].cz));

  for(let i=0;i<candidates.length&&placedCount<220;i++){
    const [x,z]=candidates[i];
    const type=types[(i*7+Math.floor(Math.abs(x+z)/14))%types.length];
    const plotW=type.w, plotD=type.d;
    if(!amenityPlotFree(x,z,plotW,plotD))continue;
    if(type.kind==='fuel')addFuelStation(x,z);
    else if(type.kind==='supermarket')addSupermarket(x,z);
    else if(type.kind==='tennis')addTennisCourt(x,z);
    else if(type.kind==='tabletennis')addTableTennis(x,z);
    else if(type.kind==='park')addGardenPark(x,z,true);
    else if(type.kind==='shop')addShopfront(x,z,'LOCAL SHOPS',0x176b43);
    else if(type.kind==='garden')addGardenPark(x,z,false);
    else if(type.kind==='pharmacy')addPharmacy(x,z);
    placedCount++;
  }

  return {placedCount,extraShelters,minShelterGap:Math.round(minShelterGap)};
}
const v037AmenityResult=addAmenityInfill();
console.info('This Is Lagos v0.67: roof-height circular pole bus-stop signs; 1,500 bus shelters (750 opposite pairs, evenly spaced) on the pavements beside the avenues with BUS road legends, fronts facing roads; protected courts and supported table-tennis; pharmacy H x3, W x2, L x2',v037AmenityResult);

// v0.65: 2,500 purpose-built, named sports centres distributed throughout Lagos.
// Reuses the game's existing road-safe plot checks, facility registry, activity
// interaction markers and live map. Each campus has its own parking and several
// sports/recreation spaces; the layout varies deterministically by centre.
const SPORTS_CENTRE_TARGET=2500;
const DETAILED_SPORTS_CENTRE_LIMIT=100;
const sportsCentreNames=[];
const sportsCentreAccent=[0x176b43,0x245f94,0x9b4036,0x7a5a28];
function nearestDistrictFor(x,z){
 let best=districtDefs[0],bestD=Infinity;
 for(const d of districtDefs){const q=(x-d[1])**2+(z-d[2])**2;if(q<bestD){bestD=q;best=d}}
 return best;
}
function sportsCentreSiteFree(x,z){
 const w=44,d=44;
 // v0.68: the 100 fully detailed campuses only use blocks wide enough for the whole 44m campus between pavements.
 {const [x0,x1]=blockSpan(x),[z0,z1]=blockSpan(z);if(x1-x0<46||z1-z0<46)return false;}
 if(!amenityPlotFree(x,z,w,d))return false;
 // Keep a little breathing room between campuses without consuming an entire block.
 return !sportsCentreNames.some(s=>Math.abs(x-s.x)<49&&Math.abs(z-s.z)<49);
}
function buildSportsCentre(x,z,index,district){
 const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
 const paving=mat(0xbfc9bd),fence=mat(0x65766b),courtLine=new THREE.MeshBasicMaterial({color:0xf4f2e7});
 const accent=sportsCentreAccent[index%sportsCentreAccent.length];
 // Perimeter campus apron and low boundary walls.
 amenityBox(g,44,.22,44,paving,0,0,0);
 for(const [px,pz,pw,pd] of [[0,-21.5,44,.45],[0,21.5,44,.45],[-21.5,0,.45,44],[21.5,0,.45,44]])amenityBox(g,pw,1.35,pd,fence,px,.2,pz);
 // Multi-sport futsal/football practice pitch.
 amenityBox(g,22,.16,12,sportGreen,-8,.18,-10);
 for(const px of [-18,-8,2])amenityBox(g,.12,.035,11,courtLine,px,.29,-10);
 amenityBox(g,21,.035,.12,courtLine,-8,.29,-15.8);amenityBox(g,21,.035,.12,courtLine,-8,.29,-4.2);
 // Basketball court and hoops.
 amenityBox(g,16,.16,9,sportRed,9,.18,-10);
 for(const px of [1,17]){amenityBox(g,.18,2,.18,dark,px, .34,-10);amenityBox(g,1.8,.12,.18,white,px,.34+2,-10)}
 // Tennis / multipurpose court.
 amenityBox(g,19,.16,10,sportBlue,-8,.18,5);
 amenityBox(g,.12,.035,9,courtLine,-17.4,.29,5);amenityBox(g,.12,.035,9,courtLine,1.4,.29,5);
 amenityBox(g,18,.035,.12,courtLine,-8,.29,.2);amenityBox(g,18,.035,.12,courtLine,-8,.29,9.8);
 // Gym, reception and changing-room block with glazed frontage.
 amenityBox(g,12,4.4,7,mat(0xe1dfd2),9,0,9);
 amenityBox(g,12,.5,7,mat(accent),9,4.4,9);
 amenityBox(g,5,2.4,.12,amenityMats.glass,7,1,12.56);
 amenityBox(g,3,2.4,.12,amenityMats.glass,12,1,12.56);
 // Dedicated parking: four marked bays inside the secured entrance apron.
 amenityBox(g,18,.12,6,asphaltMat,9,.18,17);
 for(let k=0;k<5;k++)amenityBox(g,.12,.035,5,white,1+k*4,.31,17);
 // Four compact floodlight masts.
 for(const [lx,lz] of [[-19,-19],[19,-19],[-19,19],[19,19]]){
  amenityBox(g,.28,7,.28,dark,lx,.22,lz);
  amenityBox(g,1.4,.22,.65,white,lx,7.05,lz);
 }
 const label=`SPORTS CENTRE ${String(index+1).padStart(3,'0')} · ${district[0]}`;
 signBoard(label,x,z-23,29,accent);
 reserveAmenity(x,z,44,44);
 recordCityFacility('sportscomplex',x,z,44,44,label);
 sportsCentreNames.push({x,z,label,district:district[0]});
}
function buildOneHundredSportsCentres(){
 // Candidate positions sit in the middle of existing city blocks, safely away
 // from the 48m avenues and 8m local streets. Shuffle deterministically so the
 // centres are spread across districts rather than clustered in one corner.
 const candidates=[];
 for(let ix=-73;ix<=73;ix++)for(let iz=-73;iz<=73;iz++){
  const x=35+ix*70,z=35+iz*70;
  if(x<-5145||x>5145||z<-5145||z>5145)continue;
  candidates.push({x,z,score:Math.abs(ix*17+iz*31)%97});
 }
 candidates.sort((a,b)=>a.score-b.score);
 // Select the first 100 available reserved plots in a deterministic spread,
 // then associate each campus with its nearest named district.
 candidates.sort((a,b)=>a.score-b.score);
 for(const c of candidates){
  if(sportsCentreNames.length>=DETAILED_SPORTS_CENTRE_LIMIT)break;
  if(!sportsCentreSiteFree(c.x,c.z))continue;
  buildSportsCentre(c.x,c.z,sportsCentreNames.length,nearestDistrictFor(c.x,c.z));
 }
 return {target:SPORTS_CENTRE_TARGET,created:sportsCentreNames.length};
}
const sportsCentreBuildResult=buildOneHundredSportsCentres();
// Up to 2,400 additional purpose-built, compact sports campuses are instanced in
// reserved road-safe plots. Each includes a court, a green practice area and
// dedicated marked parking; all receive named map entries.
{
 const target=SPORTS_CENTRE_TARGET-sportsCentreNames.length,records=[],used=new Set(sportsCentreNames.map(s=>Math.round((s.x+5145)/70)+','+Math.round((s.z+5145)/70)));
 const courtMat=new THREE.MeshStandardMaterial({color:0x276a9a,roughness:.8}),fieldMat=new THREE.MeshStandardMaterial({color:0x287b43,roughness:.9}),parkMat=new THREE.MeshStandardMaterial({color:0x303735,roughness:.9}),lineMat=new THREE.MeshBasicMaterial({color:0xf4f2e7});
 let n=0;for(let ix=-73;ix<=73&&n<target;ix++)for(let iz=-73;iz<=73&&n<target;iz++){
  const bx=35+ix*70,bz=35+iz*70,key=Math.round((bx+5145)/70)+','+Math.round((bz+5145)/70);
  if(((ix+74)*148+(iz+74))%7!==0||used.has(key))continue;
  // v0.68: centre the campus in the free ground of its block; scale it down only where the block is narrower than 46m.
  const [bx0,bx1]=blockSpan(bx),[bz0,bz1]=blockSpan(bz);
  const sc=Math.min(1,(bx1-bx0)/46,(bz1-bz0)/46),x=(bx0+bx1)/2,z=(bz0+bz1)/2,sz=44*sc;
  if(expandedBuildingOverlap(x,z,sz,sz,2)||amenityColliders.some(c=>x+sz/2+1>c.minX&&x-sz/2-1<c.maxX&&z+sz/2+1>c.minZ&&z-sz/2-1<c.maxZ))continue;
  const label=`SPORTS CENTRE ${String(sportsCentreNames.length+1).padStart(4,'0')}`;
  records.push({x,z,s:sc,label});sportsCentreNames.push({x,z,label,district:nearestDistrictFor(x,z)[0]});
  recordCityFacility('sportscomplex',x,z,sz,sz,label);amenityColliders.push({minX:x-sz/2,maxX:x+sz/2,minZ:z-sz/2,maxZ:z+sz/2});used.add(key);n++;
 }
 function campusInstances(geometry,material,fn){const mesh=new THREE.InstancedMesh(geometry,material,records.length),d=new THREE.Object3D();records.forEach((r,i)=>{fn(d,r);d.updateMatrix();mesh.setMatrixAt(i,d.matrix)});mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=true;scene.add(mesh)}
 campusInstances(new THREE.BoxGeometry(1,1,1),fieldMat,(d,r)=>{d.position.set(r.x-8*r.s,.12,r.z-8*r.s);d.scale.set(21*r.s,.24,13*r.s)});
 campusInstances(new THREE.BoxGeometry(1,1,1),courtMat,(d,r)=>{d.position.set(r.x+9*r.s,.12,r.z-8*r.s);d.scale.set(16*r.s,.24,13*r.s)});
 campusInstances(new THREE.BoxGeometry(1,1,1),parkMat,(d,r)=>{d.position.set(r.x+9*r.s,.08,r.z+16*r.s);d.scale.set(19*r.s,.16,8*r.s)});
 campusInstances(new THREE.BoxGeometry(1,1,1),lineMat,(d,r)=>{d.position.set(r.x+9*r.s,.22,r.z+16*r.s);d.scale.set(18*r.s,.035,.12)});
 const bayMat=new THREE.MeshBasicMaterial({color:0xf4f2e7});
 const bayMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),bayMat,records.length*4),bd=new THREE.Object3D();
 records.forEach((r,i)=>{for(let b=0;b<4;b++){bd.position.set(r.x+(2+b*4)*r.s,.22,r.z+20*r.s);bd.scale.set(.12,.035,5*r.s);bd.updateMatrix();bayMesh.setMatrixAt(i*4+b,bd.matrix)}});
 bayMesh.instanceMatrix.needsUpdate=true;bayMesh.frustumCulled=true;scene.add(bayMesh);
 console.info('Additional instanced sports centres:',n);
}
console.info('This Is Lagos v0.67 sports centres:',sportsCentreBuildResult);
sportsCentreBuildResult.created=sportsCentreNames.length;
console.info('This Is Lagos v0.67 total sports centres:',sportsCentreBuildResult);
if(sportsCentreBuildResult.created<SPORTS_CENTRE_TARGET)console.warn(`Generated ${sportsCentreBuildResult.created} of ${SPORTS_CENTRE_TARGET} planned sports centres; available road-safe plots limited placement.`);

// -----------------------------------------------------------------------------

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
  avatarModel.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false}});
  player.add(avatarModel);player.visible=true;avatarReady=true;
  if(gltf.animations?.length){
    // The game controller moves `player`; root translation inside a clip would
    // move the rig a second time and can cause periodic backwards snapping.
    let removedRootTracks=0;
    const safeClips=gltf.animations.map(clip=>{
      const before=clip.tracks.length;
      clip.tracks=clip.tracks.filter(track=>!/^root\.position(?:\[.*\])?$/i.test(track.name));
      removedRootTracks+=before-clip.tracks.length;
      return clip;
    });
    if(removedRootTracks)console.info(`This Is Lagos: removed ${removedRootTracks} root-position animation track(s) to prevent root-motion conflicts.`);
    avatarMixer=new THREE.AnimationMixer(avatarModel);
    for(const clip of safeClips)avatarActions[clip.name.toLowerCase()]=avatarMixer.clipAction(clip);
    const idle=Object.keys(avatarActions).find(n=>n.includes('idle'))||Object.keys(avatarActions)[0];
    activeAvatarAction=avatarActions[idle];activeAvatarAction?.play();
  }
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
function setDay(){let hour=worldMinutes/60;let daylight=Math.max(0,Math.sin((hour-6)/12*Math.PI));let night=1-daylight;let sky=new THREE.Color().lerpColors(new THREE.Color(0x101d37),new THREE.Color(0x9fc9d4),daylight);if(hour>17||hour<6)sky.lerp(new THREE.Color(0x25324c),.3);scene.background=sky;scene.fog.color.copy(sky);sun.intensity=.25+daylight*2.3;sun.color.setHex(daylight>.3?0xffe7c2:0x9bb8ed);renderer.toneMappingExposure=.55+daylight*.55;document.querySelector('#worldTime').textContent=hour<6||hour>=19?'Night':hour<12?'Morning':hour<17?'Afternoon':'Evening';updateStreetLighting(night);}
function toast(s){const t=document.querySelector('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}
function modal(title,body,actions=[]){document.querySelector('#modalTitle').textContent=title;document.querySelector('#modalBody').innerHTML=body;const a=document.querySelector('#modalActions');a.innerHTML='';actions.forEach(([label,fn,secondary])=>{const b=document.createElement('button');b.textContent=label;if(secondary)b.className='secondary';b.onclick=()=>{closeModal();fn?.()};a.appendChild(b)});document.querySelector('#modalBackdrop').classList.remove('hidden')}
function closeModal(){document.querySelector('#modalBackdrop').classList.add('hidden')}
document.querySelector('#closeModal').onclick=closeModal;
document.querySelector('#cameraBtn').onclick=()=>{cameraMode=(cameraMode+1)%3;document.querySelector('#cameraBtn small').textContent=modes[cameraMode];toast('Camera: '+modes[cameraMode].toLowerCase());updateCamera()};
document.querySelector('#weatherBtn').onclick=()=>{weather=weather==='Clear'?'Rain':'Clear';rainGroup.visible=weather==='Rain';document.querySelector('#weatherLabel').textContent=weather==='Rain'?'🌧 Rain':'☀ Clear';toast('Weather changed to '+weather.toLowerCase())};
document.querySelector('#activityBtn').onclick=()=>{document.querySelector('#activityPanel').classList.toggle('panel-open')};
document.querySelector('#feedClose').onclick=()=>document.querySelector('#activityPanel').classList.remove('panel-open');
document.querySelector('#feedCreate').onclick=()=>openCreateActivity();
document.querySelectorAll('[data-feed-action]').forEach(b=>b.addEventListener('click',()=>{if(typeof handleFeedAction==='function')handleFeedAction(b.dataset.feedAction)}));
document.querySelector('#transportBtn').onclick=()=>openTransport();
document.querySelector('#dealerBtn').onclick=()=>openDealer();
document.querySelector('#vehiclesBtn').onclick=()=>openGarage();

const demoActivities=[
 {id:'builtin-football-01',title:'12 vs 12 Football Match',place:'Lagos Football Arena',address:'Lagos Football Arena, Lagos',kind:'Football',joined:15,total:24,rounds:1,fee:'Free',status:'Recruiting',rules:'Two teams of 12. Standard football rules.'},
 {id:'builtin-tennis-01',title:'Tennis Singles Challenge',place:'Victoria Island Tennis Club',address:'Victoria Island Tennis Club, Lagos',kind:'Tennis',joined:1,total:2,rounds:1,fee:'Free',status:'Recruiting',rules:'Singles match. Standard tennis scoring.'}
];
const ACTIVITY_STORAGE_KEY='til-player-activities-v1';
const ACTIVITY_CATALOGUE_LIMIT=100;
function readPlayerActivities(){
 try{const data=JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY)||'[]');return Array.isArray(data)?data.filter(a=>a&&typeof a==='object'&&a.id&&a.title&&a.place):[]}catch(_e){return[]}
}
function savePlayerActivities(items){localStorage.setItem(ACTIVITY_STORAGE_KEY,JSON.stringify(items.slice(0,ACTIVITY_CATALOGUE_LIMIT)))}
function allActivities(){return [...demoActivities,...readPlayerActivities()]}
function safeActivityText(value,max=120){return String(value??'').trim().slice(0,max).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function openCompetitions(){
 const activities=allActivities();
 const rows=activities.map(a=>`<div class="activity-row"><b>${safeActivityText(a.title)}</b><span>${safeActivityText(a.place)} · ${safeActivityText(a.address||'Venue address to be confirmed')}</span><span>${Number(a.joined)||0}/${Number(a.total)||2} players · ${Number(a.rounds)||1} round(s) · ${safeActivityText(a.fee||'Free')}</span><small>${safeActivityText(a.status||'Recruiting')} · ${safeActivityText(a.kind||'Custom')}</small><button class="panel-button" data-join="${safeActivityText(a.id,80)}" ${Number(a.joined)>=Number(a.total)?'disabled':''}>${Number(a.joined)>=Number(a.total)?'Full':'Join activity'}</button></div>`).join('');
 const customCount=readPlayerActivities().length;
 modal('Activities at Lagos venues',`<p>Browse built-in and player-created activities. To create one, travel to a sports complex and enter its glowing ground circle. Player-created activities are saved on this device and remain available after reopening the game.</p><p><b>Catalogue:</b> ${activities.length} activities · ${customCount}/${ACTIVITY_CATALOGUE_LIMIT} player-created slots used</p>${rows||'<p>No activities have been posted yet.</p>'}<p class="small-note">Joining is currently local to this device. Shared player recruitment and live matches require the multiplayer server. A custom venue must be physically built and verified in the city before its activity can go live.</p>`,[['Create activity',()=>openCreateActivity()],['Close',null,true]]);
 document.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.join,custom=readPlayerActivities(),a=custom.find(x=>String(x.id)===id)||demoActivities.find(x=>String(x.id)===id);
  if(!a)return;
  if(Number(a.joined)<Number(a.total)){
   a.joined=Number(a.joined||0)+1;
   if(custom.includes(a))savePlayerActivities(custom);
   toast('Joined: '+a.title);openCompetitions();
  }else toast('This activity is full');
 });
}
function openCreateActivity(facility=currentActivityFacility){
 if(!facility){toast('Go to a sports complex and stand inside its glowing ground circle to create an activity.');return}
 const distance=Math.hypot(player.position.x-facility.x,player.position.z-facility.z);
 if(distance>5.4){currentActivityFacility=null;toast('You must be inside the facility interaction circle to create an activity.');return}
 const used=readPlayerActivities().length;
 if(used>=ACTIVITY_CATALOGUE_LIMIT){toast('Player-created activity catalogue is full (100).');return}
 const place=safeActivityText(facility.label,80),address=safeActivityText(facilityStreetAddress(facility),120);
 const defaultKind=facilityKindName(facility.type),maxCapacity=facilityCapacity(facility);
 const area=Math.round(facility.w*facility.d);
 modal('Create activity at this complex',`<p><b>Selected venue:</b> ${place}</p><p>${Math.round(facility.w)}m × ${Math.round(facility.d)}m · approximately ${area.toLocaleString('en-NG')} m² · suggested capacity ${maxCapacity} participants</p><p><b>Location:</b> ${address}</p><div class="creator-grid">
 <label>Activity name<input id="newActivity" maxlength="60" placeholder="e.g. Weekend challenge" required></label>
 <label>Activity type<select id="newActivityKind"><option>${defaultKind}</option><option>Football</option><option>Basketball</option><option>Tennis</option><option>Table tennis</option><option>Obstacle course</option><option>Other</option></select></label>
 <label>Participants<input id="newCapacity" type="number" min="2" max="${maxCapacity}" value="${Math.min(2,maxCapacity)}" required></label>
 <label>Number of rounds<input id="newRounds" type="number" min="1" max="100" value="1" required></label>
 </div><label style="display:block;margin-top:10px">Activity rules and winning conditions<textarea id="newRules" maxlength="1000" rows="4" placeholder="Explain how to play, how a winner is decided, and any special rules."></textarea></label>
 <p class="small-note">You can only create an activity while physically inside this complex's ground circle. The venue and address cannot be changed. Participant limits are based on this facility's suggested capacity. The venue's dedicated parking and full activity setup must be verified before public play is enabled.</p>`,[['Save activity',()=>{
  const title=safeActivityText(document.querySelector('#newActivity')?.value,60),kind=safeActivityText(document.querySelector('#newActivityKind')?.value,40),total=Number(document.querySelector('#newCapacity')?.value),rounds=Number(document.querySelector('#newRounds')?.value),rules=safeActivityText(document.querySelector('#newRules')?.value,1000);
  const stillNear=Math.hypot(player.position.x-facility.x,player.position.z-facility.z)<=5.4;
  if(!stillNear){toast('Creation cancelled: return to the facility interaction circle.');return}
  if(!title){toast('Enter an activity name.');openCreateActivity(facility);return}
  if(!Number.isInteger(total)||total<2||total>maxCapacity||!Number.isInteger(rounds)||rounds<1||rounds>100){toast(`Participants must be 2–${maxCapacity}; rounds must be 1–100.`);openCreateActivity(facility);return}
  const items=readPlayerActivities();if(items.length>=ACTIVITY_CATALOGUE_LIMIT){toast('Player-created activity catalogue is full (100).');return}
  const id='player-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  items.push({id,title,kind,place,address,total,joined:1,rounds,fee:'Free',status:'Facility verification required',rules,facilityType:facility.type,facilityX:facility.x,facilityZ:facility.z,facilityWidth:facility.w,facilityDepth:facility.d,createdAt:new Date().toISOString(),venueVerified:false});
  savePlayerActivities(items);toast('Activity saved for '+place+'.');openCompetitions();
 }],['Cancel',null,true]]);
}
function openTransport(){
 modal('Get to the venue',`<p>Choose transport for a demo fare estimate. Fare depends on distance and vehicle type.</p><div class="creator-grid"><label>Destination<select id="tripPlace"><option value="2">Nearby venue · 2 km</option><option value="5">Mid-distance venue · 5 km</option><option value="10">Far venue · 10 km</option><option value="15">Distant venue · 15 km</option></select></label><label>Transport<select id="tripType"><option value="taxi">Taxi</option><option value="danfo">Danfo</option><option value="bike">Okada / bike</option><option value="boat">Boat</option></select></label></div><div id="fareQuote" class="fare-quote">Estimated fare: ₦—</div><p class="small-note">Demo estimate only. No wallet is charged and no real driver is connected.</p>`,[['Close',null,true]]);
 const calc=()=>{const km=Number(document.querySelector('#tripPlace')?.value||2),type=document.querySelector('#tripType')?.value||'taxi';const rate={taxi:180,danfo:55,bike:110,boat:220}[type];document.querySelector('#fareQuote').textContent='Estimated fare: ₦'+Math.max(100,Math.round(km*rate/50)*50).toLocaleString('en-NG')+' · '+km+' km'};
 document.querySelector('#tripPlace').onchange=calc;document.querySelector('#tripType').onchange=calc;calc();
}
const demoStock=[['City compact car','Car','₦8,500,000'],['Family SUV','Car','₦18,000,000'],['Commercial danfo','Bus','₦12,000,000'],['Okada motorcycle','Bike','₦1,200,000'],['Passenger speedboat','Boat','₦25,000,000']];
function openDealer(){const items=demoStock.map((v,i)=>`<div class="activity-row"><b>${v[0]}</b><span>${v[1]} · ${v[2]}</span><button class="panel-button" data-vehicle="${i}">View purchase</button></div>`).join('');modal('Grand Dealership · Isaac Uwadiale Road',`<p><b>Location:</b> Isaac Uwadiale Road, Lagos. Vehicles and prices are set by the game operator. A player may buy for themselves or choose another player as recipient.</p>${items}<p class="small-note">Catalogue prices are illustrative placeholders. Purchases and real-money payment are not enabled in this prototype.</p>`,[['Close',null,true]]);document.querySelectorAll('[data-vehicle]').forEach(b=>b.onclick=()=>{const v=demoStock[Number(b.dataset.vehicle)];modal('Vehicle purchase preview',`<p><b>${v[0]}</b></p><p>Listed demo price: ${v[2]}</p><label class="recipient-label">Recipient player<input id="vehicleRecipient" placeholder="Enter player name" value="Your character"></label><p class="small-note">No payment will be taken in this preview.</p>`,[['Confirm preview',()=>toast('Purchase flow previewed; no charge made.')],['Back',()=>openDealer(),true]])})}
// Vehicle ownership registry — local prototype only. A secure server must become authoritative
// before ownership, unlock credentials, theft reports or purchases are used in multiplayer.
const VEHICLE_REGISTRY_KEY='til-owned-vehicles-v1';
function readOwnedVehicles(){try{const data=JSON.parse(localStorage.getItem(VEHICLE_REGISTRY_KEY)||'[]');return Array.isArray(data)?data:[]}catch(_e){return[]}}
function saveOwnedVehicles(records){localStorage.setItem(VEHICLE_REGISTRY_KEY,JSON.stringify(records))}
function escapeVehicleText(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function createVehicleId(){return 'TIL-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase()}
function createUnlockCode(){return String(Math.floor(100000+Math.random()*900000))}
function registerDemoVehicle(model,type){
 const records=readOwnedVehicles();
 const name=String(avatarSettings?.name||'New Lagosian').slice(0,24);
 const record={id:createVehicleId(),model,type,ownerName:name,ownerId:'local-player',unlockCode:createUnlockCode(),locked:true,status:'registered',parkedAt:null,createdAt:new Date().toISOString(),prototype:true};
 records.push(record);saveOwnedVehicles(records);toast('Test vehicle registered to '+name);openGarage();
}
function isAtCityParking(){return Math.hypot(player.position.x-CITY_PARKING.x,player.position.z-CITY_PARKING.z)<=CITY_PARKING.radius}
function parkOwnedVehicle(vehicleId){
 const records=readOwnedVehicles(),v=records.find(x=>x.id===vehicleId);
 if(!v||v.ownerId!=='local-player'){toast('Only vehicles registered to this character can be parked.');return}
 if(!isAtCityParking()){toast('Walk to the marked City Parking area first.');return}
 if(v.status==='parked'){toast('This vehicle is already parked.');return}
 v.status='parked';v.parkedAt={name:CITY_PARKING.name,x:CITY_PARKING.x,z:CITY_PARKING.z,at:new Date().toISOString()};
 saveOwnedVehicles(records);toast(v.model+' parked in City Parking.');openCityParking();
}
function retrieveOwnedVehicle(vehicleId){
 const records=readOwnedVehicles(),v=records.find(x=>x.id===vehicleId);
 if(!v||v.ownerId!=='local-player'){toast('Only the registered owner can retrieve this vehicle.');return}
 if(!isAtCityParking()){toast('Walk to City Parking to retrieve this vehicle.');return}
 if(v.status!=='parked'){toast('This vehicle is not parked here.');return}
 v.status='registered';v.parkedAt=null;saveOwnedVehicles(records);
 toast(v.model+' retrieved.');openCityParking();
}
function openCityParking(){
 const records=readOwnedVehicles().filter(v=>v.ownerId==='local-player');
 const nearby=isAtCityParking();
 const rows=records.length?records.map((v,i)=>`<div class="activity-row" style="display:block;margin:10px 0;padding:12px"><b>${escapeVehicleText(v.model)}</b><span style="display:block">${escapeVehicleText(v.type)} · ${escapeVehicleText(v.id)}</span><span style="display:block">Status: <b>${v.status==='parked'?'Parked here':'Not parked'}</b></span>${v.status==='parked'?`<button class="panel-button" data-retrieve-vehicle="${i}" ${nearby?'':'disabled'}>Retrieve vehicle</button>`:`<button class="panel-button" data-park-vehicle="${i}" ${nearby?'':'disabled'}>Park vehicle</button>`}</div>`).join(''):'<p>You do not have any vehicles registered to this character yet.</p>';
 const distance=Math.round(Math.hypot(player.position.x-CITY_PARKING.x,player.position.z-CITY_PARKING.z));
 modal('Public City Parking',`<p><b>${CITY_PARKING.name}</b></p><p>${nearby?'You are inside the parking area.':'Walk to the marked parking area to park or retrieve a vehicle.'} ${nearby?'':`Approx. ${distance}m away.`}</p><p>Only vehicles owned by your character can be parked or retrieved. Dealer display vehicles remain in dealer garages.</p>${rows}<p class="small-note">Parking records are saved on this device. Vehicle models are not yet spawned as drivable 3D cars; this update connects parking status to registered ownership.</p>`,[['Back to my garage',()=>openGarage(),true],['Close',null,true]]);
 document.querySelectorAll('[data-park-vehicle]').forEach(b=>b.addEventListener('click',()=>parkOwnedVehicle(records[Number(b.dataset.parkVehicle)]?.id)));
 document.querySelectorAll('[data-retrieve-vehicle]').forEach(b=>b.addEventListener('click',()=>retrieveOwnedVehicle(records[Number(b.dataset.retrieveVehicle)]?.id)));
}
function openGarage(){
 const records=readOwnedVehicles().filter(v=>v.ownerId==='local-player');
 const rows=records.length?records.map((v,i)=>`<div class="activity-row" style="display:block;margin:10px 0;padding:12px"><b>${escapeVehicleText(v.model)}</b><span style="display:block">${escapeVehicleText(v.type)} · ${escapeVehicleText(v.id)}</span><span style="display:block">Owner: ${escapeVehicleText(v.ownerName)} · ${v.locked?'Locked':'Unlocked'}</span><span style="display:block">Parking: ${v.status==='parked'?'Parked at '+escapeVehicleText(v.parkedAt?.name||CITY_PARKING.name):'Not parked'}</span><span style="display:block;font-size:12px;opacity:.8">Unlock code: <b id="vehicleCode-${i}">••••••</b></span><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="panel-button" data-reveal-code="${i}">Show code</button><button class="panel-button" data-copy-code="${i}">Copy code</button></div><small style="display:block;margin-top:7px">Local test record · not a paid or server-verified vehicle</small></div>`).join(''):'<p>No vehicles are registered to this character yet.</p>';
 modal('Vehicle garage & ownership',`<p><b>Your registered vehicles</b></p>${rows}<button class="panel-button" id="openCityParking" style="width:100%;margin:10px 0">Open City Parking</button><button class="panel-button" id="registerTestVehicle" style="width:100%;margin:10px 0">＋ Register a test vehicle</button><p>Each vehicle has a unique vehicle ID, registered owner and six-digit unlock code. The owner is taken from the current character profile.</p><p class="small-note">This is a local prototype: records are saved only in this browser and are not shared with other players. Unlock codes are prototype credentials, not secure anti-theft keys. No payment or real-money wallet is connected.</p>`,[['Close',null,true]]);
 document.querySelector('#openCityParking')?.addEventListener('click',openCityParking);
 document.querySelector('#registerTestVehicle')?.addEventListener('click',()=>{
  const opts=demoStock.map((v,i)=>`<option value="${i}">${escapeVehicleText(v[0])} · ${escapeVehicleText(v[1])}</option>`).join('');
  modal('Register a test vehicle',`<p>Select a vehicle model to create a local ownership record. This does not purchase or spawn a drivable vehicle.</p><label>Vehicle model<select id="testVehicleModel">${opts}</select></label>`,[['Register test record',()=>{const v=demoStock[Number(document.querySelector('#testVehicleModel')?.value)||0];registerDemoVehicle(v[0],v[1])}],['Cancel',()=>openGarage(),true]]);
 });
 document.querySelectorAll('[data-reveal-code]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.revealCode),el=document.querySelector('#vehicleCode-'+i);if(el){el.textContent=records[i]?.unlockCode||'Unavailable';b.textContent='Code shown'}}));
 document.querySelectorAll('[data-copy-code]').forEach(b=>b.addEventListener('click',async()=>{const code=records[Number(b.dataset.copyCode)]?.unlockCode;if(!code)return;try{await navigator.clipboard.writeText(code);toast('Unlock code copied')}catch(_e){toast('Copy is unavailable in this browser; reveal the code instead')}}));
}

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
document.querySelector('#menuBtn').onclick=()=>modal('THIS IS LAGOS','<p>Welcome to the Lagos city prototype.</p><p><b>Prototype controls</b><br>WASD / arrow keys: move<br>Drag: look around<br>C: switch camera<br>Weather button: clear / rain</p><p>This v0.59 build is a local interface prototype. Vehicle ownership records are stored on this device only; shared ownership, secure vehicle keys, purchases, live multiplayer and real-money wallet payments require a secure online backend.</p>',[['Continue',null]]);
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
  cameraDistance=Math.max(45,Math.min(260,cameraDistance+Math.sign(e.deltaY)*7));
  updateCamera();
},{passive:false});
const zoomSlider=document.querySelector('#zoomSlider');
function setCameraZoom(value){
 cameraDistance=45+(Number(value)/100)*215;
 updateCamera();
 if(zoomSlider)zoomSlider.value=String(value);
}
document.querySelector('#zoomInBtn')?.addEventListener('click',()=>setCameraZoom(Math.max(0,Number(zoomSlider?.value??52)-5)));
document.querySelector('#zoomOutBtn')?.addEventListener('click',()=>setCameraZoom(Math.min(100,Number(zoomSlider?.value??52)+5)));
document.querySelector('#zoomResetBtn')?.addEventListener('click',()=>setCameraZoom(52));
zoomSlider?.addEventListener('input',e=>setCameraZoom(e.target.value));
const touchDirs={};document.querySelectorAll('.mobile-pad button').forEach(b=>{const d=b.dataset.dir;b.addEventListener('pointerdown',e=>{e.preventDefault();touchDirs[d]=true});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>touchDirs[d]=false))});
const viewFrustum=new THREE.Frustum();
const viewProjection=new THREE.Matrix4();
let cullFrame=0;
function updateVisibleBuildings(){
 camera.updateMatrixWorld();
 viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 viewFrustum.setFromProjectionMatrix(viewProjection);
 const px=player.position.x,pz=player.position.z;
 for(const item of viewCulledBuildings){
  item.sphere.center.set(item.group.position.x,item.sphere.center.y,item.group.position.z);
  const dx=item.group.position.x-px,dz=item.group.position.z-pz;
  const distanceSq=dx*dx+dz*dz;
  const inView=viewFrustum.intersectsSphere(item.sphere);
  item.group.visible=inView && distanceSq<=item.maxDistance*item.maxDistance;
  const showFacade=distanceSq<=item.detailDistance*item.detailDistance;
  if(item.detailChildren){
   for(const child of item.detailChildren) child.visible=showFacade;
  }
 }
}
// Public city parking: a dedicated, walk-in parking area separate from dealer garages.
// It is placed in a clear city block and registered on the live map.
const CITY_PARKING={name:'Public City Parking',x:105,z:105,radius:34};
amenityColliders.push({minX:CITY_PARKING.x-22,maxX:CITY_PARKING.x+22,minZ:CITY_PARKING.z-22,maxZ:CITY_PARKING.z+22});
block(42,.16,42,asphaltMat,CITY_PARKING.x,-.12,CITY_PARKING.z);
const parkingLineMat=mat(0xe8e8dc);
for(let i=0;i<=6;i++){const x=CITY_PARKING.x-18+i*6;block(.22,.035,28,parkingLineMat,x,.05,CITY_PARKING.z+1);}
block(38,.035,.28,parkingLineMat,CITY_PARKING.x,.05,CITY_PARKING.z-13);
block(38,.035,.28,parkingLineMat,CITY_PARKING.x,.05,CITY_PARKING.z+15);
signBoard('CITY PARKING',CITY_PARKING.x,CITY_PARKING.z-25,24,0x205c82);
recordCityFacility('parking',CITY_PARKING.x,CITY_PARKING.z,42,42,CITY_PARKING.name);

// v0.64: sports facilities have a visible ground interaction circle at their
// actual centre. Activity creation is unlocked only while the character is
// physically standing inside that facility's interaction radius.
const ACTIVITY_FACILITY_TYPES=new Set(['football','tennis','basketball','tabletennis','sportscomplex']);
const activityFacilityMarkers=[];
function facilityStreetAddress(f){
 const vertical=streetName('x',Math.max(-15,Math.min(15,Math.round(f.x/70))));
 const horizontal=streetName('z',Math.max(-15,Math.min(15,Math.round(f.z/70))));
 return `Near ${vertical} and ${horizontal}, Lagos`;
}
function facilityCapacity(f){
 if(f.type==='football'||f.type==='sportscomplex')return 24;
 if(f.type==='tennis')return 6;
 if(f.type==='basketball')return 10;
 if(f.type==='tabletennis')return 4;
 return 2;
}
function facilityKindName(type){return ({football:'Football',tennis:'Tennis',basketball:'Basketball',tabletennis:'Table tennis',sportscomplex:'Multi-sport centre'})[type]||'Sports';}
for(const f of cityMapFacilities){
 if(!ACTIVITY_FACILITY_TYPES.has(f.type))continue;
 const marker=new THREE.Group();marker.position.set(f.x,.14,f.z);scene.add(marker);
 const glow=new THREE.Mesh(new THREE.CircleGeometry(5.2,48),new THREE.MeshBasicMaterial({color:0x1ce6a0,transparent:true,opacity:.12,depthWrite:false}));glow.rotation.x=-Math.PI/2;marker.add(glow);
 const ring=new THREE.Mesh(new THREE.RingGeometry(4.45,4.85,64),new THREE.MeshBasicMaterial({color:0x16e69a,side:THREE.DoubleSide,transparent:true,opacity:.96}));ring.rotation.x=-Math.PI/2;marker.add(ring);
 const inner=new THREE.Mesh(new THREE.RingGeometry(3.9,4.02,64),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.9}));inner.rotation.x=-Math.PI/2;inner.position.y=.015;marker.add(inner);
 activityFacilityMarkers.push({facility:f,marker,glow,ring,radius:5.4,opened:false});
}
let currentActivityFacility=null;
function openFacilityDetails(f){
 currentActivityFacility=f;
 const area=Math.round(f.w*f.d),capacity=facilityCapacity(f),kind=facilityKindName(f.type);
 const address=facilityStreetAddress(f);
 const details=`<div class="activity-row" style="display:block"><b>${safeActivityText(f.label)}</b><span style="display:block">Facility type: ${kind}</span><span style="display:block">Ground footprint: ${Math.round(f.w)}m × ${Math.round(f.d)}m</span><span style="display:block">Approximate site area: ${area.toLocaleString('en-NG')} m²</span><span style="display:block">Suggested activity capacity: ${capacity} participants</span><span style="display:block">Street location: ${safeActivityText(address)}</span><span style="display:block">Dedicated parking: facility parking provision must be completed and verified</span></div><p>You are inside this complex. You can create an activity for this facility now. The venue name and location are locked to this physical complex.</p>`;
 modal('Facility information',details,[['Create activity here',()=>openCreateActivity(f)],['View activities',()=>openCompetitions()],['Close',null,true]]);
}
function updateActivityFacilityProximity(){
 let nearest=null,nearestDistance=Infinity;
 for(const entry of activityFacilityMarkers){
  const f=entry.facility,d=Math.hypot(player.position.x-f.x,player.position.z-f.z);
  entry.glow.material.opacity=.09+.05*Math.sin(performance.now()*.003);
  entry.ring.rotation.z=0;
  if(d<nearestDistance){nearestDistance=d;nearest=entry;}
 }
 if(nearest&&nearestDistance<=nearest.radius){
  if(!nearest.opened){
   for(const entry of activityFacilityMarkers)entry.opened=false;
   nearest.opened=true;openFacilityDetails(nearest.facility);
  }
 }else{
  for(const entry of activityFacilityMarkers)entry.opened=false;
  currentActivityFacility=null;
 }
}

// All trees are registered by now: build instanced meshes, shade patches and trunk colliders.
finalizeTrees();
// Index building footprints into a spatial grid once. Movement checks now inspect
// only the small set of buildings in the player's current grid cell, not the whole city.
const COLLISION_CELL_SIZE=64;
const collisionGrid=new Map();
function collisionCellKey(cx,cz){return `${cx},${cz}`}
for(const b of buildingColliders){
 const minCX=Math.floor(b.minX/COLLISION_CELL_SIZE),maxCX=Math.floor(b.maxX/COLLISION_CELL_SIZE);
 const minCZ=Math.floor(b.minZ/COLLISION_CELL_SIZE),maxCZ=Math.floor(b.maxZ/COLLISION_CELL_SIZE);
 for(let cx=minCX;cx<=maxCX;cx++)for(let cz=minCZ;cz<=maxCZ;cz++){
  const key=collisionCellKey(cx,cz);let list=collisionGrid.get(key);if(!list){list=[];collisionGrid.set(key,list)}list.push(b);
 }
}
function collidesWithBuilding(x,z){
 const list=collisionGrid.get(collisionCellKey(Math.floor(x/COLLISION_CELL_SIZE),Math.floor(z/COLLISION_CELL_SIZE)));
 if(!list)return false;
 for(const b of list){if(x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ)return true;}
 return false;
}

// ============================================================================
// LIVE CITY MAP — lightweight 2D overlay linked to the player's actual 3D
// world position. The map covers the expanded -5250..5250 world bounds as movement.
// ============================================================================
const cityMapStyle=document.createElement('style');
cityMapStyle.textContent=`
 #cityMapToggle{position:fixed;top:14px;right:14px;z-index:12000;border:1px solid rgba(255,255,255,.22);border-radius:11px;background:#16834a;color:#fff;font:800 12px/1 system-ui,sans-serif;letter-spacing:1.1px;padding:12px 16px;box-shadow:0 5px 18px #10251b55;cursor:pointer;touch-action:manipulation}
 #cityMapPanel{position:fixed;top:60px;right:14px;z-index:11999;width:min( min(360px, calc(100vw - 28px)), 360px);padding:12px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:rgba(12,24,19,.96);color:#f5fff7;box-shadow:0 12px 34px #0008;backdrop-filter:blur(12px);font:12px/1.35 system-ui,sans-serif;display:none}
 #cityMapPanel.open{display:block}
 #cityMapHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
 #cityMapHead strong{font-size:13px;letter-spacing:1px}
 #cityMapClose{border:0;border-radius:8px;background:#ffffff18;color:white;font-size:20px;line-height:1;padding:4px 9px;cursor:pointer}
 #cityMapCanvas{display:block;width:100%;height:auto;aspect-ratio:1.24;background:#1e3029;border-radius:9px;border:1px solid #ffffff20}
 #cityMapFoot{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:9px;color:#d6e8dc;font-size:11px}
 #cityMapPosition{font-variant-numeric:tabular-nums;color:#fff}
 #cityMapLegend{margin-top:6px;color:#bcd0c1;font-size:10px;line-height:1.4}
 @media(max-width:520px){#cityMapPanel{top:58px;right:10px;width:min(300px,calc(100vw - 20px));padding:10px}#cityMapToggle{top:10px;right:10px;padding:11px 14px}}
`;
document.head.appendChild(cityMapStyle);
const cityMapToggle=document.createElement('button');cityMapToggle.id='cityMapToggle';cityMapToggle.type='button';cityMapToggle.textContent='MAP';cityMapToggle.setAttribute('aria-expanded','false');cityMapToggle.setAttribute('aria-controls','cityMapPanel');
const cityMapPanel=document.createElement('section');cityMapPanel.id='cityMapPanel';cityMapPanel.setAttribute('aria-label','Lagos city map');
cityMapPanel.innerHTML='<div id="cityMapHead"><strong>LAGOS CITY MAP</strong><button id="cityMapClose" type="button" aria-label="Close map">×</button></div><canvas id="cityMapCanvas" width="620" height="500" aria-label="Map showing roads, districts and your live position"></canvas><div id="cityMapFoot"><span>▲ NORTH</span><span id="cityMapPosition">Locating player…</span></div><div id="cityMapLegend">Buildings · Shops · Parking · Fuel · Markets · Parks · Bus stops · Sports · Named Lagos streets</div>';
document.body.append(cityMapToggle,cityMapPanel);
const cityMapCanvas=document.querySelector('#cityMapCanvas');
const cityMapCtx=cityMapCanvas.getContext('2d');
let cityMapOpen=false,cityMapElapsed=0;
const CITY_MAP_MIN=-5250,CITY_MAP_MAX=5250,CITY_MAP_SPAN=CITY_MAP_MAX-CITY_MAP_MIN;
function cityMapPoint(x,z){return {x:(x-CITY_MAP_MIN)/CITY_MAP_SPAN*cityMapCanvas.width,y:(z-CITY_MAP_MIN)/CITY_MAP_SPAN*cityMapCanvas.height}}
function drawCityMap(){
 if(!cityMapCtx)return;
 const ctx=cityMapCtx,w=cityMapCanvas.width,h=cityMapCanvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#263d32';ctx.fillRect(0,0,w,h);
 // Draw each generated building at its exact 3D world footprint, not generic block squares.
 const sx=w/CITY_MAP_SPAN,sz=h/CITY_MAP_SPAN;
 for(const b of cityMapBuildings){
  const p=cityMapPoint(b.x,b.z),bw=Math.max(1.2,b.w*sx),bh=Math.max(1.2,b.d*sz);
  const kind=b.kind;
  ctx.fillStyle=kind==='office'?'#9ab8c4':kind==='apartment'?'#c5b9a0':kind==='shop'||kind==='market'?'#d5a86c':kind==='tenement'?'#b9a99a':kind==='duplex'?'#c4c7a0':'#b8c8b2';
  ctx.strokeStyle='#26352d';ctx.lineWidth=.65;
  ctx.fillRect(p.x-bw/2,p.y-bh/2,bw,bh);ctx.strokeRect(p.x-bw/2,p.y-bh/2,bw,bh);
 }
 // Actual facility footprints are plotted at the coordinates where their 3D models were created.
 const facilityStyle={sportscomplex:['#f0c64b','SC'],parking:['#6fa8d8','P'],fuel:['#e34e4e','F'],supermarket:['#e7c64d','S'],pharmacy:['#5bc5a0','P'],park:['#65b96b','♣'],tennis:['#5c9fe0','T'],basketball:['#dc8750','B'],football:['#65b96b','⚽'],market:['#d49a52','M'],shop:['#d49a52','s'],tabletennis:['#8a9ee0','TT'],bus:['#63b9d6','BUS']};
 for(const f of cityMapFacilities){
  const p=cityMapPoint(f.x,f.z),fw=Math.max(2,f.w*sx),fh=Math.max(2,f.d*sz),style=facilityStyle[f.type]||['#e4d8a2','•'];
  ctx.fillStyle=style[0];ctx.strokeStyle='#17271f';ctx.lineWidth=.8;
  ctx.fillRect(p.x-fw/2,p.y-fh/2,fw,fh);ctx.strokeRect(p.x-fw/2,p.y-fh/2,fw,fh);
  if(fw>7&&fh>6){ctx.fillStyle='#14251c';ctx.font='bold 8px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(style[1],p.x,p.y)}
 }
 for(let k=-75;k<=75;k++){
  const world=k*70,p=cityMapPoint(world,0),q=cityMapPoint(0,world);
  const major=k%3===0;
  ctx.strokeStyle=major?'#a6b5a4':'#65786b';ctx.lineWidth=major?Math.max(5,w*48/CITY_MAP_SPAN):Math.max(1.5,w*8/CITY_MAP_SPAN);
  ctx.beginPath();ctx.moveTo(p.x,0);ctx.lineTo(p.x,h);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,q.y);ctx.lineTo(w,q.y);ctx.stroke();
 }
 // Street names: every named road is labelled along the top or left map edge.
 // This keeps the complete street directory discoverable without covering buildings.
 ctx.save();ctx.fillStyle='#f4f0d5';ctx.strokeStyle='#203329';ctx.lineWidth=2;ctx.font='600 7px system-ui,sans-serif';
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(let k=-75;k<=75;k++){
  const world=k*70,px=cityMapPoint(world,0).x,py=cityMapPoint(0,world).y;
  ctx.save();ctx.translate(px,7);ctx.rotate(-Math.PI/2);ctx.strokeText(streetName('x',k),0,0,110);ctx.fillText(streetName('x',k),0,0,110);ctx.restore();
  ctx.textAlign='left';ctx.strokeText(streetName('z',k),3,py-3,105);ctx.fillText(streetName('z',k),3,py-3,105);ctx.textAlign='center';
 }
 ctx.restore();
 // District names and location markers use the same coordinates as the 3D city.
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const d of districtDefs){
  const p=cityMapPoint(d[1],d[2]);
  ctx.fillStyle='#f2e9bb';ctx.font='600 11px system-ui,sans-serif';ctx.fillText(d[0],p.x,p.y-8);
  ctx.fillStyle='#e9c75b';ctx.beginPath();ctx.arc(p.x,p.y+5,3.2,0,Math.PI*2);ctx.fill();
 }
 // Player position: bright green pulse and a directional arrow.
 const me=cityMapPoint(player.position.x,player.position.z);
 const pulse=1+Math.sin(performance.now()*.006)*.16;
 ctx.fillStyle='#8cf0a8';ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(me.x,me.y,17*pulse,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 ctx.save();ctx.translate(me.x,me.y);ctx.rotate(Math.PI+player.rotation.y);
 ctx.fillStyle='#ffffff';ctx.strokeStyle='#0b5d35';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(9,10);ctx.lineTo(0,6);ctx.lineTo(-9,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 // Small map frame and north marker.
 ctx.strokeStyle='#ffffff30';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
 const nearest=districtDefs.reduce((best,d)=>{const dist=Math.hypot(player.position.x-d[1],player.position.z-d[2]);return dist<best.dist?{name:d[0],dist}:best},{name:'LAGOS',dist:Infinity});
 const pos=document.querySelector('#cityMapPosition');if(pos)pos.textContent=`${nearest.dist<260?nearest.name:'LAGOS'} · ${Math.round(player.position.x)}, ${Math.round(player.position.z)}`;
}
function setCityMapOpen(open){cityMapOpen=!!open;cityMapPanel.classList.toggle('open',cityMapOpen);cityMapToggle.setAttribute('aria-expanded',String(cityMapOpen));if(cityMapOpen)drawCityMap()}
cityMapToggle.addEventListener('click',()=>setCityMapOpen(!cityMapOpen));
document.querySelector('#cityMapClose').addEventListener('click',()=>setCityMapOpen(false));
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&cityMapOpen)setCityMapOpen(false)});
let uiUpdateElapsed=0;
// Adaptive render resolution: if frame rate drops, lower pixel count without restarting.
// ============================================================================
// v0.68 VIEW-ONLY RENDERING
// Nothing was removed from the city. Instead, everything static is grouped into 300m cells and only the
// cells that are inside the camera frustum AND within draw distance are drawn:
//  * the city-wide instanced meshes (560,000 road-paint dashes, 176,000 pavement/kerb slabs, 19,600 street
//    lamps x5 parts, lamp glow) are split per cell, so the GPU only draws the instances around the player;
//  * ~30,000 individual meshes/groups are parked in per-cell groups whose whole subtree is skipped when
//    the cell is hidden, and whose matrices are frozen (no per-frame matrix work for static scenery).
// Draw distance is graded by object size: small detail 800m, mid-size 1500m, big structures 2600m.
// ============================================================================
const CULL_CELL=300,CULL_SPHERE_R=470,CULL_SPHERE_Y=250;
const CULL_DIST={near:800,mid:1500,far:2600,pool:800,glow:800};
const cullCells=[],cullCellMap=new Map();
const cellFrustum=new THREE.Frustum(),cellProj=new THREE.Matrix4(),cullBox=new THREE.Box3(),cullSize=new THREE.Vector3(),cullCtr=new THREE.Vector3(),cullCol=new THREE.Color(),camWorld=new THREE.Vector3();
function getCullCell(cls,cx,cz,master=null){
 const key=cls+':'+cx+','+cz;let c=cullCellMap.get(key);
 if(!c){
  const group=new THREE.Group();group.matrixAutoUpdate=false;
  group.updateMatrixWorld=function(){};     // frozen subtree: static scenery needs no per-frame matrix work
  const mx=(cx+.5)*CULL_CELL,mz=(cz+.5)*CULL_CELL;
  c={group,cx:mx,cz:mz,dist:CULL_DIST[cls]||CULL_DIST.far,master,sphere:new THREE.Sphere(new THREE.Vector3(mx,CULL_SPHERE_Y,mz),CULL_SPHERE_R)};
  cullCellMap.set(key,c);cullCells.push(c);scene.add(group);
 }
 return c;
}
function cullClassFromSize(a,b,c){
 const m=[a,b,c].sort((p,q)=>p-q)[1];       // median dimension separates slabs/paint/poles from buildings
 return m<3?'near':(m<25?'mid':'far');
}
function chunkInstanced(src,forceCls,master){
 const n=src.count,arr=src.instanceMatrix.array,col=src.instanceColor?src.instanceColor.array:null;
 const dead=o=>arr[o]===0&&arr[o+5]===0&&arr[o+10]===0;       // removed lamps are zero-scaled
 let cls=forceCls;
 if(!cls){
  let k=0;while(k<n&&dead(k*16))k++;
  if(k>=n){scene.remove(src);return 0}
  if(!src.geometry.boundingBox)src.geometry.computeBoundingBox();
  const bb=src.geometry.boundingBox,o=k*16;
  const sx=Math.hypot(arr[o],arr[o+1],arr[o+2]),sy=Math.hypot(arr[o+4],arr[o+5],arr[o+6]),sz=Math.hypot(arr[o+8],arr[o+9],arr[o+10]);
  cls=cullClassFromSize((bb.max.x-bb.min.x)*sx,(bb.max.y-bb.min.y)*sy,(bb.max.z-bb.min.z)*sz);
 }
 const buckets=new Map();
 for(let i=0;i<n;i++){
  const o=i*16;if(dead(o))continue;
  const cx=Math.floor(arr[o+12]/CULL_CELL),cz=Math.floor(arr[o+14]/CULL_CELL),key=cx+','+cz;
  let b=buckets.get(key);if(!b)buckets.set(key,b={cx,cz,idx:[]});b.idx.push(i);
 }
 let made=0;
 for(const b of buckets.values()){
  const m=new THREE.InstancedMesh(src.geometry,src.material,b.idx.length),dst=m.instanceMatrix.array;
  for(let j=0;j<b.idx.length;j++)dst.set(arr.subarray(b.idx[j]*16,b.idx[j]*16+16),j*16);
  if(col){
   m.setColorAt(0,cullCol.setRGB(1,1,1));const dc=m.instanceColor.array;
   for(let j=0;j<b.idx.length;j++){const q=b.idx[j]*3;dc[j*3]=col[q];dc[j*3+1]=col[q+1];dc[j*3+2]=col[q+2]}
   m.instanceColor.needsUpdate=true;
  }
  m.instanceMatrix.needsUpdate=true;m.renderOrder=src.renderOrder;m.castShadow=false;m.receiveShadow=false;
  if(typeof m.computeBoundingSphere==='function'){m.computeBoundingSphere();m.frustumCulled=true}else m.frustumCulled=false;
  getCullCell(cls,b.cx,b.cz,master).group.add(m);made++;
 }
 scene.remove(src);
 return made;
}
function optimizeWorldForView(){
 scene.updateMatrixWorld(true);                       // settle every matrix once, then freeze static cells
 const keep=new Set([player,rainGroup,camera]);
 let chunks=0,grouped=0,rootKept=0;
 for(const L of slRealLights)keep.add(L);
 // Trees keep their own per-chunk LOD/visibility logic; their chunk objects are simply parked in the same cells
 // so that hidden cells skip them entirely (their own .visible flags still work inside a visible cell).
 for(const ch of treeChunks.values()){
  const cell=getCullCell('near',Math.floor(ch.cx/CULL_CELL),Math.floor(ch.cz/CULL_CELL));
  for(const t of [ch.near,ch.far,ch.decals]){cell.group.add(t);grouped++}
 }
 const glowSrc=slGlow,glowAttr=slGlowAttr,glowMat=slGlowMat,poolSrc=slPools;
 const glowFlag={visible:false},poolFlag={visible:false};
 for(const o of scene.children.slice()){
  if(keep.has(o)||o.isLight||o.isCamera)continue;
  if(glowSrc&&o===glowSrc){
   const pos=glowAttr.array,N=glowAttr.count,bk=new Map();
   for(let i=0;i<N;i++){
    if(pos[i*3+1]<-1000)continue;                    // removed lamps
    const cx=Math.floor(pos[i*3]/CULL_CELL),cz=Math.floor(pos[i*3+2]/CULL_CELL),key=cx+','+cz;
    let b=bk.get(key);if(!b)bk.set(key,b={cx,cz,idx:[]});b.idx.push(i);
   }
   for(const b of bk.values()){
    const a=new Float32Array(b.idx.length*3);
    b.idx.forEach((i,j)=>{a[j*3]=pos[i*3];a[j*3+1]=pos[i*3+1];a[j*3+2]=pos[i*3+2]});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(a,3));geo.computeBoundingSphere();
    const pts=new THREE.Points(geo,glowMat);pts.renderOrder=glowSrc.renderOrder;
    getCullCell('glow',b.cx,b.cz,glowFlag).group.add(pts);chunks++;
   }
   scene.remove(o);continue;
  }
  if(o.isInstancedMesh){chunks+=chunkInstanced(o,o===poolSrc?'pool':null,o===poolSrc?poolFlag:null);continue}
  if(o.isPoints||o.isLine||o.isSprite)continue;
  cullBox.setFromObject(o);
  if(cullBox.isEmpty())continue;
  cullBox.getSize(cullSize);
  if(cullSize.x>CULL_CELL*.9||cullSize.z>CULL_CELL*.9){rootKept++;continue}   // roads, ground, water: few, huge, always handled by frustum culling
  cullBox.getCenter(cullCtr);
  const cell=getCullCell(cullClassFromSize(cullSize.x,cullSize.y,cullSize.z),Math.floor(cullCtr.x/CULL_CELL),Math.floor(cullCtr.z/CULL_CELL));
  cell.group.add(o);grouped++;
 }
 // The street-light module toggles these flags at dusk/dawn; they now switch whole sets of chunked pools / glow points.
 slPools=poolFlag;slGlow=glowFlag;
 console.info('This Is Lagos v0.68 view culling:',{cells:cullCells.length,instancedChunks:chunks,objectsParkedInCells:grouped,hugeObjectsKeptAtRoot:rootKept,sceneRootChildren:scene.children.length});
 updateCullCells();
}
function updateCullCells(){
 camera.updateMatrixWorld();
 cellProj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);cellFrustum.setFromProjectionMatrix(cellProj);
 camera.getWorldPosition(camWorld);
 const px=camWorld.x,pz=camWorld.z;
 for(const c of cullCells){
  const dx=c.cx-px,dz=c.cz-pz,reach=c.dist+250;
  let vis=dx*dx+dz*dz<reach*reach;
  if(vis&&c.master)vis=c.master.visible!==false;
  if(vis)vis=cellFrustum.intersectsSphere(c.sphere);
  c.group.visible=vis;
 }
}
let fpsSampleTime=0,fpsFrames=0,slowSamples=0,fastSamples=0;
function animate(){
 requestAnimationFrame(animate);
 if(document.hidden)return;
 const rawDt=clock.getDelta();
 // Keep animation and movement tied to elapsed real time. A small upper bound
 // prevents a large jump after a stalled frame or returning from a hidden tab.
 const frameDt=Math.min(rawDt,.25);
 const uiDt=Math.min(rawDt,.1);
 fpsSampleTime+=rawDt;fpsFrames++;
 if(fpsSampleTime>=2){
  const fps=fpsFrames/fpsSampleTime;fpsSampleTime=0;fpsFrames=0;
  if(fps<27){slowSamples++;fastSamples=0}else if(fps>44){fastSamples++;slowSamples=0}else{slowSamples=0;fastSamples=0}
  let nextScale=renderScale;
  if(slowSamples>=2)nextScale=Math.max(.8,renderScale-.05);else if(fastSamples>=3)nextScale=Math.min(1.0,renderScale+.05);
  if(nextScale!==renderScale){renderScale=nextScale;renderer.setPixelRatio(maxDevicePixelRatio*renderScale);renderer.setSize(innerWidth,innerHeight);slowSamples=0;fastSamples=0;}
 }
 worldMinutes=(worldMinutes+uiDt*daySpeed)%1440;uiUpdateElapsed+=uiDt;
 if(cityMapOpen){cityMapElapsed+=uiDt;if(cityMapElapsed>=.12){cityMapElapsed=0;drawCityMap()}}
 if(uiUpdateElapsed>=.25){
  uiUpdateElapsed=0;let h=Math.floor(worldMinutes/60),m=Math.floor(worldMinutes%60);
  const clockEl=document.querySelector('#clock');if(clockEl)clockEl.textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  const districtEl=document.querySelector('.stat-row b');
  if(districtEl){let nearest=districtDefs.reduce((best,d)=>{const dist=Math.hypot(player.position.x-d[1],player.position.z-d[2]);return dist<best.dist?{name:d[0],dist}:best},{name:'Lagos Mainland',dist:1e9});districtEl.textContent=nearest.dist<260?nearest.name:'Lagos';}
  setDay();
 }
 let forward=(keys.w||keys.arrowup||touchDirs.up?1:0)-(keys.s||keys.arrowdown||touchDirs.down?1:0);
 let side=(keys.d||keys.arrowright||touchDirs.right?1:0)-(keys.a||keys.arrowleft||touchDirs.left?1:0);
 moving=!!(forward||side);
 const running=moving&&!!(keys.shift||touchDirs.run);
 if(avatarMixer){
  const names=Object.keys(avatarActions);
  const idleName=names.find(n=>n.includes('idle'));
  const walkName=names.find(n=>n.includes('walk'));
  const runName=names.find(n=>n.includes('run'));
  const desired=moving?(running?(runName||walkName||runName):(walkName||runName)):(idleName||names[0]);
  const next=avatarActions[desired]||avatarActions[names[0]];
  if(next&&next!==activeAvatarAction){next.reset().fadeIn(.2).play();activeAvatarAction?.fadeOut(.2);activeAvatarAction=next;}
  if(activeAvatarAction)activeAvatarAction.timeScale=(running&&!runName)?1.2:1;
  // Use elapsed frame time, not the old 50ms simulation cap, so animation
  // doesn't visibly fall into slow motion on slower devices.
  avatarMixer.update(frameDt);
 }
 if(moving){
  let ix=Math.sin(lookAngle)*forward+Math.cos(lookAngle)*side;
  let iz=Math.cos(lookAngle)*forward-Math.sin(lookAngle)*side;
  const inputLength=Math.hypot(ix,iz)||1;ix/=inputLength;iz/=inputLength;
  const unitsPerSecond=running?5.0:2.3;
  const distance=unitsPerSecond*frameDt;
  const dx=ix*distance,dz=iz*distance;
  // Substeps keep wall collisions reliable even when the frame rate dips.
  const steps=Math.max(1,Math.ceil(distance/.2));
  const stepX=dx/steps,stepZ=dz/steps;
  for(let i=0;i<steps;i++){
   const nextX=Math.max(-5210,Math.min(5210,player.position.x+stepX));
   const nextZ=Math.max(-5210,Math.min(5210,player.position.z+stepZ));
   if(!collidesWithBuilding(nextX,player.position.z))player.position.x=nextX;
   if(!collidesWithBuilding(player.position.x,nextZ))player.position.z=nextZ;
  }
  player.rotation.y=Math.atan2(dx,dz);
  if(body)body.position.y=1.05+Math.sin(performance.now()*.012)*.045;
 }
 updateActivityFacilityProximity();
 if(weather==='Rain'){for(const d of drops){d.position.y-=uiDt*18;if(d.position.y<0){d.position.y=35;d.position.x=player.position.x+(Math.random()-.5)*180;d.position.z=player.position.z+(Math.random()-.5)*180}}}
 updateCamera();updateCullCells();if((cullFrame++%3)===0){updateVisibleBuildings();updateTreeVisibility();}renderer.render(scene,camera);
}
updateCamera();
console.info('This Is Lagos v0.66 expanded city:',{landAreaMultiplier:25,linearFootprintMultiplier:5,districts:districtDefs.length,buildings:cityMapBuildings.length,facilities:cityMapFacilities.length,sportsCentres:sportsCentreNames.length});
optimizeWorldForView();
const clock=new THREE.Clock();animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(maxDevicePixelRatio*renderScale);renderer.setSize(innerWidth,innerHeight)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)clock.getDelta()});
toast('Facility interaction circles and on-site activity creation loaded');
