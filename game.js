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
// simple player avatar
const player=new THREE.Group();scene.add(player);
const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.85,4,8),green);body.position.y=1.05;body.castShadow=true;player.add(body);
const head=new THREE.Mesh(new THREE.SphereGeometry(.29,16,12),mat(0x8b5a3c));head.position.y=1.95;head.castShadow=true;player.add(head);
const hair=new THREE.Mesh(new THREE.SphereGeometry(.3,16,8,0,Math.PI*2,0,Math.PI/2),dark);hair.position.y=2.08;player.add(hair);
const legMat=mat(0x243b32);for(let x of [-.18,.18]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.55,3,7),legMat);leg.position.set(x,.38,0);player.add(leg)}
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
document.querySelector('#profileBtn').onclick=()=>modal('Your player profile','<label>Display name<br><input id="nameInput" value="New Lagosian" maxlength="24" style="width:100%;padding:11px;border:1px solid #d8e6da;border-radius:9px;margin-top:6px"></label><p>Profile setup, verified qualifications and clothing inventory will be added in the next development stage.</p>',[['Save name',()=>{let n=document.querySelector('#nameInput')?.value?.trim();if(n){document.querySelector('.player-name').textContent=n;toast('Profile name saved on this device')}}]]);
document.querySelector('#menuBtn').onclick=()=>modal('THIS IS LAGOS','<p>Welcome to the Lagos city prototype.</p><p><b>Prototype controls</b><br>WASD / arrow keys: move<br>Drag: look around<br>C: switch camera<br>Weather button: clear / rain</p><p>This prototype currently runs locally in your browser. Online accounts, multiplayer, trading and real-money payments are not connected yet.</p>',[['Continue',null]]);
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='c')document.querySelector('#cameraBtn').click()});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
let pointer=null;renderer.domElement.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,id:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId)});renderer.domElement.addEventListener('pointermove',e=>{if(pointer&&pointer.id===e.pointerId){lookAngle+=(e.clientX-pointer.x)*.005;lookPitch=Math.max(-.35,Math.min(.7,lookPitch+(e.clientY-pointer.y)*.003));pointer.x=e.clientX;pointer.y=e.clientY}});renderer.domElement.addEventListener('pointerup',()=>pointer=null);renderer.domElement.addEventListener('pointercancel',()=>pointer=null);
const touchDirs={};document.querySelectorAll('.mobile-pad button').forEach(b=>{const d=b.dataset.dir;b.addEventListener('pointerdown',e=>{e.preventDefault();touchDirs[d]=true});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>touchDirs[d]=false))});
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);worldMinutes=(worldMinutes+dt*daySpeed)%1440;let h=Math.floor(worldMinutes/60),m=Math.floor(worldMinutes%60);document.querySelector('#clock').textContent=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');setDay();let forward=(keys.w||keys.arrowup||touchDirs.up?1:0)-(keys.s||keys.arrowdown||touchDirs.down?1:0);let side=(keys.d||keys.arrowright||touchDirs.right?1:0)-(keys.a||keys.arrowleft||touchDirs.left?1:0);moving=!!(forward||side);if(moving){const speed=dt*7;const dx=(Math.sin(lookAngle)*forward+Math.cos(lookAngle)*side)*speed;const dz=(Math.cos(lookAngle)*forward-Math.sin(lookAngle)*side)*speed;player.position.x+=dx;player.position.z+=dz;player.rotation.y=Math.atan2(dx,dz);player.position.x=Math.max(-8,Math.min(8,player.position.x));player.position.z=Math.max(-120,Math.min(120,player.position.z));body.position.y=1.05+Math.sin(performance.now()*.012)*.045}if(weather==='Rain'){for(const d of drops){d.position.y-=dt*18;if(d.position.y<0){d.position.y=35;d.position.x=player.position.x+(Math.random()-.5)*70;d.position.z=player.position.z+(Math.random()-.5)*70}}}updateCamera();renderer.render(scene,camera)}
const clock=new THREE.Clock();animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
toast('Welcome to This Is Lagos — explore the city');
