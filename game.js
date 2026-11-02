import * as THREE from 'three';

const mount=document.querySelector('#game');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9fc9d4);
scene.fog=new THREE.Fog(0x9fc9d4,45,180);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,500);
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
rebuildAvatar();
try{const saved=JSON.parse(localStorage.getItem('til-character')||'null');if(saved){rebuildAvatar(saved);document.querySelector('.player-name').textContent=saved.name||'New Lagosian'}}catch(e){}
player.position.set(0,0,5);
const rainGroup=new THREE.Group();scene.add(rainGroup);const drops=[];
for(let i=0;i<500;i++){const d=new THREE.Mesh(new THREE.BoxGeometry(.025,.45,.025),new THREE.MeshBasicMaterial({color:0xd9efff,transparent:true,opacity:.55}));d.position.set((Math.random()-.5)*70,Math.random()*35,(Math.random()-.5)*70);rainGroup.add(d);drops.push(d)}
rainGroup.visible=false;
let cameraMode=0,weather='Clear',worldMinutes=12*60,daySpeed=3,lookAngle=0,lookPitch=.18;
const modes=['THIRD PERSON','FIRST PERSON','ISOMETRIC'];
const keys={};let moving=false;
function updateCamera(){if(cameraMode===0){const dist=7;camera.position.set(player.position.x+Math.sin(lookAngle)*dist,player.position.y+3+lookPitch*5,player.position.z+Math.cos(lookAngle)*dist);camera.lookAt(player.position.x,player.position.y+1.2,player.position.z)}else if(cameraMode===1){camera.position.set(player.position.x,player.position.y+1.7,player.position.z);camera.rotation.set(0,lookAngle+Math.PI,0);camera.rotateX(-lookPitch)}else{camera.position.set(player.position.x+13,player.position.y+17,player.position.z+13);camera.lookAt(player.position.x,0,player.position.z)}}
function setDay(){let hour=worldMinutes/60;let daylight=Math.max(0,Math.sin((hour-6)/12*Math.PI));let night=1-daylight;let sky=new THREE.Color().lerpColors(new THREE.Color(0x101d37),new THREE.Color(0x9fc9d4),daylight);if(hour>17||hour<6)sky.lerp(new THREE.Color(0x25324c),.3);scene.background=sky;scene.fog.color.copy(sky);sun.intensity=.25+daylight*2.3;sun.color.setHex(daylight>.3?0xffe7c2:0x9bb8ed);renderer.toneMappingExposure=.55+daylight*.55;document.querySelector('#worldTime').textContent=hour<6||hour>=19?'Night':hour<12?'Morning':hour<17?'Afternoon':'Evening';}
function toast(s){const t=document.querySelector('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}
function modal(title,body,actions=[]){document.querySelector('#modalTitle').textContent=title;document.querySelector('#modalBody').innerHTML=body;const a=document.querySelector('#modalActions');a.innerHTML='';actions.forEach(([label,fn,secondary])=>{const b=document.createElement('button');b.textContent=label;if(secondary)b.className='secondary';b.onclick=()=>{closeModal();fn?.()};a.appendChild(b)});document.querySelector('#modalBackdrop').classList.remove('hidden')}
function closeModal(){document.querySelector('#modalBackdrop').classList.add('hidden')}
document.querySelector('#closeModal').onclick=closeModal;
document.querySelector('#cameraBtn').onclick=()=>{cameraMode=(cameraMode+1)%3;document.querySelector('#cameraBtn small').textContent=modes[cameraMode];toast('Camera: '+modes[cameraMode].toLowerCase());updateCamera()};
document.querySelector('#weatherBtn').onclick=()=>{weather=weather==='Clear'?'Rain':'Clear';rainGroup.visible=weather==='Rain';document.querySelector('#weatherLabel').textContent=weather==='Rain'?'🌧 Rain':'☀ Clear';toast('Weather changed to '+weather.toLowerCase())};
document.querySelector('#activityBtn').onclick=()=>modal('What would you like to do?','Choose an activity in this early city prototype. More activities will arrive as the world expands.',[['Explore the street',()=>toast('Enjoy exploring Lagos!')],['Close',null,true]]);
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
      rebuildAvatar(settings);localStorage.setItem('til-character',JSON.stringify(settings));
      document.querySelector('.player-name').textContent=settings.name;toast('Character updated!');
    }],['Cancel',null,true]]
  );
};
document.querySelector('#menuBtn').onclick=()=>modal('THIS IS LAGOS','<p>Welcome to the Lagos city prototype.</p><p><b>Prototype controls</b><br>WASD / arrow keys: move<br>Drag: look around<br>C: switch camera<br>Weather button: clear / rain</p><p>This prototype currently runs locally in your browser. Online accounts, multiplayer, trading and real-money payments are not connected yet.</p>',[['Continue',null]]);
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='c')document.querySelector('#cameraBtn').click()});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
let pointer=null;renderer.domElement.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,id:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(pointer&&pointer.id===e.pointerId){lookAngle+=(e.clientX-pointer.x)*.005;lookPitch=Math.max(-.35,Math.min(.7,lookPitch+(e.clientY-pointer.y)*.003));pointer.x=e.clientX;pointer.y=e.clientY}});renderer.domElement.addEventListener('pointerup',()=>pointer=null);renderer.domElement.addEventListener('pointercancel',()=>pointer=null);
const touchDirs={};document.querySelectorAll('.mobile-pad button').forEach(b=>{const d=b.dataset.dir;b.addEventListener('pointerdown',e=>{e.preventDefault();touchDirs[d]=true});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>touchDirs[d]=false))});
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);worldMinutes=(worldMinutes+dt*daySpeed)%1440;let h=Math.floor(worldMinutes/60),m=Math.floor(worldMinutes%60);document.querySelector('#clock').textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');setDay();let forward=(keys.w||keys.arrowup||touchDirs.up?1:0)-(keys.s||keys.arrowdown||touchDirs.down?1:0);let side=(keys.d||keys.arrowright||touchDirs.right?1:0)-(keys.a||keys.arrowleft||touchDirs.left?1:0);moving=!!(forward||side);if(moving){const speed=dt*7;const dx=(Math.sin(lookAngle)*forward+Math.cos(lookAngle)*side)*speed;const dz=(Math.cos(lookAngle)*forward-Math.sin(lookAngle)*side)*speed;player.position.x+=dx;player.position.z+=dz;player.rotation.y=Math.atan2(dx,dz);player.position.x=Math.max(-8,Math.min(8,player.position.x));player.position.z=Math.max(-120,Math.min(120,player.position.z));body.position.y=1.05+Math.sin(performance.now()*.012)*.045}if(weather==='Rain'){for(const d of drops){d.position.y-=dt*18;if(d.position.y<0){d.position.y=35;d.position.x=player.position.x+(Math.random()-.5)*70;d.position.z=player.position.z+(Math.random()-.5)*70}}}updateCamera();renderer.render(scene,camera)}
const clock=new THREE.Clock();animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
toast('Welcome to This Is Lagos — explore the city');
