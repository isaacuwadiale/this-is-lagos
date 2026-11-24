// THIS IS LAGOS v0.81-HIGHRISE-AVENUES: avenues only, big modern high-rise towers, streamed + instanced chunks
// Target: < 400 MB on phones. Add ?debug to the URL to log draw calls / GPU memory.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth < 768 || /[?&]low/.test(location.search);
const DEBUG = /[?&]debug/.test(location.search);
const NO_AVATAR = /[?&]noavatar/.test(location.search);   // diagnostic: skip the GLB character
const CITY_HALF = 5250, CHUNK_SIZE = 300;
const LOAD_RADIUS = IS_MOBILE ? 480 : 1050;
const UNLOAD_RADIUS = LOAD_RADIUS + (IS_MOBILE ? 150 : 300);
const FOG_FAR = LOAD_RADIUS * 0.95;            // fog fully hides the edge of the loaded area (no pop-in)
const TREE_SHADE_DECALS = !IS_MOBILE;          // transparent decals cost fill-rate on phones

const mount = document.querySelector('#game');
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9fc9d4);
scene.background = SKY;
scene.fog = new THREE.Fog(0x9fc9d4, FOG_FAR * 0.4, FOG_FAR);

const player = new THREE.Group();
scene.add(player);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1.0, LOAD_RADIUS * 1.05);
camera.position.set(0, 5, 9);

const renderer = new THREE.WebGLRenderer({
  antialias: !IS_MOBILE,
  powerPreference: IS_MOBILE ? 'default' : 'high-performance',
  stencil: false
});
let renderScale = IS_MOBILE ? 0.85 : 1.0;
const MAX_DPR = IS_MOBILE ? 1.0 : Math.min(devicePixelRatio || 1, 1.15);
renderer.setPixelRatio(MAX_DPR * renderScale);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
mount.appendChild(renderer.domElement);

let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; });
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; }); // three re-uploads resources itself

scene.add(new THREE.HemisphereLight(0xe7fff0, 0x71856d, 2));
const sun = new THREE.DirectionalLight(0xfff2d5, 2.5);
sun.position.set(-35, 55, 25);
scene.add(sun);
const TREE_SUN = sun.position;

// ============================================================================
// SHARED GEOMETRY + MATERIALS (Lambert on mobile: much cheaper fragment shader)
// ============================================================================
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE_XZ = new THREE.PlaneGeometry(1, 1); UNIT_PLANE_XZ.rotateX(-Math.PI / 2); // flat, faces up
const UNIT_PLANE_XY = new THREE.PlaneGeometry(1, 1);                                    // upright, faces +Z

function newMat(o) {
  if (!IS_MOBILE) return new THREE.MeshStandardMaterial(o);
  const { roughness, metalness, ...rest } = o;
  return new THREE.MeshLambertMaterial(rest);
}
const matCache = new Map();
function mat(color, roughness = 0.85, metalness = 0) {
  const k = color + '_' + roughness + '_' + metalness;
  let m = matCache.get(k);
  if (!m) matCache.set(k, m = newMat({ color, roughness, metalness }));
  return m;
}
const basicCache = new Map();
function basicMat(color, pf = 0) {
  const k = color + '_' + pf;
  let m = basicCache.get(k);
  if (!m) basicCache.set(k, m = new THREE.MeshBasicMaterial({ color, polygonOffset: !!pf, polygonOffsetFactor: pf, polygonOffsetUnits: pf }));
  return m;
}

const instMat = mat(0xffffff, 0.86);       // white base; every instance carries its own colour
const cityGroundMat = newMat({ color: 0x789b70, roughness: 0.85 });
cityGroundMat.polygonOffset = true; cityGroundMat.polygonOffsetFactor = 2; cityGroundMat.polygonOffsetUnits = 2;
const asphaltMat = newMat({ color: 0x303735, roughness: 0.85 });
asphaltMat.polygonOffset = true; asphaltMat.polygonOffsetFactor = -1; asphaltMat.polygonOffsetUnits = -1;
const pavementMat = mat(0xa8452f, 0.92), kerbEdgeMat = mat(0xd8d2c4);   // red brick walkway + pale kerb
const paintWhite = basicMat(0xf4f2df, -2), paintYellow = basicMat(0xf1c84b, -2);
const lagoonMat = mat(0x3f8f9a, 0.35, 0.12), sandMat = mat(0xc7ad83);

const C = { glass: 0x5e9295, sportGreen: 0x287b43, sportBlue: 0x276a9a, sportRed: 0xb74b3b, market: 0xd5b46e, line: 0xe8e8dc, plaza: 0xbfc9bd, hall: 0xe1dfd2 };
const WALLS = [0xd9d1bd, 0xe2dfd1, 0xc8d3c9, 0xd6c3a8, 0xbfc9c4, 0xe8e2d2, 0xc7b8a5, 0xd7d9cf];
const ROOFS = [0x9a5544, 0x9c674b, 0x6d7770, 0x8b4e3f, 0xb5a18a];

function staticBox(w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(UNIT_BOX, m);
  o.scale.set(w, h, d); o.position.set(x, y + h / 2, z);
  o.matrixAutoUpdate = false; o.updateMatrix(); scene.add(o);
}
staticBox(10500, 0.35, 10500, cityGroundMat, 0, -0.55, 0);   // top at -0.20: roads sit well above it
staticBox(690, 0.5, 230, lagoonMat, 610, -0.52, 930);   // top now sits just above the ground (was a 0.22 slab)
staticBox(720, 0.12, 34, sandMat, 590, -0.12, 805);

// ============================================================================
// INSTANCING HELPER
// ============================================================================
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
function batch(recs, geo, material, group, colored = false, order = 0) {
  const n = recs.length;
  if (!n) return null;
  const mesh = new THREE.InstancedMesh(geo, material, n);
  for (let i = 0; i < n; i++) {
    const r = recs[i];
    _p.set(r.x, r.y, r.z); _q.setFromAxisAngle(AXIS_Y, r.ry || 0); _s.set(r.sx, r.sy, r.sz);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    if (colored) { if (r.tr !== undefined) _c.setRGB(r.tr, r.tg, r.tb); else _c.setHex(r.color); mesh.setColorAt(i, _c); }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (mesh.computeBoundingSphere) mesh.computeBoundingSphere(); else mesh.frustumCulled = false; // old three: bounds ignore instances
  mesh.renderOrder = order;
  group.add(mesh);
  return mesh;
}

// ============================================================================
// STREET NAMES + REGISTRIES
// ============================================================================
const verticalStreetNames = [
  'Badagry Expressway', 'Murtala Muhammed Way', 'Agege Motor Road', 'Ikorodu Road', 'Herbert Macaulay Way',
  'Yaba Road', 'Oshodi-Apapa Expressway', 'Western Avenue', 'Funsho Williams Avenue', 'Eko Bridge Approach',
  'Marina Street', 'Broad Street', 'Nnamdi Azikiwe Street', 'Idumagbo Avenue', 'Balogun Street',
  'Isaac Uwadiale Road', 'Igbosere Road', 'Bourdillon Road', 'Alexander Road', 'Awolowo Road',
  'Adeola Odeku Street', 'Ahmadu Bello Way', 'Ozumba Mbadiwe Avenue', 'Akin Adesola Street', 'Ligali Ayorinde Street',
  'Ajose Adeogun Street', 'Sanusi Fafunwa Street', 'Bishop Oluwole Street', 'Admiralty Way', 'Fola Osibo Road', 'Lekki-Epe Expressway'
];
const horizontalStreetNames = [
  'Ojo-Igbede Road', 'Festac Link Road', 'Amuwo Odofin Road', 'Mile 2 Road', 'Apapa-Oshodi Expressway',
  'Ijora Causeway', 'Eko Bridge Road', 'Carter Bridge Road', 'Tinubu Street', 'Martins Street',
  'Lagos Island Road', 'Campbell Street', 'Kofo Abayomi Street', 'Onikan Road', 'King George V Road',
  'Oniru Estate Road', 'Thompson Avenue', 'Gerrard Road', 'Ikoyi Crescent', 'Queens Drive',
  'Admiralty Road', 'Freedom Way', 'Jakande Roundabout Road', 'Chevron Drive', 'Orchid Road',
  'Allen Avenue', 'Opebi Road', 'Obafemi Awolowo Way', 'Adeniyi Jones Avenue', 'Mobolaji Bank Anthony Way', 'Ikeja Along Road'
];
function streetName(axis, index) {
  const names = axis === 'x' ? verticalStreetNames : horizontalStreetNames;
  if (index >= -15 && index <= 15) return names[index + 15];
  return `${axis === 'x' ? 'Lagos North-South' : 'Lagos East-West'} Street ${String(index + 75).padStart(3, '0')}`;
}

const buildingColliders = [];   // detailed district buildings only (~150)
const amenityColliders = [];
const cityMapBuildings = [];
const cityMapFacilities = [];
const recordCityFacility = (type, x, z, w, d, label) => cityMapFacilities.push({ type, x, z, w, d, label: label || type.toUpperCase() });

const chunkBlueprints = new Map();   // only holds small data: detailed buildings, facilities, signs
const loadedChunks = new Map();
const chunkKey = (cx, cz) => cx + ',' + cz;
function getBlueprint(cx, cz) {
  const k = chunkKey(cx, cz);
  let bp = chunkBlueprints.get(k);
  if (!bp) chunkBlueprints.set(k, bp = { buildings: [], signs: [], facilities: [] });
  return bp;
}
const blueprintAtWorld = (x, z) => getBlueprint(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));

// ============================================================================
// PROCEDURAL PALMS (geometry built once, shared by every chunk)
// ============================================================================
const treeRand = (() => { let s = 20260512; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
const treeHash = (x, z, k = 0) => { const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
const tcol = hex => new THREE.Color(hex);
function TreePart() { return { pos: [], nor: [], col: [], idx: [] }; }
function treeVert(part, px, py, pz, nx, ny, nz, c) {
  const l = Math.hypot(nx, ny, nz) || 1;
  part.pos.push(px, py, pz); part.nor.push(nx / l, ny / l, nz / l); part.col.push(c.r, c.g, c.b);
  return part.pos.length / 3 - 1;
}
function treeTube(part, pts, radii, sides, colorAt) {
  const base = part.pos.length / 3;
  const T = new THREE.Vector3(), S = new THREE.Vector3(), U = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    S.crossVectors(T, Math.abs(T.y) > 0.95 ? side : up).normalize();
    U.crossVectors(S, T).normalize();
    colorAt(i / (pts.length - 1), i, c);
    for (let k = 0; k <= sides; k++) {
      const an = (k / sides) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      const dx = ca * S.x + sa * U.x, dy = ca * S.y + sa * U.y, dz = ca * S.z + sa * U.z;
      treeVert(part, pts[i][0] + dx * radii[i], pts[i][1] + dy * radii[i], pts[i][2] + dz * radii[i], dx, dy, dz, c);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * (sides + 1) + k, b = a + 1, c2 = a + sides + 1, d = c2 + 1;
    part.idx.push(a, c2, b, b, c2, d);
  }
}
function treeGeo(part) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(part.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(part.col, 3));
  g.setIndex(part.idx);
  return g;
}
function buildPalm(v) {
  const part = TreePart(), H = v === 0 ? 14.5 : 17, lean = v === 0 ? 1.6 : -2.1, N = 9, pts = [], rad = [];
  const b0 = tcol(0x8b7b66), b1 = tcol(0x5f5342);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([lean * t * t, H * t, Math.sin(t * Math.PI) * 0.35 * (v ? 1 : -1)]);
    rad.push(0.36 + 0.34 * Math.pow(1 - t, 2.2) + (i === 0 ? 0.1 : 0));
  }
  treeTube(part, pts, rad, 5, (t, i, c) => c.copy(b0).lerp(b1, t * 0.5).multiplyScalar(i % 2 ? 0.86 : 1.04));
  const top = pts[N], leafDark = tcol(0x2a6a2c), leafLight = tcol(0x86bb4c), c = new THREE.Color(), FR = 10, NS = 7;
  for (let f = 0; f < FR; f++) {
    const a = (f / FR) * Math.PI * 2 + treeRand() * 0.3, L = 5.6 + treeRand() * 1.6, pitch0 = 0.95 - (f % 4) * 0.45;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, sp = [[top[0], top[1] + 0.2, top[2]]];
    let px = top[0], py = top[1] + 0.2, pz = top[2];
    for (let j = 1; j <= NS; j++) {
      const t = j / NS, pitch = pitch0 - t * 2.5, dl = L / NS;
      px += dx * Math.cos(pitch) * dl; pz += dz * Math.cos(pitch) * dl; py += Math.sin(pitch) * dl;
      sp.push([px, py, pz]);
    }
    for (let j = 1; j < NS; j++) {
      const t = j / NS, ll = (0.55 + 1.7 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05))) * (L / 6), p0 = sp[j], p1 = sp[j + 1];
      for (const sd of [-1, 1]) {
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2;
        c.copy(leafDark).lerp(leafLight, 0.25 + 0.55 * t);
        const i0 = treeVert(part, p0[0], p0[1], p0[2], 0, 1, 0, c);
        const i1 = treeVert(part, p1[0], p1[1], p1[2], 0, 1, 0, c);
        c.lerp(leafLight, 0.35);
        const i2 = treeVert(part, mx + sx * sd * ll * 0.9 + dx * ll * 0.25, my - ll * 0.55, mz + sz * sd * ll * 0.9 + dz * ll * 0.25, sx * sd * 0.35, 1, sz * sd * 0.35, c);
        part.idx.push(i0, i1, i2);
      }
    }
  }
  return { geo: treeGeo(part), shade: 3.8, crownY: H, base: 1.6 };
}
const FAR_PALM_H = 15.7;
function buildFarPalm() {
  const part = TreePart(), H = FAR_PALM_H, tr = tcol(0x7a6c58), dk = tcol(0x2a6a2c), lt = tcol(0x7cb34a), c = new THREE.Color();
  treeTube(part, [[0, 0, 0], [0, H * 0.5, 0], [0, H, 0]], [0.62, 0.45, 0.34], 4, (t, i, cc) => cc.copy(tr));
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2 + (f % 2) * 0.2, dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, L = 6.2, w = 1.5, u = f % 2 ? 0.9 : 0.5;
    const y0 = H + 0.2, x1 = dx * L * 0.55, z1 = dz * L * 0.55, y1 = y0 + L * 0.35 * u + 0.6, x2 = dx * L, z2 = dz * L, y2 = y0 - L * 0.25;
    const i0 = treeVert(part, 0, y0, 0, 0, 1, 0, c.copy(dk));
    const i1 = treeVert(part, x1 + sx * w, y1, z1 + sz * w, 0, 1, 0, c.copy(dk).lerp(lt, 0.5));
    const i2 = treeVert(part, x1 - sx * w, y1, z1 - sz * w, 0, 1, 0, c);
    const i3 = treeVert(part, x2, y2, z2, 0, 1, 0, c.copy(lt));
    part.idx.push(i0, i1, i2, i1, i3, i2);
  }
  return treeGeo(part);
}
const TREE_TYPES = [buildPalm(0), buildPalm(1)];
const TREE_FAR_GEO = buildFarPalm();
const TREE_FAR_STRETCH = [14.5 / FAR_PALM_H, 17 / FAR_PALM_H];
const treeMat = newMat({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });

function radialCanvasTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, stops.r0, 32, 32, 31);
  for (const [o, col] of stops.s) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}
const shadeMat = new THREE.MeshBasicMaterial({
  map: radialCanvasTex({ r0: 3, s: [[0, 'rgba(8,16,10,.3)'], [0.55, 'rgba(8,16,10,.24)'], [1, 'rgba(8,16,10,0)']] }),
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
});

