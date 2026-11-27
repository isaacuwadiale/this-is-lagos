// THIS IS LAGOS v0.86-ROAD-NETWORK (v0.85-ROTATING-MINIMAP base): 20% T-junctions, dead ends, closed roads -> bush & green fields, random street objects, graph navigation. Avenues only, big modern high-rise towers, streamed + instanced chunks
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
const extraStreetNames = [
  'Adetokunbo Ademola Street', 'Ahmed Onibudo Street', 'Idowu Taylor Street', 'Idejo Street',
  'Saka Tinubu Street', 'Tiamiyu Savage Street', 'Karimu Kotun Street', 'Bishop Aboyade Cole Street',
  'Adeyemo Alakija Street', 'Akin Ogunlewe Street', 'Water Corporation Road', 'Eleke Crescent',
  'Oko Awo Street', 'Kasumu Ekemode Street', 'Idowu Martins Street', 'Muri Okunola Street',
  'Wilmot Point Road', 'Adeola Hopewell Street', 'Walter Carrington Crescent', 'Babatunde Anjous Avenue',
  'Glover Road', 'Kingsway Road', 'Raymond Njoku Street', 'Probyn Road',
  'Macgregor Road', 'Cooper Road', 'Lugard Avenue', 'Turnbull Road',
  'Osborne Road', 'Temple Road', 'Mekunwen Road', 'Odunlami Street',
  'Breadfruit Street', 'Bamgbose Street', 'Tokunboh Street', 'Hospital Road',
  'Okesuna Street', 'Ereko Street', 'Issa Williams Street', 'Catholic Mission Street',
  'Campos Street', 'Docemo Street', 'Apongbon Street', 'Kakawa Street',
  'Lewis Street', 'Simpson Street', 'Idumota Road', 'Adeniran Ogunsanya Street',
  'Bode Thomas Street', 'Ogunlana Drive', 'Randle Avenue', 'Akerele Street',
  'Shitta Street', 'Ijesha Road', 'Eric Moore Road', 'Lagos-Abeokuta Expressway',
  'Oba Akran Avenue', 'Toyin Street', 'Joel Ogunnaike Street', 'Kodesho Street',
  'Isaac John Street', 'Medical Road', 'Oduduwa Way', 'Ladipo Kasumu Street',
  'Lateef Jakande Road', 'Ajao Road', 'Ogba Road', 'Agidingbi Road',
  'Oba Akinjobi Way', 'Commercial Avenue', 'Tejuosho Street', 'Montgomery Road',
  'Akoka Road', 'Ojuelegba Road', 'Iwaya Road', 'Jibowu Street',
  'Alagomeji Street', 'Thorburn Avenue', 'Ado Road', 'Abraham Adesanya Road',
  'Badore Road', 'Mende Road', 'Gbagada Expressway', 'Creek Road',
  'Burma Road', 'Warehouse Road', 'Wharf Road', 'Liverpool Road',
  'Commercial Road', 'Marine Road', 'Point Road', 'Tincan Island Road',
  'Itire Road', 'Lawanson Road', 'Akinhanmi Street', 'Babs Animashaun Road',
  'Old Ojo Road', 'Ojo Road', 'Mile 12 Road', 'Sagamu Road',
  'Ijede Road', 'Oba Sekumade Road', 'Idimu Road', 'Ago Palace Way',
  'Oshodi Road', 'Mushin Road', 'Fatai Atere Way', 'Old Abeokuta Road',
  'Ikosi Road', 'Ogudu Road', 'Ojota Road', 'Alapere Road',
  'Oworonshoki Road', 'Anthony Village Road', 'Ilupeju Bypass', 'Town Planning Way',
  'Magodo Road', 'Ojodu Road', 'Ikotun-Egbe Road', 'Idimu-Ejigbo Road',
  'Command Road', 'Akowonjo Road', 'Iyana-Ipaja Road', 'Dopemu Road',
  'Orile Road', 'Costain Road', 'Ikota Road', 'Ogombo Road',
  'Okokomaiko Road', 'Ago Okota Road', 'Bariga Road', 'Shomolu Road',
  'Palmgrove Road', 'Ifako-Ijaiye Road', 'Mangoro Road', 'Secretariat Road',
  'Alausa Road', 'Oregun Road', 'Kudirat Abiola Way', 'Mobolaji Johnson Avenue',
  'Isheri Road', 'Oke-Afa Road', 'Ilasamaja Road', 'Mafoluku Road',
  'Ajah Road', 'Ibeju-Lekki Road', 'Badagry Creek Road', 'Agbara Road',
  'Egbe Road', 'Ejigbo Road', 'Aboru Road', 'Abule-Egba Road',
  'Idi-Oro Road', 'Ikeja Airport Road', 'Sapara Williams Street', 'Ayodele Fanoiki Road',
  'Aromire Avenue', 'Ebute-Ero Street', 'Iddo Road', 'Oyingbo Road',
  'Egerton Road', 'Eti-Osa Road', 'Ikate Road', 'Elegushi Road',
  'Ologolo Road', 'Falomo Road'
];
// Every road has TWO names: a road is never named for more than 7 km. Roads run 10.5 km, so the first 33 blocks (6.93 km) carry one
// name and the rest of the road (3.57 km) another. Slot = (index + 24) * 2 + part, 98 slots per direction, all real Lagos street names.
const STREET_SPLIT_BLOCKS = 33;      // 33 * 210 m = 6.93 km, the longest stretch that keeps one name
const streetNameTable = { x: [], z: [] };
{
  let pi = 0;
  for (const [axis, base] of [['x', verticalStreetNames], ['z', horizontalStreetNames]]) {
    for (let slot = 0; slot < 98; slot++) {
      const idx = (slot >> 1) - 24, part = slot & 1;
      streetNameTable[axis][slot] = (part === 0 && idx >= -15 && idx <= 15) ? base[idx + 15] : extraStreetNames[pi++ % extraStreetNames.length];
    }
  }
}
function streetName(axis, index, part = 0) {
  const t = streetNameTable[axis][(index + 24) * 2 + part];
  return t || `${axis === 'x' ? 'Lagos North-South' : 'Lagos East-West'} Street ${String(index + 75).padStart(3, '0')}`;
}

const buildingColliders = [];   // detailed district buildings only (~150)
const amenityColliders = [];
const cityMapBuildings = [];
const cityMapSpecs = [];   // full design of every detailed building (the map draws their real tiers + entrances)
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
const shelterRoofMat = mat(0x1c5fd1, 0.4, 0.15), shelterBenchMat = mat(0x39434f, 0.6, 0.2), shelterFrameMat = mat(0xb9c2ca, 0.28, 0.82);
const shelterGlassMat = newMat({ color: 0x9fd2ea, roughness: 0.08, metalness: 0.1, transparent: true, opacity: IS_MOBILE ? 0.42 : 0.3, depthWrite: false });   // see-through glass walls
const shelterRoofHeight = BUS_SHELTER_HEIGHT;
const SEAT_THICK = 0.22, SEAT_TOP = BUS_SHELTER_HEIGHT * 0.20, SEAT_Y = SEAT_TOP - SEAT_THICK / 2;   // seat surface sits at 0.20 of the shelter height
const shelterWallHeight = BUS_SHELTER_HEIGHT - 0.8;   // (kept for reference)
const GLASS_Y = 0.5 + (BUS_SHELTER_HEIGHT - 0.95) / 2, GLASS_H = BUS_SHELTER_HEIGHT - 0.95;   // glass runs from just above the ground up to the roof
const POST_H = BUS_SHELTER_HEIGHT - 0.45;                                                      // steel posts end under the roof slab
const BACK_POSTS = [-10.5, -3.5, 3.5, 10.5], FRONT_POSTS = [-10.5, 10.5]; // keep the entrance clear: remove its two centre bars
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
  const bI = Math.floor(x / ROAD_SPACING), bJ = Math.floor(z / ROAD_SPACING);
  const faceOpen = f => f === 1 ? segOpen('z', bJ, bI) : f === 0 ? segOpen('z', bJ + 1, bI) : f === 3 ? segOpen('x', bI, bJ) : segOpen('x', bI + 1, bJ);
  const usable = toAve.filter(e => faceOpen(e[1])), faceList = usable.length ? usable : toAve;   // entrance faces a road that exists
  const face = R() < 0.25 ? faceList[Math.min(1, faceList.length - 1)][1] : faceList[0][1];
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
  cityMapSpecs.push(spec);
  blueprintAtWorld(spec.x, spec.z).buildings.push(spec);
  return { position: { x: spec.x, z: spec.z } };
}

// ============================================================================
// WORLD DATA (districts, sports, signs): small and fast
// ============================================================================
// Districts are spread over the WHOLE city (+-5250). The 14 principal districts sit on a stratified 4x4 layout (one per cell,
// shuffled, jittered inside its own cell) so coverage is equal but nothing lines up; the numbered districts fill the gaps on a
// finer jittered 19x19 layout. Every district name travels with its district (name, x, z, type).
const districtTemplates = [
  ['VICTORIA ISLAND', 'island'], ['IKOYI', 'island'], ['LEKKI PHASE 1', 'residential'],
  ['YABA', 'civic'], ['SURULERE', 'sports'], ['IKEJA', 'civic'],
  ['OSHODI MARKET', 'market'], ['MUSHIN', 'market'], ['AJAH', 'residential'],
  ['EPE WATERFRONT', 'civic'], ['MAINLAND SPORTS PARK', 'sports'], ['AGEGE', 'residential'],
  ['FESTAC TOWN', 'residential'], ['APAPA PORT', 'civic']
];
const baseDistrictDefs = [], districtDefs = [];
{
  const R = rngFrom(20261126);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const BASE_N = 4, BASE_SPAN = 9200, baseCell = BASE_SPAN / BASE_N, cells = [];
  for (let gx = 0; gx < BASE_N; gx++) for (let gz = 0; gz < BASE_N; gz++) cells.push([gx, gz]);
  shuffle(cells);                                         // 16 cells, 14 districts: two random cells stay empty
  districtTemplates.forEach(([name, type], i) => {
    const [gx, gz] = cells[i];
    baseDistrictDefs.push([name,
      Math.round(-BASE_SPAN / 2 + (gx + 0.5) * baseCell + (R() - 0.5) * baseCell * 0.56),
      Math.round(-BASE_SPAN / 2 + (gz + 0.5) * baseCell + (R() - 0.5) * baseCell * 0.56), type]);
  });
  districtDefs.push(...baseDistrictDefs);
  const FINE_N = 19, FINE_SPAN = 9800, fineCell = FINE_SPAN / FINE_N, fine = [];
  for (let gx = 0; gx < FINE_N; gx++) for (let gz = 0; gz < FINE_N; gz++) fine.push([gx, gz]);
  shuffle(fine);
  let n = 0;
  for (const [gx, gz] of fine) {
    const x = Math.round(-FINE_SPAN / 2 + (gx + 0.5) * fineCell + (R() - 0.5) * fineCell * 0.44);
    const z = Math.round(-FINE_SPAN / 2 + (gz + 0.5) * fineCell + (R() - 0.5) * fineCell * 0.44);
    if (baseDistrictDefs.some(d => Math.hypot(d[1] - x, d[2] - z) < 380)) continue;   // keep clear of the principal districts
    const [name, type] = districtTemplates[n % districtTemplates.length];
    districtDefs.push([`${name} DISTRICT ${String(Math.floor(n / districtTemplates.length) + 1).padStart(2, '0')}`, x, z, type]);
    n++;
  }
}

// ============================================================================
// ROAD NETWORK EDITS
// ~20% of the crossroads become T-junctions (one arm is closed or cut short), some roads become dead ends with a single
// entrance, and every closed stretch turns into bush + green field with no road markings. Deterministic and UNEVEN: a smooth
// noise field decides where closures are dense or rare, and a random pick order decides who is chosen, so the gaps between
// them are never regular.
//   axis 'x' = a road at x = i*210 (runs along z); axis 'z' = a road at z = i*210 (runs along x).
//   segment j of a road = the stretch between junction j and junction j+1 (coordinates j*210 .. (j+1)*210).
// ============================================================================
const NET_LO = -24, NET_HI = 24, NET_W = NET_HI - NET_LO + 1;
const NET_T_SHARE = 0.20;                                    // share of ALL crossroads that must end up as T-junctions
const SEG_SPAN = ROAD_SPACING - 2 * AVE_HALF;                // 162: one road stretch between two junction squares
const FIELD_CAP = ROAD_EDGE_CLEARANCE;                       // 12: red walkway closing a dead end
const roadSegs = new Map();                                  // changed stretches only: { k: 1 closed | 2 stub from low end | 3 stub from high end | 4 stubs from both ends, a, b }
const wildBlocks = new Set();                                // blocks beside closed roads that are given back to nature
const fieldRects = [];                                       // green fields on closed road stretches
const deadEnds = [];                                         // { axis, i, g, q, dir }: end of a stub, dir = side the field lies on
const segKey = (axis, i, j) => axis + i + ',' + j;
const segOpen = (axis, i, j) => !roadSegs.has(segKey(axis, i, j));
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

function netRand(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function netNoise(x, z) {   // smooth value noise, two octaves, 0..1
  const oct = (sx, sz, c) => {
    const ix = Math.floor(sx), iz = Math.floor(sz), fx = sx - ix, fz = sz - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = netRand(ix, iz, c), b = netRand(ix + 1, iz, c), d = netRand(ix, iz + 1, c), e = netRand(ix + 1, iz + 1, c);
    return a + (b - a) * ux + (d - a) * uz + (a - b - d + e) * ux * uz;
  };
  return 0.62 * oct(x / 7, z / 7, 1) + 0.38 * oct(x / 2.6 + 40, z / 2.6 + 40, 2);
}

// Is there real road at along-road coordinate q of road line (axis, i)?  (junction squares always are)
function liveAt(axis, i, q) {
  const S = ROAD_SPACING, j = Math.floor(q / S), r = q - j * S;
  if (r <= AVE_HALF || r >= S - AVE_HALF) return true;
  const rec = roadSegs.get(segKey(axis, i, j));
  if (!rec) return true;
  const lo = r - AVE_HALF, hi = S - AVE_HALF - r;
  if (rec.k === 2) return lo <= rec.a;
  if (rec.k === 3) return hi <= rec.b;
  if (rec.k === 4) return lo <= rec.a || hi <= rec.b;
  return false;
}
const roadLive = (axis, i, q, pad = 0) => liveAt(axis, i, q) && (!pad || (liveAt(axis, i, q - pad) && liveAt(axis, i, q + pad)));
// Does the arm leaving junction jn of road (axis, i) in direction dir (+1 / -1) carry a road?
function armOpen(axis, i, jn, dir) {
  const rec = roadSegs.get(segKey(axis, i, dir > 0 ? jn : jn - 1));
  if (!rec) return true;
  if (rec.k === 1) return false;
  return dir > 0 ? (rec.k === 2 || rec.k === 4) : (rec.k === 3 || rec.k === 4);
}
// Live stretches of a road line inside [lo, hi]: junction squares + open/stub parts, merged. [a, b, deadAtA, deadAtB]
function roadRuns(axis, i, lo, hi) {
  const S = ROAD_SPACING, out = [];
  const add = (a, b, dl, dh) => {
    if (b <= lo || a >= hi) return;
    const dLo = dl && a >= lo, dHi = dh && b <= hi;
    a = Math.max(a, lo); b = Math.min(b, hi);
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.001) { last[1] = Math.max(last[1], b); last[3] = dHi; } else out.push([a, b, dLo, dHi]);
  };
  for (let j = Math.floor(lo / S) - 1, e = Math.ceil(hi / S) + 1; j <= e; j++) {
    add(j * S - AVE_HALF, j * S + AVE_HALF, false, false);
    const rec = roadSegs.get(segKey(axis, i, j)), s0 = j * S + AVE_HALF, e0 = (j + 1) * S - AVE_HALF;
    if (!rec) add(s0, e0, false, false);
    else if (rec.k === 2) add(s0, s0 + rec.a, false, true);
    else if (rec.k === 3) add(e0 - rec.b, e0, true, false);
    else if (rec.k === 4) { add(s0, s0 + rec.a, false, true); add(e0 - rec.b, e0, true, false); }
  }
  return out;
}
// Same, but only the stretches BETWEEN junction squares (kerbs, walkways, lane markings live here). [s0, e0, deadAtS0, deadAtE0]
function liveSpans(axis, i, lo, hi, clip = true) {
  const S = ROAD_SPACING, out = [];
  const add = (s0, e0, dl, dh) => {
    if (e0 <= lo || s0 >= hi) return;
    if (clip) { dl = dl && s0 >= lo; dh = dh && e0 <= hi; s0 = Math.max(s0, lo); e0 = Math.min(e0, hi); }
    if (e0 - s0 > 0.5) out.push([s0, e0, dl, dh]);
  };
  for (let j = Math.floor(lo / S) - 1, e = Math.ceil(hi / S) + 1; j <= e; j++) {
    const rec = roadSegs.get(segKey(axis, i, j)), s0 = j * S + AVE_HALF, e0 = (j + 1) * S - AVE_HALF;
    if (!rec) add(s0, e0, false, false);
    else if (rec.k === 2) add(s0, s0 + rec.a, false, true);
    else if (rec.k === 3) add(e0 - rec.b, e0, true, false);
    else if (rec.k === 4) { add(s0, s0 + rec.a, false, true); add(e0 - rec.b, e0, true, false); }
  }
  return out;
}

function netGenerate(protectedSegs) {
  const S = ROAD_SPACING, nodeId = (ni, nj) => (ni - NET_LO) * NET_W + (nj - NET_LO), cand = [];
  for (const axis of ['x', 'z']) for (let i = -23; i <= 23; i++) for (let j = -23; j <= 22; j++) {
    const key = segKey(axis, i, j);
    if (protectedSegs.has(key)) continue;
    const mx = axis === 'x' ? i : j + 0.5, mz = axis === 'x' ? j + 0.5 : i, s = axis === 'x' ? 1 : 2;
    cand.push({
      axis, i, j, key,
      n1: axis === 'x' ? nodeId(i, j) : nodeId(j, i), n2: axis === 'x' ? nodeId(i, j + 1) : nodeId(j + 1, i),
      dens: 0.03 + 0.97 * Math.pow(smooth01((netNoise(mx, mz) - 0.40) / 0.26), 1.25),
      r0: netRand(i, j, 100 + s), r1: netRand(i, j, 200 + s), r2: netRand(i, j, 300 + s), r3: netRand(i, j, 400 + s), r4: netRand(i, j, 500 + s), r5: netRand(i, j, 600 + s)
    });
  }
  cand.sort((a, b) => a.r0 - b.r0);                     // random pick order: no scan-line regularity
  const contrib = k => k === 1 ? 2 : k === 4 ? 0 : 1;  // junctions turned into T by each kind
  const run = scale => {
    const touched = new Set([nodeId(0, 0)]), acc = []; let t = 0;   // a junction is touched at most once, the start crossroads stays whole
    for (const c of cand) {
      if (touched.has(c.n1) || touched.has(c.n2) || c.r1 >= Math.min(1, scale * c.dens)) continue;
      const k = c.r2 < 0.5 ? 1 : c.r2 < 0.8 ? (c.r3 < 0.5 ? 2 : 3) : 4;
      touched.add(c.n1); touched.add(c.n2); t += contrib(k); acc.push({ c, k });
    }
    return { acc, t };
  };
  const target = Math.round(NET_T_SHARE * NET_W * NET_W);
  let lo = 0, hi = 80;
  for (let it = 0; it < 28; it++) { const mid = (lo + hi) / 2; if (run(mid).t >= target) hi = mid; else lo = mid; }
  const res = run(hi);
  while (res.acc.length) { const l = res.acc[res.acc.length - 1], d = contrib(l.k); if (res.t - d >= target) { res.acc.pop(); res.t -= d; } else break; }
  return res;
}

