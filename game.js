import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const mount=document.querySelector('#game');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x9fc9d4);
scene.fog=new THREE.Fog(0x9fc9d4,220,700);
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,1200);
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
for(let i=0;i<500;i++){const d=new THREE.Mesh(new THREE.BoxGeometry(.025,.45,.025),new THREE.MeshBasicMaterial({color:0xd9efff,transparent:true,opacity:.55}));d.position.set((Math.random()-.5)*70,Math.random()*35,(Math.random()-.5)*70);rainGroup.add(d);drops.push(d)}
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
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);worldMinutes=(worldMinutes+dt*daySpeed)%1440;let h=Math.floor(worldMinutes/60),m=Math.floor(worldMinutes%60);document.querySelector('#clock').textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');setDay();let forward=(keys.w||keys.arrowup||touchDirs.up?1:0)-(keys.s||keys.arrowdown||touchDirs.down?1:0);let side=(keys.d||keys.arrowright||touchDirs.right?1:0)-(keys.a||keys.arrowleft||touchDirs.left?1:0);moving=!!(forward||side);if(avatarMixer){const desired=Object.keys(avatarActions).find(n=>moving?n.includes('walk-loop'):n.includes('idle'))||Object.keys(avatarActions)[0];const next=avatarActions[desired];if(next&&next!==activeAvatarAction){next.reset().fadeIn(.2).play();activeAvatarAction?.fadeOut(.2);activeAvatarAction=next;}avatarMixer.update(dt)}if(moving){const speed=dt*7;const dx=(Math.sin(lookAngle)*forward+Math.cos(lookAngle)*side)*speed;const dz=(Math.cos(lookAngle)*forward-Math.sin(lookAngle)*side)*speed;player.position.x+=dx;player.position.z+=dz;player.rotation.y=Math.atan2(dx,dz);player.position.x=Math.max(-8,Math.min(8,player.position.x));player.position.z=Math.max(-120,Math.min(120,player.position.z));if(body)body.position.y=1.05+Math.sin(performance.now()*.012)*.045}if(weather==='Rain'){for(const d of drops){d.position.y-=dt*18;if(d.position.y<0){d.position.y=35;d.position.x=player.position.x+(Math.random()-.5)*70;d.position.z=player.position.z+(Math.random()-.5)*70}}}updateCamera();renderer.render(scene,camera)}
updateCamera();
const clock=new THREE.Clock();animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
toast('Welcome to This Is Lagos — explore the city');