// ============================================================================
// STREETLIGHT + SIGN SHARED ASSETS
// ============================================================================
const BUS_SHELTER_HEIGHT = 18.33;
const STREETLIGHT_HEIGHT = BUS_SHELTER_HEIGHT * 1.5;
const poleMat = mat(0x59645e, 0.55);
const lampGlow = newMat({ color: 0xffe7ad, emissive: 0xffc66b, emissiveIntensity: 0.15, roughness: 0.3 });
// Lightweight bus shelter parts: shared assets, instanced per streamed chunk.
// Keep the established 18.33-unit shelter height; do not compress it to the roof height
// used by the earlier compact placeholder version.
const shelterRoofMat = mat(0x1c5fd1, 0.4, 0.15), shelterBenchMat = mat(0x39434f, 0.6, 0.2), shelterFrameMat = mat(0x1a2a3c, 0.45, 0.35);
const shelterGlassMat = newMat({ color: 0x9fd2ea, roughness: 0.08, metalness: 0.1, transparent: true, opacity: IS_MOBILE ? 0.42 : 0.3, depthWrite: false });   // see-through glass walls
const shelterRoofHeight = BUS_SHELTER_HEIGHT;
const SEAT_THICK = 0.22, SEAT_TOP = BUS_SHELTER_HEIGHT * 0.20, SEAT_Y = SEAT_TOP - SEAT_THICK / 2;   // seat surface sits at 0.20 of the shelter height
const shelterWallHeight = BUS_SHELTER_HEIGHT - 0.8;   // (kept for reference)
const GLASS_Y = 0.5 + (BUS_SHELTER_HEIGHT - 0.95) / 2, GLASS_H = BUS_SHELTER_HEIGHT - 0.95;   // glass runs from just above the ground up to the roof
const POST_H = BUS_SHELTER_HEIGHT - 0.45;                                                      // steel posts end under the roof slab
const BACK_POSTS = [-10.5, -3.5, 3.5, 10.5], FRONT_POSTS = [-10.5, -3.5, 3.5, 10.5];
const BUS_MARK_W = 4, BUS_MARK_L = 9;   // legend: 4 across the lane (half of the original 8), stretched 9 along it like real road lettering
const busLaneCanvas = document.createElement('canvas');
busLaneCanvas.width = 256; busLaneCanvas.height = 128;   // 128 KB, no mipmaps
const busLaneCtx = busLaneCanvas.getContext('2d');
busLaneCtx.clearRect(0, 0, 256, 128);
busLaneCtx.textAlign = 'center'; busLaneCtx.textBaseline = 'middle';
busLaneCtx.font = '900 100px "Arial Black", Arial, sans-serif';
{ const w = busLaneCtx.measureText('BUS').width; if (w > 0) busLaneCtx.font = '900 ' + Math.floor(100 * 226 / w) + 'px "Arial Black", Arial, sans-serif'; }   // letters fill the sign
busLaneCtx.fillStyle = busLaneCtx.strokeStyle = '#f4f2df';                       // exactly the lane-line paint colour, nothing else
busLaneCtx.lineJoin = 'round'; busLaneCtx.lineWidth = 7;                          // a little extra weight so the strokes read as thick as road paint
busLaneCtx.strokeText('BUS', 128, 66); busLaneCtx.fillText('BUS', 128, 66);
const busLaneTexture = new THREE.CanvasTexture(busLaneCanvas);
busLaneTexture.generateMipmaps = false; busLaneTexture.minFilter = THREE.LinearFilter;
if ('colorSpace' in busLaneTexture) busLaneTexture.colorSpace = THREE.SRGBColorSpace;
// Same kind of material as the lane lines (flat white, same polygon offset); alphaTest instead of blending = it behaves like painted road.
const busLaneMarkMat = new THREE.MeshBasicMaterial({ map: busLaneTexture, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const poleGeo = new THREE.CylinderGeometry(0.3, 0.52, STREETLIGHT_HEIGHT, 7); poleGeo.translate(0, STREETLIGHT_HEIGHT / 2, 0);
const armGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 6); armGeo.rotateZ(-Math.PI / 2); armGeo.translate(0.5, STREETLIGHT_HEIGHT - 0.7, 0);
const headGeo = new THREE.BoxGeometry(2.6, 0.42, 1.0); headGeo.translate(0, STREETLIGHT_HEIGHT - 0.5, 0);
const slPoolMat = new THREE.MeshBasicMaterial({
  map: radialCanvasTex({ r0: 0, s: [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']] }),
  color: 0xffc46e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
});
slPoolMat.visible = false;
const slRealLights = [];
{
  const physical = parseInt(THREE.REVISION, 10) >= 155;
  for (let i = 0; i < (IS_MOBILE ? 0 : 6); i++) {   // point lights multiply per-pixel cost: desktop only
    const L = new THREE.PointLight(0xffd28a, 0, 170, physical ? 1 : 1.5);
    L.userData.peak = physical ? 120 : 2.2;
    scene.add(L); slRealLights.push(L);
  }
}

// ---- Round blue BUS STOP sign: a thin blue disc on a metal bar, one beside every shelter, lettering on BOTH faces ----
const BUS_SIGN_R = 2.8 * 0.7, BUS_SIGN_THICK = 0.4, BUS_SIGN_POLE_R = 0.14; // diameter reduced to 70%
const busSignPoleGeo = new THREE.CylinderGeometry(BUS_SIGN_POLE_R, BUS_SIGN_POLE_R, 1, 8); busSignPoleGeo.translate(0, 0.5, 0);   // unit-height bar, scaled per sign
const busSignDiscGeo = new THREE.CylinderGeometry(BUS_SIGN_R, BUS_SIGN_R, BUS_SIGN_THICK, 28); busSignDiscGeo.rotateX(Math.PI / 2);   // axis along +z
const busSignDiscMat = mat(0x0b4fc4, 0.45, 0.1);
const busSignCanvas = document.createElement('canvas');
busSignCanvas.width = 256; busSignCanvas.height = 256;
{
  const c = busSignCanvas.getContext('2d');
  c.clearRect(0, 0, 256, 256);
  c.strokeStyle = c.fillStyle = '#ffffff';
  c.lineWidth = 9; c.beginPath(); c.arc(128, 128, 116, 0, Math.PI * 2); c.stroke();     // white ring just inside the rim
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 92px "Arial Black", Arial, sans-serif'; c.fillText('BUS', 128, 94);
  c.font = '900 66px "Arial Black", Arial, sans-serif'; c.fillText('STOP', 128, 168);
}
const busSignTexture = new THREE.CanvasTexture(busSignCanvas);
busSignTexture.generateMipmaps = false; busSignTexture.minFilter = THREE.LinearFilter;
if ('colorSpace' in busSignTexture) busSignTexture.colorSpace = THREE.SRGBColorSpace;
const busSignFaceMat = new THREE.MeshBasicMaterial({ map: busSignTexture, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const BUS_SIGN_Y = BUS_SHELTER_HEIGHT - BUS_SIGN_R;   // disc centre; the disc top is level with the shelter height

const STREET_SIGN_POLE_HEIGHT = BUS_SHELTER_HEIGHT * 0.25;
const STREET_SIGN_SCALE = 0.4;
const streetSignPoleGeo = new THREE.CylinderGeometry(0.11, 0.15, STREET_SIGN_POLE_HEIGHT, 7);
const streetSignPoleMat = mat(0x2b3640);
const DISTRICT_POLE_HEIGHT = BUS_SHELTER_HEIGHT * 1.5, DISTRICT_POLE_OFFSET = 27.6, DISTRICT_BOARD_H = 6;
const districtPoleGeo = new THREE.CylinderGeometry(0.5, 0.7, DISTRICT_POLE_HEIGHT, 8);
const districtPoleMat = mat(0x2b3640);

function makeCompactSignTexture(text, bgHex, subtext = '') {
  const cw = 256, ch = 64, cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d');
  c.fillStyle = '#' + bgHex.toString(16).padStart(6, '0'); c.fillRect(0, 0, cw, ch);
  c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.strokeRect(4, 4, cw - 8, ch - 8);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = subtext ? 'bold 20px Arial, sans-serif' : 'bold 24px Arial, sans-serif';
  c.fillText(text.toUpperCase(), cw / 2, subtext ? ch * 0.38 : ch * 0.52, cw - 20);
  if (subtext) { c.fillStyle = '#8fdcff'; c.font = 'bold 13px Arial, sans-serif'; c.fillText(subtext.toUpperCase(), cw / 2, ch * 0.75, cw - 20); }
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// PLOT / ROAD HELPERS
// ============================================================================
// Only the 48-wide avenues remain (every 210 units). All the old 70-unit local streets are gone, so every block is
// one big 210 x 210 plot (138 x 138 usable once the avenue + walkway setback is taken off) for a single large tower.
const MAJOR_LANE_WIDTH = 12;
const ROAD_EDGE_CLEARANCE = MAJOR_LANE_WIDTH, BLOCK_SETBACK = MAJOR_LANE_WIDTH;
const ROAD_SPACING = 210, AVE_HALF = 24, BLOCK_N = 25;      // blocks run from -25 to +24 in x and z
const blockIndex = (bi, bj) => (bi + BLOCK_N) * (BLOCK_N * 2) + (bj + BLOCK_N);
const roadHalfWidthAt = () => AVE_HALF;
function blockSpan(v) {
  const a = Math.floor(v / ROAD_SPACING) * ROAD_SPACING, b = a + ROAD_SPACING;
  return [a + AVE_HALF + BLOCK_SETBACK, b - AVE_HALF - BLOCK_SETBACK];
}
function clearBuildingPlot(x, z, w, d, extra = 0) {
  const halfW = w / 2 + extra, halfD = d / 2 + extra;
  // The footprint edge must stay one full lane width (12) beyond the avenue edge (centreline +/- 24).
  for (let k = Math.floor((x - halfW) / ROAD_SPACING) - 1, e = Math.ceil((x + halfW) / ROAD_SPACING) + 1; k <= e; k++)
    if (Math.abs(x - k * ROAD_SPACING) < halfW + AVE_HALF + ROAD_EDGE_CLEARANCE) return false;
  for (let k = Math.floor((z - halfD) / ROAD_SPACING) - 1, e = Math.ceil((z + halfD) / ROAD_SPACING) + 1; k <= e; k++)
    if (Math.abs(z - k * ROAD_SPACING) < halfD + AVE_HALF + ROAD_EDGE_CLEARANCE) return false;
  if ((x - halfW) < 130 && (x + halfW) > -130 && Math.abs(z + 22) < halfD + 8.75) return false;
  return true;
}
const overlaps = (list, x, z, w, d) => list.some(c => x + w / 2 + 2 > c.minX && x - w / 2 - 2 < c.maxX && z + d / 2 + 2 > c.minZ && z - d / 2 - 2 < c.maxZ);

const claimedBlocks = new Set();
const sportsLayout = new Map();
function claimOpenBlock(x, z, minW, minD) {
  const bx0 = Math.floor(x / ROAD_SPACING), bz0 = Math.floor(z / ROAD_SPACING), cands = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const bx = bx0 + i, bz = bz0 + j, key = bx + ',' + bz;
    if (claimedBlocks.has(key)) continue;
    const [x0, x1] = blockSpan(bx * ROAD_SPACING + ROAD_SPACING / 2), [z0, z1] = blockSpan(bz * ROAD_SPACING + ROAD_SPACING / 2);
    if (x1 - x0 < minW || z1 - z0 < minD) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    cands.push({ key, cx, cz, x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, dist: Math.hypot(cx - x, cz - z) });
  }
  cands.sort((a, b) => a.dist - b.dist);
  const c = cands[0];
  if (!c) return null;
  claimedBlocks.add(c.key);
  return c;
}
function registerSign(text, x, z, width = 22, color = 0x176b43, y = 7, type = 'board', axis = 'z') {
  blueprintAtWorld(x, z).signs.push({ text, x, z, width, color, y, type, axis });
}

// ----------------------------------------------------------------------------
// MODERN HIGH-RISE FACADES
// Every building is a podium (glazed lobby) + 1-3 stacked tiers, each wrapped in a procedural facade texture whose UVs are
// set so windows line up with whole floors and whole bays. Glass towers and solid-material towers (concrete, brick, stone,
// terracotta, bronze panels...) are picked at random from FACADE_PRESETS.
// ----------------------------------------------------------------------------
const FLOOR_H = 9, BAY_W = 4.5, PODIUM_H = 14, TEX_CELLS = 4;
const TEX_PX = IS_MOBILE ? 256 : 512;
const FACADE_PRESETS = [
  { style: 'curtain', wall: 0x1f2a30, glass: 0x4f86a8, glassy: true },   // 0  blue curtain wall
  { style: 'curtain', wall: 0xc9d0d4, glass: 0x3c8c8c, glassy: true },   // 1  teal, silver frame
  { style: 'curtain', wall: 0x2a3036, glass: 0x34444f, glassy: true },   // 2  graphite mirror glass
  { style: 'curtain', wall: 0x20302b, glass: 0x4f9a86, glassy: true },   // 3  green glass
  { style: 'curtain', wall: 0x3b2f24, glass: 0x9a7b52, glassy: true },   // 4  bronze glass
  { style: 'curtain', wall: 0xd7dde0, glass: 0x7f93a3, glassy: true },   // 5  pale silver glass
  { style: 'fins',    wall: 0xe9e6dc, glass: 0x4f86a8, glassy: true },   // 6  glass with white fins
  { style: 'fins',    wall: 0x383d42, glass: 0x4a9a9a, glassy: true },   // 7  glass with black fins
  { style: 'ribbon',  wall: 0xb9b7b0, glass: 0x35566e },                 // 8  concrete + ribbon windows
  { style: 'ribbon',  wall: 0xefece4, glass: 0x39556b },                 // 9  white render ribbon
  { style: 'ribbon',  wall: 0xd2b48c, glass: 0x46606e },                 // 10 sandstone ribbon
  { style: 'punched', wall: 0x9c5a46, glass: 0x2f3f4a },                 // 11 brick
  { style: 'punched', wall: 0xc2774f, glass: 0x34424c },                 // 12 terracotta
  { style: 'punched', wall: 0xdcd0b4, glass: 0x3a4a56 },                 // 13 limestone
  { style: 'punched', wall: 0x3d4247, glass: 0x6e8da0 },                 // 14 charcoal metal
  { style: 'grid',    wall: 0xa9aaa5, glass: 0x405565 },                 // 15 deep concrete grid
  { style: 'grid',    wall: 0xf0eee8, glass: 0x4a6377 },                 // 16 white grid
  { style: 'grid',    wall: 0x7d6a55, glass: 0x3a4c58 },                 // 17 bronze panel grid
  { style: 'bands',   wall: 0x2d3236, glass: 0x7fb0c8 },                 // 18 dark spandrel bands
  { style: 'bands',   wall: 0x8aa08a, glass: 0x5f93ab },                 // 19 sage spandrel bands
  { style: 'bands',   wall: 0xcfc5b0, glass: 0x4e7a92 }                  // 20 stone spandrel bands
];
const GLASS_PRESETS = FACADE_PRESETS.map((p, i) => p.glassy ? i : -1).filter(i => i >= 0);
const SOLID_PRESETS = FACADE_PRESETS.map((p, i) => p.glassy ? -1 : i).filter(i => i >= 0);
const ROOF_COLORS = [0x5b6063, 0x6d6a64, 0x474c50, 0x7a7e80];
const CANOPY_COLORS = [0x1d2327, 0xe9e6de, 0xb06f3c, 0x2f4d5f, 0x8a1f2b];
const HEIGHT_FLOORS = { office: [10, 55], apartment: [9, 46], mixed: [6, 28], residential: [4, 20], tenement: [3, 12], shop: [2, 8], market: [2, 6], duplex: [2, 8] };

function rngFrom(seed) {   // small deterministic PRNG (mulberry32)
  let t = (seed ^ 0x9e3779b9) >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const hexRGB = hex => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const cssHex = (hex, f = 1) => { const [r, g, b] = hexRGB(hex); return `rgb(${Math.min(255, r * f | 0)},${Math.min(255, g * f | 0)},${Math.min(255, b * f | 0)})`; };
const cssMix = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
function facadeTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const maxA = renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  t.anisotropy = Math.min(IS_MOBILE ? 2 : 8, maxA);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// One texture tile = 4 bays across x 4 floors high, with a little random variation window to window.
function makeTowerTexture(pi) {
  const p = FACADE_PRESETS[pi], S = TEX_PX, n = TEX_CELLS, c = S / n, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = rngFrom(pi * 977 + 11);
  g.fillStyle = cssHex(p.wall); g.fillRect(0, 0, S, S);
  for (let fy = 0; fy < n; fy++) for (let bx = 0; bx < n; bx++) {
    const x0 = bx * c, y0 = fy * c, v = 0.84 + R() * 0.3, lit = R() < 0.1;
    const glass = lit ? cssMix(p.glass, 0xffe0a0, 0.5) : cssHex(p.glass, v);
    const sheen = () => {
      const gr = g.createLinearGradient(x0, y0, x0 + c, y0 + c);
      gr.addColorStop(0, 'rgba(255,255,255,.24)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.2)');
      g.fillStyle = gr;
    };
    if (p.style === 'curtain') {
      g.fillStyle = glass; g.fillRect(x0, y0, c, c);
      sheen(); g.fillRect(x0, y0, c, c);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x0, y0 + c * 0.78, c, c * 0.22);          // opaque spandrel glass
      g.fillStyle = cssHex(p.wall); g.fillRect(x0, y0, c * 0.035, c); g.fillRect(x0, y0, c, c * 0.04);   // mullion + slab edge
    } else if (p.style === 'fins') {
      g.fillStyle = glass; g.fillRect(x0, y0, c, c);
      sheen(); g.fillRect(x0, y0, c, c);
      g.fillStyle = cssHex(p.wall); g.fillRect(x0, y0, c * 0.2, c); g.fillRect(x0, y0 + c * 0.82, c, c * 0.18);
    } else if (p.style === 'ribbon') {
      g.fillStyle = glass; g.fillRect(x0, y0 + c * 0.18, c, c * 0.58);
      sheen(); g.fillRect(x0, y0 + c * 0.18, c, c * 0.58);
      g.fillStyle = cssHex(p.wall, 0.75); g.fillRect(x0, y0 + c * 0.18, c * 0.03, c * 0.58);
      g.fillStyle = cssHex(p.wall, 1.15); g.fillRect(x0, y0 + c * 0.76, c, c * 0.035);
    } else if (p.style === 'punched') {
      const wx = x0 + c * 0.2, wy = y0 + c * 0.2, ww = c * 0.6, wh = c * 0.55;
      g.fillStyle = cssHex(p.wall, 0.66); g.fillRect(wx - c * 0.03, wy - c * 0.03, ww + c * 0.06, wh + c * 0.06);
      g.fillStyle = glass; g.fillRect(wx, wy, ww, wh);
      sheen(); g.fillRect(wx, wy, ww, wh);
      g.fillStyle = cssHex(p.wall, 0.8); g.fillRect(wx, wy + wh * 0.32, ww, c * 0.02);     // transom
      g.fillStyle = cssHex(p.wall, 1.18); g.fillRect(wx - c * 0.05, wy + wh + c * 0.03, ww + c * 0.1, c * 0.04);   // sill
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(wx - c * 0.03, wy - c * 0.07, ww + c * 0.06, c * 0.04);          // lintel shadow
    } else if (p.style === 'grid') {
      g.fillStyle = cssHex(p.wall, 0.6); g.fillRect(x0 + c * 0.1, y0 + c * 0.1, c * 0.8, c * 0.72);   // deep reveal
      g.fillStyle = glass; g.fillRect(x0 + c * 0.16, y0 + c * 0.16, c * 0.68, c * 0.6);
      sheen(); g.fillRect(x0 + c * 0.16, y0 + c * 0.16, c * 0.68, c * 0.6);
      g.fillStyle = cssHex(p.wall, 0.85); g.fillRect(x0 + c * 0.49, y0 + c * 0.16, c * 0.02, c * 0.6);
    } else {   // bands: glazing above a solid spandrel panel
      g.fillStyle = glass; g.fillRect(x0, y0, c, c * 0.6);
      sheen(); g.fillRect(x0, y0, c, c * 0.6);
      g.fillStyle = cssHex(p.wall); g.fillRect(x0, y0 + c * 0.6, c, c * 0.4);
      g.fillStyle = cssHex(p.wall, 0.7); g.fillRect(x0, y0 + c * 0.6, c, c * 0.03); g.fillRect(x0, y0, c * 0.025, c * 0.6);
    }
  }
  return facadeTexture(cv);
}
// Ground-floor lobby strip: tall glazed panels under a fascia band (one storey high, 4 bays across).
function makeLobbyTexture(pi) {
  const p = FACADE_PRESETS[pi], S = TEX_PX, c = S / TEX_CELLS, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = rngFrom(pi * 331 + 5);
  g.fillStyle = cssHex(p.wall, 0.92); g.fillRect(0, 0, S, S);
  g.fillStyle = cssHex(p.wall, 0.7); g.fillRect(0, 0, S, S * 0.2);                           // fascia band
  const pier = p.glassy ? c * 0.035 : c * 0.15, y = S * 0.23, h = S * 0.71;
  for (let bx = 0; bx < TEX_CELLS; bx++) {
    const x = bx * c + pier, w = c - 2 * pier;
    g.fillStyle = cssHex(p.glass, 0.7 + R() * 0.25); g.fillRect(x, y, w, h);
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.2)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = cssHex(p.wall, 0.85); g.fillRect(x + w / 2 - 1.5, y, 3, h);              // mullion
    if (!p.glassy) g.fillRect(x, y + h * 0.4, w, 3);                                         // transom
  }
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, S * 0.94, S, S * 0.06);                      // plinth
  return facadeTexture(cv);
}
const towerTexCache = new Map(), lobbyTexCache = new Map(), facadeMatCache = new Map();
function facadeMats(pi, tint) {
  const key = pi * 4 + tint;
  let m = facadeMatCache.get(key);
  if (m) return m;
  if (!towerTexCache.has(pi)) towerTexCache.set(pi, makeTowerTexture(pi));
  if (!lobbyTexCache.has(pi)) lobbyTexCache.set(pi, makeLobbyTexture(pi));
  const p = FACADE_PRESETS[pi], col = [0xffffff, 0xe6e6e6, 0xf4eadb][tint];
  m = {
    side: newMat({ map: towerTexCache.get(pi), color: col, roughness: p.glassy ? 0.24 : 0.82, metalness: p.glassy ? 0.18 : 0 }),
    lobby: newMat({ map: lobbyTexCache.get(pi), color: col, roughness: 0.3, metalness: 0.1 })
  };
  facadeMatCache.set(key, m);
  return m;
}

// Everything about one building is decided here, deterministically from its position: material, height, setbacks,
// rooftop kit, entrance side/style/canopy, so no two towers come out alike.
function designBuilding(x, z, w, d, kind, seedIn) {
  const R = rngFrom(Math.imul(Math.round(x * 10) + 77777, 73856093) ^ Math.imul(Math.round(z * 10) + 99991, 19349663) ^ Math.imul(seedIn + 17, 83492791));
  const [f0, f1] = HEIGHT_FLOORS[kind] || [8, 30];
  const floors = Math.max(2, Math.round(f0 + Math.pow(R(), 1.2) * (f1 - f0)));
  const pool = R() < 0.45 ? GLASS_PRESETS : SOLID_PRESETS;
  const preset = pool[Math.floor(R() * pool.length)], tint = Math.floor(R() * 3);
  const tiers = [];
  const nT = floors >= 30 ? 1 + Math.floor(R() * 3) : floors >= 12 ? 1 + Math.floor(R() * 2) : 1;
  let rem = floors, tw = w, td = d, tx = x, tz = z;
  for (let t = 0; t < nT; t++) {
    const share = Math.max(1, Math.min(rem, t === nT - 1 ? rem : Math.round(rem * (0.42 + R() * 0.28))));
    tiers.push({ x: tx, z: tz, w: tw, d: td, floors: share });
    rem -= share;
    if (rem <= 0) break;
    const nw = tw * (0.6 + R() * 0.28), nd = td * (0.6 + R() * 0.28);
    tx += (R() - 0.5) * (tw - nw) * 0.8; tz += (R() - 0.5) * (td - nd) * 0.8;
    tw = nw; td = nd;
  }
  if (rem > 0) tiers[tiers.length - 1].floors += rem;
  const bx = x - Math.floor(x / ROAD_SPACING) * ROAD_SPACING, bz = z - Math.floor(z / ROAD_SPACING) * ROAD_SPACING;
  const toAve = [[bz, 1], [ROAD_SPACING - bz, 0], [bx, 3], [ROAD_SPACING - bx, 2]].sort((a, b) => a[0] - b[0]);   // faces: 0 +z, 1 -z, 2 +x, 3 -x
  const face = R() < 0.25 ? toAve[1][1] : toAve[0][1];
  const faceW = (face < 2 ? w : d) + 4;
  return {
    x, z, w, d, kind, floors, preset, tint, tiers, h: PODIUM_H + floors * FLOOR_H,
    roofColor: ROOF_COLORS[Math.floor(R() * ROOF_COLORS.length)],
    plant: R() < 0.6 ? { fw: 0.25 + R() * 0.3, fd: 0.25 + R() * 0.3, h: 5 + R() * 8, ox: (R() - 0.5) * 0.3, oz: (R() - 0.5) * 0.3 } : null,
    antenna: R() < 0.28 ? 14 + R() * 40 : 0,
    door: { face, style: Math.floor(R() * 3), off: (R() - 0.5) * Math.max(0, faceW - 44) * 0.8, canopy: CANOPY_COLORS[Math.floor(R() * CANOPY_COLORS.length)] },
    minX: x - w / 2 - 2.5, maxX: x + w / 2 + 2.5, minZ: z - d / 2 - 2.5, maxZ: z + d / 2 + 2.5
  };
}

// Adds one building to a chunk: textured meshes (podium + tiers) straight into the group, small details into the shared box batch.
function emitBuilding(s, group, entry, boxes) {
  const B = (w, h, d, color, x, y, z) => boxes.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: d, color });
  const p = FACADE_PRESETS[s.preset], mats = facadeMats(s.preset, s.tint), roof = mat(s.roofColor, 0.9);
  const solid = (w, h, d, x, y, z, material, lobby, vRep) => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, faceW = [d, d, 0, 0, w, w];
    for (let f = 0; f < 6; f++) {
      if (f === 2 || f === 3) continue;                        // top / bottom: plain roof colour, no windows
      const bays = Math.max(1, Math.round(faceW[f] / BAY_W)), ru = lobby ? Math.max(1, Math.round(bays / TEX_CELLS)) : bays / TEX_CELLS;
      for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * vRep);
    }
    uv.needsUpdate = true;
    const m = new THREE.Mesh(g, [material, material, roof, roof, material, material]);
    m.position.set(x, y + h / 2, z); m.matrixAutoUpdate = false; m.updateMatrix();
    group.add(m); entry.disposables.push(g);
  };
  solid(s.w + 4, PODIUM_H, s.d + 4, s.x, 0, s.z, mats.lobby, true, 1);
  B(s.w + 5.6, 1.1, s.d + 5.6, p.wall, s.x, PODIUM_H - 0.2, s.z);                     // cornice between podium and tower
  let y = PODIUM_H;
  for (const t of s.tiers) {
    const th = t.floors * FLOOR_H;
    solid(t.w, th, t.d, t.x, y, t.z, mats.side, false, t.floors / TEX_CELLS);
    y += th;
    B(t.w + 1.4, 1.2, t.d + 1.4, p.wall, t.x, y - 0.1, t.z);                          // parapet / crown slab
  }
  const top = s.tiers[s.tiers.length - 1];
  if (s.plant) B(top.w * s.plant.fw, s.plant.h, top.d * s.plant.fd, 0x858b90, top.x + top.w * s.plant.ox, y + 1.1, top.z + top.d * s.plant.oz);
  if (s.antenna) B(0.9, s.antenna, 0.9, 0xcfd3d6, top.x, y + 1.1, top.z);

  // Entrance: apron + frame + glass doors + canopy, built on the face looking at the nearest avenue.
  const D = s.door, hw = (s.w + 4) / 2, hd = (s.d + 4) / 2, off = D.off;
  const FB = (lx, yy, lo, bw, bh, bd, color) => {          // lx along the wall, lo outward from the wall plane
    if (D.face === 0) B(bw, bh, bd, color, s.x + lx, yy, s.z + hd + lo);
    else if (D.face === 1) B(bw, bh, bd, color, s.x - lx, yy, s.z - hd - lo);
    else if (D.face === 2) B(bd, bh, bw, color, s.x + hw + lo, yy, s.z - lx);
    else B(bd, bh, bw, color, s.x - hw - lo, yy, s.z + lx);
  };
  const DARK = 0x1b2024, GLASS = 0x9fd6e8, STEEL = 0xd9dde0;
  FB(off, 0, 3.3, 26, 0.5, 6.6, 0xb7b5ae);                 // apron
  if (D.style === 0) {                                      // double glass doors under a flat canopy
    FB(off, 0.5, 0.25, 12, 9.6, 1.1, DARK);
    for (const sx of [-1, 1]) { FB(off + sx * 2.7, 0.5, 0.5, 5.2, 8.6, 1.0, GLASS); FB(off + sx * 0.9, 3.2, 1.2, 0.22, 2.6, 0.5, STEEL); }
    FB(off, 0.5, 0.7, 0.5, 8.6, 1.3, DARK);
    FB(off, 10.4, 4.6, 20, 0.7, 9.2, D.canopy);
    for (const sx of [-1, 1]) FB(off + sx * 9.2, 0.5, 8.8, 0.5, 10, 0.5, DARK);
  } else if (D.style === 1) {                               // deep portal frame, centre door + sidelights
    for (const sx of [-1, 1]) FB(off + sx * 7.4, 0, 2.1, 2.4, 12.6, 4.2, D.canopy);
    FB(off, 10.4, 2.1, 17.2, 2.2, 4.2, D.canopy);
    FB(off, 0.5, 0.25, 12.4, 9.8, 0.9, DARK);
    FB(off, 0.5, 0.5, 4.4, 8.8, 1.0, GLASS);
    for (const sx of [-1, 1]) { FB(off + sx * 4.4, 0.5, 0.5, 3.4, 8.8, 1.0, GLASS); FB(off + sx * 2.5, 0.5, 0.8, 0.4, 8.8, 1.3, DARK); }
    FB(off + 1.4, 3.2, 1.2, 0.22, 2.6, 0.5, STEEL);
  } else {                                                  // triple glass doors flanked by timber fins
    FB(off, 0.5, 0.25, 16.6, 9.6, 1.1, DARK);
    for (const i of [-1, 0, 1]) FB(off + i * 5.2, 0.5, 0.5, 4.6, 8.6, 1.0, GLASS);
    for (const sx of [-1, 1]) { FB(off + sx * 2.6, 0.5, 0.8, 0.4, 8.6, 1.3, DARK); FB(off + sx * 10.6, 0, 1.8, 1.4, 12.4, 3.6, 0xa5764a); }
    FB(off, 10.9, 3.4, 19, 0.5, 6.8, D.canopy);
  }
}