{   // ---- commit the generated network: protect district gateways, build fields, dead ends, signs ----
  const S = ROAD_SPACING, protectedSegs = new Set();
  for (const d of districtDefs) {       // the gateway arch of every district stands over a road stretch: keep those open
    const ax = Math.max(-5040, Math.min(5040, Math.round(d[1] / S) * S)), az = Math.max(-5040, Math.min(5040, Math.round(d[2] / S) * S));
    if (Math.abs(ax - d[1]) <= Math.abs(az - d[2])) protectedSegs.add(segKey('x', ax / S, Math.floor(d[2] / S)));
    else protectedSegs.add(segKey('z', az / S, Math.floor(d[1] / S)));
  }
  const res = netGenerate(protectedSegs);
  for (const { c, k } of res.acc) {
    const { axis, i, j } = c, g = i * S, s0 = j * S + AVE_HALF, e0 = (j + 1) * S - AVE_HALF;
    const rec = { k, a: 0, b: 0 };
    if (k === 2) rec.a = SEG_SPAN * (0.26 + 0.5 * c.r4);                  // 42..123 units of road, then it just ends
    else if (k === 3) rec.b = SEG_SPAN * (0.26 + 0.5 * c.r4);
    else if (k === 4) { rec.a = SEG_SPAN * (0.16 + 0.14 * c.r4); rec.b = SEG_SPAN * (0.16 + 0.14 * c.r5); }
    roadSegs.set(c.key, rec);
    const spans = [];                                                      // stretches of green field along the road
    if (k === 1) spans.push([s0 + FIELD_CAP, e0 - FIELD_CAP]);
    if (k === 2 || k === 4) { deadEnds.push({ axis, i, g, q: s0 + rec.a, dir: 1 }); }
    if (k === 3 || k === 4) { deadEnds.push({ axis, i, g, q: e0 - rec.b, dir: -1 }); }
    if (k === 2) spans.push([s0 + rec.a + FIELD_CAP, e0 - FIELD_CAP]);
    if (k === 3) spans.push([s0 + FIELD_CAP, e0 - rec.b - FIELD_CAP]);
    if (k === 4) spans.push([s0 + rec.a + FIELD_CAP, e0 - rec.b - FIELD_CAP]);
    for (const [lo, hi] of spans) if (hi - lo > 6) {
      const half = AVE_HALF + FIELD_CAP;
      fieldRects.push(axis === 'x' ? { x0: g - half, x1: g + half, z0: lo, z1: hi, seed: i * 977 + j * 131 + 5 } : { x0: lo, x1: hi, z0: g - half, z1: g + half, seed: i * 977 + j * 131 + 9 });
    }
    // neighbouring blocks beside a closed stretch are sometimes given back to nature as well (bigger, irregular fields)
    const pw = k === 1 ? 0.36 : 0.16, nb = axis === 'x' ? [[i - 1, j], [i, j]] : [[j, i - 1], [j, i]];
    nb.forEach(([bi, bj], n) => { if (netRand(bi, bj, 700 + n) < pw) wildBlocks.add(blockIndex(bi, bj)); });
  }
  for (const e of deadEnds) {           // "DEAD END" board beside the entrance side of the road, facing the traffic that arrives
    const off = AVE_HALF + 3.2, back = e.q - e.dir * 9;
    registerSign('DEAD END', e.axis === 'x' ? e.g + off : back, e.axis === 'x' ? back : e.g + off, 7.5, 0xb3261e, STREET_SIGN_POLE_HEIGHT - 1.1, 'street', e.axis === 'x' ? 'z' : 'x');
  }
  if (DEBUG) console.log(`[road network] ${res.acc.length} changed stretches, ${deadEnds.length} dead ends, ${wildBlocks.size} wild blocks, T share ${(res.t / (NET_W * NET_W) * 100).toFixed(1)}%`);
}