function findBuildingPosition(x, z, w, d) {
  const bi0 = Math.floor(x / ROAD_SPACING), bj0 = Math.floor(z / ROAD_SPACING), cands = [];
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
    const bi = bi0 + i, bj = bj0 + j;
    if (bi < -BLOCK_N || bi >= BLOCK_N || bj < -BLOCK_N || bj >= BLOCK_N) continue;
    const [x0, x1] = blockSpan(bi * ROAD_SPACING + ROAD_SPACING / 2), [z0, z1] = blockSpan(bj * ROAD_SPACING + ROAD_SPACING / 2);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    cands.push({ cx, cz, maxW: x1 - x0 - 4, maxD: z1 - z0 - 4, dist: Math.hypot(cx - x, cz - z) });
  }
  cands.sort((a, b) => a.dist - b.dist);
  for (const factor of [1, 0.85, 0.7, 0.58]) {
    for (const c of cands) {
      const fw = Math.min(w, c.maxW) * factor, fd = Math.min(d, c.maxD) * factor;
      if (!clearBuildingPlot(c.cx, c.cz, fw + 4, fd + 4, 0)) continue;
      if (!overlaps(buildingColliders, c.cx, c.cz, fw + 4, fd + 4) && !overlaps(amenityColliders, c.cx, c.cz, fw + 4, fd + 4)) return { x: c.cx, z: c.cz, w: fw, d: fd };
    }
  }
  return null;
}
function makeBuilding(x, z, w, d, h, kind = 'residential', seed = 0) {
  const sizeFactor = kind === 'office' ? 1.22 : kind === 'apartment' ? 1.2 : 1.12;
  const R = rngFrom(Math.imul(seed + 3, 2654435761) ^ Math.round(x * 3) ^ Math.imul(Math.round(z * 5), 40503));
  // old footprint x 2-3, capped to what a block can hold, then trimmed a little at random so the slabs differ in proportion
  const mult = 2 + R();
  const W = w * sizeFactor * 4 * mult * (0.72 + R() * 0.28), D = d * sizeFactor * 4 * mult * (0.72 + R() * 0.28);
  const placed = findBuildingPosition(x, z, W, D);
  if (!placed) return null;
  const spec = designBuilding(placed.x, placed.z, placed.w, placed.d, kind, seed);
  buildingColliders.push({ minX: spec.minX, maxX: spec.maxX, minZ: spec.minZ, maxZ: spec.maxZ });
  cityMapBuildings.push({ x: spec.x, z: spec.z, w: spec.w + 4, d: spec.d + 4, kind });
  blueprintAtWorld(spec.x, spec.z).buildings.push(spec);
  return { position: { x: spec.x, z: spec.z } };
}

// ============================================================================
// WORLD DATA (districts, sports, signs): small and fast
// ============================================================================
const districtDefs = [
  ['VICTORIA ISLAND', 0, -420, 'island'], ['IKOYI', 420, -420, 'island'], ['LEKKI PHASE 1', 760, -120, 'residential'],
  ['YABA', -420, -120, 'civic'], ['SURULERE', -700, 260, 'sports'], ['IKEJA', -180, 520, 'civic'],
  ['OSHODI MARKET', -780, -360, 'market'], ['MUSHIN', -470, 650, 'market'], ['AJAH', 720, 520, 'residential'],
  ['EPE WATERFRONT', 930, 760, 'civic'], ['MAINLAND SPORTS PARK', -70, 120, 'sports'], ['AGEGE', -880, 20, 'residential'],
  ['FESTAC TOWN', -760, 760, 'residential'], ['APAPA PORT', -980, 520, 'civic']
];
const baseDistrictDefs = districtDefs.slice();
for (let tx = -2; tx <= 2; tx++) for (let tz = -2; tz <= 2; tz++) {
  if (tx === 0 && tz === 0) continue;
  const tileNo = (tz + 2) * 5 + (tx + 2) + 1;
  for (const d of baseDistrictDefs) districtDefs.push([`${d[0]} DISTRICT ${String(tileNo).padStart(2, '0')}`, d[1] + tx * 2100, d[2] + tz * 2100, d[3]]);
}

for (const d of baseDistrictDefs) {   // reserve sports complexes first so buildings avoid them
  if (d[3] !== 'sports') continue;
  const cx = d[1], cz = d[2];
  const pitch = claimOpenBlock(cx, cz, 50, 50), tennis = claimOpenBlock(cx + 135, cz + 5, 50, 50), basket = claimOpenBlock(cx - 135, cz + 8, 50, 50);
  if (!pitch || !tennis || !basket) continue;
  sportsLayout.set(d[0], {
    pitch: { cx: pitch.cx, cz: pitch.cz, s: Math.min(1, pitch.w / 100, pitch.d / 66) },
    tennis: { cx: tennis.cx, cz: tennis.cz, s: Math.min(1, tennis.w / 30, tennis.d / 74) },
    basket: { cx: basket.cx, cz: basket.cz, s: Math.min(1, basket.w / 40, basket.d / 28) }
  });
  for (const b of [pitch, tennis, basket]) amenityColliders.push({ minX: b.x0 - 1, maxX: b.x1 + 1, minZ: b.z0 - 1, maxZ: b.z1 + 1 });
}

baseDistrictDefs.forEach((d, i) => {
  const [name, cx, cz, type] = d, seed = i * 13;
  if (type === 'island') {
    for (let k = 0; k < 10; k++) makeBuilding(cx + (k % 5) * 34 - 68, cz + Math.floor(k / 5) * 45 - 18, 27, 29, 32, 'office', seed + k);
    makeBuilding(cx, cz + 90, 76, 40, 64, 'office', seed + 20);
  } else if (type === 'market') {
    for (let k = 0; k < 7; k++) {
      const sh = makeBuilding(cx + (k % 4) * 13 - 20, cz + Math.floor(k / 4) * 15, 10, 10, 4, 'market', k);
    }
    registerSign(name, cx, cz - 18, 30, 0x9a5b23);
    recordCityFacility('market', cx, cz, 78, 30, name);
  } else if (type === 'sports') {
    const L = sportsLayout.get(name);
    if (L) {
      blueprintAtWorld(L.pitch.cx, L.pitch.cz).facilities.push({ type: 'pitch', ...L.pitch });
      recordCityFacility('football', L.pitch.cx, L.pitch.cz, 92 * L.pitch.s, 58 * L.pitch.s, name + ' FOOTBALL ARENA');
      blueprintAtWorld(L.tennis.cx, L.tennis.cz).facilities.push({ type: 'tennis', ...L.tennis });
      recordCityFacility('tennis', L.tennis.cx, L.tennis.cz, 30 * L.tennis.s, 72 * L.tennis.s, 'Tennis centre');
      blueprintAtWorld(L.basket.cx, L.basket.cz).facilities.push({ type: 'basketball', ...L.basket });
      recordCityFacility('basketball', L.basket.cx, L.basket.cz, 38, 23, 'Basketball court');
    }
  } else if (type === 'civic') {
    makeBuilding(cx - 35, cz, 45, 38, 22, 'office', seed);
    makeBuilding(cx + 35, cz, 42, 36, 18, 'office', seed + 1);
    makeBuilding(cx, cz + 58, 88, 28, 8, 'mixed', seed + 2);
  } else {
    for (let k = 0; k < 14; k++) makeBuilding(cx + (k % 5) * 32 - 64, cz + Math.floor(k / 5) * 36 - 36, 15, 14, 10, 'residential', seed + k);
  }
});

for (const d of districtDefs) {   // district gateways
  const ax = Math.max(-5040, Math.min(5040, Math.round(d[1] / 210) * 210));
  const az = Math.max(-5040, Math.min(5040, Math.round(d[2] / 210) * 210));
  const alongZ = Math.abs(ax - d[1]) <= Math.abs(az - d[2]);
  const gx = alongZ ? ax : Math.floor(d[1] / ROAD_SPACING) * ROAD_SPACING + ROAD_SPACING / 2, gz = alongZ ? Math.floor(d[2] / ROAD_SPACING) * ROAD_SPACING + ROAD_SPACING / 2 : az;
  registerSign(d[0], gx, gz, DISTRICT_POLE_OFFSET * 2 - 1.4, 0x2a72a8, DISTRICT_POLE_HEIGHT - 3.4, 'gateway', alongZ ? 'z' : 'x');
}
// Street-name signs are generated inside each active chunk below, beside its actual roads.

const CITY_PARKING = { name: 'Public City Parking', x: 105, z: 105 };
amenityColliders.push({ minX: CITY_PARKING.x - 22, maxX: CITY_PARKING.x + 22, minZ: CITY_PARKING.z - 22, maxZ: CITY_PARKING.z + 22 });
recordCityFacility('parking', CITY_PARKING.x, CITY_PARKING.z, 42, 42, CITY_PARKING.name);
blueprintAtWorld(CITY_PARKING.x, CITY_PARKING.z).facilities.push({ type: 'parking', x: CITY_PARKING.x, z: CITY_PARKING.z });

{ // Sports centres on every 7th block (these blocks are skipped by infill)
  const reserved = amenityColliders.slice(), SPORTS_CENTRE_TARGET = 2500;
  let n = 0;
  for (let ix = -BLOCK_N; ix < BLOCK_N && n < SPORTS_CENTRE_TARGET; ix++) for (let iz = -BLOCK_N; iz < BLOCK_N && n < SPORTS_CENTRE_TARGET; iz++) {
    if (blockIndex(ix, iz) % 7 !== 0) continue;
    const [bx0, bx1] = blockSpan(ROAD_SPACING / 2 + ix * ROAD_SPACING), [bz0, bz1] = blockSpan(ROAD_SPACING / 2 + iz * ROAD_SPACING);
    const sc = Math.min(1, (bx1 - bx0) / 46, (bz1 - bz0) / 46);
    const x = (bx0 + bx1) / 2, z = (bz0 + bz1) / 2, sz = 44 * sc;
    if (overlaps(reserved, x, z, sz, sz) || overlaps(buildingColliders, x, z, sz, sz)) continue;
    const label = `SPORTS CENTRE ${String(n + 1).padStart(4, '0')}`;
    recordCityFacility('sportscomplex', x, z, sz, sz, label);
    blueprintAtWorld(x, z).facilities.push({ type: 'sportscomplex', x, z, s: sc });
    n++;
  }
}

function nearestDistrictFor(x, z) {
  let best = districtDefs[0], bestD = Infinity;
  for (const d of districtDefs) { const q = (x - d[1]) ** 2 + (z - d[2]) ** 2; if (q < bestD) { bestD = q; best = d; } }
  return best;
}

// ============================================================================
// INFILL BUILDINGS: computed on demand per block (22k blocks never stored up front)
// ============================================================================
const detailedBlocks = new Set();   // blocks already covered by detailed buildings / parking
for (const c of [...buildingColliders, amenityColliders[amenityColliders.length - 1]])
  for (let bi = Math.floor(c.minX / ROAD_SPACING); bi <= Math.floor(c.maxX / ROAD_SPACING); bi++)
    for (let bj = Math.floor(c.minZ / ROAD_SPACING); bj <= Math.floor(c.maxZ / ROAD_SPACING); bj++) detailedBlocks.add(blockIndex(bi, bj));

const infillCache = new Map();
function infillAt(bi, bj) {
  if (bi < -BLOCK_N || bi >= BLOCK_N || bj < -BLOCK_N || bj >= BLOCK_N) return null;
  const k = blockIndex(bi, bj);
  let r = infillCache.get(k);
  if (r !== undefined) return r;
  r = null;
  const gx = bi * ROAD_SPACING + ROAD_SPACING / 2, gz = bj * ROAD_SPACING + ROAD_SPACING / 2;
  if (k % 7 !== 0 && !detailedBlocks.has(k) && !claimedBlocks.has(bi + ',' + bj) &&
      !baseDistrictDefs.some(d => Math.hypot(gx - d[1], gz - d[2]) < 105)) {
    const R = rngFrom(k * 7919 + 13), roll = R();
    const kind = roll < 0.2 ? 'office' : roll < 0.55 ? 'apartment' : roll < 0.7 ? 'mixed' : roll < 0.82 ? 'residential' : roll < 0.9 ? 'tenement' : roll < 0.96 ? 'shop' : 'duplex';
    const [x0, x1] = blockSpan(gx), [z0, z1] = blockSpan(gz);
    const maxW = x1 - x0 - 4, maxD = z1 - z0 - 4;                       // 134 x 134: roughly 2.0-3.0x the old footprints
    const w = maxW * (0.68 + R() * 0.32), d = maxD * (0.68 + R() * 0.32);
    const x = (x0 + x1) / 2 + (R() - 0.5) * (maxW - w), z = (z0 + z1) / 2 + (R() - 0.5) * (maxD - d);
    r = designBuilding(x, z, w, d, kind, k);
  }
  infillCache.set(k, r);
  return r;
}

const CELL = 64, detailGrid = new Map();
for (const b of buildingColliders)
  for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++)
    for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) {
      const k = cx + ',' + cz; let l = detailGrid.get(k);
      if (!l) detailGrid.set(k, l = []);
      l.push(b);
    }