// ---- green fields: ground patchwork, bushes, grass, rocks, trees (deterministic per field) ----
const CONE_GEO = new THREE.ConeGeometry(0.36, 0.95, 8); CONE_GEO.translate(0, 0.475, 0);
const DRUM_GEO = new THREE.CylinderGeometry(0.46, 0.46, 1.15, 10); DRUM_GEO.translate(0, 0.575, 0);
const BIN_GEO = new THREE.CylinderGeometry(0.42, 0.34, 1.05, 10); BIN_GEO.translate(0, 0.525, 0);
const barRedMat = mat(0xc9362b, 0.7), barWhiteMat = mat(0xf0efe8, 0.7);
// ---- Vegetation: three small procedural textures shared by everything (grass ground, leafy bush card, grass-blade card) ----
// Memory plan: ground = ONE merged mesh per chunk (no per-patch boxes), bushes = 4 alpha-tested quads (16 vertices), tufts = 2 quads,
// textures 256/128/64 px, item lists are built on demand and only a few are cached.
const vegCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function vegTexture(cv, repeat) {
  const t = new THREE.CanvasTexture(cv), maxA = renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(IS_MOBILE ? 2 : 4, maxA);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeGroundTexture() {   // tileable lawn: soft tonal blotches + thousands of tiny blades + clover / dry specks
  const N = IS_MOBILE ? 128 : 256, cv = vegCanvas(N, N), g = cv.getContext('2d'), R = rngFrom(4242);
  g.fillStyle = '#587a3a'; g.fillRect(0, 0, N, N);
  const wrap = (x, y, r, fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { const px = x + dx, py = y + dy; if (px + r < 0 || px - r > N || py + r < 0 || py - r > N) continue; fn(px, py); } };
  for (let i = 0; i < 40; i++) {
    const x = R() * N, y = R() * N, r = N * (0.07 + R() * 0.16), dark = R() < 0.5, col = dark ? '38,66,28' : '122,150,66';
    wrap(x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${col},0.32)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(px - r, py - r, 2 * r, 2 * r); });
  }
  g.lineCap = 'round';
  for (let i = 0, n = N * N / (IS_MOBILE ? 18 : 12); i < n; i++) {
    const x = R() * N, y = R() * N, len = (N / 128) * (2 + R() * 5), ang = -Math.PI / 2 + (R() - 0.5) * 1.5, wd = (N / 256) * (0.6 + R() * 0.9);
    const col = `hsl(${68 + R() * 48},${28 + R() * 32}%,${16 + R() * 36}%)`, ex = Math.cos(ang) * len, ey = Math.sin(ang) * len;
    wrap(x, y, len + 2, (px, py) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(px, py); g.lineTo(px + ex, py + ey); g.stroke(); });
  }
  for (let i = 0; i < N / 5; i++) {   // clover, dry stalks and bits of soil
    const x = R() * N, y = R() * N, k = R(), col = k < 0.4 ? 'rgba(205,200,140,0.55)' : k < 0.7 ? 'rgba(120,98,64,0.5)' : 'rgba(40,58,30,0.6)', r = (N / 256) * (0.8 + R() * 1.6);
    wrap(x, y, r, (px, py) => { g.fillStyle = col; g.beginPath(); g.ellipse(px, py, r * 1.4, r, R() * 3, 0, 6.283); g.fill(); });
  }
  return vegTexture(cv, true);
}
function makeBushTexture() {     // a leafy dome: dark core, layered leaves lit from above, ragged transparent edge, shaded underside
  const N = IS_MOBILE ? 96 : 128, cv = vegCanvas(N, N), g = cv.getContext('2d'), R = rngFrom(777), cx = N / 2, cy = N * 0.55, rx = N * 0.46, ry = N * 0.42;
  const edge = th => 1 + 0.1 * Math.sin(5 * th + 1) + 0.07 * Math.sin(9 * th + 2) + 0.05 * Math.sin(14 * th);
  g.fillStyle = '#1d3719'; g.beginPath();
  for (let a = 0; a <= 64; a++) { const th = a / 64 * 6.283, e = 0.8 * edge(th); g[a ? 'lineTo' : 'moveTo'](cx + Math.cos(th) * rx * e, cy + Math.sin(th) * ry * e); }
  g.fill();
  const passes = [[2.4, 15, 24, 0.9], [2.0, 22, 34, 0.9], [1.6, 30, 46, 0.75]];   // [leaf size, min lightness, max lightness, coverage]
  passes.forEach(([size, l0, l1, cover], pi) => {
    for (let i = 0, n = N * N / (pi === 0 ? 9 : 8); i < n; i++) {
      const th = R() * 6.283, rho = Math.sqrt(R()), e = edge(th);
      if (rho > e * 1.0 || (rho > 0.78 && R() > (1 - rho) / 0.22 * cover + 0.1)) continue;     // thin, ragged edge
      const x = cx + Math.cos(th) * rx * rho * e, y = cy + Math.sin(th) * ry * rho * e, up = 1 - (y - (cy - ry)) / (2 * ry);       // up: 1 at the crown
      const L = l0 + (l1 - l0) * (0.35 * R() + 0.65 * Math.max(0, Math.min(1, up * 0.85 + rho * 0.25))) , hue = 82 + R() * 34, sat = 32 + R() * 26;
      g.save(); g.translate(x, y); g.rotate(th + (R() - 0.5) * 1.6);
      g.fillStyle = `hsl(${hue},${sat}%,${L}%)`; g.beginPath(); g.ellipse(0, 0, (N / 128) * size * (1.1 + R() * 1.4), (N / 128) * size * (0.5 + R() * 0.5), 0, 0, 6.283); g.fill();
      if (pi === 2 && R() < 0.25) { g.strokeStyle = `hsla(${hue + 8},${sat}%,${Math.min(68, L + 14)}%,0.6)`; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-size, 0); g.lineTo(size * 1.4, 0); g.stroke(); }   // midrib catching light
      g.restore();
    }
  });
  g.globalCompositeOperation = 'source-atop';           // ambient occlusion: the underside is dark, the crown stays bright
  const sh = g.createLinearGradient(0, cy - ry, 0, cy + ry); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.55, 'rgba(8,16,6,0.12)'); sh.addColorStop(1, 'rgba(6,12,4,0.62)');
  g.fillStyle = sh; g.fillRect(0, 0, N, N);
  return vegTexture(cv, false);
}
function makeTuftTexture() {     // a clump of tapered, curved grass blades
  const W = 64, H = 96, cv = vegCanvas(W, H), g = cv.getContext('2d'), R = rngFrom(31337);
  for (let i = 0; i < 34; i++) {
    const bx = W / 2 + (R() - 0.5) * W * 0.5, h = H * (0.45 + R() * 0.5), lean = (R() - 0.5) * W * 0.55, wd = 1.3 + R() * 1.6, tx = bx + lean, ty = H - h;
    const gr = g.createLinearGradient(0, H, 0, ty), hue = 70 + R() * 38;
    gr.addColorStop(0, `hsl(${hue},40%,17%)`); gr.addColorStop(0.55, `hsl(${hue},45%,31%)`); gr.addColorStop(1, `hsl(${hue - 6},50%,${48 + R() * 14}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(bx - wd, H); g.quadraticCurveTo(bx + lean * 0.15 - wd * 0.6, H - h * 0.55, tx, ty); g.quadraticCurveTo(bx + lean * 0.15 + wd * 0.6, H - h * 0.55, bx + wd, H); g.closePath(); g.fill();
  }
  return vegTexture(cv, false);
}
function quadGeo(quads) {         // quads of [bl, br, tr, tl] corners; every normal points up so foliage is lit softly from all sides
  const pos = [], uv = [], nor = [], idx = [];
  quads.forEach((q, k) => { for (const [x, y, z] of q) { pos.push(x, y, z); nor.push(0, 1, 0); } uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const vertCards = (w, h, angles) => angles.map(a => { const c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2; return [[-c, 0, -s], [c, 0, s], [c, h, s], [-c, h, -s]]; });
const BUSH_GEO = quadGeo([...vertCards(2, 1.25, [0, Math.PI / 3, 2 * Math.PI / 3]), [[-0.95, 0.62, 0.95], [0.95, 0.62, 0.95], [0.95, 0.62, -0.95], [-0.95, 0.62, -0.95]]]);   // 3 crossed cards + a canopy top
const TUFT_GEO = quadGeo(vertCards(1.4, 2.1, [0, Math.PI / 2, Math.PI / 4]));
const ROCK_GEO = (() => {        // faceted boulder: an icosphere with noisy radius and flat shading
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + 0.4 * netRand(Math.round(x * 400), Math.round(y * 400), Math.round(z * 400)); p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
})();
let bushMat = null, tuftMat = null, groundMat = null, rockMat = null;       // created on first use
const vegMats = () => {
  if (!bushMat) {
    bushMat = new THREE.MeshLambertMaterial({ map: makeBushTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    tuftMat = new THREE.MeshLambertMaterial({ map: makeTuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
    groundMat = new THREE.MeshLambertMaterial({ map: makeGroundTexture(), vertexColors: true });
    rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  }
};
const BUSH_TINTS = [0xffffff, 0xeaf3dc, 0xd9ecc4, 0xf4f1cc, 0xcfe2b8, 0xe4f0d0, 0xc2d9a8, 0xf0f6e0];   // multiply the leaf texture: no two bushes look the same
const TUFT_TINTS = [0xffffff, 0xeef3d4, 0xdfe9b8, 0xf6efc0, 0xd0e0a8];
const ROCK_GREYS = [0x8c8c84, 0x77776f, 0x9a968a, 0x6d6f6a, 0x857d70];
const FIELD_TILE = 26;           // metres of ground per texture repeat
function fieldGroundGeo(rects, x0, x1, z0, z1) {   // ONE merged mesh for every field in a chunk, with soft per-vertex tone (greens / dry straw) so fields never look tiled
  const pos = [], uv = [], col = [], idx = [];
  for (const r of rects) {
    const a0 = Math.max(r.x0, x0), a1 = Math.min(r.x1, x1), b0 = Math.max(r.z0, z0), b1 = Math.min(r.z1, z1);
    if (a1 - a0 < 0.5 || b1 - b0 < 0.5) continue;
    const nx = Math.max(1, Math.ceil((a1 - a0) / 22)), nz = Math.max(1, Math.ceil((b1 - b0) / 22)), base = pos.length / 3;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = a0 + (a1 - a0) * i / nx, z = b0 + (b1 - b0) * j / nz;
      const n = netNoise(x / 45 + 11, z / 45 - 5), m = netNoise(x / 13, z / 13 + 8), dry = smooth01((n - 0.52) / 0.2), b = 0.74 + 0.5 * m;
      pos.push(x, -0.1, z); uv.push(x / FIELD_TILE, z / FIELD_TILE);
      col.push(b * (1 + 0.28 * dry), b * (1 - 0.02 * dry), b * (1 - 0.32 * dry));
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const p = base + j * (nx + 1) + i, q = p + nx + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry(), nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
const fieldCache = new Map();
function fieldItems(r) {         // bushes in clusters, grass clumps, boulders, palms: built on demand, only the 48 most recent fields are kept
  const key = r.x0 + ',' + r.z0;
  let it = fieldCache.get(key);
  if (it) return it;
  const R = rngFrom(r.seed * 7 + 3), w = r.x1 - r.x0, d = r.z1 - r.z0, area = w * d, mob = IS_MOBILE ? 0.5 : 1;
  it = { bushes: [], tufts: [], rocks: [], trees: [] };
  const pick = a => a[Math.floor(R() * a.length)];
  const inside = (x, z, m) => [Math.max(r.x0 + m, Math.min(r.x1 - m, x)), Math.max(r.z0 + m, Math.min(r.z1 - m, z))];
  const bush = (x, z, s) => it.bushes.push({ x, y: -0.1, z, ry: R() * 6.28, sx: s * (1 + R() * 0.3), sy: s * (0.7 + R() * 0.5), sz: s * (1 + R() * 0.3), color: pick(BUSH_TINTS) });
  for (let c = Math.max(1, Math.round(area / 1500 * (0.5 + R()) * mob)); c > 0; c--) {      // bush clusters of different size and spread
    const cx0 = r.x0 + 3 + R() * (w - 6), cz0 = r.z0 + 3 + R() * (d - 6), rad = 3 + R() * 7, cnt = Math.round((2 + R() * 6) * mob) + 1;
    for (let k = 0; k < cnt; k++) { const a = R() * 6.283, rr = rad * Math.sqrt(R()), [x, z] = inside(cx0 + Math.cos(a) * rr, cz0 + Math.sin(a) * rr, 1.5); bush(x, z, 0.9 + R() * 1.5 * (1 - rr / (rad * 1.5))); }
  }
  for (let k = Math.round(area / 1800 * mob * (0.4 + R())); k > 0; k--) { const [x, z] = inside(r.x0 + R() * w, r.z0 + R() * d, 1.5); bush(x, z, 0.7 + R() * 1.1); }
  const tuft = (x, z) => { const s = 0.3 + R() * 0.45; it.tufts.push({ x, y: -0.1, z, ry: R() * 6.28, sx: s, sy: s * (0.9 + R() * 0.35), sz: s, color: pick(TUFT_TINTS) }); };
  for (let c = Math.round(area / (IS_MOBILE ? 520 : 260)); c > 0; c--) {                       // grass grows in clumps, not evenly
    const cx0 = r.x0 + R() * w, cz0 = r.z0 + R() * d, cnt = 3 + Math.floor(R() * 5), rad = 1.2 + R() * 2.4;
    for (let k = 0; k < cnt; k++) { const a = R() * 6.283, rr = rad * Math.sqrt(R()); const [x, z] = inside(cx0 + Math.cos(a) * rr, cz0 + Math.sin(a) * rr, 0.5); tuft(x, z); }
  }
  for (let k = Math.round(area / 3500 * (0.3 + R() * 1.4)); k > 0; k--) {
    const s = 0.6 + R() * 1.3;
    it.rocks.push({ x: r.x0 + 2 + R() * (w - 4), y: s * 0.3 - 0.12, z: r.z0 + 2 + R() * (d - 4), ry: R() * 6.28, sx: s * (0.8 + R() * 0.7), sy: s * (0.5 + R() * 0.4), sz: s * (0.8 + R() * 0.7), color: pick(ROCK_GREYS) });
  }
  for (let k = Math.round(area / 1500 * (0.3 + R() * 1.3)); k > 0; k--)                        // a few palms standing in the fields
    it.trees.push({ x: r.x0 + 5 + R() * (w - 10), z: r.z0 + 5 + R() * (d - 10), type: R() < 0.5 ? 0 : 1, s: 0.75 + R() * 0.5, rot: R() * 6.28, tr: 0.9 + R() * 0.14, tg: 0.92 + R() * 0.14, tb: 0.88 + R() * 0.16 });
  fieldCache.set(key, it);
  if (fieldCache.size > 48) fieldCache.delete(fieldCache.keys().next().value);
  return it;
}
const wildFinal = new Set(), wildRectCache = new Map();
function fieldRectsIn(x0, x1, z0, z1) {    // closed-road fields + wild blocks overlapping the box
  const out = [];
  for (const r of fieldRects) if (r.x1 > x0 && r.x0 < x1 && r.z1 > z0 && r.z0 < z1) out.push(r);
  if (!wildBlocks.size) return out;
  for (let bi = Math.floor(x0 / ROAD_SPACING), be = Math.floor(x1 / ROAD_SPACING); bi <= be; bi++)
    for (let bj = Math.floor(z0 / ROAD_SPACING), bf = Math.floor(z1 / ROAD_SPACING); bj <= bf; bj++) {
      if (bi < -BLOCK_N || bi >= BLOCK_N || bj < -BLOCK_N || bj >= BLOCK_N) continue;
      const k = blockIndex(bi, bj);
      if (!wildBlocks.has(k)) continue;
      infillAt(bi, bj);
      if (!wildFinal.has(k)) continue;
      let r = wildRectCache.get(k);
      if (!r) { const [a0, a1] = blockSpan(bi * ROAD_SPACING + 105), [c0, c1] = blockSpan(bj * ROAD_SPACING + 105); wildRectCache.set(k, r = { x0: a0, x1: a1, z0: c0, z1: c1, seed: k * 31 + 7 }); }
      if (r.x1 > x0 && r.x0 < x1 && r.z1 > z0 && r.z0 < z1) out.push(r);
    }
  return out;
}

// ---- random street objects: cars, cones, drums, bins, kiosks, bushes. Dense in some stretches, absent in others. ----
const CAR_COLORS = [0xb33a3a, 0x2f5d8a, 0xd8d8d0, 0x333a3f, 0xe0b43a, 0x4c7a4b, 0x8a8f94, 0xc9702b, 0x6a3f7a];
const DRUM_COLORS = [0x2e5aa8, 0xb23a2a, 0x3a7a4a, 0x8a8f94, 0xc99a2a];
const KIOSK_COLORS = [0xd5b46e, 0x4f8fb5, 0xc4563f, 0x6aa36b, 0xe0c24a, 0x9b6bb0];
function addRoadsideProps(cx, cz, box, L) {
  return;   // roads and walkways are kept clear: no parked cars, cones, drums, bins, kiosks or bushes scattered about
  const xMin = cx * CHUNK_SIZE, zMin = cz * CHUNK_SIZE, STEP = 6;
  for (const rAxis of ['x', 'z']) {
    const aLo = rAxis === 'x' ? xMin : zMin, qLo = rAxis === 'x' ? zMin : xMin;
    for (let gi = Math.ceil((aLo - 44) / ROAD_SPACING); gi * ROAD_SPACING <= aLo + CHUNK_SIZE + 44; gi++) {
      if (gi < NET_LO || gi > NET_HI) continue;
      const g = gi * ROAD_SPACING, fa = furnitureAlong(g, qLo - 12, qLo + CHUNK_SIZE + 12, rAxis);
      for (let n = 0, nMax = Math.ceil(CHUNK_SIZE / STEP); n < nMax; n++) {
        const q0 = qLo + n * STEP;
        for (const side of [-1, 1]) {
          const px = rAxis === 'x' ? g : q0, pz = rAxis === 'x' ? q0 : g;
          const dens = 0.012 + 0.17 * smooth01((netNoise(px / 210 + 31.7, pz / 210 - 12.3) - 0.38) / 0.30);   // clustered, patchy
          if (treeHash(g * 0.37 + side * 3.1, q0, rAxis === 'x' ? 51 : 52) > dens) continue;
          const q = q0 + treeHash(q0, g, 53) * STEP;
          if (Math.abs(q - Math.round(q / ROAD_SPACING) * ROAD_SPACING) < AVE_HALF + 16) continue;     // keep junctions clear
          if (!roadLive(rAxis, gi, q, 8)) continue;
          if (fa.poles.some(p => Math.abs(p - q) < 4) || fa.stops.some(p => Math.abs(p - q) < SHELTER_LEN / 2 + 8)) continue;
          const t = treeHash(q, g, 54), h2 = k => treeHash(q, g + side, 60 + k);
          const at = (off, al) => rAxis === 'x' ? [g + side * off, al] : [al, g + side * off];
          const dim = (len, wid) => rAxis === 'x' ? [wid, len] : [len, wid];
          if (t < 0.26) {                                              // car parked in the kerb lane
            const col = CAR_COLORS[Math.floor(h2(1) * CAR_COLORS.length)], [x, z] = at(AVE_HALF - 6, q), [bw, bl] = dim(4.6, 1.95), [kw, kl] = dim(2.5, 1.75);
            registerStreetBlock(x, z, 2.8, 1.5);
            const sh = h2(2) < 0.5 ? -0.35 : 0.35, [ox, oz] = rAxis === 'x' ? [0, sh] : [sh, 0];
            box(bw, 0.9, bl, col, x, 0.35, z); box(kw, 0.78, kl, 0x2d3b45, x + ox, 1.25, z + oz);
            for (const a of [-1.45, 1.45]) for (const b of [-1, 1]) { const [wx, wz] = rAxis === 'x' ? [x + b * 0.98, z + a] : [x + a, z + b * 0.98], [ww, wl] = dim(0.8, 0.36); box(ww, 0.8, wl, 0x16181b, wx, 0, wz); }
          } else if (t < 0.40) {                                       // a few traffic cones
            for (let k = 0, m = 2 + Math.floor(h2(3) * 3); k < m; k++) { const [x, z] = at(AVE_HALF - 2.2 - h2(4 + k) * 1.2, q + k * 2.4); registerStreetBlock(x,z,0.65,0.65); L.cones.push({ x, y: 0, z, sx: 1, sy: 1, sz: 1, color: 0xff6a1a }); }
          } else if (t < 0.52) {                                       // oil drums by the building line
            for (let k = 0, m = 2 + Math.floor(h2(5) * 3); k < m; k++) { const [x, z] = at(AVE_HALF + 9 + h2(6 + k) * 1.5, q + (k - 1) * 1.1 + h2(9 + k) * 0.4); registerStreetBlock(x,z,0.8,0.8); L.drums.push({ x, y: 0, z, sx: 1, sy: 1, sz: 1, color: DRUM_COLORS[Math.floor(h2(12 + k) * DRUM_COLORS.length)] }); }
          } else if (t < 0.63) {                                       // litter bin
            const [x, z] = at(AVE_HALF + 7, q); registerStreetBlock(x,z,0.9,0.9); L.bins.push({ x, y: 0, z, sx: 1, sy: 1, sz: 1, color: h2(7) < 0.5 ? 0x3c5a45 : 0x4d5156 });
          } else if (t < 0.75) {                                       // roadside kiosk with a coloured canopy
            const [x, z] = at(AVE_HALF + 6.4, q); registerStreetBlock(x,z,2.4,2.0); const [bw, bl] = dim(3.6, 2.6), [rw, rl] = dim(4.6, 3.6);
            box(bw, 2.6, bl, 0xe6e0d2, x, 0, z); box(rw, 0.25, rl, KIOSK_COLORS[Math.floor(h2(8) * KIOSK_COLORS.length)], x, 2.6, z);
          } else {                                                     // bush clump at the edge of the walkway
            for (let k = 0, m = 1 + Math.floor(h2(10) * 3); k < m; k++) {
              const [x, z] = at(AVE_HALF + 8.4 - h2(14 + k) * 0.6, q + (k - 1) * 2.2), s = 0.9 + h2(17 + k) * 0.9;
              registerStreetBlock(x,z,1.35,1.35); L.bushes.push({ x, y: 0.05, z, ry: h2(20 + k) * 6.28, sx: s * 1.1, sy: s * 0.8, sz: s * 1.1, color: BUSH_TINTS[Math.floor(h2(23 + k) * BUSH_TINTS.length)] });
            }
          }
        }
      }
    }
  }
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
const markWild = k => { if (!wildBlocks.has(k)) return false; wildFinal.add(k); return true; };   // block given back to nature: no tower
function infillAt(bi, bj) {
  if (bi < -BLOCK_N || bi >= BLOCK_N || bj < -BLOCK_N || bj >= BLOCK_N) return null;
  const k = blockIndex(bi, bj);
  let r = infillCache.get(k);
  if (r !== undefined) return r;
  r = null;
  const gx = bi * ROAD_SPACING + ROAD_SPACING / 2, gz = bj * ROAD_SPACING + ROAD_SPACING / 2;
  if (k % 7 !== 0 && !detailedBlocks.has(k) && !claimedBlocks.has(bi + ',' + bj) &&
      !baseDistrictDefs.some(d => Math.hypot(gx - d[1], gz - d[2]) < 105) && !markWild(k)) {
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


// ============================================================================
// ADDRESS REGISTRY: every building (detailed or infill) has a registered address, worked out deterministically from its spec:
// district (nearest), street (the avenue its entrance faces), house number (position along that street, odd/even by side),
// building type, and 20-500 apartments scaled by its volume. Nothing is stored up front; entries are cached when first asked for.
// ============================================================================
const ADDR_KIND_LABEL = { office: 'Office tower', apartment: 'Apartment tower', mixed: 'Mixed-use tower', residential: 'Residential tower', tenement: 'Residential block', shop: 'Retail building', duplex: 'Duplex block', market: 'Market building' };
const addrCache = new Map(), streetNumbers = new Map();   // streetNumbers: street key -> Map(building key -> house number)
const bKey = b => Math.round(b.x * 10) + ',' + Math.round(b.z * 10);
function streetOfBuilding(b) {   // which road (axis, index) the entrance faces, and where along it the building stands
  const bI = Math.floor(b.x / ROAD_SPACING), bJ = Math.floor(b.z / ROAD_SPACING), face = b.door.face;
  const axis = face < 2 ? 'z' : 'x', idx = face === 0 ? bJ + 1 : face === 1 ? bJ : face === 2 ? bI + 1 : bI, along = face < 2 ? b.x : b.z;
  const part = Math.floor(along / ROAD_SPACING) + BLOCK_N >= STREET_SPLIT_BLOCKS ? 1 : 0;
  return { axis, idx, along, part, key: axis + idx + ':' + part };
}
function numberStreet(st) {   // number every building on one named street 1, 2, 3 ... in order along it (no gaps, no repeats)
  const list = [], seen = new Set(), lo = st.part === 0 ? 0 : STREET_SPLIT_BLOCKS, hi = st.part === 0 ? STREET_SPLIT_BLOCKS - 1 : 2 * BLOCK_N - 1;
  const add = b => { if (!b) return; const k = bKey(b); if (seen.has(k)) return; const o = streetOfBuilding(b); if (o.key !== st.key) return; seen.add(k); list.push({ k, along: o.along, side: b.door.face & 1 }); };
  for (let seg = lo; seg <= hi; seg++) {
    const sI = seg - BLOCK_N;                                   // block index along the street
    for (const side of [-1, 0]) add(st.axis === 'z' ? infillAt(sI, st.idx + side) : infillAt(st.idx + side, sI));
  }
  for (const b of cityMapSpecs) add(b);                         // the hand-placed district buildings
  list.sort((a, b) => a.along - b.along || a.side - b.side || (a.k < b.k ? -1 : 1));
  const m = new Map(); list.forEach((e, i) => m.set(e.k, i + 1));
  streetNumbers.set(st.key, m);
  return m;
}
function buildingAddress(b) {
  const key = bKey(b);
  let a = addrCache.get(key);
  if (a) return a;
  const st = streetOfBuilding(b);
  const nums = streetNumbers.get(st.key) || numberStreet(st);
  const R = rngFrom(Math.imul(Math.round(b.x * 10) + 31, 73856093) ^ Math.imul(Math.round(b.z * 10) + 57, 19349663));
  const vol = b.w * b.d * b.floors, t = Math.max(0, Math.min(1, vol / 700000));
  const apartments = Math.max(20, Math.min(500, Math.round((20 + 480 * Math.pow(t, 0.7)) * (0.92 + 0.16 * R()))));
  a = { district: nearestDistrictFor(b.x, b.z)[0], street: streetName(st.axis, st.idx, st.part), number: nums.get(key) || 1, kind: b.kind, kindLabel: ADDR_KIND_LABEL[b.kind] || 'Building', floors: b.floors, apartments };
  addrCache.set(key, a);
  return a;
}
const apartmentNumber = (a, i) => i + 1;   // apartments are numbered 1..N in every building, no gaps
function entrancePoint(b, lo) {   // world point on the entrance apron (lo = distance out from the wall)
  const D = b.door, hw = (b.w + 4) / 2, hd = (b.d + 4) / 2, off = D.off;
  return D.face === 0 ? [b.x + off, b.z + hd + lo] : D.face === 1 ? [b.x - off, b.z - hd - lo] : D.face === 2 ? [b.x + hw + lo, b.z - off] : [b.x - hw - lo, b.z + off];
}

// ---- bottom mini-window shown only when the player stands right at a building door ----
const entranceEl = document.createElement('div');
entranceEl.id = 'entranceWindow';
document.head.insertAdjacentHTML('beforeend', `<style>
#entranceWindow{position:fixed;left:50%;bottom:58px;transform:translate(-50%,16px);width:min(460px,calc(100vw - 20px));box-sizing:border-box;padding:12px 14px;border-radius:16px;background:rgba(32,183,101,.20);color:#fff;text-shadow:0 1px 2px rgba(0,40,15,.9);border:1px solid rgba(150,255,190,.45);box-shadow:0 8px 24px rgba(0,0,0,.18);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font:12px/1.35 "DM Sans",system-ui,sans-serif;z-index:900;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
#entranceWindow.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#entranceWindow .ew-x{position:absolute;top:8px;right:8px;width:26px;height:26px;border:0;border-radius:50%;background:rgba(0,40,15,.45);color:#fff;font:700 15px/26px system-ui,sans-serif;text-align:center;cursor:pointer;padding:0;text-shadow:none}
#entranceWindow .ew-eyebrow{font-size:9px;font-weight:800;letter-spacing:1.6px;color:#d4ffe2}
#entranceWindow .ew-title{font-size:16px;font-weight:800;margin:2px 30px 6px 0}
#entranceWindow .ew-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}
#entranceWindow .ew-grid span{color:#d4ffe2;font-size:10px;display:block}
#entranceWindow .ew-grid b{font-size:12px}
#entranceWindow .ew-list{margin-top:6px;max-height:84px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px;touch-action:pan-y}
#entranceWindow .ew-list i{cursor:pointer;font-style:normal;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.22);color:#fff}
#entranceWindow .ew-list i.sel{background:#14a35a;color:#fff}
#entranceWindow .ew-buy{width:100%;margin-top:8px;border:0;border-radius:10px;padding:10px;background:#14a35a;color:#fff;font:inherit;font-weight:800;font-size:13px;cursor:pointer;text-shadow:none}
#entranceWindow .ew-buy:disabled{background:rgba(255,255,255,.2);color:#e6fff0;cursor:default}
@media(max-width:700px){#entranceWindow{bottom:176px;font-size:11px}}
</style>`);
document.body.appendChild(entranceEl);
const APARTMENT_PRICE = 5000;   // naira, every apartment
let ownedApartments = {};
try { ownedApartments = JSON.parse(localStorage.getItem('til-apartments') || '{}') || {}; } catch (e) { ownedApartments = {}; }
const addrKey = a => a.district + '|' + a.street + '|' + a.number;
function availableApartments(a) {   // nothing is bought yet, so every apartment is on sale
  const owned = ownedApartments[addrKey(a)] || [], all = [];
  for (let i = 0; i < a.apartments; i++) { const n = apartmentNumber(a, i); if (!owned.includes(n)) all.push(n); }
  return all;
}
let entranceShownKey = null, entranceDismissed = null, entranceAddr = null, entranceSel = null;
const naira = n => '₦' + n.toLocaleString('en-US');
function hideEntrance() { entranceEl.classList.remove('show'); entranceShownKey = null; entranceAddr = null; entranceSel = null; }
function renderEntrance() {
  const a = entranceAddr, list = availableApartments(a);
  entranceEl.innerHTML = `<button class="ew-x" type="button" aria-label="Close">✕</button><div class="ew-eyebrow">BUILDING ENTRANCE</div><div class="ew-title">No. ${a.number} ${a.street}</div>
    <div class="ew-grid"><div><span>District</span><b>${a.district}</b></div><div><span>Building type</span><b>${a.kindLabel}</b></div>
    <div><span>House number</span><b>${a.number}</b></div><div><span>Total apartments</span><b>${a.apartments} (${a.floors} floors)</b></div>
    <div><span>Available to buy</span><b>${list.length}</b></div><div><span>Price per apartment</span><b>${naira(APARTMENT_PRICE)}</b></div></div>
    <div class="ew-eyebrow" style="margin-top:8px">SELECT YOUR APARTMENT NUMBER</div>
    <div class="ew-list">${list.map(n => `<i data-n="${n}"${n === entranceSel ? ' class="sel"' : ''}>${n}</i>`).join('')}</div>
    <button class="ew-buy" ${entranceSel === null ? 'disabled' : ''}>${entranceSel === null ? 'Select an apartment to buy' : `Buy apartment ${entranceSel} · ${naira(APARTMENT_PRICE)}`}</button>`;
}
entranceEl.addEventListener('click', e => {
  if (!entranceAddr) return;
  if (e.target.closest('.ew-x')) { entranceDismissed = entranceShownKey; hideEntrance(); return; }   // stays closed until the player walks away and comes back
  const chip = e.target.closest('i[data-n]');
  if (chip) { entranceSel = +chip.dataset.n; renderEntrance(); const sel = entranceEl.querySelector('.ew-list i.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' }); return; }
  if (e.target.closest('.ew-buy') && entranceSel !== null) {
    const k = addrKey(entranceAddr), bought = entranceSel;
    (ownedApartments[k] = ownedApartments[k] || []).push(bought);
    try { localStorage.setItem('til-apartments', JSON.stringify(ownedApartments)); } catch (err) {}
    entranceSel = null; renderEntrance();
    toast(`Apartment ${bought} at No. ${entranceAddr.number} ${entranceAddr.street} is yours · ${naira(APARTMENT_PRICE)}`);
  }
});
const ENTRANCE_SHOW = 6, ENTRANCE_HIDE = 9;   // metres from the door: must be right at it to appear, a small step away to vanish
function updateEntranceWindow() {
  const px = player.position.x, pz = player.position.z, bi0 = Math.floor(px / ROAD_SPACING), bj0 = Math.floor(pz / ROAD_SPACING);
  let best = null, bd = Infinity;
  const test = b => { if (!b) return; const [ex, ez] = entrancePoint(b, 2), d = Math.hypot(px - ex, pz - ez); if (d < bd) { bd = d; best = b; } };
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) test(infillAt(bi0 + i, bj0 + j));
  for (const b of cityMapSpecs) if (Math.abs(b.x - px) < 260 && Math.abs(b.z - pz) < 260) test(b);
  if (!best || bd > (entranceShownKey ? ENTRANCE_HIDE : ENTRANCE_SHOW)) {
    if (entranceShownKey) hideEntrance();
    if (!best || bd > ENTRANCE_HIDE) entranceDismissed = null;   // walked away: the window may appear again next time
    return;
  }
  const key = bKey(best);
  if (key === entranceShownKey || key === entranceDismissed) return;
  entranceShownKey = key; entranceAddr = buildingAddress(best); entranceSel = null;
  renderEntrance();
  entranceEl.classList.add('show');
}

const CELL = 64, detailGrid = new Map();
const STREET_BLOCK_CELL = 24, streetBlockGrid = new Map();
function registerStreetBlock(x, z, rx, rz) {
  const b = { minX: x-rx, maxX: x+rx, minZ: z-rz, maxZ: z+rz };
  for (let gx=Math.floor(b.minX/STREET_BLOCK_CELL); gx<=Math.floor(b.maxX/STREET_BLOCK_CELL); gx++)
    for (let gz=Math.floor(b.minZ/STREET_BLOCK_CELL); gz<=Math.floor(b.maxZ/STREET_BLOCK_CELL); gz++) { const k=gx+','+gz; let a=streetBlockGrid.get(k); if(!a) streetBlockGrid.set(k,a=[]); a.push(b); }
}
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
  const nearby = streetBlockGrid.get(Math.floor(x/STREET_BLOCK_CELL)+','+Math.floor(z/STREET_BLOCK_CELL));
  if (nearby) for (const b of nearby) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  for (const b of amenityColliders) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
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
      const rAxis = axis === 'z' ? 'x' : 'z', gI = Math.round(g / ROAD_SPACING);
      const fa = furnitureAlong(g, qLo - 12, qLo + CHUNK_SIZE + 12, rAxis);
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
          if (!roadLive(rAxis, gI, jq, 7)) continue;                                // no roadside trees along closed roads
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
  for (const r of fieldRectsIn(lo[0], lo[0] + CHUNK_SIZE, lo[1], lo[1] + CHUNK_SIZE))   // palms standing in the green fields
    for (const t of fieldItems(r).trees) {
      if (t.x < lo[0] || t.x >= lo[0] + CHUNK_SIZE || t.z < lo[1] || t.z >= lo[1] + CHUNK_SIZE) continue;
      if (IS_MOBILE && treeHash(t.x, t.z, 21) < 0.4) continue;
      out.push(t);
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
function furnitureAlong(g, lo, hi, axis = 'x') {
  const out = { poles: [], stops: [], avenue: true }, gi = Math.round(g / ROAD_SPACING);
  for (let a = Math.floor(lo / ROAD_SPACING) * ROAD_SPACING - ROAD_SPACING; a < hi; a += ROAD_SPACING) {
    if (a < -5180 || a + ROAD_SPACING > 5180) continue;
    const c = Math.round(a / ROAD_SPACING), rec = roadSegs.get(segKey(axis, gi, c));
    if (rec && rec.k === 1) continue;                                                   // closed road: no lamps, no shelters
    const l0 = a + AVE_HALF + CORNER_PAD, l1 = a + ROAD_SPACING - AVE_HALF - CORNER_PAD;
    if (rec) {                                                                          // dead-end stubs: a couple of lamps along the road that exists
      const add = (from, len, sgn) => { for (const d of [18, len - 14]) if (d >= 18 && d <= len - 10) { const q = from + sgn * d; if (q >= lo && q < hi) out.poles.push(q); } };
      if (rec.k === 2 || rec.k === 4) add(a + AVE_HALF, rec.a, 1);
      if (rec.k === 3 || rec.k === 4) add(a + ROAD_SPACING - AVE_HALF, rec.b, -1);
      continue;
    }
    const mid = (l0 + l1) / 2;
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
  const ZW = WALK_W, ZEBRA_T = 0.15 * 3 * 2;   // zebra: stripes run along the drive direction, ZW long (= red walkway width), 6x the lane-line thickness (3x, then doubled)
  const PAVE_W = WALK_W - 0.24, PAVE_C = 0.24 + PAVE_W / 2;   // red walkway: from the kerb out to the building line
  // Zebra crossings fill the first WALK_W (12) units of every road beside each junction, so centre / lane lines start after them.
  const markSpan = (s0, e0, loDead, hiDead) => {   // a dead end stops the paint 4 units short of the cap instead of leaving room for a zebra
    const g = Math.floor((s0 - AVE_HALF + 0.01) / ROAD_SPACING) * ROAD_SPACING;
    return [loDead ? s0 + 4 : Math.max(s0, g + AVE_HALF + WALK_W), hiDead ? e0 - 4 : Math.min(e0, g + ROAD_SPACING - AVE_HALF - WALK_W)];
  };
  const barRed = [], barWhite = [];

  for (let gx = Math.floor(xMin / ROAD_SPACING) * ROAD_SPACING; gx < xMax; gx += ROAD_SPACING) {   // avenues running along z
    if (gx < -5180 || gx > 5180 || gx < xMin) continue;
    const isAve = true, half = AVE_HALF, gi = Math.round(gx / ROAD_SPACING);
    for (const [a, b] of roadRuns('x', gi, zMin, zMax)) asphaltRecs.push({ x: gx, y: -0.12, z: (a + b) / 2, sx: half * 2, sy: 0.18, sz: b - a });   // asphalt only where the road really exists
    for (const [s0, e0, loDead, hiDead] of liveSpans('x', gi, zMin, zMax)) {
      const mz = (s0 + e0) / 2, len = e0 - s0;
      for (const side of [-1, 1]) {
        kerb.push({ x: gx + side * (half + 0.12), y: 0.05, z: mz, sx: 0.24, sy: 0.18, sz: len });
        pvm.push({ x: gx + side * (half + PAVE_C), y: 0.02, z: mz, sx: PAVE_W, sy: 0.12, sz: len });
      }
      if (isAve) {
        const [m0, m1] = markSpan(s0, e0, loDead, hiDead), mm = (m0 + m1) / 2, ml = m1 - m0;
        if (ml > 0.5) yellow.push({ x: gx - 0.42, y: -0.015, z: mm, sx: 0.22, sy: 0.03, sz: ml }, { x: gx + 0.42, y: -0.015, z: mm, sx: 0.22, sy: 0.03, sz: ml });
        for (let q = Math.ceil((m0 + 2) / 14) * 14; q <= m1 - 2; q += 14)
          white.push({ x: gx - 12, y: -0.015, z: q, sx: 0.15, sy: 0.03, sz: 4 }, { x: gx + 12, y: -0.015, z: q, sx: 0.15, sy: 0.03, sz: 4 });
      }
    }
    const fa = furnitureAlong(gx, zMin, zMax, 'x');
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
      registerStreetBlock(bx,q,0.65,SHELTER_LEN/2); registerStreetBlock(sx + side*1.7,q - (SHELTER_LEN/2 - 0.07),SHELTER_DEPTH/4,0.65); registerStreetBlock(sx + side*1.7,q + (SHELTER_LEN/2 - 0.07),SHELTER_DEPTH/4,0.65);
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
      busLaneMarks.push({ x: gx + side * (half - 6), y: -0.028, z: q, sx: BUS_MARK_W, sy: 1, sz: BUS_MARK_L, ry: side > 0 ? 0 : Math.PI });
    }
  }
  for (let gz = Math.floor(zMin / ROAD_SPACING) * ROAD_SPACING; gz < zMax; gz += ROAD_SPACING) {   // avenues running along x
    if (gz < -5180 || gz > 5180 || gz < zMin) continue;
    const isAve = true, half = AVE_HALF, gi = Math.round(gz / ROAD_SPACING);
    for (const [a, b] of roadRuns('z', gi, xMin, xMax)) asphaltRecs.push({ x: (a + b) / 2, y: -0.12, z: gz, sx: b - a, sy: 0.18, sz: half * 2 });
    for (const [s0, e0, loDead, hiDead] of liveSpans('z', gi, xMin, xMax)) {
      const mx = (s0 + e0) / 2, len = e0 - s0;
      for (const side of [-1, 1]) {
        kerb.push({ x: mx, y: 0.05, z: gz + side * (half + 0.12), sx: len, sy: 0.18, sz: 0.24 });
        pvm.push({ x: mx, y: 0.02, z: gz + side * (half + PAVE_C), sx: len, sy: 0.12, sz: PAVE_W });
      }
      if (isAve) {
        const [m0, m1] = markSpan(s0, e0, loDead, hiDead), mm = (m0 + m1) / 2, ml = m1 - m0;
        if (ml > 0.5) yellow.push({ x: mm, y: -0.015, z: gz - 0.42, sx: ml, sy: 0.03, sz: 0.22 }, { x: mm, y: -0.015, z: gz + 0.42, sx: ml, sy: 0.03, sz: 0.22 });
        for (let q = Math.ceil((m0 + 2) / 14) * 14; q <= m1 - 2; q += 14)
          white.push({ x: q, y: -0.015, z: gz - 12, sx: 4, sy: 0.03, sz: 0.15 }, { x: q, y: -0.015, z: gz + 12, sx: 4, sy: 0.03, sz: 0.15 });
      }
    }
    const fa = furnitureAlong(gz, xMin, xMax, 'z');
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
      registerStreetBlock(q,bz,SHELTER_LEN/2,0.65); registerStreetBlock(q - (SHELTER_LEN/2 - 0.07),sz + side*1.7,0.65,SHELTER_DEPTH/4); registerStreetBlock(q + (SHELTER_LEN/2 - 0.07),sz + side*1.7,0.65,SHELTER_DEPTH/4);
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
      busLaneMarks.push({ x: q, y: -0.028, z: gz + side * (half - 6), sx: BUS_MARK_W, sy: 1, sz: BUS_MARK_L, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
  }
  // Junction markings. Every road approach gets a thick white STOP LINE across its approaching (right-hand) lanes, just before the
  // crossing road; every crossing gets a yellow BOX JUNCTION (square outline + diagonals) painted inside it. Each junction belongs to the chunk
  // that holds its centre, so nothing is drawn twice.
  for (let ix = Math.ceil(xMin / ROAD_SPACING) * ROAD_SPACING; ix < xMax; ix += ROAD_SPACING) {
    if (ix < -5180 || ix > 5180) continue;
    for (let iz = Math.ceil(zMin / ROAD_SPACING) * ROAD_SPACING; iz < zMax; iz += ROAD_SPACING) {
      if (iz < -5180 || iz > 5180) continue;
      const ni = Math.round(ix / ROAD_SPACING), nj = Math.round(iz / ROAD_SPACING);
      const aN = armOpen('x', ni, nj, -1), aS = armOpen('x', ni, nj, 1), aW = armOpen('z', nj, ni, -1), aE = armOpen('z', nj, ni, 1);   // which arms carry a road
      const nOpen = (aN ? 1 : 0) + (aS ? 1 : 0) + (aW ? 1 : 0) + (aE ? 1 : 0);
      const tH = nOpen === 3 && (!aN || !aS), tV = nOpen === 3 && (!aW || !aE);   // T-junction whose straight (through) road runs along x / along z
      const sN = aN && !tV, sS = aS && !tV, sW = aW && !tH, sE = aE && !tH;       // zebra + stop line only on the side road (the stem of the T)
      const hx = roadHalfAt(ix), hz = roadHalfAt(iz);
      const yZ = -0.015, yX = -0.015, yB = -0.015;   // paint height follows each road's own lane-line convention
      const SL = 1.2, GAP = 0.6, OFF = ZW;   // stop line: 1.2 thick, pushed back OFF (=zebra length) so the zebra comes right after it
      if (sN) white.push({ x: ix - (hx + GAP) / 2, y: yZ, z: iz - hz - OFF - GAP - SL / 2 - 0.2, sx: hx - GAP, sy: 0.03, sz: SL });
      if (sS) white.push({ x: ix + (hx + GAP) / 2, y: yZ, z: iz + hz + OFF + GAP + SL / 2 + 0.2, sx: hx - GAP, sy: 0.03, sz: SL });
      if (sW) white.push({ x: ix - hx - OFF - GAP - SL / 2 - 0.2, y: yX, z: iz + (hz + GAP) / 2, sx: SL, sy: 0.03, sz: hz - GAP });
      if (sE) white.push({ x: ix + hx + OFF + GAP + SL / 2 + 0.2, y: yX, z: iz - (hz + GAP) / 2, sx: SL, sy: 0.03, sz: hz - GAP });
      {   // zebra crossings only on arms that exist
        const N = Math.floor((2 * hx - ZEBRA_T) / (2 * ZEBRA_T)) + 1, pitch = (2 * hx - ZEBRA_T) / (N - 1), yz = -0.015;
        for (let k = 0; k < N; k++) {
          const o = -hx + ZEBRA_T / 2 + k * pitch;
          if (sN) white.push({ x: ix + o, y: yz, z: iz - hz - ZW / 2, sx: ZEBRA_T, sy: 0.03, sz: ZW });
          if (sS) white.push({ x: ix + o, y: yz, z: iz + hz + ZW / 2, sx: ZEBRA_T, sy: 0.03, sz: ZW });
          if (sW) white.push({ x: ix - hx - ZW / 2, y: yz, z: iz + o, sx: ZW, sy: 0.03, sz: ZEBRA_T });
          if (sE) white.push({ x: ix + hx + ZW / 2, y: yz, z: iz + o, sx: ZW, sy: 0.03, sz: ZEBRA_T });
        }
      }
      // T-junction: the red walkway + kerb of the through road run straight across the closed arm
      if (!aN) { pvm.push({ x: ix, y: 0.02, z: iz - (hz + PAVE_C), sx: 2 * hx, sy: 0.12, sz: PAVE_W }); kerb.push({ x: ix, y: 0.05, z: iz - (hz + 0.12), sx: 2 * hx, sy: 0.18, sz: 0.24 }); }
      if (!aS) { pvm.push({ x: ix, y: 0.02, z: iz + (hz + PAVE_C), sx: 2 * hx, sy: 0.12, sz: PAVE_W }); kerb.push({ x: ix, y: 0.05, z: iz + (hz + 0.12), sx: 2 * hx, sy: 0.18, sz: 0.24 }); }
      if (!aW) { pvm.push({ x: ix - (hx + PAVE_C), y: 0.02, z: iz, sx: PAVE_W, sy: 0.12, sz: 2 * hz }); kerb.push({ x: ix - (hx + 0.12), y: 0.05, z: iz, sx: 0.24, sy: 0.18, sz: 2 * hz }); }
      if (!aE) { pvm.push({ x: ix + (hx + PAVE_C), y: 0.02, z: iz, sx: PAVE_W, sy: 0.12, sz: 2 * hz }); kerb.push({ x: ix + (hx + 0.12), y: 0.05, z: iz, sx: 0.24, sy: 0.18, sz: 2 * hz }); }
      if (tH || tV) {   // the straight road keeps its yellow centre line and white lane dashes unbroken through the junction
        const lo = (tH ? ix : iz) - AVE_HALF - WALK_W, hi = (tH ? ix : iz) + AVE_HALF + WALK_W, c = tH ? iz : ix;
        for (const o of [-0.42, 0.42]) yellow.push(tH ? { x: ix, y: yB, z: c + o, sx: hi - lo, sy: 0.03, sz: 0.22 } : { x: c + o, y: yB, z: iz, sx: 0.22, sy: 0.03, sz: hi - lo });
        for (let q = Math.ceil((lo + 2) / 14) * 14; q <= hi - 2; q += 14)
          for (const o of [-12, 12]) white.push(tH ? { x: q, y: yB, z: c + o, sx: 4, sy: 0.03, sz: 0.15 } : { x: c + o, y: yB, z: q, sx: 0.15, sy: 0.03, sz: 4 });
      }
      if (aN && aS && aW && aE) {   // yellow box junction only on real crossroads
        const ex = hx - 0.8, ez = hz - 0.8, t = 0.3;
        yellow.push({ x: ix, y: yB, z: iz - ez, sx: 2 * ex + t, sy: 0.03, sz: t }, { x: ix, y: yB, z: iz + ez, sx: 2 * ex + t, sy: 0.03, sz: t },
                    { x: ix - ex, y: yB, z: iz, sx: t, sy: 0.03, sz: 2 * ez }, { x: ix + ex, y: yB, z: iz, sx: t, sy: 0.03, sz: 2 * ez });
        const dl = Math.hypot(2 * ex, 2 * ez), da = Math.atan2(ez, ex);
        yellow.push({ x: ix, y: yB, z: iz, sx: dl, sy: 0.03, sz: t, ry: -da }, { x: ix, y: yB, z: iz, sx: dl, sy: 0.03, sz: t, ry: da });
      }
    }
  }
  // Dead ends: kerb + red walkway across the end of the road, and a striped barrier just before it.
  for (const d of deadEnds) {
    const ex = d.axis === 'x' ? d.g : d.q, ez = d.axis === 'x' ? d.q : d.g;
    if (ex < xMin || ex >= xMax || ez < zMin || ez >= zMax) continue;
    const q = d.q, dir = d.dir, hw = AVE_HALF;
    if (d.axis === 'x') {
      kerb.push({ x: d.g, y: 0.05, z: q + dir * 0.12, sx: 2 * hw + 0.48, sy: 0.18, sz: 0.24 });
      pvm.push({ x: d.g, y: 0.02, z: q + dir * (0.24 + PAVE_W / 2), sx: 2 * (hw + WALK_W), sy: 0.12, sz: PAVE_W });
    } else {
      kerb.push({ x: q + dir * 0.12, y: 0.05, z: d.g, sx: 0.24, sy: 0.18, sz: 2 * hw + 0.48 });
      pvm.push({ x: q + dir * (0.24 + PAVE_W / 2), y: 0.02, z: d.g, sx: PAVE_W, sy: 0.12, sz: 2 * (hw + WALK_W) });
    }
    for (let k = 0; k < 8; k++) {   // 8 striped boards across the 48-wide road, standing on legs
      const o = -hw + 1.2 + k * 5.8, bq = q - dir * 1.2, list = k % 2 ? barWhite : barRed;
      list.push(d.axis === 'x' ? { x: d.g + o + 2.6, y: 1.8, z: bq, sx: 5.4, sy: 1.0, sz: 0.5 } : { x: bq, y: 1.8, z: d.g + o + 2.6, sx: 0.5, sy: 1.0, sz: 5.4 });
      if (k % 2 === 0) barWhite.push(d.axis === 'x' ? { x: d.g + o + 2.6, y: 0.7, z: bq, sx: 0.5, sy: 1.4, sz: 0.5 } : { x: bq, y: 0.7, z: d.g + o + 2.6, sx: 0.5, sy: 1.4, sz: 0.5 });
    }
  }
  batch(asphaltRecs, UNIT_BOX, asphaltMat, group);
  batch(pvm, UNIT_BOX, pavementMat, group);
  batch(kerb, UNIT_BOX, kerbEdgeMat, group);
  batch(barRed, UNIT_BOX, barRedMat, group); batch(barWhite, UNIT_BOX, barWhiteMat, group);
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
        for (let i = 0; i <= 6; i++) box(0.22, 0.035, 28, C.line, f.x - 18 + i * 6, 0.04, f.z + 1);
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
  job(() => {   // 1b. green fields on closed roads / wild blocks + random street objects (ground cells go into the shared box batch)
    const x1 = xMin + CHUNK_SIZE, z1 = zMin + CHUNK_SIZE, inC = o => o.x >= xMin && o.x < x1 && o.z >= zMin && o.z < z1;
    const L = { bushes: [], tufts: [], rocks: [], cones: [], drums: [], bins: [] };
    for (const r of fieldRectsIn(xMin, x1, zMin, z1)) {
      const it = fieldItems(r);
      for (const b of it.tufts) if (inC(b)) L.tufts.push(b);
    }
    addRoadsideProps(cx, cz, box, L);
    vegMats();
    const fr = fieldRectsIn(xMin, x1, zMin, z1), gg = fr.length ? fieldGroundGeo(fr, xMin, x1, zMin, z1) : null;
    if (gg) { const gm = new THREE.Mesh(gg, groundMat); gm.matrixAutoUpdate = false; gm.updateMatrix(); group.add(gm); entry.disposables.push(gg); }   // one draw call, freed with the chunk
    batch(L.bushes, BUSH_GEO, bushMat, group, true); batch(L.tufts, TUFT_GEO, tuftMat, group, true); batch(L.rocks, ROCK_GEO, rockMat, group, true);
    batch(L.cones, CONE_GEO, instMat, group, true); batch(L.drums, DRUM_GEO, instMat, group, true); batch(L.bins, BIN_GEO, instMat, group, true);
  });
  job(() => { batch(boxes, UNIT_BOX, instMat, group, true); });          // 2. one draw call for all boxes
  job(() => { buildRoads(cx, cz, group, asphalt); });                       // 3. roads, kerbs, markings, lamps
  job(() => {                                                               // 4. palms
    const trees = chunkTrees(cx, cz);
    if (!trees.length) return;
    for (const t of trees) registerStreetBlock(t.x,t.z,Math.max(1.1,t.s*1.15),Math.max(1.1,t.s*1.15));
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
    for (let gx = Math.ceil(x0 / ROAD_SPACING) * ROAD_SPACING; gx < x1 && gx >= -5180 && gx <= 5180; gx += ROAD_SPACING) {
      if (!roadLive('x', Math.round(gx / ROAD_SPACING), (z0 + z1) / 2, 6)) continue;      // no name board beside a closed road
      addStreetNameSign(streetName('x', Math.round(gx / ROAD_SPACING)), gx + AVE_HALF + 2, (z0 + z1) / 2, 'x');
    }
    for (let gz = Math.ceil(z0 / ROAD_SPACING) * ROAD_SPACING; gz < z1 && gz >= -5180 && gz <= 5180; gz += ROAD_SPACING) {
      if (!roadLive('z', Math.round(gz / ROAD_SPACING), (x0 + x1) / 2, 6)) continue;
      addStreetNameSign(streetName('z', Math.round(gz / ROAD_SPACING)), (x0 + x1) / 2, gz + AVE_HALF + 2, 'z');
    }
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
  for (const q of furnitureAlong(ax, player.position.z - 320, player.position.z + 320, 'x').poles) for (const sd of [-1, 1]) add(ax + sd * headOff, q);
  for (const q of furnitureAlong(az, player.position.x - 320, player.position.x + 320, 'z').poles) for (const sd of [-1, 1]) add(q, az + sd * headOff);
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
// CITY MAP: Google-Maps style, drawn live from the real world data.
// Drag to pan, wheel / pinch / +- to zoom, double-click to zoom in, tap a building or ground for details, search for places.
// It follows the player (blue dot + direction beam + trail) until you drag away; the ◎ button snaps back to you.
// Shows the lagoon, avenues (named), junctions with zebra crossings + stop lines, bus stops and shelters,
// sports grounds / market / car park, and every building with its real footprint, setback tiers and entrance.
// ============================================================================
const MAP_MIN_SCALE = 0.04, MAP_MAX_SCALE = 8, MAP_DEFAULT_SCALE = 0.9;
const mapStyleEl = document.createElement('style');
mapStyleEl.textContent = `
#cityMapPanel{position:fixed;left:50%;top:84px;bottom:20px;width:min(1100px,calc(100vw - 24px));transform:translateX(-50%);z-index:11999;border-radius:18px;overflow:hidden;background:#dfe3e8;box-shadow:0 18px 60px rgba(0,0,0,.45);display:none;font:13px/1.35 "DM Sans",system-ui,sans-serif;color:#202124;user-select:none;-webkit-user-select:none}
#cityMapPanel.open{display:block}
#cityMapCanvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
#cityMapCanvas.grabbing{cursor:grabbing}
.mapChip{position:absolute;background:#fff;box-shadow:0 2px 8px rgba(60,64,67,.35);z-index:2}
#mapSearchBox{left:12px;top:12px;width:min(340px,calc(100% - 76px));height:44px;border-radius:24px;display:flex;align-items:center;padding:0 12px}
#mapSearchBox input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:#202124;padding:0 8px}
#mapResults{position:absolute;left:12px;top:62px;width:min(340px,calc(100% - 76px));background:#fff;border-radius:14px;box-shadow:0 4px 16px rgba(60,64,67,.4);display:none;overflow:hidden;z-index:3}
#mapResults button{display:block;width:100%;text-align:left;border:0;border-top:1px solid #f1f3f4;background:#fff;padding:9px 14px;font:inherit;color:#202124;cursor:pointer}
#mapResults button:first-child{border-top:0}#mapResults button:hover{background:#f1f3f4}#mapResults small{display:block;color:#70757a;font-size:11px}
#cityMapClose{position:absolute;right:12px;top:12px;width:44px;height:44px;border-radius:50%;border:0;background:#fff;box-shadow:0 2px 8px rgba(60,64,67,.35);font-size:24px;line-height:1;color:#5f6368;cursor:pointer;z-index:2}
#mapCtl{right:12px;bottom:84px;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
#mapCtl button,#mapLocate{width:44px;height:44px;border:0;background:#fff;font-size:22px;line-height:1;color:#5f6368;cursor:pointer}
#mapCtl button+button{border-top:1px solid #e8eaed}
#mapLocate{right:12px;bottom:28px;border-radius:50%;box-shadow:0 2px 8px rgba(60,64,67,.35);position:absolute;z-index:2;font-size:24px}
#mapLocate.on{color:#1a73e8}
#mapCompass{right:12px;top:66px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:11px;color:#d93025;letter-spacing:.5px}
#mapFoot{left:12px;bottom:12px;max-width:calc(100% - 84px);padding:7px 12px;border-radius:12px;font-size:11.5px;color:#3c4043;display:flex;flex-direction:column;gap:4px}
#mapScaleRow{display:flex;align-items:center;gap:8px;color:#5f6368;font-size:11px}
#mapScaleBar{height:6px;border:2px solid #5f6368;border-top:0;display:inline-block;width:80px}
#mapCard{left:12px;bottom:78px;width:min(330px,calc(100% - 84px));padding:14px 16px;border-radius:14px;display:none;z-index:3}
#mapCard h4{margin:0 26px 2px 0;font-size:15px}#mapCard p{margin:3px 0;color:#5f6368;font-size:12px}#mapCard b{color:#202124}
#mapCardX{position:absolute;right:8px;top:6px;border:0;background:transparent;font-size:20px;color:#5f6368;cursor:pointer}
#mapCardGo{margin-top:8px;border:0;border-radius:18px;background:#1a73e8;color:#fff;padding:7px 14px;font:700 12px "DM Sans",system-ui,sans-serif;cursor:pointer}
#mapOpenBtn{background:#fff!important;color:#138344!important;border:1.5px solid #138344!important;display:flex;align-items:center;justify-content:center;gap:7px}
@media(max-width:700px){#cityMapPanel{left:8px;right:8px;top:70px;bottom:8px;width:auto;transform:none}#mapCard{bottom:84px}}`;
document.head.appendChild(mapStyleEl);

const cityMapPanel = document.createElement('section');
cityMapPanel.id = 'cityMapPanel'; cityMapPanel.setAttribute('aria-label', 'City map');
cityMapPanel.innerHTML = `<canvas id="cityMapCanvas"></canvas>
<div class="mapChip" id="mapSearchBox"><span>🔎</span><input id="mapSearch" type="text" placeholder="Search places, streets, e.g. 11 Allen Avenue" autocomplete="off" spellcheck="false"></div>
<div id="mapResults"></div>
<button id="cityMapClose" type="button" aria-label="Close map">×</button>
<div class="mapChip" id="mapCompass" title="North is up">▲N</div>
<div class="mapChip" id="mapCtl"><button id="mapZoomIn" type="button" aria-label="Zoom in">＋</button><button id="mapZoomOut" type="button" aria-label="Zoom out">−</button></div>
<button id="mapLocate" type="button" class="on" aria-label="My location">◎</button>
<div class="mapChip" id="mapCard"><button id="mapCardX" type="button" aria-label="Close">×</button><h4 id="mapCardTitle"></h4><div id="mapCardBody"></div><button id="mapCardGo" type="button">Centre here</button></div>
<div class="mapChip" id="mapFoot"><div id="mapScaleRow"><span id="mapScaleBar"></span><span id="mapScaleText"></span></div><div id="mapStatus">Locating…</div></div>`;
document.body.appendChild(cityMapPanel);
const mapOpenBtn = document.createElement('button');
mapOpenBtn.id = 'mapOpenBtn'; mapOpenBtn.type = 'button'; mapOpenBtn.className = 'panel-button';
mapOpenBtn.innerHTML = '🗺 Map view';
// Lives inside the character panel (not floating), so it can never sit on top of another button.
(document.querySelector('.left-panel') || document.body).appendChild(mapOpenBtn);

const mapEl = id => cityMapPanel.querySelector('#' + id);
const cityMapCanvas = mapEl('cityMapCanvas'), mapCtx = cityMapCanvas.getContext('2d');
const mapSearchEl = mapEl('mapSearch'), mapResultsEl = mapEl('mapResults'), mapCardEl = mapEl('mapCard'), mapLocateEl = mapEl('mapLocate');
const mapView = { cx: 0, cz: 0, scale: MAP_DEFAULT_SCALE, follow: true };
let cityMapOpen = false, mapW = 800, mapH = 600, mapDpr = 1, mapDirty = true, mapSelected = null, mapPulse = 0, mapLastX = NaN, mapLastZ = NaN, mapLastR = NaN;
const mapTrail = [];

// ---- look-ups ---------------------------------------------------------------
const MAP_KIND_LABEL = { office: 'Office tower', apartment: 'Apartment tower', mixed: 'Mixed-use tower', residential: 'Residential tower', tenement: 'Residential block', shop: 'Retail building', duplex: 'Duplex block', market: 'Market building' };
const MAP_FACADE_LABEL = { curtain: 'Glass curtain wall', fins: 'Glass with vertical fins', ribbon: 'Ribbon windows', punched: 'Punched windows', grid: 'Deep window grid', bands: 'Glazed bands' };
const MAP_FACILITY_LABEL = { football: 'Football arena', tennis: 'Tennis courts', basketball: 'Basketball court', sportscomplex: 'Sports centre', market: 'Market', parking: 'Car park' };
const MAP_FACE_NAME = ['south', 'north', 'east', 'west'];
const mapHexCss = h => '#' + h.toString(16).padStart(6, '0');
const mapBlend = (hex, mixHex, t, f = 1) => { const a = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255], b = [(mixHex >> 16) & 255, (mixHex >> 8) & 255, mixHex & 255]; return `rgb(${a.map((v, i) => Math.min(255, Math.round((v + (b[i] - v) * t) * f))).join(',')})`; };
const mapPresetCache = new Map();
function mapPresetColors(pi) {   // soft map tones taken from the real facade of each tower
  let c = mapPresetCache.get(pi);
  if (!c) {
    const p = FACADE_PRESETS[pi], base = p.glassy ? p.glass : p.wall;
    c = { tiers: [0.9, 0.84, 0.78, 0.72].map(f => mapBlend(base, 0xe9e5db, 0.5, f)), edge: mapBlend(base, 0x9a958a, 0.45) };
    mapPresetCache.set(pi, c);
  }
  return c;
}
const mapFacilityStyle = {
  football: ['#cdebc2', '#9fd18f'], tennis: ['#cdebc2', '#9fd18f'], basketball: ['#cdebc2', '#9fd18f'], sportscomplex: ['#d4edc9', '#a8d79a'],
  market: ['#fbe6c2', '#e9c98b'], parking: ['#d9e6f8', '#a9c3ea']
};
const mapFacilityIcon = { football: '⚽', tennis: '🎾', basketball: '🏀', sportscomplex: '🏟', market: '🛍', parking: 'P' };

// ---- view helpers -----------------------------------------------------------
function mapResize() {
  const r = cityMapCanvas.getBoundingClientRect();
  mapW = Math.max(1, Math.round(r.width)); mapH = Math.max(1, Math.round(r.height));
  mapDpr = Math.min(2, window.devicePixelRatio || 1);
  cityMapCanvas.width = Math.round(mapW * mapDpr); cityMapCanvas.height = Math.round(mapH * mapDpr);
  mapDirty = true;
}
const mapClampScale = s => Math.max(MAP_MIN_SCALE, Math.min(MAP_MAX_SCALE, s));
function mapZoomAt(px, py, factor) {
  if (mapView.follow) { px = mapW / 2; py = mapH / 2; }          // while following, zoom around the player
  const wx = mapView.cx + (px - mapW / 2) / mapView.scale, wz = mapView.cz + (py - mapH / 2) / mapView.scale;
  mapView.scale = mapClampScale(mapView.scale * factor);
  mapView.cx = wx - (px - mapW / 2) / mapView.scale; mapView.cz = wz - (py - mapH / 2) / mapView.scale;
  mapDirty = true;
}
function mapSetFollow(on) {
  mapView.follow = on; mapLocateEl.classList.toggle('on', on); mapDirty = true;
}
function mapFlyTo(x, z, scale) {
  mapSetFollow(false);
  mapView.cx = x; mapView.cz = z;
  if (scale) mapView.scale = mapClampScale(scale);
  mapDirty = true;
}
function mapNearestDistrict(x, z) {
  let best = null, bd = 1e12;
  for (const d of baseDistrictDefs) { const dd = Math.hypot(d[1] - x, d[2] - z); if (dd < bd) { bd = dd; best = d[0]; } }
  return best;
}

// ============================================================================
// NAVIGATION: Google-Maps style directions on top of the city map.
//   tap / search a place -> "Directions" -> pick Walk / Bus / Drive (time, distance, arrival clock) -> "Start".
// Start shrinks the map into a corner mini-map that follows the player. The route stays drawn as a blue line from the
// player to the destination, and a banner shows the next turn, remaining time / distance and the arrival time.
// Routes follow the real road network (closed roads and dead ends are avoided; ROAD_SPACING grid). Walk uses the normal walking pace; Bus and Drive raise the player's
// travel speed while navigating (NAV_SPEEDS, metres per second) so the estimated time matches what you actually experience.
// ============================================================================
const NAV_SPEEDS = { walk: 2.3, bus: 9, car: 16 };
const NAV_MODES = ['walk', 'bus', 'car'];
const NAV_MODE_INFO = { walk: ['🚶', 'Walk'], bus: ['🚌', 'Bus'], car: ['🚗', 'Drive'] };
const NAV_MINI_SCALE = { walk: 0.8, bus: 0.45, car: 0.32 };          // zoom of the corner mini-map per mode
const NAV_ROAD_MAX = 24, NAV_ARRIVE_R = 22, NAV_OFF_ROUTE = 80, NAV_BUS_SPACING = ROAD_SPACING * BUS_STOP_EVERY;
const nav = { active: false, plan: null, mode: 'car', lastMode: 'car', dest: null, route: null, line: null, remain: 0, arrived: false, arriveT: 0, offT: 0, uiT: 1, mini: false };
let mapSelDest = null, mapMiniAcc = 0;
// Mini-map orientation while navigating. navMapTurn: 0 = AUTO (the top of the map is whatever the game screen faces, and it
// turns with the camera), 1..4 = fixed compass side on top (North, East, South, West). The turn button cycles through them.
let mapRot = 0, mapRotCur = 0, mapRotSnap = true, navMapTurn = 0;
const NAV_TURN_LABELS = ['AUTO', 'N', 'E', 'S', 'W'];
const NAV_TURN_TOAST = ['Map follows your screen', 'Map: North on top', 'Map: East on top', 'Map: South on top', 'Map: West on top'];
const _mapDirV = new THREE.Vector3();
function navMapTargetRot() {          // canvas rotation that puts the wanted direction at the top of the mini-map
  if (navMapTurn === 0) {
    camera.getWorldDirection(_mapDirV);                       // where the game screen is looking (horizontal part)
    if (_mapDirV.x * _mapDirV.x + _mapDirV.z * _mapDirV.z < 1e-6) return mapRotCur;
    return -Math.PI / 2 - Math.atan2(_mapDirV.z, _mapDirV.x); // map x = world x, map y = world z (north = -z)
  }
  return -(navMapTurn - 1) * Math.PI / 2;
}
function mapUpright(ctx, x, y, fn) {  // draw something at (x,y) that must stay upright while the map is turned
  ctx.save(); ctx.translate(x, y); if (mapRot) ctx.rotate(-mapRot); fn(); ctx.restore();
}

// <nav-pure>
const navClampIdx = i => Math.max(-NAV_ROAD_MAX, Math.min(NAV_ROAD_MAX, i));
const navClampPos = v => Math.max(-NAV_ROAD_MAX * ROAD_SPACING, Math.min(NAV_ROAD_MAX * ROAD_SPACING, v));
// Nearest point of road line (axis, i) that really exists (junction squares + open / stub stretches) to along-road coordinate q.
function navLiveQ(axis, i, q) {
  let best = q, bd = Infinity;
  for (const [a, b] of roadRuns(axis, i, q - 2 * ROAD_SPACING, q + 2 * ROAD_SPACING)) {
    const c = Math.max(a, Math.min(b, q)), d = Math.abs(c - q);
    if (d < bd) { bd = d; best = c; }
  }
  return navClampPos(best);
}
// The roads beside a point (two lines each side, snapped onto road that exists), nearest first. axis 'x' = road at x = i*210 (runs along z).
function navSnaps(x, z) {
  const out = [], X0 = Math.floor(x / ROAD_SPACING), Z0 = Math.floor(z / ROAD_SPACING);
  for (const ix of [X0, X0 + 1]) { const i = navClampIdx(ix), q = navLiveQ('x', i, z); out.push({ axis: 'x', i, x: i * ROAD_SPACING, z: q, d: Math.hypot(x - i * ROAD_SPACING, z - q) }); }
  for (const iz of [Z0, Z0 + 1]) { const i = navClampIdx(iz), q = navLiveQ('z', i, x); out.push({ axis: 'z', i, x: q, z: i * ROAD_SPACING, d: Math.hypot(x - q, z - i * ROAD_SPACING) }); }
  out.sort((a, b) => a.d - b.d);
  return out;
}
const navSnap = (x, z) => navSnaps(x, z)[0];
function navFree(x, z) {   // a walkable point: if (x,z) is inside a building, use the nearest road point instead
  x = Math.max(-5200, Math.min(5200, x)); z = Math.max(-5200, Math.min(5200, z));
  if (!collidesWithBuilding(x, z)) return [x, z];
  const s = navSnap(x, z); return [s.x, s.z];
}
const navStreet = (x, z) => { const s = navSnap(x, z); return streetName(s.axis, s.i); };
const NAV_DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// ---- junction graph: 49 x 49 junctions, an edge for every road stretch that is fully open (closed roads and dead-end stubs lead nowhere) ----
const navNodeId = (ni, nj) => (ni + 24) * 49 + (nj + 24);
function navLoc(s) {   // where a snapped point sits: on a junction square, or inside one road stretch (with the junctions it can reach)
  const S = ROAD_SPACING, ax = s.axis, q = ax === 'x' ? s.z : s.x, j = Math.round(q / S);
  const nodeOf = jj => ax === 'x' ? [s.i, jj] : [jj, s.i];
  if (Math.abs(q - j * S) <= AVE_HALF) return { ends: [{ n: nodeOf(j), d: Math.abs(q - j * S), dirs: [0, 1, 2, 3] }], part: 'n' + nodeOf(j).join(',') };
  const j0 = Math.floor(q / S), rec = roadSegs.get(segKey(ax, s.i, j0)), r = q - j0 * S;
  let low = true, high = true, part = 'o';
  if (rec) {
    const inLo = (r - AVE_HALF) <= rec.a, inHi = (S - AVE_HALF - r) <= rec.b;
    if (rec.k === 2) { high = false; part = 'l'; } else if (rec.k === 3) { low = false; part = 'h'; }
    else if (rec.k === 4) { if (inLo || !inHi) { high = false; part = 'l'; } else { low = false; part = 'h'; } }
    else { low = high = false; }
  }
  const ends = [];
  if (low) ends.push({ n: nodeOf(j0), d: q - j0 * S, dirs: [ax === 'x' ? 3 : 1] });         // heading toward lower coordinates
  if (high) ends.push({ n: nodeOf(j0 + 1), d: (j0 + 1) * S - q, dirs: [ax === 'x' ? 2 : 0] });
  return { ends, part: ax + s.i + ':' + j0 + part, q };
}
const NAV_TURN_COST = 70;   // a turn costs like 70 extra units of road, so routes prefer long straight runs over staircases
function navDijkstra(sources) {   // multi-source shortest paths over (junction, heading) states
  const N = 49 * 49 * 4, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [];
  const push = (d, id) => { let k = heap.length; heap.push([d, id]); while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let m = k; const l = 2 * k + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (const s of sources) for (const dr of s.dirs) { const id = navNodeId(s.n[0], s.n[1]) * 4 + dr; if (s.d < dist[id]) { dist[id] = s.d; push(s.d, id); } }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (heap.length) {
    const [d, st] = pop(); if (d > dist[st]) continue;
    const id = st >> 2, dir = st & 3, ni = Math.floor(id / 49) - 24, nj = (id % 49) - 24;
    for (let nd2 = 0; nd2 < 4; nd2++) {
      if (nd2 === (dir ^ 1)) continue;                                                              // no U-turns
      const mi = ni + DIRS[nd2][0], mj = nj + DIRS[nd2][1]; if (mi < -24 || mi > 24 || mj < -24 || mj > 24) continue;
      const open = nd2 < 2 ? segOpen('z', nj, Math.min(ni, mi)) : segOpen('x', ni, Math.min(nj, mj));   // road along x at z-line nj / along z at x-line ni
      if (!open) continue;
      const m = navNodeId(mi, mj) * 4 + nd2, nd = d + ROAD_SPACING + (nd2 === dir ? 0 : NAV_TURN_COST);
      if (nd < dist[m]) { dist[m] = nd; prev[m] = st; push(nd, m); }
    }
  }
  return { dist, prev };
}
function navFinish(pts, names, dest) {
  if (pts.length < 2) { pts.push([dest.x + 0.01, dest.z]); names.push(null); }
  const n = pts.length, cum = [0];
  for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  // bus stops that lie on the road legs of the route (a shelter pair every 3rd block, mid-block) - only on fully open stretches
  const stops = [];
  for (let k = 0; k < names.length; k++) {
    if (!names[k]) continue;
    const x0 = pts[k][0], z0 = pts[k][1], x1 = pts[k + 1][0], z1 = pts[k + 1][1], vertical = Math.abs(x1 - x0) < 0.5;
    const lo = vertical ? Math.min(z0, z1) : Math.min(x0, x1), hi = vertical ? Math.max(z0, z1) : Math.max(x0, x1), line = Math.round((vertical ? x0 : z0) / ROAD_SPACING);
    for (let m = Math.ceil((lo - ROAD_SPACING / 2) / NAV_BUS_SPACING), e = Math.floor((hi - ROAD_SPACING / 2) / NAV_BUS_SPACING); m <= e; m++) {
      const q = m * NAV_BUS_SPACING + ROAD_SPACING / 2;
      if (!segOpen(vertical ? 'x' : 'z', line, Math.floor(q / ROAD_SPACING))) continue;
      stops.push(vertical ? [x0, q] : [q, z0]);
    }
  }
  // turn-by-turn steps: v = index of the vertex where the manoeuvre happens
  const steps = [];
  for (let k = 1; k < n - 1; k++) {
    const d1x = pts[k][0] - pts[k - 1][0], d1z = pts[k][1] - pts[k - 1][1], d2x = pts[k + 1][0] - pts[k][0], d2z = pts[k + 1][1] - pts[k][1];
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z); if (!l1 || !l2) continue;
    const dot = (d1x * d2x + d1z * d2z) / (l1 * l2), cross = (d1x * d2z - d1z * d2x) / (l1 * l2), road = names[k];   // map y points down, so cross > 0 = right turn
    if (dot > 0.93) { if (road && road !== names[k - 1]) steps.push({ v: k, icon: '⬆', text: 'Continue onto ' + road }); continue; }
    if (dot < -0.93) steps.push({ v: k, icon: '↩', text: 'Make a U-turn' + (road ? ' onto ' + road : '') });
    else steps.push({ v: k, icon: cross > 0 ? '↱' : '↰', text: (cross > 0 ? 'Turn right' : 'Turn left') + (road ? ' onto ' + road : ' toward ' + dest.name) });
  }
  steps.push({ v: n - 1, icon: '🏁', text: 'Arrive at ' + dest.name });
  let via = '', bestLeg = 0;
  for (let k = 0; k < names.length; k++) if (names[k] && cum[k + 1] - cum[k] > bestLeg) { bestLeg = cum[k + 1] - cum[k]; via = names[k]; }
  return { pts, names, cum, len: cum[n - 1], steps, stops, via };
}
// Route over the real road network: start -> its road -> junction to junction (shortest way round closed roads and dead ends) -> destination road -> destination.
function navRoute(from, dest, A, B, la, lb, D) {
  const S = ROAD_SPACING, pts = [[from[0], from[1]]], names = [];
  const add = (x, z, name) => { const l = pts[pts.length - 1]; if (Math.hypot(x - l[0], z - l[1]) < 0.5) return; pts.push([x, z]); names.push(name); };
  add(A.x, A.z, null);
  const nA = streetName(A.axis, A.i), nB = streetName(B.axis, B.i);
  if (la.part === lb.part) add(B.x, B.z, nA);                               // same stretch (or same junction square): straight there
  else {
    let best = Infinity, bestState = -1;
    for (const e of lb.ends) for (let dr = 0; dr < 4; dr++) { const st = navNodeId(e.n[0], e.n[1]) * 4 + dr, t = D.dist[st] + e.d; if (t < best) { best = t; bestState = st; } }
    if (bestState < 0) return null;
    const seq = []; let st = bestState;
    while (st !== -1) { const id = st >> 2; if (seq[seq.length - 1] !== id) seq.push(id); st = D.prev[st]; }
    seq.reverse();
    const P = id2 => [(Math.floor(id2 / 49) - 24) * S, ((id2 % 49) - 24) * S];
    let p = P(seq[0]); add(p[0], p[1], nA);                                 // along the start road to the first junction
    for (let k = 1; k < seq.length; k++) {
      const q = P(seq[k]);
      add(q[0], q[1], q[0] === p[0] ? streetName('x', p[0] / S) : streetName('z', p[1] / S));
      p = q;
    }
    add(B.x, B.z, nB);                                                      // along the destination road to the snapped point
  }
  add(dest.x, dest.z, null);
  return navFinish(pts, names, dest);
}
function navMakePath(from, dest) {
  const sa = navSnaps(from[0], from[1]).slice(0, 3), sb = navSnaps(dest.x, dest.z).slice(0, 3), lbs = sb.map(navLoc);
  let best = null;
  for (const A of sa) {
    const la = navLoc(A), D = navDijkstra(la.ends);
    sb.forEach((B, k) => { const r = navRoute(from, dest, A, B, la, lbs[k], D); if (r && (!best || r.len < best.len - 0.5)) best = r; });
  }
  return best;
}
const navFmtDist = m => m < 950 ? Math.max(10, Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(1) + ' km';
const navFmtDur = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); };
const navClock = s => new Date(Date.now() + s * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });   // real clock: you travel in real time
// </nav-pure>

// ---- UI: styles, directions sheet, mini-map expand button, turn banner --------
const navStyleEl = document.createElement('style');
navStyleEl.textContent = `
#mapCardDir{margin-top:8px;margin-right:6px;border:0;border-radius:18px;background:#1a73e8;color:#fff;padding:7px 14px;font:700 12px "DM Sans",system-ui,sans-serif;cursor:pointer}
#mapCardGo{background:#fff;color:#1a73e8;border:1px solid #dadce0}
#mapDir{left:12px;bottom:78px;width:min(360px,calc(100% - 84px));padding:12px 14px 14px;border-radius:14px;display:none;z-index:3}
#mapDir h4{margin:0 26px 8px 0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mapDirX{position:absolute;right:8px;top:6px;border:0;background:transparent;font-size:20px;color:#5f6368;cursor:pointer}
#mapDirTabs{display:flex;gap:6px}
#mapDirTabs button{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;border:1px solid #dadce0;background:#fff;border-radius:12px;padding:6px 2px;font:inherit;color:#3c4043;cursor:pointer}
#mapDirTabs button span{font-size:18px;line-height:1.1}#mapDirTabs button b{font-size:13px}#mapDirTabs button small{font-size:10.5px;color:#70757a}
#mapDirTabs button.on{background:#e8f0fe;border-color:#1a73e8;color:#1a73e8}#mapDirTabs button.on small{color:#1a73e8}
#mapDirInfo{margin:10px 0 0;color:#3c4043;font-size:12.5px;line-height:1.45}#mapDirInfo b{color:#188038}
#mapDirStart{margin-top:10px;width:100%;border:0;border-radius:20px;background:#1a73e8;color:#fff;padding:10px 14px;font:700 14px "DM Sans",system-ui,sans-serif;cursor:pointer}
#mapMiniExpand{display:none;position:absolute;right:6px;top:6px;width:34px;height:34px;border-radius:50%;border:0;background:#fff;box-shadow:0 2px 8px rgba(60,64,67,.45);font-size:17px;line-height:1;color:#1a73e8;cursor:pointer;z-index:5;pointer-events:auto}
#cityMapPanel.navigating #mapSearchBox,#cityMapPanel.navigating #mapResults{display:none!important}
#cityMapPanel.mini{left:auto;right:10px;top:78px;bottom:auto;width:220px;height:220px;transform:none;border-radius:16px;border:3px solid #fff;box-shadow:0 6px 22px rgba(0,0,0,.5);pointer-events:none}
#cityMapPanel.mini #mapSearchBox,#cityMapPanel.mini #mapResults,#cityMapPanel.mini #cityMapClose,#cityMapPanel.mini #mapCompass,#cityMapPanel.mini #mapCtl,#cityMapPanel.mini #mapLocate,#cityMapPanel.mini #mapCard,#cityMapPanel.mini #mapDir,#cityMapPanel.mini #mapFoot{display:none!important}
#cityMapPanel.mini #mapMiniExpand{display:block}
#mapMiniTurn{display:none;position:absolute;right:6px;bottom:6px;width:40px;height:40px;border-radius:50%;border:0;background:#fff;box-shadow:0 2px 8px rgba(60,64,67,.45);color:#1a73e8;cursor:pointer;z-index:5;pointer-events:auto;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;font-family:\"DM Sans\",system-ui,sans-serif}
#mapMiniTurn span{font-size:16px;line-height:1}#mapMiniTurn small{font-size:9px;font-weight:800;line-height:1;letter-spacing:.3px}
#cityMapPanel.mini #mapMiniTurn{display:flex}
@media(max-width:700px){#cityMapPanel.mini{left:auto;right:8px;top:74px;bottom:auto;width:150px;height:150px}#mapDir{bottom:84px}}
#navBanner{position:fixed;left:50%;top:10px;transform:translateX(-50%);width:min(560px,calc(100vw - 16px));box-sizing:border-box;min-height:56px;display:none;align-items:center;gap:10px;padding:8px 10px 8px 10px;border-radius:16px;background:#0b6b46;color:#fff;box-shadow:0 6px 22px rgba(0,0,0,.45);z-index:12001;font:13px/1.3 "DM Sans",system-ui,sans-serif}
#navBanner.on{display:flex}
#navIcon{flex:none;width:40px;text-align:center;font-size:30px;line-height:1}
#navTxt{flex:1;min-width:0}
#navMain{display:block;font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#navSub{display:block;font-size:12px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#navExit{flex:none;border:0;border-radius:18px;background:#fff;color:#0b6b46;font:700 12px "DM Sans",system-ui,sans-serif;padding:8px 14px;cursor:pointer}`;
document.head.appendChild(navStyleEl);
cityMapPanel.insertAdjacentHTML('beforeend', `<div class="mapChip" id="mapDir"><button id="mapDirX" type="button" aria-label="Close directions">×</button><h4 id="mapDirTitle"></h4>
<div id="mapDirTabs"><button type="button" data-mode="walk"></button><button type="button" data-mode="bus"></button><button type="button" data-mode="car"></button></div>
<p id="mapDirInfo"></p><button id="mapDirStart" type="button">▶ Start</button></div>
<button id="mapMiniExpand" type="button" aria-label="Expand map" title="Expand map">⤢</button>
<button id="mapMiniTurn" type="button" aria-label="Turn map" title="Turn map: Auto, North, East, South, West"><span>⟳</span><small>AUTO</small></button>`);
const mapDirEl = mapEl('mapDir');
const navBannerEl = document.createElement('div');
navBannerEl.id = 'navBanner';
navBannerEl.innerHTML = '<div id="navIcon">⬆</div><div id="navTxt"><b id="navMain"></b><span id="navSub"></span></div><button id="navExit" type="button">End</button>';
document.body.appendChild(navBannerEl);
const navQ = id => navBannerEl.querySelector('#' + id);
const mapCardDirBtn = document.createElement('button');
mapCardDirBtn.id = 'mapCardDir'; mapCardDirBtn.type = 'button'; mapCardDirBtn.textContent = 'Directions';
mapCardEl.insertBefore(mapCardDirBtn, mapEl('mapCardGo'));

// ---- planning (directions sheet) -------------------------------------------------
function navRefreshSheet() {
  const p = nav.plan; if (!p) return;
  mapEl('mapDirTitle').textContent = 'To ' + p.dest.name;
  mapEl('mapDirTabs').querySelectorAll('button').forEach(b => {
    const m = b.dataset.mode;
    b.classList.toggle('on', m === p.mode);
    b.innerHTML = `<span>${NAV_MODE_INFO[m][0]}</span><b>${navFmtDur(p.route.len / NAV_SPEEDS[m])}</b><small>${NAV_MODE_INFO[m][1]}</small>`;
  });
  const sec = p.route.len / NAV_SPEEDS[p.mode], ns = p.route.stops.length;
  mapEl('mapDirInfo').innerHTML = `<b>Arrive ${navClock(sec)}</b> · ${navFmtDist(p.route.len)}` + (p.route.via ? ` · via ${p.route.via}` : '') +
    (p.mode === 'bus' ? `<br>🚌 ${ns} bus stop${ns === 1 ? '' : 's'} on the way` : '');
}
function navPlanTo(dest) {
  const route = navMakePath([player.position.x, player.position.z], dest);
  if (!route) { mapCardEl.style.display = 'none'; mapDirEl.style.display = 'none'; alert('No passable road route is available to this destination. Choose a destination beside an open road.'); return; }
  nav.plan = { dest, route, mode: nav.lastMode };
  mapCardEl.style.display = 'none';
  navRefreshSheet(); mapDirEl.style.display = 'block';
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;           // fit the whole route in view
  for (const p of route.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const sc = Math.min(Math.max(100, mapW - 140) / Math.max(60, x1 - x0), Math.max(100, mapH - 240) / Math.max(60, z1 - z0), 1.3);
  mapFlyTo((x0 + x1) / 2, (z0 + z1) / 2 + 40 / Math.max(sc, 0.04), mapClampScale(sc));
}
function navCancelPlan() {
  if (!nav.plan) return;
  nav.plan = null; mapDirEl.style.display = 'none'; mapDirty = true;
}

// ---- driving the navigation ---------------------------------------------------------
function setMapMini(on) {
  nav.mini = on; cityMapPanel.classList.toggle('mini', on); mapRotSnap = true;
  mapResultsEl.style.display = 'none';
  mapSetFollow(true);
  mapView.scale = on ? NAV_MINI_SCALE[nav.mode] : MAP_DEFAULT_SCALE;
  mapResize(); mapDirty = true; drawCityMap();
}
function navStart() {
  const p = nav.plan; if (!p) return;
  nav.active = true; nav.mode = nav.lastMode = p.mode; nav.dest = p.dest;
  nav.route = navMakePath([player.position.x, player.position.z], p.dest);
  if (!nav.route) { alert('The route is no longer available. Please choose another destination.'); return; }
  nav.plan = null; nav.arrived = false; nav.offT = 0; nav.uiT = 1; nav.line = null;
  mapDirEl.style.display = 'none'; mapCardEl.style.display = 'none'; mapSelDest = null;
  mapTrail.length = 0; navMapTurn = 0; navMapTurnRefresh();
  cityMapPanel.classList.add('navigating'); navBannerEl.classList.add('on');
  updateNav(0);
  setMapMini(true);
}
function navEnd() {
  navMapTurn = 0; navMapTurnRefresh();
  nav.active = false; nav.route = nav.line = nav.dest = null; nav.arrived = false;
  navBannerEl.classList.remove('on'); cityMapPanel.classList.remove('navigating');
  if (nav.mini) { nav.mini = false; cityMapPanel.classList.remove('mini'); setCityMapOpen(false); }
  mapDirty = true;
}
function updateNav(dt) {
  if (!nav.active) return;
  if (nav.arrived) { if ((nav.arriveT -= dt) <= 0) navEnd(); return; }
  const P = nav.route, dest = nav.dest, px = player.position.x, pz = player.position.z;
  let bd = Infinity, bi = 0, bt = 0, qx = px, qz = pz;                               // closest point of the route to the player
  for (let k = 0; k < P.pts.length - 1; k++) {
    const ax = P.pts[k][0], az = P.pts[k][1], dx = P.pts[k + 1][0] - ax, dz = P.pts[k + 1][1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)), cx = ax + dx * t, cz = az + dz * t, d = (px - cx) ** 2 + (pz - cz) ** 2;
    if (d < bd) { bd = d; bi = k; bt = t; qx = cx; qz = cz; }
  }
  const off = Math.sqrt(bd), along = P.cum[bi] + bt * (P.cum[bi + 1] - P.cum[bi]);
  nav.remain = Math.max(0, P.len - along) + (off > 8 ? off : 0);
  const line = [[px, pz]];                                                           // blue line: player -> route -> destination
  if (off > 8) line.push([qx, qz]);
  for (let k = bi + 1; k < P.pts.length; k++) line.push(P.pts[k]);
  nav.line = line;

  if (Math.hypot(px - dest.x, pz - dest.z) < NAV_ARRIVE_R) {                         // arrived
    nav.arrived = true; nav.arriveT = 4; nav.remain = 0;
    navQ('navIcon').textContent = '🏁'; navQ('navMain').textContent = 'You have arrived'; navQ('navSub').textContent = dest.name;
    return;
  }
  if (off > NAV_OFF_ROUTE) { if ((nav.offT += dt) > 1.5) { const reroute = navMakePath([px, pz], dest); if (reroute) nav.route = reroute; nav.offT = 0; } } else nav.offT = 0;   // wandered off: re-route

  if ((nav.uiT += dt) >= 0.2) {
    nav.uiT = 0;
    const st = P.steps.find(s => s.v > bi) || P.steps[P.steps.length - 1];
    const toStep = Math.max(0, P.cum[st.v] - along) + (off > 8 ? off : 0), sec = nav.remain / NAV_SPEEDS[nav.mode];
    navQ('navIcon').textContent = st.icon; navQ('navMain').textContent = st.text;
    navQ('navSub').textContent = `in ${navFmtDist(toStep)} · ${navFmtDur(sec)} · ${navFmtDist(nav.remain)} · Arrive ${navClock(sec)}`;
  }
}

// ---- drawing: blue route line (dotted when walking), bus stops, destination pin ------------
function drawNavRoute(ctx, X, Y, S) {
  const mode = nav.active ? nav.mode : nav.plan ? nav.plan.mode : null;
  const route = nav.active ? nav.route : nav.plan ? nav.plan.route : null;
  const line = nav.active ? nav.line : route ? route.pts : null;
  const ex = mapRot ? (Math.hypot(mapW, mapH) - mapW) / 2 : 0, ey = mapRot ? (Math.hypot(mapW, mapH) - mapH) / 2 : 0;
  if (line && line.length > 1) {
    const w = Math.max(5, Math.min(10, 12 * S + 2));
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); line.forEach((p, i) => { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
    if (mode === 'walk') ctx.setLineDash([0.01, w * 1.7]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = w + 4; ctx.stroke();
    ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = w; ctx.stroke();
    ctx.restore();
    if (mode === 'bus' && route && S >= 0.2) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '11px system-ui, sans-serif';
      for (const st of route.stops) {
        const sx = X(st[0]), sy = Y(st[1]); if (sx < -20 - ex || sx > mapW + 20 + ex || sy < -20 - ey || sy > mapH + 20 + ey) continue;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        mapUpright(ctx, sx, sy, () => { ctx.fillStyle = '#1a73e8'; ctx.fillText('🚌', 0, 0.5); });
      }
    }
  }
  const d = nav.active ? nav.dest : nav.plan ? nav.plan.dest : mapSelDest;
  if (d) {
    const px = X(d.x), py = Y(d.z);
    if (px > -30 - ex && px < mapW + 30 + ex && py > -40 - ey && py < mapH + 30 + ey) {
      mapUpright(ctx, px, py, () => {   // the pin always stands upright, tip on the destination
        ctx.fillStyle = '#ea4335'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-4, -8, -12, -14, -12, -22); ctx.arc(0, -22, 12, Math.PI, 0); ctx.bezierCurveTo(12, -14, 4, -8, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -22, 4.5, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
}

mapCardDirBtn.addEventListener('click', () => { if (mapSelDest) navPlanTo(mapSelDest); });
mapEl('mapDirTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !nav.plan) return; nav.plan.mode = b.dataset.mode; navRefreshSheet(); mapDirty = true; });
mapEl('mapDirX').addEventListener('click', navCancelPlan);
mapEl('mapDirStart').addEventListener('click', navStart);
mapEl('mapMiniExpand').addEventListener('click', () => setMapMini(false));
function navMapTurnRefresh() { const b = mapEl('mapMiniTurn'); if (b) b.querySelector('small').textContent = NAV_TURN_LABELS[navMapTurn]; }
mapEl('mapMiniTurn').addEventListener('click', e => {
  e.stopPropagation();
  navMapTurn = (navMapTurn + 1) % NAV_TURN_LABELS.length;     // AUTO -> N -> E -> S -> W -> AUTO
  navMapTurnRefresh(); mapDirty = true; toast(NAV_TURN_TOAST[navMapTurn]);
});
navQ('navExit').addEventListener('click', navEnd);


// ---- drawing ----------------------------------------------------------------
function drawCityMap() {
  const ctx = mapCtx, W = mapW, H = mapH, S = mapView.scale, cx = mapView.cx, cz = mapView.cz;
  ctx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  mapRot = nav.mini ? mapRotCur : 0;                  // only the navigation mini-map turns; the full map stays north-up
  const D = Math.hypot(W, H), eX = mapRot ? (D - W) / 2 : 0, eY = mapRot ? (D - H) / 2 : 0;   // extra area that turns into view
  ctx.save();
  if (mapRot) { ctx.translate(W / 2, H / 2); ctx.rotate(mapRot); ctx.translate(-W / 2, -H / 2); }
  const X = x => (x - cx) * S + W / 2, Y = z => (z - cz) * S + H / 2;
  const wx0 = cx - (W / 2 + eX) / S, wx1 = cx + (W / 2 + eX) / S, wz0 = cz - (H / 2 + eY) / S, wz1 = cz + (H / 2 + eY) / S;
  const vis = (x, z, hw, hd) => x + hw >= wx0 && x - hw <= wx1 && z + hd >= wz0 && z - hd <= wz1;
  const placed = [];                                   // label collision boxes
  const label = (text, x, y, w, h) => {
    if (x + w / 2 < -eX || x - w / 2 > W + eX || y + h / 2 < -eY || y - h / 2 > H + eY) return false;
    for (const b of placed) if (Math.abs(b[0] - x) < (b[2] + w) / 2 && Math.abs(b[1] - y) < (b[3] + h) / 2) return false;
    placed.push([x, y, w, h]); return true;
  };
  const halo = (text, x, y, color, size, weight = 600, letter = 0, up = true) => {
    if (up && mapRot) { mapUpright(ctx, x, y, () => halo(text, 0, 0, color, size, weight, letter, false)); return; }
    ctx.font = `${weight} ${size}px "DM Sans", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = letter + 'px';
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.lineJoin = 'miter';
  };

  // 1. ground, beach, lagoon
  ctx.fillStyle = '#dfe3e8'; ctx.fillRect(-eX, -eY, W + 2 * eX, H + 2 * eY);
  ctx.fillStyle = '#f2efe9'; ctx.fillRect(X(-CITY_HALF), Y(-CITY_HALF), CITY_HALF * 2 * S, CITY_HALF * 2 * S);
  ctx.fillStyle = '#f3e6c0'; ctx.fillRect(X(590 - 360), Y(805 - 17), 720 * S, 34 * S);
  ctx.fillStyle = '#aadaff'; ctx.fillRect(X(610 - 345), Y(930 - 115), 690 * S, 230 * S);

  // 2. parks / sports grounds / market / car park (ground fills)
  for (const f of cityMapFacilities) {
    if (!vis(f.x, f.z, f.w / 2, f.d / 2)) continue;
    const st = mapFacilityStyle[f.type] || mapFacilityStyle.sportscomplex, w = f.w * S, h = f.d * S;
    if (w < 1 && h < 1) continue;
    ctx.fillStyle = st[0]; ctx.fillRect(X(f.x) - w / 2, Y(f.z) - h / 2, w, h);
    const selF = mapSelected && mapSelected.f === f;
    if (S >= 0.2 || selF) { ctx.strokeStyle = selF ? '#ea4335' : st[1]; ctx.lineWidth = selF ? 3 : 1.5; ctx.strokeRect(X(f.x) - w / 2, Y(f.z) - h / 2, w, h); }
    if (S >= 0.6 && (f.type === 'football' || f.type === 'tennis' || f.type === 'basketball')) {   // pitch markings
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(1, 0.5 * S);
      const iw = w * 0.9, ih = h * 0.88, x = X(f.x), y = Y(f.z);
      ctx.strokeRect(x - iw / 2, y - ih / 2, iw, ih);
      ctx.beginPath();
      if (f.type === 'football') { if (w >= h) { ctx.moveTo(x, y - ih / 2); ctx.lineTo(x, y + ih / 2); } else { ctx.moveTo(x - iw / 2, y); ctx.lineTo(x + iw / 2, y); } ctx.moveTo(x + Math.min(iw, ih) * 0.14, y); ctx.arc(x, y, Math.min(iw, ih) * 0.14, 0, Math.PI * 2); }
      else if (f.type === 'tennis') { ctx.moveTo(x - iw / 2, y); ctx.lineTo(x + iw / 2, y); }
      else { ctx.moveTo(x + Math.min(iw, ih) * 0.16, y); ctx.arc(x, y, Math.min(iw, ih) * 0.16, 0, Math.PI * 2); }
      ctx.stroke();
    }
  }

  // 3. green fields where roads were closed, then roads (only road that really exists): walkways, casings, fills, lane detail when zoomed in
  const kx0 = Math.max(-24, Math.ceil((wx0 - 40) / ROAD_SPACING)), kx1 = Math.min(24, Math.floor((wx1 + 40) / ROAD_SPACING));
  const kz0 = Math.max(-24, Math.ceil((wz0 - 40) / ROAD_SPACING)), kz1 = Math.min(24, Math.floor((wz1 + 40) / ROAD_SPACING));
  const isMajor = k => ((k % 3) + 3) % 3 === 0;
  const zLo = Math.max(wz0 - 60, -CITY_HALF), zHi = Math.min(wz1 + 60, CITY_HALF), xLo = Math.max(wx0 - 60, -CITY_HALF), xHi = Math.min(wx1 + 60, CITY_HALF);
  if (S >= 0.04) {
    const fields = fieldRectsIn(wx0 - 60, wx1 + 60, wz0 - 60, wz1 + 60);
    ctx.fillStyle = '#cde6bd';
    for (const r of fields) ctx.fillRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    if (S >= 0.7) {
      ctx.fillStyle = '#a6cf92';
      for (const r of fields) for (const b of fieldItems(r).bushes) { if (!vis(b.x, b.z, 4, 4)) continue; ctx.beginPath(); ctx.arc(X(b.x), Y(b.z), Math.max(1.5, b.sx * S * 0.9), 0, 6.283); ctx.fill(); }
    }
  }
  const roadBand = (axis, k, wd, ext = 0) => {   // one road line as a band, broken wherever the road is closed; ext pads dead ends (the red cap)
    const g = k * ROAD_SPACING, w = Math.max(wd * S, 1.4);
    for (const [a, b, dl, dh] of roadRuns(axis, k, axis === 'x' ? zLo : xLo, axis === 'x' ? zHi : xHi)) {
      const a2 = a - (dl ? ext : 0), b2 = b + (dh ? ext : 0);
      if (axis === 'x') ctx.fillRect(X(g) - w / 2, Y(a2), w, (b2 - a2) * S); else ctx.fillRect(X(a2), Y(g) - w / 2, (b2 - a2) * S, w);
    }
  };
  if (S >= 0.3) {
    ctx.fillStyle = '#e8dccf';
    for (let k = kx0; k <= kx1; k++) roadBand('x', k, 2 * (AVE_HALF + WALK_W), WALK_W);
    for (let k = kz0; k <= kz1; k++) roadBand('z', k, 2 * (AVE_HALF + WALK_W), WALK_W);
  }
  const casing = S < 0.3 ? 1.2 / S : 2.2 / S;
  for (const major of [false, true]) {
    ctx.fillStyle = major ? '#e5c46f' : '#cfd3d8';
    for (let k = kx0; k <= kx1; k++) if (isMajor(k) === major) roadBand('x', k, 2 * AVE_HALF + casing);
    for (let k = kz0; k <= kz1; k++) if (isMajor(k) === major) roadBand('z', k, 2 * AVE_HALF + casing);
  }
  for (const major of [false, true]) {
    ctx.fillStyle = major ? '#fde293' : '#ffffff';
    for (let k = kx0; k <= kx1; k++) if (isMajor(k) === major) roadBand('x', k, 2 * AVE_HALF);
    for (let k = kz0; k <= kz1; k++) if (isMajor(k) === major) roadBand('z', k, 2 * AVE_HALF);
  }
  const detail = Math.max(0, Math.min(1, (S - 0.55) / 0.4));
  if (detail > 0.01) {                                  // real asphalt + paint fade in as you zoom
    ctx.globalAlpha = detail; ctx.fillStyle = '#50565a';
    for (let k = kx0; k <= kx1; k++) roadBand('x', k, 2 * AVE_HALF);
    for (let k = kz0; k <= kz1; k++) roadBand('z', k, 2 * AVE_HALF);
    ctx.lineCap = 'butt';
    const yellowW = Math.max(1, 1.06 * S), whiteW = Math.max(1, 0.15 * S);
    const marks = (axis, k, lo, hi, fn) => { for (const [s0, e0, dl, dh] of liveSpans(axis, k, lo, hi, false)) fn(dl ? s0 + 4 : s0 + WALK_W, dh ? e0 - 4 : e0 - WALK_W); };   // paint stops short of junctions / dead ends
    for (let k = kx0; k <= kx1; k++) {                  // roads along z (constant x = g)
      const g = k * ROAD_SPACING;
      marks('x', k, wz0 - 5, wz1 + 5, (m0, m1) => {
        ctx.setLineDash([]); ctx.strokeStyle = '#f1c84b'; ctx.lineWidth = yellowW;
        ctx.beginPath(); ctx.moveTo(X(g), Y(m0)); ctx.lineTo(X(g), Y(m1)); ctx.stroke();
        const q0 = Math.ceil((m0 + 2) / 14) * 14 - 2;
        ctx.strokeStyle = '#f4f2df'; ctx.lineWidth = whiteW; ctx.setLineDash([4 * S, 10 * S]);
        for (const sd of [-12, 12]) { ctx.beginPath(); ctx.moveTo(X(g + sd), Y(q0)); ctx.lineTo(X(g + sd), Y(m1)); ctx.stroke(); }
        ctx.setLineDash([]);
      });
    }
    for (let k = kz0; k <= kz1; k++) {                  // roads along x (constant z = g)
      const g = k * ROAD_SPACING;
      marks('z', k, wx0 - 5, wx1 + 5, (m0, m1) => {
        ctx.setLineDash([]); ctx.strokeStyle = '#f1c84b'; ctx.lineWidth = yellowW;
        ctx.beginPath(); ctx.moveTo(X(m0), Y(g)); ctx.lineTo(X(m1), Y(g)); ctx.stroke();
        const q0 = Math.ceil((m0 + 2) / 14) * 14 - 2;
        ctx.strokeStyle = '#f4f2df'; ctx.lineWidth = whiteW; ctx.setLineDash([4 * S, 10 * S]);
        for (const sd of [-12, 12]) { ctx.beginPath(); ctx.moveTo(X(q0), Y(g + sd)); ctx.lineTo(X(m1), Y(g + sd)); ctx.stroke(); }
        ctx.setLineDash([]);
      });
    }
    // junctions: zebra crossings and stop lines only on arms that exist; yellow box only on real crossroads
    const ZT = 0.9, ZW_ = WALK_W, ZN = Math.floor((2 * AVE_HALF - ZT) / (2 * ZT)) + 1, ZP = (2 * AVE_HALF - ZT) / (ZN - 1), SLT = 1.2, GAPM = 0.6;
    for (let a = kx0; a <= kx1; a++) for (let b = kz0; b <= kz1; b++) {
      const ix = a * ROAD_SPACING, iz = b * ROAD_SPACING, hw = AVE_HALF;
      const aN = armOpen('x', a, b, -1), aS = armOpen('x', a, b, 1), aW = armOpen('z', b, a, -1), aE = armOpen('z', b, a, 1);
      const nOpen = (aN ? 1 : 0) + (aS ? 1 : 0) + (aW ? 1 : 0) + (aE ? 1 : 0), tH = nOpen === 3 && (!aN || !aS), tV = nOpen === 3 && (!aW || !aE);
      const sN = aN && !tV, sS = aS && !tV, sW = aW && !tH, sE = aE && !tH;     // crossings only on the side road of a T
      if (tH || tV) {                                                           // centre + lane lines continue straight through the T
        const c0 = (tH ? ix : iz) - AVE_HALF - WALK_W, c1 = (tH ? ix : iz) + AVE_HALF + WALK_W, q0 = Math.ceil((c0 + 2) / 14) * 14 - 2;
        ctx.setLineDash([]); ctx.strokeStyle = '#f1c84b'; ctx.lineWidth = yellowW; ctx.beginPath();
        if (tH) { ctx.moveTo(X(c0), Y(iz)); ctx.lineTo(X(c1), Y(iz)); } else { ctx.moveTo(X(ix), Y(c0)); ctx.lineTo(X(ix), Y(c1)); }
        ctx.stroke(); ctx.strokeStyle = '#f4f2df'; ctx.lineWidth = whiteW; ctx.setLineDash([4 * S, 10 * S]);
        for (const sd of [-12, 12]) { ctx.beginPath(); if (tH) { ctx.moveTo(X(q0), Y(iz + sd)); ctx.lineTo(X(c1), Y(iz + sd)); } else { ctx.moveTo(X(ix + sd), Y(q0)); ctx.lineTo(X(ix + sd), Y(c1)); } ctx.stroke(); }
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = '#f4f2df'; ctx.lineWidth = ZW_ * S; ctx.setLineDash([ZT * S, (ZP - ZT) * S]);
      for (const sg of [-1, 1]) {
        if (sg < 0 ? sN : sS) { ctx.beginPath(); ctx.moveTo(X(ix - hw), Y(iz + sg * (hw + ZW_ / 2))); ctx.lineTo(X(ix + hw), Y(iz + sg * (hw + ZW_ / 2))); ctx.stroke(); }   // arms along z
        if (sg < 0 ? sW : sE) { ctx.beginPath(); ctx.moveTo(X(ix + sg * (hw + ZW_ / 2)), Y(iz - hw)); ctx.lineTo(X(ix + sg * (hw + ZW_ / 2)), Y(iz + hw)); ctx.stroke(); }   // arms along x
      }
      ctx.setLineDash([]); ctx.fillStyle = '#f4f2df';
      const so = hw + ZW_ + GAPM + SLT / 2 + 0.2, sl = Math.max(SLT * S, 1.2);
      if (sN) ctx.fillRect(X(ix - hw), Y(iz - so) - sl / 2, (hw - GAPM) * S, sl);
      if (sS) ctx.fillRect(X(ix + GAPM), Y(iz + so) - sl / 2, (hw - GAPM) * S, sl);
      if (sW) ctx.fillRect(X(ix - so) - sl / 2, Y(iz + GAPM), sl, (hw - GAPM) * S);
      if (sE) ctx.fillRect(X(ix + so) - sl / 2, Y(iz - hw), sl, (hw - GAPM) * S);
      if (S >= 1.0 && aN && aS && aW && aE) {
        const e = hw - 0.8;
        ctx.strokeStyle = '#f1c84b'; ctx.lineWidth = Math.max(1, 0.3 * S);
        ctx.strokeRect(X(ix - e), Y(iz - e), 2 * e * S, 2 * e * S);
        ctx.beginPath(); ctx.moveTo(X(ix - e), Y(iz - e)); ctx.lineTo(X(ix + e), Y(iz + e)); ctx.moveTo(X(ix + e), Y(iz - e)); ctx.lineTo(X(ix - e), Y(iz + e)); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
  if (S >= 0.5) {                                       // dead-end caps: a small red bar across the end of the road
    ctx.fillStyle = '#c9362b';
    for (const d of deadEnds) {
      const ex = d.axis === 'x' ? d.g : d.q, ez = d.axis === 'x' ? d.q : d.g; if (!vis(ex, ez, 30, 30)) continue;
      if (d.axis === 'x') ctx.fillRect(X(d.g - AVE_HALF), Y(d.q) - 1.5, 2 * AVE_HALF * S, 3); else ctx.fillRect(X(d.q) - 1.5, Y(d.g - AVE_HALF), 3, 2 * AVE_HALF * S);
    }
  }

  // 4. bus stops (shelters) along the avenues
  const stopPts = [];
  if (S >= 0.45) {
    for (let k = kx0; k <= kx1; k++) { const g = k * ROAD_SPACING; for (const q of furnitureAlong(g, wz0 - 40, wz1 + 40, 'x').stops) for (const sd of [-1, 1]) stopPts.push([g + sd * (AVE_HALF + SHELTER_OFFSET), q, SHELTER_DEPTH, SHELTER_LEN]); }
    for (let k = kz0; k <= kz1; k++) { const g = k * ROAD_SPACING; for (const q of furnitureAlong(g, wx0 - 40, wx1 + 40, 'z').stops) for (const sd of [-1, 1]) stopPts.push([q, g + sd * (AVE_HALF + SHELTER_OFFSET), SHELTER_LEN, SHELTER_DEPTH]); }
  }

  // 5. buildings: real footprints, set-back tiers, entrance canopy
  const drawSpec = b => {
    const pw = (b.w + 4) * S, pd = (b.d + 4) * S, bx = X(b.x), by = Y(b.z);
    if (bx + pw / 2 < -eX || bx - pw / 2 > W + eX || by + pd / 2 < -eY || by - pd / 2 > H + eY) return;
    const col = mapPresetColors(b.preset), sel = mapSelected && mapSelected.b === b;
    if (pw < 1.5 && pd < 1.5) { ctx.fillStyle = col.tiers[0]; ctx.fillRect(bx - 1, by - 1, 2, 2); return; }
    if (S < 0.3) { ctx.fillStyle = col.tiers[0]; ctx.fillRect(bx - pw / 2, by - pd / 2, pw, pd); }
    else {
      ctx.fillStyle = '#e6e2d9'; ctx.fillRect(bx - pw / 2, by - pd / 2, pw, pd);                  // glazed podium
      ctx.strokeStyle = col.edge; ctx.lineWidth = 1; ctx.strokeRect(bx - pw / 2, by - pd / 2, pw, pd);
      b.tiers.forEach((t, i) => {
        const tw = t.w * S, td = t.d * S, tx = X(t.x) - tw / 2, ty = Y(t.z) - td / 2;
        ctx.fillStyle = col.tiers[Math.min(i, 3)]; ctx.fillRect(tx, ty, tw, td);
        ctx.strokeRect(tx, ty, tw, td);
      });
      if (S >= 0.7) {                                                                             // entrance canopy on the street face
        const d = b.door, hw = (b.w + 4) / 2, hd = (b.d + 4) / 2, f = d.face;
        let ex, ez, ew, ed;
        if (f === 0) { ex = b.x + d.off; ez = b.z + hd + 4; ew = 18; ed = 8; }
        else if (f === 1) { ex = b.x - d.off; ez = b.z - hd - 4; ew = 18; ed = 8; }
        else if (f === 2) { ex = b.x + hw + 4; ez = b.z - d.off; ew = 8; ed = 18; }
        else { ex = b.x - hw - 4; ez = b.z + d.off; ew = 8; ed = 18; }
        ctx.fillStyle = mapHexCss(d.canopy); ctx.globalAlpha = 0.85; ctx.fillRect(X(ex) - ew * S / 2, Y(ez) - ed * S / 2, ew * S, ed * S); ctx.globalAlpha = 1;
      }
    }
    if (sel) { ctx.strokeStyle = '#ea4335'; ctx.lineWidth = 3; ctx.strokeRect(bx - pw / 2 - 1, by - pd / 2 - 1, pw + 2, pd + 2); }
  };
  {
    const bi0 = Math.max(-BLOCK_N, Math.floor(wx0 / ROAD_SPACING)), bi1 = Math.min(BLOCK_N - 1, Math.floor(wx1 / ROAD_SPACING));
    const bj0 = Math.max(-BLOCK_N, Math.floor(wz0 / ROAD_SPACING)), bj1 = Math.min(BLOCK_N - 1, Math.floor(wz1 / ROAD_SPACING));
    for (let bi = bi0; bi <= bi1; bi++) for (let bj = bj0; bj <= bj1; bj++) { const r = infillAt(bi, bj); if (r) drawSpec(r); }
    for (const b of cityMapSpecs) if (vis(b.x, b.z, b.w / 2 + 2, b.d / 2 + 2)) drawSpec(b);
  }

  // 6. bus stop symbols on top of the buildings' ground
  for (const [x, z, sw, sd] of stopPts) {
    const px = X(x), py = Y(z);
    if (px < -20 - eX || px > W + 20 + eX || py < -20 - eY || py > H + 20 + eY) continue;
    if (S >= 1.2) {
      ctx.fillStyle = 'rgba(138,180,248,.75)'; ctx.fillRect(px - sw * S / 2, py - sd * S / 2, sw * S, sd * S);
      ctx.strokeStyle = '#4285f4'; ctx.lineWidth = 1.2; ctx.strokeRect(px - sw * S / 2, py - sd * S / 2, sw * S, sd * S);
    }
    const r = S >= 1.2 ? 8 : 5.5;
    ctx.fillStyle = '#1a73e8'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(px - r * 0.45, py - r * 0.5, r * 0.9, r * 0.7); ctx.fillStyle = '#1a73e8'; ctx.fillRect(px - r * 0.33, py - r * 0.38, r * 0.66, r * 0.26);
    ctx.fillStyle = '#fff'; ctx.fillRect(px - r * 0.35, py + r * 0.28, r * 0.2, r * 0.2); ctx.fillRect(px + r * 0.15, py + r * 0.28, r * 0.2, r * 0.2);
  }

  // 7. labels (priority order: districts, places, water, street names)
  const dAlpha = S < 0.35 ? 1 : Math.max(0, 1 - (S - 0.35) / 0.45);
  if (dAlpha > 0.02) {
    ctx.globalAlpha = dAlpha;
    for (const d of districtDefs) {
      const isBase = baseDistrictDefs.indexOf(d) >= 0;
      if (!isBase && (S < 0.16 || S > 0.35)) continue;   // the repeated tile districts only appear at mid zoom, so the overview stays clean
      if (d[1] < wx0 - 400 || d[1] > wx1 + 400 || d[2] < wz0 - 100 || d[2] > wz1 + 100) continue;
      const px = X(d[1]), py = Y(d[2]), size = isBase ? 12 : 10;
      ctx.font = `700 ${size}px "DM Sans", system-ui, sans-serif`;
      const w = ctx.measureText(d[0]).width + 8;
      if (label(d[0], px, py, w, size + 6)) halo(d[0], px, py, isBase ? '#5f6368' : '#80868b', size, 700, 1);
    }
    ctx.globalAlpha = 1;
  }
  if (S >= 0.15) {
    for (const f of cityMapFacilities) {
      if (!vis(f.x, f.z, 20, 20)) continue;
      if (f.type === 'sportscomplex' && S < 0.5) continue;
      const px = X(f.x), py = Y(f.z);
      const ic = mapFacilityIcon[f.type] || '•';
      ctx.fillStyle = f.type === 'parking' ? '#4285f4' : f.type === 'market' ? '#f29900' : '#34a853';
      if (label(ic, px, py, 18, 18)) {
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        mapUpright(ctx, px, py, () => {
          ctx.fillStyle = '#fff'; ctx.font = '12px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ic, 0, 0.5);
          if (S >= 0.5 && f.label) { ctx.font = '600 10.5px "DM Sans", system-ui, sans-serif'; const w = ctx.measureText(f.label).width + 6; if (label(f.label, px, py + 19, w, 13)) halo(f.label, 0, 19, '#188038', 10.5, 600, 0, false); }
        });
      }
    }
  }
  if (vis(610, 930, 345, 115) && S >= 0.06) { const px = X(610), py = Y(930); if (label('Lagos Lagoon', px, py, 110, 14)) halo('Lagos Lagoon', px, py, '#4a7ba7', 12, 600, 1); }
  if (S >= 0.07) {
    ctx.font = '600 11px "DM Sans", system-ui, sans-serif';
    const drawName = (name, px, py, vertical) => {
      const tw = ctx.measureText(name).width + 6;
      if (!label(name, px, py, vertical ? 14 : tw, vertical ? tw : 14)) return;
      let ra = vertical ? -Math.PI / 2 : 0;
      if (Math.cos(ra + mapRot) < -1e-4) ra += Math.PI;   // keep street names readable when the map is turned
      ctx.save(); ctx.translate(px, py); if (ra) ctx.rotate(ra);
      halo(name, 0, 0, '#5f6368', 11, 600, 0, false); ctx.restore();
    };
    for (let k = kx0; k <= kx1; k++) {
      if (S < 0.25 && !isMajor(k)) continue;
      const name = streetName('x', k), tw = ctx.measureText(name).width, step = Math.max(1, Math.ceil((tw + 50) / (ROAD_SPACING * S)));
      for (let m = Math.floor(wz0 / ROAD_SPACING); m * ROAD_SPACING < wz1; m++) { if (m < -24 || m > 23 || ((m % step) + step) % step || !segOpen('x', k, m)) continue; drawName(name, X(k * ROAD_SPACING), Y(m * ROAD_SPACING + 105), true); }
    }
    for (let k = kz0; k <= kz1; k++) {
      if (S < 0.25 && !isMajor(k)) continue;
      const name = streetName('z', k), tw = ctx.measureText(name).width, step = Math.max(1, Math.ceil((tw + 50) / (ROAD_SPACING * S)));
      for (let m = Math.floor(wx0 / ROAD_SPACING); m * ROAD_SPACING < wx1; m++) { if (m < -24 || m > 23 || ((m % step) + step) % step || !segOpen('z', k, m)) continue; drawName(name, X(m * ROAD_SPACING + 105), Y(k * ROAD_SPACING), false); }
    }
  }

  drawNavRoute(ctx, X, Y, S);   // navigation: blue route line, bus stops, destination pin

  // 8. live player: trail, direction beam, pulsing blue dot
  const pl = player.position, pxp = X(pl.x), pyp = Y(pl.z);
  if (mapTrail.length > 1 && !nav.active) {
    ctx.strokeStyle = 'rgba(26,115,232,.45)'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); mapTrail.forEach((p, i) => { const tx = X(p[0]), ty = Y(p[1]); if (i) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty); });
    ctx.lineTo(pxp, pyp); ctx.stroke(); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  }
  if (pxp > -60 && pxp < W + 60 && pyp > -60 && pyp < H + 60) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 450), ang = Math.PI - player.rotation.y - Math.PI / 2;   // facing (sin,cos) in (x,z) -> screen angle
    const gr = ctx.createRadialGradient(pxp, pyp, 4, pxp, pyp, 44);
    gr.addColorStop(0, 'rgba(26,115,232,.45)'); gr.addColorStop(1, 'rgba(26,115,232,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(pxp, pyp); ctx.arc(pxp, pyp, 44, ang - 0.62, ang + 0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(26,115,232,${0.14 + 0.1 * pulse})`; ctx.beginPath(); ctx.arc(pxp, pyp, 17 + 5 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pxp, pyp, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a73e8'; ctx.beginPath(); ctx.arc(pxp, pyp, 6.8, 0, Math.PI * 2); ctx.fill();
  } else {                                                                                       // player is off-screen: arrow on the edge
    const dx = pxp - W / 2, dy = pyp - H / 2, k = Math.min((W / 2 - 24) / Math.abs(dx || 1e-6), (H / 2 - 24) / Math.abs(dy || 1e-6)), ex = W / 2 + dx * k, ey = H / 2 + dy * k, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = '#1a73e8'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  ctx.restore();   // end of the (possibly turned) map layer

  // 8b. compass for the turned mini-map: red end of the needle (and the N) points to real north
  if (nav.mini) {
    const kx = 26, ky = 26, kr = 15, na = -Math.PI / 2 + mapRot;
    ctx.save(); ctx.translate(kx, ky);
    ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.strokeStyle = 'rgba(60,64,67,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, kr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.rotate(na + Math.PI / 2);
    ctx.fillStyle = '#d93025'; ctx.beginPath(); ctx.moveTo(0, -kr + 3); ctx.lineTo(4.5, 1); ctx.lineTo(-4.5, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.moveTo(0, kr - 3); ctx.lineTo(4.5, -1); ctx.lineTo(-4.5, -1); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.font = '800 10px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const nx = kx + Math.cos(na) * (kr + 8), ny = ky + Math.sin(na) * (kr + 8);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeText('N', nx, ny); ctx.fillStyle = '#d93025'; ctx.fillText('N', nx, ny);
  }

  // 9. HUD text: scale bar + live position
  const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  let L = nice[0]; for (const n of nice) if (n * S <= 130) L = n;
  mapEl('mapScaleBar').style.width = Math.max(20, L * S) + 'px';
  mapEl('mapScaleText').textContent = L >= 1000 ? (L / 1000) + ' km' : L + ' m';
  mapEl('mapStatus').textContent = `📍 You: ${Math.round(pl.x)}, ${Math.round(pl.z)} · near ${mapNearestDistrict(pl.x, pl.z)}`;
}

// ---- picking + info card -----------------------------------------------------
function mapPick(wx, wz) {
  for (const f of cityMapFacilities) if (Math.abs(wx - f.x) <= f.w / 2 && Math.abs(wz - f.z) <= f.d / 2) return { f };
  const inside = b => Math.abs(wx - b.x) <= (b.w + 4) / 2 && Math.abs(wz - b.z) <= (b.d + 4) / 2;
  const r = infillAt(Math.floor(wx / ROAD_SPACING), Math.floor(wz / ROAD_SPACING));
  if (r && inside(r)) return { b: r };
  for (const b of cityMapSpecs) if (inside(b)) return { b };
  return null;
}
function mapShowCard(hit) {
  mapSelected = hit; mapDirty = true; mapSelDest = null;
  if (hit) navCancelPlan();
  if (!hit) { mapCardEl.style.display = 'none'; return; }
  const title = mapEl('mapCardTitle'), body = mapEl('mapCardBody');
  if (hit.b) {
    const b = hit.b, bi = Math.floor(b.x / ROAD_SPACING), bj = Math.floor(b.z / ROAD_SPACING), p = FACADE_PRESETS[b.preset];
    title.textContent = MAP_KIND_LABEL[b.kind] || 'Building';
    const ad = buildingAddress(b);
    body.innerHTML = `<p><b>No. ${ad.number}</b> ${ad.street}</p><p>${ad.district} · ${ad.apartments} apartments · ${naira(APARTMENT_PRICE)} each</p>
      <p><b>${b.floors}</b> floors · <b>${Math.round(b.h)}</b> m tall${b.tiers.length > 1 ? ' · ' + b.tiers.length + ' stepped tiers' : ''}</p>
      <p>Footprint ${Math.round(b.w + 4)} × ${Math.round(b.d + 4)} m</p>
      <p>${p.glassy ? 'Glass tower' : 'Solid facade'} · ${MAP_FACADE_LABEL[p.style]}</p>
      <p>Entrance on the ${MAP_FACE_NAME[b.door.face]} side</p>
      <p>Block of ${streetName('x', bi)}, ${streetName('x', bi + 1)}, ${streetName('z', bj)} and ${streetName('z', bj + 1)}</p>`;
    mapCardEl._go = [b.x, b.z, Math.max(mapView.scale, 0.9)];
    const dd = b.door, hw = (b.w + 4) / 2, hd = (b.d + 4) / 2, lo = 9;   // a point just outside the entrance
    const dp = dd.face === 0 ? [b.x + dd.off, b.z + hd + lo] : dd.face === 1 ? [b.x - dd.off, b.z - hd - lo] : dd.face === 2 ? [b.x + hw + lo, b.z - dd.off] : [b.x - hw - lo, b.z + dd.off];
    mapSelDest = { name: title.textContent + ' on ' + navStreet(dp[0], dp[1]), x: dp[0], z: dp[1] };
  } else if (hit.f) {
    const f = hit.f;
    title.textContent = f.label || MAP_FACILITY_LABEL[f.type];
    body.innerHTML = `<p>${MAP_FACILITY_LABEL[f.type] || f.type} · ${Math.round(f.w)} × ${Math.round(f.d)} m</p><p>Near ${mapNearestDistrict(f.x, f.z)}</p>`;
    mapCardEl._go = [f.x, f.z, Math.max(mapView.scale, 1.2)];
    const fp = navFree(f.x, f.z); mapSelDest = { name: title.textContent, x: fp[0], z: fp[1] };
  } else if (hit.s) {                                           // a search result (district, facility or street)
    const it = hit.s, sx = it.x === null ? mapView.cx : it.x, sz = it.z === null ? mapView.cz : it.z, sp = navFree(sx, sz);
    title.textContent = it.name;
    body.innerHTML = `<p>${it.sub}</p><p>Near ${mapNearestDistrict(sx, sz)}</p>`;
    mapCardEl._go = [sx, sz, it.s];
    mapSelDest = { name: it.name, x: sp[0], z: sp[1] };
  } else if (hit.pin) {                                         // a tap on open ground / a road: dropped pin
    const pp = navFree(hit.pin[0], hit.pin[1]);
    title.textContent = 'Dropped pin';
    body.innerHTML = `<p>Near ${navStreet(pp[0], pp[1])}</p><p>${mapNearestDistrict(pp[0], pp[1])} area</p>`;
    mapCardEl._go = [pp[0], pp[1], Math.max(mapView.scale, 0.9)];
    mapSelDest = { name: 'Dropped pin near ' + navStreet(pp[0], pp[1]), x: pp[0], z: pp[1] };
  }
  mapCardEl.style.display = 'block';
}

// ---- search -----------------------------------------------------------------
let mapSearchIndex = null;
const MAP_KIND_WORDS = { office: 'office tower', apartment: 'apartment tower', mixed: 'mixed use tower', residential: 'residential tower', tenement: 'residential block', shop: 'retail shop building', duplex: 'duplex block', market: 'market building' };
const SEARCH_HINT_WORDS = ['street', 'road', 'avenue', 'way', 'crescent', 'drive', 'expressway', 'lane', 'district', 'lagoon', 'river', 'beach', 'sports centre', 'football', 'tennis', 'basketball', 'market', 'car park', 'tower', 'apartment', 'office'];
function searchLev(a, b) {   // tiny edit distance, for close-spelling suggestions
  const m = a.length, n = b.length; if (Math.abs(m - n) > 1) return 2;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function mapSearchBuild() {
  mapSearchIndex = [];
  for (const d of districtDefs) mapSearchIndex.push({ type: 'place', name: d[0], sub: 'District', x: d[1], z: d[2], s: 0.3 });
  for (const f of cityMapFacilities) if (f.label) mapSearchIndex.push({ type: 'place', name: f.label, sub: MAP_FACILITY_LABEL[f.type] || 'Place', x: f.x, z: f.z, s: 1.4 });
  mapSearchIndex.push({ type: 'place', name: 'Lagos Lagoon', alias: 'river water creek sea waterfront', sub: 'Lagoon · river', x: 610, z: 930, s: 0.4 });
  mapSearchIndex.push({ type: 'place', name: 'Lagoon Beach', alias: 'sand shore waterfront river', sub: 'Beach', x: 590, z: 805, s: 0.9 });
  for (const axis of ['x', 'z']) for (let idx = -24; idx <= 24; idx++) for (let part = 0; part < 2; part++)
    mapSearchIndex.push({ type: 'street', name: streetName(axis, idx, part), sub: 'Street', axis, idx, part });
}
function mapSearchMatch(it, toks) {   // null = no match, lower = better
  const words = it._w || (it._w = (it.name + ' ' + (it.alias || '')).toLowerCase().split(/[\s\-.]+/).filter(Boolean));
  let sc = 0;
  for (const t of toks) {
    let best = 9;
    for (const w of words) {
      if (w.startsWith(t)) best = Math.min(best, w === t ? 0 : 0.5);
      else if (w.includes(t)) best = Math.min(best, 1.5);
      else if (t.length >= 4 && w.length >= 3 && (searchLev(w.slice(0, t.length), t) <= 1 || searchLev(w.slice(0, t.length + 1), t) <= 1)) best = Math.min(best, 2.5);   // close spelling
    }
    if (best === 9) return null; sc += best;
  }
  return sc - (it.name.toLowerCase().startsWith(toks.join(' ')) ? 1 : 0);
}
function mapStreetCentre(it) {   // the point on that named street nearest to the middle of the current map view
  const lo = (it.part === 0 ? -BLOCK_N : STREET_SPLIT_BLOCKS - BLOCK_N) * ROAD_SPACING, hi = (it.part === 0 ? STREET_SPLIT_BLOCKS - BLOCK_N : BLOCK_N) * ROAD_SPACING;
  return it.axis === 'x' ? [it.idx * ROAD_SPACING, Math.max(lo, Math.min(hi, mapView.cz))] : [Math.max(lo, Math.min(hi, mapView.cx)), it.idx * ROAD_SPACING];
}
const mapSearchDist = it => { const [x, z] = it.type === 'street' ? mapStreetCentre(it) : [it.x, it.z]; return Math.hypot(x - mapView.cx, z - mapView.cz); };
function buildingFromKey(key) {
  const [x, z] = key.split(',').map(v => +v / 10);
  const b = infillAt(Math.floor(x / ROAD_SPACING), Math.floor(z / ROAD_SPACING));
  return b && bKey(b) === key ? b : cityMapSpecs.find(c => bKey(c) === key) || null;
}
function mapSearchItems(q) {
  if (!mapSearchIndex) mapSearchBuild();
  q = q.trim().toLowerCase().replace(/[,#]/g, ' ').replace(/\bno\.?\s*(?=\d)/g, '');   // "No. 11 Allen Avenue" works too
  if (!q) return [];
  const toks = q.split(/\s+/).filter(Boolean), numTok = toks.find(t => /^\d+$/.test(t)), words = toks.filter(t => t !== numTok);
  const out = [], seen = new Set(), push = it => { const k = it.name + '|' + it.sub; if (!seen.has(k)) { seen.add(k); out.push(it); } };
  const ranked = (items, ts) => items.map(it => [mapSearchMatch(it, ts), it]).filter(e => e[0] !== null).sort((a, b) => a[0] - b[0] || mapSearchDist(a[1]) - mapSearchDist(b[1]));
  if (numTok) {   // an address: a house number plus the start of a street name (or just a number: nearest streets)
    const streets = mapSearchIndex.filter(it => it.type === 'street');
    const hits = words.length ? ranked(streets, words).slice(0, 5).map(e => e[1]) : streets.filter(it => { const c = mapStreetCentre(it); return Math.abs((it.axis === 'x' ? c[0] : c[1]) - (it.axis === 'x' ? mapView.cx : mapView.cz)) < ROAD_SPACING * 3; }).sort((a, b) => mapSearchDist(a) - mapSearchDist(b)).slice(0, 5);
    for (const st of hits) push({ type: 'addr', name: `${+numTok} ${st.name}`, sub: 'Address', st, n: +numTok });
  }
  if (words.length) {
    for (const [, it] of ranked(mapSearchIndex, words).slice(0, 8)) push(it);
    const kinds = Object.keys(MAP_KIND_WORDS).filter(k => mapSearchMatch({ name: MAP_KIND_WORDS[k] }, words) !== null);
    if (kinds.length) {   // structures: the nearest hand-built towers / blocks of that kind
      cityMapSpecs.filter(b => kinds.includes(b.kind)).sort((a, b) => Math.hypot(a.x - mapView.cx, a.z - mapView.cz) - Math.hypot(b.x - mapView.cx, b.z - mapView.cz)).slice(0, 3)
        .forEach(b => { const ad = buildingAddress(b); push({ type: 'bldg', b, name: `${ad.kindLabel} · No. ${ad.number} ${ad.street}`, sub: 'Building' }); });
    }
  }
  if (!out.length && words.length) {   // nothing close: offer the nearest-looking keywords
    const last = words[words.length - 1], hints = SEARCH_HINT_WORDS.filter(h => h.startsWith(last[0]) || searchLev(h.slice(0, last.length), last) <= 2).slice(0, 4);
    hints.forEach(h => push({ type: 'hint', name: [...words.slice(0, -1), h].join(' '), sub: 'Did you mean…' }));
  }
  return out.slice(0, 8);
}
function mapGoSearch(it) {
  if (it.type === 'hint') { mapSearchEl.value = it.name; mapSearchEl.dispatchEvent(new Event('input')); return; }
  mapResultsEl.style.display = 'none'; mapSearchEl.blur();
  if (it.type === 'addr') {
    const st = { axis: it.st.axis, idx: it.st.idx, part: it.st.part, key: it.st.axis + it.st.idx + ':' + it.st.part };
    const nums = streetNumbers.get(st.key) || numberStreet(st);
    let key = null; for (const [k, v] of nums) if (v === it.n) { key = k; break; }
    mapSearchEl.value = it.name;
    const b = key && buildingFromKey(key);
    if (b) { mapFlyTo(b.x, b.z, 1.0); mapShowCard({ b }); return; }
    const c = mapStreetCentre(it.st);   // no such house: show the street and how many houses it has
    mapFlyTo(c[0], c[1], 0.5);
    mapShowCard({ s: { name: it.st.name, sub: nums.size ? `No. ${it.n} does not exist. This street has house numbers 1 to ${nums.size}.` : 'No buildings on this street', x: c[0], z: c[1], s: 0.5 } });
    return;
  }
  if (it.type === 'bldg') { mapSearchEl.value = it.name; mapFlyTo(it.b.x, it.b.z, 1.0); mapShowCard({ b: it.b }); return; }
  mapSearchEl.value = it.name;
  if (it.type === 'street') {
    const c = mapStreetCentre(it), st = { axis: it.axis, idx: it.idx, part: it.part, key: it.axis + it.idx + ':' + it.part };
    const n = (streetNumbers.get(st.key) || numberStreet(st)).size;
    mapFlyTo(c[0], c[1], 0.5);
    mapShowCard({ s: { name: it.name, sub: n ? `Street · house numbers 1 to ${n}` : 'Street', x: c[0], z: c[1], s: 0.5 } });
    return;
  }
  mapFlyTo(it.x, it.z, it.s);
  mapShowCard({ s: it });
}
mapSearchEl.addEventListener('input', () => {
  const items = mapSearchItems(mapSearchEl.value);
  mapResultsEl.innerHTML = '';
  items.forEach(it => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `${it.name}<small>${it.sub}</small>`; b.addEventListener('click', () => mapGoSearch(it)); mapResultsEl.appendChild(b); });
  if (!items.length && mapSearchEl.value.trim()) { const d = document.createElement('div'); d.style.cssText = 'padding:10px 14px;color:#5f6368;font-size:13px'; d.textContent = 'No places or addresses found. Try a street, district, sports centre or "11 Allen Avenue".'; mapResultsEl.appendChild(d); }
  mapResultsEl.style.display = items.length || mapSearchEl.value.trim() ? 'block' : 'none';
});
mapSearchEl.addEventListener('keydown', e => {
  e.stopPropagation();                                   // typing must not move the player
  if (e.key === 'Enter') { const it = mapSearchItems(mapSearchEl.value)[0]; if (it) mapGoSearch(it); }
  if (e.key === 'Escape') { mapSearchEl.value = ''; mapResultsEl.style.display = 'none'; mapSearchEl.blur(); }
});
mapSearchEl.addEventListener('keyup', e => e.stopPropagation());

// ---- gestures: drag to pan, wheel / pinch to zoom, tap to inspect ------------
const mapPtrs = new Map();
let mapGesture = null;
const mapLocal = e => { const r = cityMapCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cityMapCanvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { cityMapCanvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
  mapPtrs.set(e.pointerId, mapLocal(e)); mapResultsEl.style.display = 'none';
  const pts = [...mapPtrs.values()];
  if (pts.length === 1) mapGesture = { type: 'pan', x0: pts[0].x, y0: pts[0].y, cx0: mapView.cx, cz0: mapView.cz, moved: 0, t0: performance.now() };
  else if (pts.length === 2) {
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    mapGesture = { type: 'pinch', d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, s0: mapView.scale, wx: mapView.cx + (mx - mapW / 2) / mapView.scale, wz: mapView.cz + (my - mapH / 2) / mapView.scale, moved: 99 };
    mapSetFollow(false);
  }
});
cityMapCanvas.addEventListener('pointermove', e => {
  if (!mapPtrs.has(e.pointerId)) return;
  mapPtrs.set(e.pointerId, mapLocal(e));
  const pts = [...mapPtrs.values()];
  if (mapGesture && mapGesture.type === 'pan' && pts.length === 1) {
    const dx = pts[0].x - mapGesture.x0, dy = pts[0].y - mapGesture.y0;
    mapGesture.moved = Math.max(mapGesture.moved, Math.hypot(dx, dy));
    if (mapGesture.moved > 4) { if (mapView.follow) mapSetFollow(false); cityMapCanvas.classList.add('grabbing'); mapView.cx = mapGesture.cx0 - dx / mapView.scale; mapView.cz = mapGesture.cz0 - dy / mapView.scale; mapDirty = true; }
  } else if (mapGesture && mapGesture.type === 'pinch' && pts.length >= 2) {
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2, d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    mapView.scale = mapClampScale(mapGesture.s0 * d / mapGesture.d0);
    mapView.cx = mapGesture.wx - (mx - mapW / 2) / mapView.scale; mapView.cz = mapGesture.wz - (my - mapH / 2) / mapView.scale; mapDirty = true;
  }
});
const mapPointerEnd = e => {
  if (!mapPtrs.has(e.pointerId)) return;
  const p = mapPtrs.get(e.pointerId);
  mapPtrs.delete(e.pointerId); cityMapCanvas.classList.remove('grabbing');
  if (mapGesture && mapGesture.type === 'pan' && e.type === 'pointerup' && mapGesture.moved < 6 && performance.now() - mapGesture.t0 < 600)
  { const wx = mapView.cx + (p.x - mapW / 2) / mapView.scale, wz = mapView.cz + (p.y - mapH / 2) / mapView.scale;
    mapShowCard(mapPick(wx, wz) || (Math.abs(wx) < CITY_HALF && Math.abs(wz) < CITY_HALF ? { pin: [wx, wz] } : null)); }
  const rest = [...mapPtrs.values()];
  mapGesture = rest.length === 1 ? { type: 'pan', x0: rest[0].x, y0: rest[0].y, cx0: mapView.cx, cz0: mapView.cz, moved: 99, t0: 0 } : null;
};
cityMapCanvas.addEventListener('pointerup', mapPointerEnd);
cityMapCanvas.addEventListener('pointercancel', mapPointerEnd);
cityMapCanvas.addEventListener('wheel', e => { e.preventDefault(); const p = mapLocal(e); mapZoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
cityMapCanvas.addEventListener('dblclick', e => { const p = mapLocal(e); mapZoomAt(p.x, p.y, 2); });
mapEl('mapZoomIn').addEventListener('click', () => mapZoomAt(mapW / 2, mapH / 2, 1.6));
mapEl('mapZoomOut').addEventListener('click', () => mapZoomAt(mapW / 2, mapH / 2, 1 / 1.6));
mapLocateEl.addEventListener('click', () => { mapSetFollow(true); if (mapView.scale < 0.3) mapView.scale = MAP_DEFAULT_SCALE; });
mapEl('mapCardX').addEventListener('click', () => mapShowCard(null));
mapEl('mapCardGo').addEventListener('click', () => { const g = mapCardEl._go; if (g) mapFlyTo(g[0], g[1], g[2]); });

// ---- open / close / per-frame update ----------------------------------------
function setCityMapOpen(open) {
  cityMapOpen = open; cityMapPanel.classList.toggle('open', open);
  if (!open && nav.active) { setMapMini(true); return; }   // while navigating, closing just minimises
  if (!open) { mapResultsEl.style.display = 'none'; navCancelPlan(); mapSelDest = null; return; }
  mapResize();
  mapView.cx = player.position.x; mapView.cz = player.position.z; mapSetFollow(true);
  mapTrail.length = 0; mapLastX = mapLastZ = mapLastR = NaN;
  mapShowCard(null); mapDirty = true; drawCityMap();
}
function updateCityMap(dt) {
  const p = player.position;
  if (nav.mini) {                                        // turn the mini-map smoothly towards the wanted side
    const tgt = navMapTargetRot(), d = Math.atan2(Math.sin(tgt - mapRotCur), Math.cos(tgt - mapRotCur));
    if (mapRotSnap) { mapRotCur = tgt; mapRotSnap = false; mapDirty = true; }
    else if (Math.abs(d) > 0.0008) { mapRotCur += d * Math.min(1, dt * 12); mapDirty = true; }
  }
  if (mapView.follow) {                                  // glide to the player's live position
    const k = Math.min(1, dt * 20), nx = mapView.cx + (p.x - mapView.cx) * k, nz = mapView.cz + (p.z - mapView.cz) * k;
    if (Math.abs(nx - mapView.cx) > 0.001 || Math.abs(nz - mapView.cz) > 0.001) mapDirty = true;
    mapView.cx = nx; mapView.cz = nz;
  }
  if (p.x !== mapLastX || p.z !== mapLastZ || player.rotation.y !== mapLastR) {
    mapLastX = p.x; mapLastZ = p.z; mapLastR = player.rotation.y; mapDirty = true;
    const last = mapTrail[mapTrail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.z) > 4) { mapTrail.push([p.x, p.z]); if (mapTrail.length > 300) mapTrail.shift(); }
  }
  if ((mapPulse += dt) > 0.1) { mapPulse = 0; mapDirty = true; }   // keeps the blue dot pulsing
  if (mapDirty && (!nav.mini || (mapMiniAcc += dt) >= (IS_MOBILE ? 0.08 : 0.033))) { mapMiniAcc = 0; mapDirty = false; drawCityMap(); }   // mini-map redraws a little less often
}
mapOpenBtn.addEventListener('click', () => { if (nav.active) setMapMini(!nav.mini); else setCityMapOpen(!cityMapOpen); });
mapEl('cityMapClose').addEventListener('click', () => { if (nav.active) setMapMini(true); else setCityMapOpen(false); });
window.addEventListener('resize', () => { if (cityMapOpen) mapResize(); });
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const k = (e.key || '').toLowerCase();
  if (k === 'm') { if (nav.active) setMapMini(!nav.mini); else setCityMapOpen(!cityMapOpen); }
  else if (k === 'escape' && cityMapOpen) { if (nav.active) setMapMini(true); else setCityMapOpen(false); }
});

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
  if (nav.active) updateNav(uiDt);
  if (cityMapOpen) updateCityMap(uiDt);
  if (uiUpdateElapsed >= 0.3) {
    uiUpdateElapsed = 0;
    if (clockEl) clockEl.textContent = String(Math.floor(worldMinutes / 60)).padStart(2, '0') + ':' + String(Math.floor(worldMinutes % 60)).padStart(2, '0');
    if (districtEl) {
      const n = nearestDistrictFor(player.position.x, player.position.z);
      districtEl.textContent = n[0];
    }
    updateEntranceWindow();
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
    const rideSpeed = nav.active && NAV_SPEEDS[nav.mode] > NAV_SPEEDS.walk ? NAV_SPEEDS[nav.mode] : 0;   // Bus / Drive: faster travel while navigating
    const distance = (rideSpeed || (running ? 5.0 : 2.3)) * frameDt, dx = ix * distance, dz = iz * distance;
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