function collidesWithBuilding(x, z) {
  const r = infillAt(Math.floor(x / ROAD_SPACING), Math.floor(z / ROAD_SPACING));
  if (r && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true;
  const list = detailGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (list) for (const b of list) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  return false;
}

// ============================================================================
// PER-CHUNK TREES (deterministic from treeHash, same layout as before, nothing stored)
// ============================================================================
function treeOnRoad(x, z, margin = 3.4) {
  const gx = Math.max(-5040, Math.min(5040, Math.round(x / ROAD_SPACING) * ROAD_SPACING));
  const gz = Math.max(-5040, Math.min(5040, Math.round(z / ROAD_SPACING) * ROAD_SPACING));
  return Math.abs(x - gx) < AVE_HALF + margin || Math.abs(z - gz) < AVE_HALF + margin;
}
function chunkTrees(cx, cz) {
  // Trees stand on the HOUSE side of the red walkway (TREE_LINE from the road edge), never on the walkway itself,
  // and keep clear of the crossing-road corners, lamp poles and bus shelters.
  const out = [], lo = [cx * CHUNK_SIZE, cz * CHUNK_SIZE];
  for (const axis of ['z', 'x']) {
    const aLo = axis === 'z' ? lo[0] : lo[1], qLo = axis === 'z' ? lo[1] : lo[0];
    for (let g = Math.ceil((aLo - 44) / ROAD_SPACING) * ROAD_SPACING; g <= aLo + CHUNK_SIZE + 44; g += ROAD_SPACING) {
      if (g < -5180 || g > 5180) continue;
      const half = AVE_HALF, SP = 10;
      const fa = furnitureAlong(g, qLo - 12, qLo + CHUNK_SIZE + 12);
      for (const side of [-1, 1]) {
        const q0 = -5140 + (side > 0 ? SP / 2 : 0);
        for (let n = Math.max(0, Math.floor((qLo - 2 - q0) / SP)), nMax = Math.ceil((qLo + CHUNK_SIZE + 2 - q0) / SP); n <= nMax; n++) {
          const q = q0 + n * SP;
          if (q > 5140) break;
          const jq = q + (treeHash(g, q, 11 + side) - 0.5) * 1.6;
          const off = g + side * (half + TREE_LINE + treeHash(q, g, 13) * 0.4);
          const x = axis === 'z' ? off : jq, z = axis === 'z' ? jq : off;
          if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue;
          const gc = Math.round(jq / ROAD_SPACING) * ROAD_SPACING;                // nearest crossing avenue
          if (Math.abs(jq - gc) < roadHalfAt(gc) + CORNER_PAD) continue;           // keep the corner walkways clear
          if (fa.poles.some(p => Math.abs(p - jq) < 4) || fa.stops.some(p => Math.abs(p - jq) < SHELTER_LEN / 2 + 5.5)) continue;
          if (IS_MOBILE && treeHash(x, z, 21) < 0.5) continue;   // half density on phones
          out.push({
            x, z, type: Math.floor(treeHash(x, z) * 2) % 2,
            s: (0.8 + treeHash(x, z, 9) * 0.35) * (0.88 + treeHash(x, z, 3) * 0.28),
            rot: treeHash(x, z, 4) * Math.PI * 2,
            tr: 0.9 + treeHash(x, z, 5) * 0.14, tg: 0.92 + treeHash(x, z, 6) * 0.14, tb: 0.88 + treeHash(x, z, 7) * 0.16
          });
        }
      }
    }
  }
  return out;
}

// ============================================================================
// CHUNK BUILD / DISPOSE / STREAM QUEUE
// ============================================================================
const roadHalfAt = () => AVE_HALF;   // only avenues exist now
// Stretches of a road BETWEEN the roads that cross it, so kerbs, pavements and markings never run through an intersection
function spansAlong(lo, hi) {
  const out = [];
  for (let g = Math.floor(lo / ROAD_SPACING) * ROAD_SPACING - ROAD_SPACING; g <= hi; g += ROAD_SPACING) {
    const s0 = Math.max(g + AVE_HALF, lo), e0 = Math.min(g + ROAD_SPACING - AVE_HALF, hi);
    if (e0 - s0 > 0.5) out.push([s0, e0]);
  }
  return out;
}
const poleInRoad = q => { const g = Math.round(q / ROAD_SPACING) * ROAD_SPACING; return Math.abs(q - g) < AVE_HALF + 1.5; };

// ---- Street furniture layout ---------------------------------------------------------------------------------
// Every road has a RED WALKWAY filling the whole gap between its kerb and the building line (WALK_W = the 12-unit setback).
// Lamp poles and trees stand on the house side of that walkway; bus shelters stand near the kerb, open to the road.
const WALK_W = ROAD_EDGE_CLEARANCE;
const SHELTER_LEN = 21.6, SHELTER_DEPTH = 6.8;   // 3x as long (along the road) and 2x as wide as before; height unchanged (18.33)
const SHELTER_OFFSET = 5.2;                    // shelter centre, from the road edge
const BUS_STOP_EVERY = 3;                      // a stop pair in every 3rd local-to-local block of an avenue = 630 units apart (was ~150)
const TREE_LINE = 8.9, POLE_LINE = 10.7;       // tree trunks / lamp poles, from the road edge (house side of the walkway)
const AVE_ARM = 9.5, LOCAL_ARM = 8.5;          // lamp arm lengths: they reach out over the kerb
const CORNER_PAD = WALK_W + 1.5;               // keep furniture out of the crossing road's own walkway
// Furniture positions along road line g (a constant x or z) for along-road coordinates in [lo, hi).
// One lamp per block on avenues (every second block on local roads); a bus stop in every second avenue block.
function furnitureAlong(g, lo, hi) {
  const out = { poles: [], stops: [], avenue: true };
  for (let a = Math.floor(lo / ROAD_SPACING) * ROAD_SPACING - ROAD_SPACING; a < hi; a += ROAD_SPACING) {
    if (a < -5180 || a + ROAD_SPACING > 5180) continue;
    const l0 = a + AVE_HALF + CORNER_PAD, l1 = a + ROAD_SPACING - AVE_HALF - CORNER_PAD;
    const mid = (l0 + l1) / 2, c = Math.round(a / ROAD_SPACING);
    const stop = (((c % BUS_STOP_EVERY) + BUS_STOP_EVERY) % BUS_STOP_EVERY === 0);   // a shelter pair in every 3rd block = 630 units apart
    if (stop && mid >= lo && mid < hi) out.stops.push(mid);
    for (const t of [0.12, 0.5, 0.88]) {                                              // three lamps per block, one beside the shelter if there is one
      const q = l0 + (l1 - l0) * t + (t === 0.5 && stop ? SHELTER_LEN / 2 + 3.5 : 0);
      if (q >= lo && q < hi) out.poles.push(q);
    }
  }
  return out;
}

function buildRoads(cx, cz, group, asphaltRecs) {
  const xMin = cx * CHUNK_SIZE, xMax = xMin + CHUNK_SIZE, zMin = cz * CHUNK_SIZE, zMax = zMin + CHUNK_SIZE;
  const midX = (xMin + xMax) / 2, midZ = (zMin + zMax) / 2;
  const pvm = [], kerb = [], white = [], yellow = [], poles = [], arms = [], heads = [], pools = [];
  const shelterRoofs = [], shelterBacks = [], shelterSides = [], shelterBenches = [], shelterFrames = [], busLaneMarks = [], busSignPoles = [], busSignDiscs = [], busSignFaces = [];
  const spansZ = spansAlong(zMin, zMax), spansX = spansAlong(xMin, xMax);
  const ZW = WALK_W, ZEBRA_T = 0.15 * 3 * 2;   // zebra: stripes run along the drive direction, ZW long (= red walkway width), 6x the lane-line thickness (3x, then doubled)
  const PAVE_W = WALK_W - 0.24, PAVE_C = 0.24 + PAVE_W / 2;   // red walkway: from the kerb out to the building line
  // Zebra crossings fill the first WALK_W (12) units of every road beside each junction, so centre / lane lines start after them.
  const markSpan = (s0, e0) => {
    const g = Math.floor((s0 - AVE_HALF + 0.01) / ROAD_SPACING) * ROAD_SPACING;
    return [Math.max(s0, g + AVE_HALF + WALK_W), Math.min(e0, g + ROAD_SPACING - AVE_HALF - WALK_W)];
  };

  for (let gx = Math.floor(xMin / ROAD_SPACING) * ROAD_SPACING; gx < xMax; gx += ROAD_SPACING) {   // avenues running along z
    if (gx < -5180 || gx > 5180 || gx < xMin) continue;
    const isAve = true, half = AVE_HALF;
    asphaltRecs.push({ x: gx, y: isAve ? -0.12 : -0.16, z: midZ, sx: half * 2, sy: isAve ? 0.18 : 0.12, sz: CHUNK_SIZE });
    for (const [s0, e0] of spansZ) {
      const mz = (s0 + e0) / 2, len = e0 - s0;
      for (const side of [-1, 1]) {
        kerb.push({ x: gx + side * (half + 0.12), y: 0.05, z: mz, sx: 0.24, sy: 0.18, sz: len });
        pvm.push({ x: gx + side * (half + PAVE_C), y: 0.02, z: mz, sx: PAVE_W, sy: 0.12, sz: len });
      }
      if (isAve) {
        const [m0, m1] = markSpan(s0, e0), mm = (m0 + m1) / 2, ml = m1 - m0;
        if (ml > 0.5) yellow.push({ x: gx - 0.42, y: 0.095, z: mm, sx: 0.22, sy: 0.03, sz: ml }, { x: gx + 0.42, y: 0.095, z: mm, sx: 0.22, sy: 0.03, sz: ml });
        for (let q = Math.ceil((m0 + 2) / 14) * 14; q <= m1 - 2; q += 14)
          white.push({ x: gx - 12, y: 0.095, z: q, sx: 0.15, sy: 0.03, sz: 4 }, { x: gx + 12, y: 0.095, z: q, sx: 0.15, sy: 0.03, sz: 4 });
      }
    }
    const fa = furnitureAlong(gx, zMin, zMax);
    // Streetlights: pole on the house side of the walkway, arm reaching out toward the road, lamp head on the arm's end.
    const armLen = isAve ? AVE_ARM : LOCAL_ARM;
    for (const q of fa.poles) for (const side of [-1, 1]) {
      const px = gx + side * (half + POLE_LINE), toRoad = -side;
      const rot = side < 0 ? 0 : Math.PI;                     // the arm's local +x axis must point toward the road
      const hx = px + toRoad * armLen * 0.9;
      poles.push({ x: px, y: 0, z: q, ry: rot, sx: 1, sy: 1, sz: 1 });
      arms.push({ x: px, y: 0, z: q, ry: rot, sx: armLen, sy: 1, sz: 1 });
      heads.push({ x: hx, y: 0, z: q, ry: rot, sx: 1, sy: 1, sz: 1 });
      if (isAve) pools.push({ x: hx, y: 0.1, z: q, sx: 120, sy: 1, sz: 120 });
    }
    // Modern glass shelters, one on each pavement of the avenue, directly opposite each other and open to the road.
    if (isAve) for (const q of fa.stops) for (const side of [-1, 1]) {
      const sx = gx + side * (half + SHELTER_OFFSET), bx = sx + side * (SHELTER_DEPTH / 2 - 0.1), fx = sx - side * (SHELTER_DEPTH / 2 - 0.15);
      shelterRoofs.push({ x: sx, y: shelterRoofHeight - 0.225, z: q, sx: SHELTER_DEPTH + 0.8, sy: 0.45, sz: SHELTER_LEN + 1.0 });
      shelterBacks.push({ x: bx, y: GLASS_Y, z: q, sx: 0.14, sy: GLASS_H, sz: SHELTER_LEN });
      for (const e of [-1, 1]) shelterSides.push({ x: sx + side * 1.7, y: GLASS_Y, z: q + e * (SHELTER_LEN / 2 - 0.07), sx: SHELTER_DEPTH / 2, sy: GLASS_H, sz: 0.14 });
      for (const dz of BACK_POSTS) shelterFrames.push({ x: bx, y: POST_H / 2, z: q + dz, sx: 0.3, sy: POST_H, sz: 0.3 });
      for (const dz of FRONT_POSTS) shelterFrames.push({ x: fx, y: POST_H / 2, z: q + dz, sx: 0.3, sy: POST_H, sz: 0.3 });
      // Seat slides back until it touches the metal back posts, and rests on a steel rail bolted to those posts.
      for (const dz of [-5.4, 5.4]) {
        shelterBenches.push({ x: bx - side * (0.15 + 0.55), y: SEAT_Y, z: q + dz, sx: 1.1, sy: SEAT_THICK, sz: 7.0 });
        shelterFrames.push({ x: bx - side * 0.3, y: SEAT_TOP - SEAT_THICK - 0.15, z: q + dz, sx: 0.3, sy: 0.3, sz: 7.0 });
      }
      // Round blue BUS STOP sign on a metal bar, at the approach end of the shelter (disc faces along the road; text on both faces).
      {
        const px = gx + side * (half + 3.3), pz = q + side * (SHELTER_LEN / 2 + 1.5), fo = BUS_SIGN_THICK / 2 + 0.02;
        busSignPoles.push({ x: px, y: 0, z: pz, sx: 1, sy: BUS_SIGN_Y, sz: 1 });
        busSignDiscs.push({ x: px, y: BUS_SIGN_Y, z: pz, sx: 1, sy: 1, sz: 1 });
        busSignFaces.push({ x: px, y: BUS_SIGN_Y, z: pz + fo, ry: 0, sx: BUS_SIGN_R * 2, sy: BUS_SIGN_R * 2, sz: 1 },
                          { x: px, y: BUS_SIGN_Y, z: pz - fo, ry: Math.PI, sx: BUS_SIGN_R * 2, sy: BUS_SIGN_R * 2, sz: 1 });
      }
      // BUS legend in the kerb lane in front of the shelter, upright for the driver (top of the letters = direction of travel; right-hand traffic).
      busLaneMarks.push({ x: gx + side * (half - 6), y: 0.115, z: q, sx: BUS_MARK_W, sy: 1, sz: BUS_MARK_L, ry: side > 0 ? 0 : Math.PI });
    }
  }
  for (let gz = Math.floor(zMin / ROAD_SPACING) * ROAD_SPACING; gz < zMax; gz += ROAD_SPACING) {   // avenues running along x
    if (gz < -5180 || gz > 5180 || gz < zMin) continue;
    const isAve = true, half = AVE_HALF;
    asphaltRecs.push({ x: midX, y: isAve ? -0.12 : -0.16, z: gz, sx: CHUNK_SIZE, sy: isAve ? 0.18 : 0.12, sz: half * 2 });
    for (const [s0, e0] of spansX) {
      const mx = (s0 + e0) / 2, len = e0 - s0;
      for (const side of [-1, 1]) {
        kerb.push({ x: mx, y: 0.05, z: gz + side * (half + 0.12), sx: len, sy: 0.18, sz: 0.24 });
        pvm.push({ x: mx, y: 0.02, z: gz + side * (half + PAVE_C), sx: len, sy: 0.12, sz: PAVE_W });
      }
      if (isAve) {
        const [m0, m1] = markSpan(s0, e0), mm = (m0 + m1) / 2, ml = m1 - m0;
        if (ml > 0.5) yellow.push({ x: mm, y: 0.095, z: gz - 0.42, sx: ml, sy: 0.03, sz: 0.22 }, { x: mm, y: 0.095, z: gz + 0.42, sx: ml, sy: 0.03, sz: 0.22 });
        for (let q = Math.ceil((m0 + 2) / 14) * 14; q <= m1 - 2; q += 14)
          white.push({ x: q, y: 0.095, z: gz - 12, sx: 4, sy: 0.03, sz: 0.15 }, { x: q, y: 0.095, z: gz + 12, sx: 4, sy: 0.03, sz: 0.15 });
      }
    }
    const fa = furnitureAlong(gz, xMin, xMax);
    const armLen = isAve ? AVE_ARM : LOCAL_ARM;
    for (const q of fa.poles) for (const side of [-1, 1]) {
      const pz = gz + side * (half + POLE_LINE), toRoad = -side;
      // Rotating by +/-90 degrees turns the arm's local +x axis to world -/+z, so the sign is side * 90 degrees.
      // (The old code used the opposite sign, so the arm pointed away from the road while the lamp head sat on the other side.)
      const rot = side * Math.PI / 2;
      const hz = pz + toRoad * armLen * 0.9;
      poles.push({ x: q, y: 0, z: pz, ry: rot, sx: 1, sy: 1, sz: 1 });
      arms.push({ x: q, y: 0, z: pz, ry: rot, sx: armLen, sy: 1, sz: 1 });
      heads.push({ x: q, y: 0, z: hz, ry: rot, sx: 1, sy: 1, sz: 1 });
      if (isAve) pools.push({ x: q, y: 0.1, z: hz, sx: 120, sy: 1, sz: 120 });
    }
    if (isAve) for (const q of fa.stops) for (const side of [-1, 1]) {
      const sz = gz + side * (half + SHELTER_OFFSET), bz = sz + side * (SHELTER_DEPTH / 2 - 0.1), fz = sz - side * (SHELTER_DEPTH / 2 - 0.15);
      shelterRoofs.push({ x: q, y: shelterRoofHeight - 0.225, z: sz, sx: SHELTER_LEN + 1.0, sy: 0.45, sz: SHELTER_DEPTH + 0.8 });
      shelterBacks.push({ x: q, y: GLASS_Y, z: bz, sx: SHELTER_LEN, sy: GLASS_H, sz: 0.14 });
      for (const e of [-1, 1]) shelterSides.push({ x: q + e * (SHELTER_LEN / 2 - 0.07), y: GLASS_Y, z: sz + side * 1.7, sx: 0.14, sy: GLASS_H, sz: SHELTER_DEPTH / 2 });
      for (const dx of BACK_POSTS) shelterFrames.push({ x: q + dx, y: POST_H / 2, z: bz, sx: 0.3, sy: POST_H, sz: 0.3 });
      for (const dx of FRONT_POSTS) shelterFrames.push({ x: q + dx, y: POST_H / 2, z: fz, sx: 0.3, sy: POST_H, sz: 0.3 });
      for (const dx of [-5.4, 5.4]) {
        shelterBenches.push({ x: q + dx, y: SEAT_Y, z: bz - side * (0.15 + 0.55), sx: 7.0, sy: SEAT_THICK, sz: 1.1 });
        shelterFrames.push({ x: q + dx, y: SEAT_TOP - SEAT_THICK - 0.15, z: bz - side * 0.3, sx: 7.0, sy: 0.3, sz: 0.3 });
      }
      {
        const px = q - side * (SHELTER_LEN / 2 + 1.5), pz = gz + side * (half + 3.3), fo = BUS_SIGN_THICK / 2 + 0.02;
        busSignPoles.push({ x: px, y: 0, z: pz, sx: 1, sy: BUS_SIGN_Y, sz: 1 });
        busSignDiscs.push({ x: px, y: BUS_SIGN_Y, z: pz, ry: Math.PI / 2, sx: 1, sy: 1, sz: 1 });
        busSignFaces.push({ x: px + fo, y: BUS_SIGN_Y, z: pz, ry: Math.PI / 2, sx: BUS_SIGN_R * 2, sy: BUS_SIGN_R * 2, sz: 1 },
                          { x: px - fo, y: BUS_SIGN_Y, z: pz, ry: -Math.PI / 2, sx: BUS_SIGN_R * 2, sy: BUS_SIGN_R * 2, sz: 1 });
      }
      busLaneMarks.push({ x: q, y: 0.115, z: gz + side * (half - 6), sx: BUS_MARK_W, sy: 1, sz: BUS_MARK_L, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  // Junction markings. Every road approach gets a thick white STOP LINE across its approaching (right-hand) lanes, just before the
  // crossing road; every crossing gets a yellow BOX JUNCTION (square outline + diagonals) painted inside it. Each junction belongs to the chunk
  // that holds its centre, so nothing is drawn twice.
  for (let ix = Math.ceil(xMin / ROAD_SPACING) * ROAD_SPACING; ix < xMax; ix += ROAD_SPACING) {
    if (ix < -5180 || ix > 5180) continue;
    for (let iz = Math.ceil(zMin / ROAD_SPACING) * ROAD_SPACING; iz < zMax; iz += ROAD_SPACING) {
      if (iz < -5180 || iz > 5180) continue;
      const hx = roadHalfAt(ix), hz = roadHalfAt(iz);
      const yZ = hx > 4 ? 0.095 : 0.03, yX = hz > 4 ? 0.095 : 0.03, yB = (hx > 4 || hz > 4) ? 0.095 : 0.03;   // paint height follows each road's own lane-line convention
      const SL = 1.2, GAP = 0.6, OFF = ZW;   // stop line: 1.2 thick, pushed back OFF (=zebra length) so the zebra comes right after it
      white.push({ x: ix - (hx + GAP) / 2, y: yZ, z: iz - hz - OFF - GAP - SL / 2 - 0.2, sx: hx - GAP, sy: 0.03, sz: SL },   // southbound traffic (west half), north of the crossing
                 { x: ix + (hx + GAP) / 2, y: yZ, z: iz + hz + OFF + GAP + SL / 2 + 0.2, sx: hx - GAP, sy: 0.03, sz: SL },   // northbound traffic (east half), south of it
                 { x: ix - hx - OFF - GAP - SL / 2 - 0.2, y: yX, z: iz + (hz + GAP) / 2, sx: SL, sy: 0.03, sz: hz - GAP },   // eastbound traffic (south half), west of it
                 { x: ix + hx + OFF + GAP + SL / 2 + 0.2, y: yX, z: iz - (hz + GAP) / 2, sx: SL, sy: 0.03, sz: hz - GAP }); // westbound traffic (north half), east of it
      // ZEBRA CROSSINGS: on each of the 4 arms, in the 12-unit strip beside the junction (exactly where the red walkway of the
      // crossing road meets this road), after the stop line. Stripes run along the direction of drive and fill the road kerb to kerb.
      {
        const N = Math.floor((2 * hx - ZEBRA_T) / (2 * ZEBRA_T)) + 1, pitch = (2 * hx - ZEBRA_T) / (N - 1), yz = 0.1;
        for (let k = 0; k < N; k++) {
          const o = -hx + ZEBRA_T / 2 + k * pitch;
          white.push({ x: ix + o, y: yz, z: iz - hz - ZW / 2, sx: ZEBRA_T, sy: 0.03, sz: ZW },   // arm to the north (-z)
                     { x: ix + o, y: yz, z: iz + hz + ZW / 2, sx: ZEBRA_T, sy: 0.03, sz: ZW },   // arm to the south (+z)
                     { x: ix - hx - ZW / 2, y: yz, z: iz + o, sx: ZW, sy: 0.03, sz: ZEBRA_T },   // arm to the west (-x)
                     { x: ix + hx + ZW / 2, y: yz, z: iz + o, sx: ZW, sy: 0.03, sz: ZEBRA_T });  // arm to the east (+x)
        }
      }
      const ex = hx - 0.8, ez = hz - 0.8, t = 0.3;
      yellow.push({ x: ix, y: yB, z: iz - ez, sx: 2 * ex + t, sy: 0.03, sz: t }, { x: ix, y: yB, z: iz + ez, sx: 2 * ex + t, sy: 0.03, sz: t },
                  { x: ix - ex, y: yB, z: iz, sx: t, sy: 0.03, sz: 2 * ez }, { x: ix + ex, y: yB, z: iz, sx: t, sy: 0.03, sz: 2 * ez });
      const dl = Math.hypot(2 * ex, 2 * ez), da = Math.atan2(ez, ex);
      yellow.push({ x: ix, y: yB, z: iz, sx: dl, sy: 0.03, sz: t, ry: -da }, { x: ix, y: yB, z: iz, sx: dl, sy: 0.03, sz: t, ry: da });
    }
  }
  batch(asphaltRecs, UNIT_BOX, asphaltMat, group);
  batch(pvm, UNIT_BOX, pavementMat, group);
  batch(kerb, UNIT_BOX, kerbEdgeMat, group);
  batch(white, UNIT_BOX, paintWhite, group);
  batch(yellow, UNIT_BOX, paintYellow, group);
  batch(poles, poleGeo, poleMat, group);
  batch(arms, armGeo, poleMat, group);
  batch(heads, headGeo, lampGlow, group);
  batch(shelterRoofs, UNIT_BOX, shelterRoofMat, group);
  batch(shelterBacks, UNIT_BOX, shelterGlassMat, group);
  batch(shelterSides, UNIT_BOX, shelterGlassMat, group);
  batch(shelterBenches, UNIT_BOX, shelterBenchMat, group);
  batch(shelterFrames, UNIT_BOX, shelterFrameMat, group);
  batch(busSignPoles, busSignPoleGeo, shelterFrameMat, group);
  batch(busSignDiscs, busSignDiscGeo, busSignDiscMat, group);
  batch(busSignFaces, UNIT_PLANE_XY, busSignFaceMat, group, false, 3);
  batch(busLaneMarks, UNIT_PLANE_XZ, busLaneMarkMat, group, false, 3);
  if (!IS_MOBILE) batch(pools, UNIT_PLANE_XZ, slPoolMat, group, false, 2);   // additive overdraw: desktop only
}

// A chunk is built in small jobs spread over frames, so no single frame does all the work.
const taskQueue = [];
function buildChunkContent(cx, cz) {
  const key = chunkKey(cx, cz);
  if (loadedChunks.has(key)) return;
  const entry = { cx, cz, group: new THREE.Group(), disposables: [], dead: false };
  loadedChunks.set(key, entry);
  const xMin = cx * CHUNK_SIZE, zMin = cz * CHUNK_SIZE;
  if (xMin + CHUNK_SIZE < -CITY_HALF || xMin > CITY_HALF || zMin + CHUNK_SIZE < -CITY_HALF || zMin > CITY_HALF) return; // off the map
  scene.add(entry.group);
  const group = entry.group, bp = chunkBlueprints.get(key), boxes = [], asphalt = [];
  const box = (w, h, d, color, x, y, z) => boxes.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: d, color });
  const job = fn => taskQueue.push({ entry, fn });

  job(() => {   // 1. collect every coloured box (buildings, roofs, windows, facilities)
    const towers = [];
    for (let bi = Math.floor(xMin / ROAD_SPACING) - 1, e = Math.ceil((xMin + CHUNK_SIZE) / ROAD_SPACING) + 1; bi <= e; bi++)
      for (let bj = Math.floor(zMin / ROAD_SPACING) - 1, f = Math.ceil((zMin + CHUNK_SIZE) / ROAD_SPACING) + 1; bj <= f; bj++) {
        const r = infillAt(bi, bj);
        if (!r || Math.floor(r.x / CHUNK_SIZE) !== cx || Math.floor(r.z / CHUNK_SIZE) !== cz) continue;
        towers.push(r);
      }
    if (bp) for (const b of bp.buildings) towers.push(b);
    for (const t of towers) emitBuilding(t, group, entry, boxes);
    if (!bp) return;
    for (const f of bp.facilities) {
      if (f.type === 'parking') {
        asphalt.push({ x: f.x, y: -0.04, z: f.z, sx: 42, sy: 0.16, sz: 42 });
        for (let i = 0; i <= 6; i++) box(0.22, 0.035, 28, C.line, f.x - 18 + i * 6, 0.05, f.z + 1);
      } else if (f.type === 'canopy') box(10, 0.35, 10, C.market, f.x, 4.4, f.z);
      else if (f.type === 'pitch') box(82 * f.s, 0.22, 48 * f.s, C.sportGreen, f.cx, 0.04, f.cz);
      else if (f.type === 'tennis') box(22 * f.s, 0.2, 36 * f.s, C.sportBlue, f.cx, 0.06, f.cz);
      else if (f.type === 'basketball') box(38, 0.2, 23, C.sportRed, f.cx, 0.05, f.cz);
      else if (f.type === 'sportscomplex') {
        const s = f.s;
        box(44 * s, 0.22, 44 * s, C.plaza, f.x, 0, f.z);
        box(22 * s, 0.16, 12 * s, C.sportGreen, f.x - 8 * s, 0.18, f.z - 10 * s);
        box(16 * s, 0.16, 9 * s, C.sportRed, f.x + 9 * s, 0.18, f.z - 10 * s);
        box(19 * s, 0.16, 10 * s, C.sportBlue, f.x - 8 * s, 0.18, f.z + 5 * s);
        box(12 * s, 4.4 * s, 7 * s, C.hall, f.x + 9 * s, 0, f.z + 9 * s);
      }
    }
  });
  job(() => { batch(boxes, UNIT_BOX, instMat, group, true); });          // 2. one draw call for all boxes
  job(() => { buildRoads(cx, cz, group, asphalt); });                       // 3. roads, kerbs, markings, lamps
  job(() => {                                                               // 4. palms
    const trees = chunkTrees(cx, cz);
    if (!trees.length) return;
    for (let type = 0; type < 2; type++) {
      const recs = [];
      for (const t of trees) {
        if (t.type !== type) continue;
        const sc = t.s * TREE_TYPES[type].base;
        recs.push({ x: t.x, y: 0, z: t.z, ry: t.rot, sx: sc, sy: IS_MOBILE ? sc * TREE_FAR_STRETCH[type] : sc, sz: sc, tr: t.tr, tg: t.tg, tb: t.tb });
      }
      batch(recs, IS_MOBILE ? TREE_FAR_GEO : TREE_TYPES[type].geo, treeMat, group, true);
    }
    if (TREE_SHADE_DECALS) {
      batch(trees.map(t => {
        const T = TREE_TYPES[t.type], sc = t.s * T.base, h = T.crownY * sc;
        const ox = (-TREE_SUN.x / TREE_SUN.y) * h, oz = (-TREE_SUN.z / TREE_SUN.y) * h, w = T.shade * sc * 1.5;
        return { x: t.x + ox, y: 0.16, z: t.z + oz, ry: Math.atan2(-oz, ox), sx: w, sy: 1, sz: w };
      }), UNIT_PLANE_XZ, shadeMat, group, false, 2);
    }
  });
  job(() => {                                                               // 5. signs
    for (const s of (bp ? bp.signs : [])) {
      const tex = makeCompactSignTexture(s.text, s.color);
      const faceMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      entry.disposables.push(tex, faceMat);
      const yaw = s.axis === 'z' ? 0 : Math.PI / 2;
      if (s.type === 'gateway') {
        const g = new THREE.Group();
        g.position.set(s.x, 0, s.z); g.rotation.y = yaw;
        for (const sx of [-1, 1]) { const pole = new THREE.Mesh(districtPoleGeo, districtPoleMat); pole.position.set(sx * DISTRICT_POLE_OFFSET, DISTRICT_POLE_HEIGHT / 2, 0); g.add(pole); }
        const board = new THREE.Mesh(UNIT_PLANE_XY, faceMat);
        board.scale.set(s.width, DISTRICT_BOARD_H, 1); board.position.set(0, s.y, 0);
        g.add(board); group.add(g);
      } else {
        if (s.type === 'street') { const pole = new THREE.Mesh(streetSignPoleGeo, streetSignPoleMat); pole.position.set(s.x, STREET_SIGN_POLE_HEIGHT / 2, s.z); group.add(pole); }
        const board = new THREE.Mesh(UNIT_PLANE_XY, faceMat);
        board.scale.set(s.width, s.type === 'street' ? 2 : 5, 1); board.rotation.y = yaw; board.position.set(s.x, s.y, s.z);
        group.add(board);
      }
    }
    // Place readable street-name signs throughout this loaded chunk, rather than at one remote city edge.
    const x0 = cx * CHUNK_SIZE, x1 = x0 + CHUNK_SIZE, z0 = cz * CHUNK_SIZE, z1 = z0 + CHUNK_SIZE;
    const addStreetNameSign = (label, x, z, axis) => {
      const tex = makeCompactSignTexture(label, 0x10446f);
      const material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      entry.disposables.push(tex, material);
      const pole = new THREE.Mesh(streetSignPoleGeo, streetSignPoleMat);
      pole.position.set(x, STREET_SIGN_POLE_HEIGHT / 2, z); group.add(pole);
      const board = new THREE.Mesh(UNIT_PLANE_XY, material);
      board.scale.set(12 * STREET_SIGN_SCALE, 2, 1);
      board.rotation.y = axis === 'x' ? Math.PI / 2 : 0;
      board.position.set(x, STREET_SIGN_POLE_HEIGHT - 1.1, z); group.add(board);
    };
    for (let gx = Math.ceil(x0 / ROAD_SPACING) * ROAD_SPACING; gx < x1 && gx >= -5180 && gx <= 5180; gx += ROAD_SPACING)
      addStreetNameSign(streetName('x', Math.round(gx / ROAD_SPACING)), gx + AVE_HALF + 2, (z0 + z1) / 2, 'x');
    for (let gz = Math.ceil(z0 / ROAD_SPACING) * ROAD_SPACING; gz < z1 && gz >= -5180 && gz <= 5180; gz += ROAD_SPACING)
      addStreetNameSign(streetName('z', Math.round(gz / ROAD_SPACING)), (x0 + x1) / 2, gz + AVE_HALF + 2, 'z');
  });
}

function unloadChunk(key) {
  const ch = loadedChunks.get(key);
  if (!ch) return;
  ch.dead = true;
  scene.remove(ch.group);
  ch.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });   // frees instance buffers; shared geometry/materials stay
  for (const d of ch.disposables) d.dispose();                         // per-chunk sign textures + materials
  loadedChunks.delete(key);
}

function distToChunk(cx, cz) {
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE, px = player.position.x, pz = player.position.z;
  return Math.hypot(Math.max(x0 - px, 0, px - x0 - CHUNK_SIZE), Math.max(z0 - pz, 0, pz - z0 - CHUNK_SIZE));
}
const buildQueue = [];
let lastPcx = Infinity, lastPcz = Infinity;
function updateStreamedChunks(force = false) {
  const pcx = Math.floor(player.position.x / CHUNK_SIZE), pcz = Math.floor(player.position.z / CHUNK_SIZE);
  if (!force && pcx === lastPcx && pcz === lastPcz) return;
  lastPcx = pcx; lastPcz = pcz;
  buildQueue.length = 0;
  const range = Math.ceil(LOAD_RADIUS / CHUNK_SIZE);
  for (let dx = -range; dx <= range; dx++) for (let dz = -range; dz <= range; dz++) {
    const cx = pcx + dx, cz = pcz + dz;
    if (loadedChunks.has(chunkKey(cx, cz))) continue;
    const d = distToChunk(cx, cz);
    if (d <= LOAD_RADIUS) buildQueue.push({ cx, cz, d });
  }
  buildQueue.sort((a, b) => a.d - b.d);
  for (const [key, ch] of loadedChunks) if (distToChunk(ch.cx, ch.cz) > UNLOAD_RADIUS) unloadChunk(key);
}
function pumpChunks(budgetMs, minTasks = 1) {   // run queued chunk jobs until the frame budget is spent
  const t0 = performance.now();
  let n = 0;
  for (;;) {
    if (n >= minTasks && performance.now() - t0 >= budgetMs) break;
    if (!taskQueue.length) {
      if (!buildQueue.length) break;
      const c = buildQueue.shift(); buildChunkContent(c.cx, c.cz); continue;
    }
    const t = taskQueue.shift();
    if (!t.entry.dead) t.fn();
    n++;
  }
}

// ============================================================================
// AVATAR
// ============================================================================
let body;
const avatarDefaults = { skin: '#70452f', hair: '#171513', style: 'Low cut', top: '#16834a', bottom: '#263d35', shoes: '#f3f3e9', name: 'New Lagosian' };
let avatarSettings = { ...avatarDefaults };
const AV = {};   // shared avatar geometries (created once)
const fallbackAvatar = new THREE.Group();
function avPart(geoKey, make, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(AV[geoKey] || (AV[geoKey] = make()), material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); fallbackAvatar.add(mesh);
  return mesh;
}
function rebuildAvatar(opts = avatarSettings) {
  avatarSettings = { ...opts };
  fallbackAvatar.clear();
  const skin = mat(avatarSettings.skin, 0.72), hairMat = mat(avatarSettings.hair, 0.92), shirt = mat(avatarSettings.top);
  const trousers = mat(avatarSettings.bottom), shoe = mat(avatarSettings.shoes);
  body = avPart('body', () => new THREE.CapsuleGeometry(0.34, 0.72, 6, 12), shirt, 0, 1.08, 0, 1.05, 1, 0.72);
  avPart('neck', () => new THREE.CylinderGeometry(0.105, 0.12, 0.22, 12), skin, 0, 1.72, 0);
  avPart('head', () => new THREE.SphereGeometry(0.29, 20, 16), skin, 0, 2.02, 0, 0.88, 1.12, 0.9);
  avPart('hair', () => new THREE.SphereGeometry(0.295, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat, 0, 2.18, -0.005, 1, 0.7, 1);
  for (const side of [-1, 1]) {
    avPart('arm', () => new THREE.CapsuleGeometry(0.105, 0.53, 4, 8), skin, side * 0.39, 1.12, 0, 1, 1, 0.95).rotation.z = side * -0.12;
    avPart('leg', () => new THREE.CapsuleGeometry(0.135, 0.52, 4, 8), trousers, side * 0.16, 0.39, 0, 1, 1, 0.9);
    avPart('shoe', () => UNIT_BOX, shoe, side * 0.16, 0.105, -0.075, 0.22, 0.13, 0.38);
  }
}
player.add(fallbackAvatar);

// ----------------------------------------------------------------------------
// CHARACTER (GLB) TEXTURE BUDGET
// A 4K/8K texture decodes to 64-256 MB each (plus mipmaps on the GPU), so a single
// character can cost gigabytes. Textures are capped BEFORE they are decoded (Chrome/Android
// path), with a post-decode shrink as the fallback (Safari/iOS path).
// ----------------------------------------------------------------------------
const AVATAR_TEX_MAX = IS_MOBILE ? 1024 : 2048;
function imageSizeOf(b) {   // read width/height from the file header without decoding the pixels
  if (b[0] === 0x89 && b[1] === 0x50)   // PNG
    return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  if (b[0] === 0xff && b[1] === 0xd8) {   // JPEG: walk the markers to the first SOF
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) {   // WebP
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (t === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (t === 'VP8L') return { w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
  }
  return null;
}
function capImageDecode(max) {   // while the GLB loads, decode oversized textures at a reduced size; returns an undo function
  const native = window.createImageBitmap;
  if (!native) return () => {};
  window.createImageBitmap = async function (src, opts) {
    try {
      if (src instanceof Blob) {
        const s = imageSizeOf(new Uint8Array(await src.slice(0, 262144).arrayBuffer()));
        if (s && s.w && s.h && Math.max(s.w, s.h) > max) {
          const k = max / Math.max(s.w, s.h);
          return await native.call(window, src, { ...(opts || {}), resizeWidth: Math.max(1, Math.round(s.w * k)), resizeHeight: Math.max(1, Math.round(s.h * k)), resizeQuality: 'medium' });
        }
      }
    } catch (_e) { /* fall through to a normal decode */ }
    return native.call(window, src, opts);
  };
  return () => { window.createImageBitmap = native; };
}
function shrinkTexture(tex, max) {   // post-decode fallback (Safari/iOS decode on their own)
  const img = tex?.image;
  if (!img || !img.width || Math.max(img.width, img.height) <= max) return;
  const k = max / Math.max(img.width, img.height), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  img.close?.();
  tex.image = cv; tex.needsUpdate = true;
}

let avatarMixer = null, avatarModel = null, avatarActions = {}, activeAvatarAction = null;
let avatarGroundAlignElapsed = 0;
try {
  const saved = JSON.parse(localStorage.getItem('til-character') || 'null');
  if (saved) {
    avatarSettings = { ...avatarDefaults, ...saved };
    const nameEl = document.querySelector('.player-name');
    if (nameEl) nameEl.textContent = saved.name || 'New Lagosian';
  }
} catch (_e) {}
player.position.set(0, 0, 5);

// The simple built-in character is shown straight away, so there is always a visible player
// (even while a big GLB downloads, or if it fails on a phone). The GLB replaces it when ready.
rebuildAvatar(avatarSettings);
player.visible = true;

const loadingBadge = document.createElement('div');
loadingBadge.id = 'modelLoading'; loadingBadge.textContent = 'Loading your character…';
document.body.appendChild(loadingBadge);

const AVATAR_FULL = './models/The_Miami_Dealer.glb';
const AVATAR_MOBILE = './models/The_Miami_Dealer_mobile.glb';   // optional small export (see notes); used first on phones
// Phones never download the full model: it is what was crashing them. Without a *_mobile.glb they keep the simple built-in character.
const avatarUrls = IS_MOBILE ? [AVATAR_MOBILE] : [AVATAR_FULL];
const AVATAR_MAX_BYTES = IS_MOBILE ? 12 * 1048576 : Infinity;
let avatarInfo = 'not loaded yet';
// Downloads the model while counting the REAL (decompressed) bytes, and stops as soon as the limit is passed.
// (Content-Length / xhr.total are the gzip size, which is why the old progress showed values like 380%.)
async function fetchCapped(url, maxBytes, onBytes) {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.missing = true; throw e; }
  const reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (got > maxBytes) { reader.cancel(); const e = new Error('too big'); e.tooBig = true; throw e; }
    parts.push(value); onBytes?.(got);
  }
  const buf = new Uint8Array(got); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return buf.buffer;
}

const avatarTexReport = new Set();   // texture sizes actually in memory (shown in ?debug)
function attachAvatar(gltf) {
  const model = gltf.scene;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.setScalar(2.35 / (size.y || 2.3));
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    o.frustumCulled = false;   // skinned meshes can be culled wrongly by their bind-pose bounds
    // Face morph targets are never driven by this game, and three builds a float texture for them PER material
    // (the original GLB: 24 materials x 34 targets = ~2 GB). Strip them if an unoptimised GLB is ever used.
    if (o.geometry?.morphAttributes && Object.keys(o.geometry.morphAttributes).length) o.geometry.morphAttributes = {};
    o.morphTargetInfluences = undefined; o.morphTargetDictionary = undefined;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      if (IS_MOBILE) {   // phones: no normal/AO maps (small on screen, costly in memory and fill-rate)
        for (const k of ['normalMap', 'aoMap']) if (m[k]) { m[k].image?.close?.(); m[k] = null; m.needsUpdate = true; }
      }
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (!m[k]) continue;
        shrinkTexture(m[k], AVATAR_TEX_MAX);
        avatarTexReport.add(k + ' ' + (m[k].image?.width || '?') + 'x' + (m[k].image?.height || '?'));
        if (IS_MOBILE && k === 'map') { m[k].generateMipmaps = false; m[k].minFilter = THREE.LinearFilter; }
      }
    }
  });
  fallbackAvatar.visible = false; body = undefined;
  avatarModel = model;
  player.add(avatarModel);
  if (gltf.animations?.length) {
    avatarMixer = new THREE.AnimationMixer(avatarModel);
    for (const clip of gltf.animations) {
      clip.tracks = clip.tracks.filter(t => !/^root.position(?:\(.*\))?$/i.test(t.name) && !/morphTargetInfluences/.test(t.name));
      avatarActions[clip.name.toLowerCase()] = avatarMixer.clipAction(clip);
    }
    activeAvatarAction = avatarActions[Object.keys(avatarActions).find(n => n.includes('idle')) || Object.keys(avatarActions)[0]];
    activeAvatarAction?.play();
  }
}

async function loadAvatar(i = 0) {
  const url = avatarUrls[i];
  const next = () => {
    if (i + 1 < avatarUrls.length) { loadAvatar(i + 1); return; }
    loadingBadge.textContent = 'Using simple character preview';   // procedural character stays visible
    setTimeout(() => loadingBadge.remove(), 2600);
  };
  avatarInfo = 'downloading ' + url;
  let buf;
  try {
    buf = await fetchCapped(url, AVATAR_MAX_BYTES, n => { loadingBadge.textContent = 'Loading your character… ' + (n / 1048576).toFixed(1) + ' MB'; });
  } catch (err) {
    avatarInfo = err.tooBig ? 'skipped: over ' + Math.round(AVATAR_MAX_BYTES / 1048576) + ' MB real size, too big for phone ' + url : err.missing ? 'missing ' + url : 'download failed ' + url;
    console.warn('Character model not used:', url, err.message);
    next(); return;
  }
  avatarInfo = (buf.byteLength / 1048576).toFixed(1) + ' MB real size ' + url;
  const restoreDecode = capImageDecode(AVATAR_TEX_MAX);
  let settled = false;
  const fail = err => {
    if (settled) return; settled = true; restoreDecode();
    avatarInfo = 'failed ' + url; console.warn('Character model failed:', url, err);
    next();
  };
  new GLTFLoader().parse(buf, url.slice(0, url.lastIndexOf('/') + 1), gltf => {
    if (settled) return;
    try { attachAvatar(gltf); } catch (err) { fail(err); return; }
    settled = true; restoreDecode();
    avatarInfo += ' - loaded; textures: ' + ([...avatarTexReport].join(', ') || 'none');
    loadingBadge.remove();
    toast('Character loaded');
  }, fail);
}
if (NO_AVATAR) loadingBadge.remove(); else loadAvatar(0);

// ============================================================================
// WEATHER, CAMERA, DAY/NIGHT
// ============================================================================
const rainGroup = new THREE.Group();
scene.add(rainGroup);
const RAIN_COUNT = IS_MOBILE ? 160 : 350;
const rainGeo = new THREE.BufferGeometry();
const rainPositions = new Float32Array(RAIN_COUNT * 3);
for (let i = 0; i < RAIN_COUNT; i++) {
  rainPositions[i * 3] = (Math.random() - 0.5) * 140; rainPositions[i * 3 + 1] = Math.random() * 35; rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 140;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rainPoints = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xd9efff, size: 0.35, transparent: true, opacity: 0.65 }));
rainPoints.frustumCulled = false;
rainGroup.add(rainPoints);
rainGroup.visible = false;

let cameraMode = 0, weather = 'Clear', worldMinutes = 12 * 60, daySpeed = 3, lookAngle = 0, lookPitch = 0.12, cameraDistance = 120;
const CAMERA_DISTANCE_DEFAULT = 120, CAMERA_DISTANCE_MIN = 12, CAMERA_DISTANCE_MAX = CAMERA_DISTANCE_DEFAULT * 20;
function syncZoomControl() {
  const slider = document.getElementById('zoomSlider');
  if (!slider) return;
  const t = Math.log(cameraDistance / CAMERA_DISTANCE_MIN) /
    Math.log(CAMERA_DISTANCE_MAX / CAMERA_DISTANCE_MIN);
  slider.value = String(Math.round((1 - t) * 100));
}
function setCameraZoom(distance) {
  if (cameraMode === 1) {
    cameraMode = 0;
    camera.near = 1.0;
  }
  cameraDistance = Math.max(CAMERA_DISTANCE_MIN, Math.min(CAMERA_DISTANCE_MAX, distance));
  updateCamera();
  syncZoomControl();
}
function changeZoom(factor) {
  setCameraZoom(cameraDistance * factor);
}
const modes = ['THIRD PERSON', 'FIRST PERSON', 'ISOMETRIC'];
const keys = {};
camera.rotation.order = 'YXZ';
function updateCamera() {
  // Extend camera clipping/fog for zoom-out without expanding streamed chunk memory.
  const requiredFar = Math.max(LOAD_RADIUS * 1.05, cameraDistance + LOAD_RADIUS * 1.15);
  if (Math.abs(camera.far - requiredFar) > 1) {
    camera.far = requiredFar;
    camera.updateProjectionMatrix();
  }
  if (scene.fog) scene.fog.far = Math.max(FOG_FAR, cameraDistance + LOAD_RADIUS * 1.15);
  const px = player.position.x, py = player.position.y, pz = player.position.z;
  if (cameraMode === 0) {
    const horizontal = Math.cos(lookPitch) * cameraDistance;
    camera.position.set(px + Math.sin(lookAngle) * horizontal, py + 1.18 + Math.sin(lookPitch) * cameraDistance, pz + Math.cos(lookAngle) * horizontal);
    camera.lookAt(px, py + 1.18, pz);
  } else if (cameraMode === 1) {
    camera.position.set(px, py + 1.68, pz);
    camera.rotation.set(-lookPitch, lookAngle + Math.PI, 0);
  } else {
    camera.position.set(px + 12, py + 15, pz + 12);
    camera.lookAt(px, py + 0.8, pz);
  }
}

const SKY_NIGHT = new THREE.Color(0x101d37), SKY_DAY = new THREE.Color(0x9fc9d4), SKY_DUSK = new THREE.Color(0x25324c);
function updateStreetLighting(level) {
  lampGlow.emissiveIntensity = 0.12 + level * 3.4;
  slPoolMat.opacity = level * 0.85;
  slPoolMat.visible = level > 0.01;
  if (level <= 0.01) { for (const L of slRealLights) L.intensity = 0; return; }
  const ax = Math.round(player.position.x / 210) * 210, az = Math.round(player.position.z / 210) * 210, cand = [];
  const headOff = 24 + POLE_LINE - AVE_ARM * 0.9;   // lamp heads hang over the kerb side of the walkway
  const add = (x, z) => cand.push({ x, z, d: (x - player.position.x) ** 2 + (z - player.position.z) ** 2 });
  for (const q of furnitureAlong(ax, player.position.z - 320, player.position.z + 320).poles) for (const sd of [-1, 1]) add(ax + sd * headOff, q);
  for (const q of furnitureAlong(az, player.position.x - 320, player.position.x + 320).poles) for (const sd of [-1, 1]) add(q, az + sd * headOff);
  cand.sort((a, b) => a.d - b.d);
  slRealLights.forEach((L, i) => { if (!cand[i]) { L.intensity = 0; return; } L.position.set(cand[i].x, STREETLIGHT_HEIGHT - 1, cand[i].z); L.intensity = L.userData.peak * level; });
}
const worldTimeEl = document.querySelector('#worldTime');
function setDay() {
  const hour = worldMinutes / 60;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)), night = 1 - daylight;
  const level = Math.max(0, Math.min(1, (night - 0.45) / 0.35));
  SKY.lerpColors(SKY_NIGHT, SKY_DAY, daylight);
  if (hour > 17 || hour < 6) SKY.lerp(SKY_DUSK, 0.3);
  scene.fog.color.copy(SKY);
  sun.intensity = 0.25 + daylight * 2.3;
  sun.color.setHex(daylight > 0.3 ? 0xffe7c2 : 0x9bb8ed);
  renderer.toneMappingExposure = 0.55 + daylight * 0.55 + level * 0.2;
  if (worldTimeEl) worldTimeEl.textContent = hour < 6 || hour >= 19 ? 'Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  updateStreetLighting(level);
}

// ============================================================================
// UI
// ============================================================================
function toast(s) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = s; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}
function modal(title, bodyHtml, actions = []) {
  const t = document.querySelector('#modalTitle'), b = document.querySelector('#modalBody'), a = document.querySelector('#modalActions'), bd = document.querySelector('#modalBackdrop');
  if (!t || !b || !a || !bd) return;
  t.textContent = title; b.innerHTML = bodyHtml; a.innerHTML = '';
  actions.forEach(([label, fn, secondary]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (secondary) btn.className = 'secondary';
    btn.onclick = () => { closeModal(); fn?.(); };
    a.appendChild(btn);
  });
  bd.classList.remove('hidden');
}
function closeModal() { document.querySelector('#modalBackdrop')?.classList.add('hidden'); }
const on = (sel, fn) => document.querySelector(sel)?.addEventListener('click', fn);
on('#closeModal', closeModal);
on('#cameraBtn', () => {
  cameraMode = (cameraMode + 1) % 3;
  camera.near = cameraMode === 1 ? 0.3 : 1.0; camera.updateProjectionMatrix();
  const sm = document.querySelector('#cameraBtn small');
  if (sm) sm.textContent = modes[cameraMode];
  toast('Camera: ' + modes[cameraMode].toLowerCase());
  updateCamera();
});
on('#weatherBtn', () => {
  weather = weather === 'Clear' ? 'Rain' : 'Clear';
  rainGroup.visible = weather === 'Rain';
  const wl = document.querySelector('#weatherLabel');
  if (wl) wl.textContent = weather === 'Rain' ? '🌧 Rain' : '☀ Clear';
  toast('Weather changed to ' + weather.toLowerCase());
});
on('#activityBtn', () => document.querySelector('#activityPanel')?.classList.toggle('panel-open'));
on('#feedClose', () => document.querySelector('#activityPanel')?.classList.remove('panel-open'));
on('#transportBtn', () => modal('Transport', 'Select Taxi, Danfo, Okada, or Boat to travel across Lagos.', [['Close', null, true]]));
on('#dealerBtn', () => modal('Grand Dealership · Isaac Uwadiale Road', 'Browse compact cars, SUVs, commercial danfos, and speedboats.', [['Close', null, true]]));
on('#vehiclesBtn', () => modal('Vehicle Garage', 'Manage your registered Lagos vehicles and parking status.', [['Close', null, true]]));
on('#menuBtn', () => modal('THIS IS LAGOS', 'Mobile-optimized Lagos city prototype. Use WASD / touch pad to move and drag to look around.', [['Continue', null]]));

// ============================================================================
// CITY MAP (static layer cached offscreen, built on first open)
// ============================================================================
const cityMapStyle = document.createElement('style');
cityMapStyle.textContent = `#cityMapToggle{position:fixed;top:14px;right:14px;z-index:12000;border:1px solid rgba(255,255,255,.22);border-radius:11px;background:#16834a;color:#fff;font:800 12px/1 system-ui,sans-serif;letter-spacing:1.1px;padding:12px 16px;cursor:pointer;touch-action:manipulation}
#cityMapPanel{position:fixed;top:60px;right:14px;z-index:11999;width:min(340px,calc(100vw - 28px));padding:12px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:rgba(12,24,19,.96);color:#f5fff7;font:12px/1.35 system-ui,sans-serif;display:none}
#cityMapPanel.open{display:block}
#cityMapHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
#cityMapClose{border:0;border-radius:8px;background:#ffffff18;color:white;font-size:20px;line-height:1;padding:4px 9px;cursor:pointer}
#cityMapCanvas{display:block;width:100%;height:auto;aspect-ratio:1;background:#1e3029;border-radius:9px;border:1px solid #ffffff20}
#cityMapFoot{display:flex;justify-content:space-between;margin-top:9px;color:#d6e8dc;font-size:11px}`;
document.head.appendChild(cityMapStyle);
const cityMapToggle = document.createElement('button');
cityMapToggle.id = 'cityMapToggle'; cityMapToggle.type = 'button'; cityMapToggle.textContent = 'MAP';
const cityMapPanel = document.createElement('section');
cityMapPanel.id = 'cityMapPanel';
cityMapPanel.innerHTML = '<div id="cityMapHead"><b>LAGOS CITY MAP</b><button id="cityMapClose" type="button">×</button></div><canvas id="cityMapCanvas" width="420" height="420"></canvas><div id="cityMapFoot"><span>▲ NORTH</span><span id="cityMapPosition">Locating…</span></div>';
document.body.append(cityMapToggle, cityMapPanel);
const cityMapCanvas = document.querySelector('#cityMapCanvas');
const cityMapCtx = cityMapCanvas.getContext('2d');
const cityMapPosEl = document.querySelector('#cityMapPosition');
let cityMapOpen = false, cityMapElapsed = 0, staticMapBuffer = null;
const CITY_MAP_MIN = -CITY_HALF, CITY_MAP_SPAN = CITY_HALF * 2;
function cityMapPoint(x, z, w, h) { return { x: ((x - CITY_MAP_MIN) / CITY_MAP_SPAN) * w, y: ((z - CITY_MAP_MIN) / CITY_MAP_SPAN) * h }; }
function buildStaticMapCache() {
  staticMapBuffer = document.createElement('canvas');
  const w = staticMapBuffer.width = cityMapCanvas.width, h = staticMapBuffer.height = cityMapCanvas.height;
  const ctx = staticMapBuffer.getContext('2d'), sx = w / CITY_MAP_SPAN, sz = h / CITY_MAP_SPAN;
  ctx.fillStyle = '#263d32'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#9ab8c4';
  const drawB = b => { const p = cityMapPoint(b.x, b.z, w, h); ctx.fillRect(p.x - (b.w * sx) / 2, p.y - (b.d * sz) / 2, Math.max(1, b.w * sx), Math.max(1, b.d * sz)); };
  for (const b of cityMapBuildings) drawB(b);
  for (let bi = -BLOCK_N; bi < BLOCK_N; bi++) for (let bj = -BLOCK_N; bj < BLOCK_N; bj++) { const r = infillAt(bi, bj); if (r) drawB({ x: r.x, z: r.z, w: r.w + 4, d: r.d + 4 }); }
  ctx.fillStyle = '#f0c64b';
  for (const f of cityMapFacilities) { const p = cityMapPoint(f.x, f.z, w, h); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  ctx.strokeStyle = '#a6b5a4'; ctx.lineWidth = 2.5;
  for (let k = -75; k <= 75; k += 3) {
    const p = cityMapPoint(k * 70, 0, w, h), q = cityMapPoint(0, k * 70, w, h);
    ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, q.y); ctx.lineTo(w, q.y); ctx.stroke();
  }
  ctx.fillStyle = '#f2e9bb'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const d of baseDistrictDefs) { const p = cityMapPoint(d[1], d[2], w, h); ctx.fillText(d[0], p.x, p.y); }
}
function drawCityMap() {
  if (!staticMapBuffer) buildStaticMapCache();
  const w = cityMapCanvas.width, h = cityMapCanvas.height;
  cityMapCtx.drawImage(staticMapBuffer, 0, 0);
  const me = cityMapPoint(player.position.x, player.position.z, w, h);
  cityMapCtx.fillStyle = '#ffffff'; cityMapCtx.strokeStyle = '#0b5d35'; cityMapCtx.lineWidth = 2.5;
  cityMapCtx.beginPath(); cityMapCtx.arc(me.x, me.y, 6, 0, Math.PI * 2); cityMapCtx.fill(); cityMapCtx.stroke();
  if (cityMapPosEl) cityMapPosEl.textContent = `${Math.round(player.position.x)}, ${Math.round(player.position.z)}`;
}
cityMapToggle.addEventListener('click', () => { cityMapOpen = !cityMapOpen; cityMapPanel.classList.toggle('open', cityMapOpen); if (cityMapOpen) drawCityMap(); });
document.querySelector('#cityMapClose').addEventListener('click', () => { cityMapOpen = false; cityMapPanel.classList.remove('open'); });

// Use the single original zoom panel already defined in index.html.
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomSlider = document.getElementById('zoomSlider');
zoomInBtn?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); changeZoom(1 / 1.25); });
zoomOutBtn?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); changeZoom(1.25); });
zoomResetBtn?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setCameraZoom(CAMERA_DISTANCE_DEFAULT); });
zoomSlider?.addEventListener('input', e => {
  const t = 1 - (Number(e.target.value) / 100);
  setCameraZoom(CAMERA_DISTANCE_MIN * Math.pow(CAMERA_DISTANCE_MAX / CAMERA_DISTANCE_MIN, t));
});
syncZoomControl();
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  changeZoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

// ============================================================================
// INPUT
// ============================================================================
window.addEventListener('keydown', e => { const k = (e.key || '').toLowerCase(); keys[k] = true; if (k === 'c') document.querySelector('#cameraBtn')?.click(); if (k === '+' || k === '=') changeZoom(1 / 1.25); if (k === '-' || k === '_') changeZoom(1.25); });
window.addEventListener('keyup', e => { keys[(e.key || '').toLowerCase()] = false; });
let pointer = null;
renderer.domElement.style.touchAction = 'none';
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  lookAngle -= (e.clientX - pointer.x) * 0.008;
  lookPitch = Math.max(-0.18, Math.min(0.72, lookPitch + (e.clientY - pointer.y) * 0.006));
  pointer.x = e.clientX; pointer.y = e.clientY;
});
window.addEventListener('pointerup', e => { if (pointer && pointer.id === e.pointerId) pointer = null; });
window.addEventListener('pointercancel', () => { pointer = null; });
const touchDirs = {};
document.querySelectorAll('.mobile-pad button').forEach(b => {
  const d = b.dataset.dir;
  b.addEventListener('pointerdown', e => { e.preventDefault(); touchDirs[d] = true; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { touchDirs[d] = false; }));
});

// ============================================================================
// MAIN LOOP
// ============================================================================
let dbgEl = null;
if (DEBUG) {
  dbgEl = document.createElement('div');
  dbgEl.style.cssText = 'position:fixed;left:6px;top:6px;z-index:13000;background:rgba(0,0,0,.7);color:#9f9;font:11px/1.35 monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(dbgEl);
}
const clockEl = document.querySelector('#clock'), districtEl = document.querySelector('.stat-row b');
let uiUpdateElapsed = 1, fpsSampleTime = 0, fpsFrames = 0, slowSamples = 0, fastSamples = 0;
const clock = new THREE.Clock();
const applyResolution = () => renderer.setPixelRatio(MAX_DPR * renderScale);   // also resizes the buffer

function animate() {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const rawDt = clock.getDelta(), frameDt = Math.min(rawDt, 0.25), uiDt = Math.min(rawDt, 0.1);

  fpsSampleTime += rawDt; fpsFrames++;
  if (fpsSampleTime >= 2) {   // adaptive resolution: drops when slow, recovers when there is headroom
    const fps = fpsFrames / fpsSampleTime;
    if (dbgEl) dbgEl.textContent = `fps ${fps.toFixed(0)}  scale ${renderScale.toFixed(2)}\ncalls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\ngeometries ${renderer.info.memory.geometries}  textures ${renderer.info.memory.textures}\nchunks ${loadedChunks.size}  jobs ${taskQueue.length}\nJS heap ${performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a'}\nv0.76  avatar: ${avatarInfo}`;
    fpsSampleTime = 0; fpsFrames = 0;
    if (fps < 26) { slowSamples++; fastSamples = 0; } else if (fps > 55) { fastSamples++; slowSamples = 0; } else slowSamples = fastSamples = 0;
    if (slowSamples >= 2 && renderScale > 0.6) { renderScale = Math.max(0.6, renderScale - 0.1); applyResolution(); slowSamples = 0; }
    else if (fastSamples >= 5 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.1); applyResolution(); fastSamples = 0; }
  }

  worldMinutes = (worldMinutes + uiDt * daySpeed) % 1440;
  uiUpdateElapsed += uiDt;
  if (cityMapOpen && (cityMapElapsed += uiDt) >= 0.2) { cityMapElapsed = 0; drawCityMap(); }
  if (uiUpdateElapsed >= 0.3) {
    uiUpdateElapsed = 0;
    if (clockEl) clockEl.textContent = String(Math.floor(worldMinutes / 60)).padStart(2, '0') + ':' + String(Math.floor(worldMinutes % 60)).padStart(2, '0');
    if (districtEl) {
      const n = nearestDistrictFor(player.position.x, player.position.z);
      districtEl.textContent = Math.hypot(player.position.x - n[1], player.position.z - n[2]) < 260 ? n[0] : 'Lagos';
    }
    setDay();
  }

  const forward = (keys.w || keys.arrowup || touchDirs.up ? 1 : 0) - (keys.s || keys.arrowdown || touchDirs.down ? 1 : 0);
  const side = (keys.d || keys.arrowright || touchDirs.right ? 1 : 0) - (keys.a || keys.arrowleft || touchDirs.left ? 1 : 0);
  const moving = !!(forward || side), running = moving && !!(keys.shift || touchDirs.run);

  if (avatarMixer) {
    const names = Object.keys(avatarActions);
    const idleName = names.find(n => n.includes('idle')), walkName = names.find(n => n.includes('walk')), runName = names.find(n => n.includes('run'));
    const desired = moving ? (running ? (runName || walkName) : (walkName || runName)) : (idleName || names[0]);
    const next = avatarActions[desired] || avatarActions[names[0]];
    if (next && next !== activeAvatarAction) { next.reset().fadeIn(0.2).play(); activeAvatarAction?.fadeOut(0.2); activeAvatarAction = next; }
    avatarMixer.update(frameDt);
    // Keep the animated character's feet on the top of the world ground slab.
    // The ground slab top is y = -0.20 (not the player's y = 0 origin).
    // Use precise bounds so animated/skinned meshes are measured after the animation update.
    if (avatarModel && (avatarGroundAlignElapsed += frameDt) >= 0.08) {
      avatarGroundAlignElapsed = 0;
      const feetY = new THREE.Box3().setFromObject(avatarModel, true).min.y;
      const groundY = player.position.y - 0.20;
      if (Number.isFinite(feetY)) avatarModel.position.y += groundY - feetY;
    }
  }

  if (moving) {
    let ix = Math.sin(lookAngle) * forward + Math.cos(lookAngle) * side;
    let iz = Math.cos(lookAngle) * forward - Math.sin(lookAngle) * side;
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;
    const distance = (running ? 5.0 : 2.3) * frameDt, dx = ix * distance, dz = iz * distance;
    const steps = Math.max(1, Math.ceil(distance / 0.2));
    for (let i = 0; i < steps; i++) {
      const nextX = Math.max(-5210, Math.min(5210, player.position.x + dx / steps));
      const nextZ = Math.max(-5210, Math.min(5210, player.position.z + dz / steps));
      if (!collidesWithBuilding(nextX, player.position.z)) player.position.x = nextX;
      if (!collidesWithBuilding(player.position.x, nextZ)) player.position.z = nextZ;
    }
    player.rotation.y = Math.atan2(dx, dz);
    if (body) body.position.y = 1.05 + Math.sin(performance.now() * 0.012) * 0.045;
  }

  if (weather === 'Rain') {
    rainGroup.position.set(player.position.x, 0, player.position.z);   // rain box follows the player
    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3 + 1] -= uiDt * 18;
      if (pos[i * 3 + 1] < 0) { pos[i * 3] = (Math.random() - 0.5) * 140; pos[i * 3 + 1] = 35; pos[i * 3 + 2] = (Math.random() - 0.5) * 140; }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  updateStreamedChunks();
  pumpChunks(IS_MOBILE ? 3 : 6, 1);
  updateCamera();
  if (!contextLost) renderer.render(scene, camera);
}

updateStreamedChunks(true);
pumpChunks(0, 30);       // first jobs immediately, the rest are spread across frames
setDay();
updateCamera();
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(MAX_DPR * renderScale);
  renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) clock.getDelta(); });
