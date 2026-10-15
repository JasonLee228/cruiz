import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_HALF_WIDTH, roadDX, roadX, roadY, terrainY, waterY } from './path';
import { mulberry32 } from './random';
import { BARK, LEAF, scenery, type Variant } from './assets';

const CHUNK_LENGTH = 80;
const CHUNKS_AHEAD = 7;
const CHUNKS_BEHIND = 2;
const TERRAIN_HALF_WIDTH = 220;
const TERRAIN_COLS = 44;
const TERRAIN_ROWS = 12;
const ROAD_STEP = 2;

const GRASS = ['#9fdc8a', '#8fd283', '#b3e594'].map((c) => new THREE.Color(c));
const HILL = new THREE.Color('#6fbf7a');
const SAND = new THREE.Color('#f2e2b4');
const CLIFF = new THREE.Color('#e3d3b4');

const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const roadMaterial = new THREE.MeshLambertMaterial({ color: '#7e8197' });
export const lineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#7a5235', flatShading: true });
const leafMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, vertexColors: true });
const railMaterial = new THREE.MeshLambertMaterial({ color: '#dfe3ee', flatShading: true, side: THREE.DoubleSide });
const postMaterial = new THREE.MeshLambertMaterial({ color: '#aab0c4', flatShading: true });
const signMaterial = new THREE.MeshLambertMaterial({ color: '#f2c14e', flatShading: true });
const lampGlowMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe3a0').multiplyScalar(2.5), fog: false });
const rockMaterial = new THREE.MeshLambertMaterial({ color: '#c9c2d4', flatShading: true });
const cliffMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
const waterMaterial = new THREE.MeshLambertMaterial({ color: '#4cc3dd', flatShading: true, transparent: true, opacity: 0.92 });
const wallMaterials = ['#fff1dc', '#ffd9c2', '#d9ecf7', '#fbe3a8'].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const roofMaterials = ['#ee8b72', '#e57a8a', '#f2a65a'].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const whiteMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
const redMaterial = new THREE.MeshLambertMaterial({ color: '#e8606a', flatShading: true });

const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5).translate(0, 0.8, 0);
/**
 * 잎 덩어리 여러 개를 합친 나무 모양. 아래쪽은 어둡고 위쪽은 밝게 정점 색을 줘서
 * 한 가지 색만 입혀도 입체감이 생긴다 (인스턴스 색과 곱해진다).
 */
function foliage(parts: THREE.BufferGeometry[], bottom: number, top: number): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  const pos = merged.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    // 면 하나에 한 밝기 → 로우폴리 질감 유지
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const t = THREE.MathUtils.clamp((y - bottom) / (top - bottom), 0, 1);
    const shade = 0.72 + t * 0.38 + (((i * 7919) % 13) / 13 - 0.5) * 0.06;
    for (let k = 0; k < 3; k++) colors.set([shade, shade, shade], (i + k) * 3);
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}
// 큰 잎 덩어리만 세분하고 작은 것은 거칠게 두어 삼각형 수를 아낀다
const blob = (r: number, x: number, y: number, z: number, sy = 1, detail = 0) =>
  new THREE.IcosahedronGeometry(r, detail).scale(1, sy, 1).translate(x, y, z);
// 소나무: 원뿔 세 단을 겹친다
const pineGeometry = foliage([
  new THREE.ConeGeometry(1.8, 2.6, 7).translate(0, 2.4, 0),
  new THREE.ConeGeometry(1.45, 2.3, 7).rotateY(0.4).translate(0, 3.5, 0),
  new THREE.ConeGeometry(1.0, 2.0, 7).rotateY(0.9).translate(0, 4.6, 0),
], 1.2, 5.6);
// 활엽수: 크기가 다른 잎 덩어리 네 개
const roundTreeGeometry = foliage([
  blob(1.6, 0, 3.0, 0, 0.9, 1),
  blob(1.15, 0.95, 3.6, 0.3),
  blob(1.1, -0.85, 3.5, -0.35),
  blob(1.0, 0.1, 4.3, -0.2),
], 1.6, 5.2);
const bushGeometry = foliage([
  blob(0.85, 0, 0.55, 0, 0.75),
  blob(0.6, 0.7, 0.45, 0.2, 0.75),
  blob(0.55, -0.65, 0.4, -0.15, 0.75),
], 0, 1.2);
const postGeometry = new THREE.BoxGeometry(0.16, 0.9, 0.16).translate(0, 0.45, 0);
const signGeometry = new THREE.BoxGeometry(1.3, 1.3, 0.12).rotateZ(Math.PI / 4).translate(0, 2.6, 0);
const signPoleGeometry = new THREE.CylinderGeometry(0.06, 0.06, 2, 5).translate(0, 1, 0);
const lampPoleGeometry = new THREE.CylinderGeometry(0.07, 0.1, 5.4, 5).translate(0, 2.7, 0);
const lampGlowGeometry = new THREE.IcosahedronGeometry(0.3, 0).translate(0, 5.5, 0);
const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

const BARK_COLOR = new THREE.Color('#8a6246');
const STONE_COLOR = new THREE.Color('#c9c2d4');
// 에셋 높이를 월드 높이로 맞춘다 (기존 나무 한 그루 크기 기준)
const ASSET_HEIGHT = { pine: 5.6, round: 4.8, bush: 1.2 } as const;
const ASSET_ROCK_SCALE = 3.2;
// 도로에서 이보다 먼 에셋은 그림자를 끄고 가벼운 모델(LIGHT_TRIS 이하)만 쓴다
const FAR_LATERAL = 35;
const LIGHT_TRIS = 80;
const assetMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const PINE_COLORS = ['#4fae78', '#5cbd82', '#3f9a6c'].map((c) => new THREE.Color(c));
const LEAF_COLORS = ['#7ad183', '#66c47a', '#92dc86', '#52b872', '#f4c26b', '#f2a07b'].map((c) => new THREE.Color(c));

/** 도로 중심에서 lateral 만큼 옆으로 떨어진 지점 (도로 진행 방향에 수직) */
function roadPoint(z: number, lateral: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const dx = roadDX(z);
  const len = Math.hypot(dx, 1);
  // 진행 방향 (-dx, -1)/len 의 오른쪽 수직 벡터는 (1, -dx)/len
  const nx = 1 / len;
  const nz = -dx / len;
  const cx = roadX(z);
  return out.set(cx + nx * lateral, roadY(z) + lift, z + nz * lateral);
}

/** 도로를 따라가는 띠 모양 메쉬. dash가 있으면 점선. */
function ribbon(z0: number, z1: number, left: number, right: number, lift: number, dash?: [number, number]): THREE.BufferGeometry {
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let z = z0; z > z1; z -= ROAD_STEP) {
    const zn = Math.max(z - ROAD_STEP, z1);
    if (dash) {
      const phase = ((-z % (dash[0] + dash[1])) + (dash[0] + dash[1])) % (dash[0] + dash[1]);
      if (phase >= dash[0]) continue;
    }
    roadPoint(z, left, lift, a);
    roadPoint(z, right, lift, b);
    roadPoint(zn, left, lift, c);
    roadPoint(zn, right, lift, d);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    positions.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** 도로를 따라가는 세로 띠(가드레일 면) */
function wall(z0: number, z1: number, lateral: number, lo: number, hi: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let z = z0; z > z1; z -= ROAD_STEP) {
    const zn = Math.max(z - ROAD_STEP, z1);
    roadPoint(z, lateral, lo, a);
    roadPoint(z, lateral, hi, b);
    roadPoint(zn, lateral, lo, c);
    roadPoint(zn, lateral, hi, d);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    positions.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

function buildTerrain(z0: number, rand: () => number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(TERRAIN_HALF_WIDTH * 2, CHUNK_LENGTH, TERRAIN_COLS, TERRAIN_ROWS);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const lz = pos.getZ(i); // -L/2..L/2
    const z = z0 - CHUNK_LENGTH / 2 + lz;
    const center = roadX(z);
    // 열 간격의 일부만큼 흔들어 로우폴리 느낌을 낸다 (가장자리 정점은 이음매 때문에 고정)
    const isEdgeRow = Math.abs(Math.abs(lz) - CHUNK_LENGTH / 2) < 0.01;
    const jitter = isEdgeRow ? 0 : (rand() - 0.5) * 3;
    const x = center + pos.getX(i) + jitter;
    pos.setXYZ(i, x, terrainY(x, z), z);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();

  const p = flat.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // 삼각형 하나에 한 색 → 면마다 색이 다른 로우폴리 질감
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const d = Math.abs(cx - roadX(cz));
    const rise = cy - roadY(cz);
    if (d < ROAD_HALF_WIDTH + 3.5) color.copy(SAND);
    else if (cy < waterY(cz) + 1.3) color.copy(SAND);
    else if (cx > roadX(cz) && rise < -1.5) color.copy(CLIFF).lerp(SAND, 0.4);
    else {
      color.copy(GRASS[Math.floor(rand() * GRASS.length)]);
      color.lerp(HILL, Math.min(Math.max(rise / 20, 0), 1));
      // 같은 풀밭도 면마다 조금씩 밝기를 달리해 포근한 질감을 낸다
      color.offsetHSL(0, 0, (rand() - 0.5) * 0.04);
    }
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

function buildScenery(group: THREE.Group, z0: number, index: number, rand: () => number): void {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  type Kind = SceneryItem['kind'];
  type Item = SceneryItem;
  const items: Item[] = [];
  const add = (z: number, x: number, scale: number, kind: Kind) => {
    const y = terrainY(x, z);
    if (y < waterY(z) + 1) return; // 물 속에는 심지 않는다
    items.push({ x, y, z, scale, rot: rand() * Math.PI * 2, kind });
  };
  for (let i = 0; i < 64; i++) {
    const z = z0 - rand() * CHUNK_LENGTH;
    const side = rand() < 0.85 ? -1 : 1; // 왼쪽 숲이 더 빽빽, 오른쪽은 바다가 보이도록 듬성듬성
    const offset = ROAD_HALF_WIDTH + (side < 0 ? 6 : 14) + Math.pow(rand(), 1.5) * 140;
    const r = rand();
    add(z, roadX(z) + side * offset, 0.8 + rand() * 1.0, r < 0.4 ? 'pine' : 'round');
  }
  for (let i = 0; i < 26; i++) {
    const z = z0 - rand() * CHUNK_LENGTH;
    const side = rand() < 0.5 ? -1 : 1;
    add(z, roadX(z) + side * (ROAD_HALF_WIDTH + (side < 0 ? 4 : 8) + rand() * 10), 0.7 + rand() * 0.9, 'bush');
  }
  // 왼쪽 길가의 연한 절벽 바위
  const cliffCount = Math.floor(rand() * 5);
  for (let i = 0; i < cliffCount; i++) {
    const z = z0 - rand() * CHUNK_LENGTH;
    add(z, roadX(z) - (ROAD_HALF_WIDTH + 12 + rand() * 20), 4 + rand() * 5, 'cliff');
  }
  for (let i = 0; i < 6; i++) {
    const z = z0 - rand() * CHUNK_LENGTH;
    add(z, roadX(z) + (rand() < 0.5 ? -1 : 1) * (ROAD_HALF_WIDTH + 6 + rand() * 30), 1 + rand(), 'rock');
  }

  const by = (k: Kind) => items.filter((it) => it.kind === k);
  const place = (mesh: THREE.InstancedMesh, list: Item[], palette?: THREE.Color[], extraScale = 1, sink = 0) => {
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot);
      s.setScalar(it.scale * extraScale);
      p.set(it.x, it.y - sink, it.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (palette) mesh.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const cliffs = by('cliff');
  place(new THREE.InstancedMesh(rockGeometry, cliffMaterial, cliffs.length), cliffs, [CLIFF, CLIFF.clone().offsetHSL(0, 0, 0.04)], 1, 1.5);

  if (scenery) {
    // 한 청크의 나무·바위·덤불을 길가(그림자 있음)와 먼 곳(그림자 없음, 가벼운 모델) 두 메쉬로 합친다
    const far = (it: SceneryItem) => Math.abs(it.x - roadX(it.z)) > FAR_LATERAL;
    const rest = items.filter((it) => it.kind !== 'cliff');
    const near = mergeScenery(rest.filter((it) => !far(it)), rand, false);
    near.castShadow = true;
    near.receiveShadow = true;
    const distant = mergeScenery(rest.filter(far), rand, true);
    distant.receiveShadow = true;
    group.add(near, distant);
  } else {
    // 에셋을 못 받았을 때 쓰는 코드 생성 모양
    const trees = items.filter((it) => it.kind === 'pine' || it.kind === 'round');
    const pines = by('pine');
    const rounds = by('round');
    const bushes = by('bush');
    const rocks = by('rock');
    place(new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length), trees);
    place(new THREE.InstancedMesh(pineGeometry, leafMaterial, pines.length), pines, PINE_COLORS);
    place(new THREE.InstancedMesh(roundTreeGeometry, leafMaterial, rounds.length), rounds, LEAF_COLORS);
    place(new THREE.InstancedMesh(bushGeometry, leafMaterial, bushes.length), bushes, LEAF_COLORS);
    place(new THREE.InstancedMesh(rockGeometry, rockMaterial, rocks.length), rocks, undefined, 1.3, 0.3);
  }

  buildWater(group, z0);
  if (index % 5 === 2) buildVillage(group, z0, rand);
  if (index % 9 === 4) buildLighthouse(group, z0, rand);
  buildBoats(group, z0, rand);
}

type SceneryItem = { x: number; y: number; z: number; scale: number; rot: number; kind: 'pine' | 'round' | 'rock' | 'bush' | 'cliff' };

/** 에셋을 청크 단위 정적 메쉬 하나로 합친다. 색은 정점에 구워 넣는다. */
function mergeScenery(items: SceneryItem[], rand: () => number, light: boolean): THREE.Mesh {
  const set = scenery!;
  // 먼 곳은 안개에 묻혀 디테일이 안 보이니 삼각형이 적은 모델만 쓴다
  const pool = (list: Variant[]) => (light ? list.filter((v) => v.tris <= LIGHT_TRIS) : list);
  const pools = { pine: pool(set.pines), round: pool(set.roundTrees), bush: pool(set.bushes), rock: pool(set.rocks) };
  const chosen = items.map((it) => {
    const list: Variant[] = pools[it.kind as keyof typeof pools];
    return { it, v: list[Math.floor(rand() * list.length)] };
  });
  let verts = 0;
  let idx = 0;
  for (const { v } of chosen) { verts += v.part.length; idx += v.index.length; }
  const position = new Float32Array(verts * 3);
  const normal = new Float32Array(verts * 3);
  const color = new Float32Array(verts * 3);
  const index = new Uint32Array(idx);
  const tint = new THREE.Color();
  let vo = 0;
  let io = 0;
  for (const { it, v } of chosen) {
    const k = it.kind === 'rock'
      ? ASSET_ROCK_SCALE * it.scale
      : (ASSET_HEIGHT[it.kind as 'pine' | 'round' | 'bush'] * it.scale) / v.height;
    const c = Math.cos(it.rot);
    const sn = Math.sin(it.rot);
    const sink = it.kind === 'rock' ? 0.25 : 0;
    const palette = it.kind === 'pine' ? PINE_COLORS : LEAF_COLORS;
    // 단풍색(팔레트 뒤쪽 둘)은 가끔만 섞어 숲이 초록 위주로 보이게 한다
    const leaf = palette[Math.floor(rand() * (rand() < 0.2 ? palette.length : Math.min(palette.length, 4)))];
    const stoneShade = 0.88 + rand() * 0.2;
    for (let i = 0; i < v.part.length; i++) {
      const px = v.position[i * 3], py = v.position[i * 3 + 1], pz = v.position[i * 3 + 2];
      const o = (vo + i) * 3;
      position[o] = it.x + (c * px + sn * pz) * k;
      position[o + 1] = it.y - sink + py * k;
      position[o + 2] = it.z + (-sn * px + c * pz) * k;
      const nx = v.normal[i * 3], nz = v.normal[i * 3 + 2];
      normal[o] = c * nx + sn * nz;
      normal[o + 1] = v.normal[i * 3 + 1];
      normal[o + 2] = -sn * nx + c * nz;
      const part = v.part[i];
      if (part === LEAF) {
        // 아래는 어둡고 위는 밝게: 기존 잎 덩어리와 같은 입체감
        const t = Math.min(Math.max(py / v.height, 0), 1);
        tint.copy(leaf).multiplyScalar(0.72 + t * 0.38);
      } else if (part === BARK) tint.copy(BARK_COLOR);
      else tint.copy(STONE_COLOR).multiplyScalar(stoneShade);
      color[o] = tint.r;
      color[o + 1] = tint.g;
      color[o + 2] = tint.b;
    }
    for (let i = 0; i < v.index.length; i++) index[io + i] = v.index[i] + vo;
    vo += v.part.length;
    io += v.index.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, assetMaterial);
}

/** 오른쪽 바다. 도로를 따라 수면 높이가 오르내린다. */
function buildWater(group: THREE.Group, z0: number): void {
  const rows = 8;
  const positions: number[] = [];
  const pt = (z: number, x: number) => [x, waterY(z), z];
  for (let r = 0; r < rows; r++) {
    const za = z0 - (r / rows) * CHUNK_LENGTH;
    const zb = z0 - ((r + 1) / rows) * CHUNK_LENGTH;
    const xa0 = roadX(za) + 8, xa1 = roadX(za) + 700;
    const xb0 = roadX(zb) + 8, xb1 = roadX(zb) + 700;
    positions.push(...pt(za, xa0), ...pt(za, xa1), ...pt(zb, xb0));
    positions.push(...pt(za, xa1), ...pt(zb, xb1), ...pt(zb, xb0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, waterMaterial);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildVillage(group: THREE.Group, z0: number, rand: () => number): void {
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(0.85, 0.7, 4).rotateY(Math.PI / 4).translate(0, 1.35, 0);
  for (let i = 0; i < 9; i++) {
    const z = z0 - 8 - rand() * (CHUNK_LENGTH - 16);
    const x = roadX(z) + (rand() < 0.5 ? 1 : -1) * (ROAD_HALF_WIDTH + 20 + rand() * 30);
    const y = terrainY(x, z);
    if (y < waterY(z) + 1.2) continue;
    const w = 3 + rand() * 2.5;
    const h = 2.4 + rand() * 1.6;
    const house = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, wallMaterials[Math.floor(rand() * wallMaterials.length)]);
    body.scale.set(w, h, w * (0.8 + rand() * 0.5));
    const roof = new THREE.Mesh(roofGeo, roofMaterials[Math.floor(rand() * roofMaterials.length)]);
    roof.scale.set(w * 1.35, h * 0.55, w * 1.2);
    roof.position.y = h - 1.35 + 1.35 * (h * 0.55) - 0.7;
    house.add(body, roof);
    house.position.set(x, y, z);
    house.rotation.y = rand() * Math.PI;
        group.add(house);
  }
}

function buildLighthouse(group: THREE.Group, z0: number, rand: () => number): void {
  const z = z0 - 20 - rand() * 40;
  const x = roadX(z) + 90 + rand() * 40;
  const wl = waterY(z);
  const light = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(9, 0), rockMaterial);
  rock.scale.set(1.3, 0.7, 1.1);
  rock.position.y = 0;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 16, 8), whiteMaterial);
  tower.position.y = 11;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.0, 3, 8), redMaterial);
  band.position.y = 11;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 8), lampGlowMaterial);
  lamp.position.y = 20;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.4, 8), redMaterial);
  cap.position.y = 22.4;
  light.add(rock, tower, band, lamp, cap);
  light.position.set(x, wl + 1.5, z);
  group.add(light);
}

function buildBoats(group: THREE.Group, z0: number, rand: () => number): void {
  const hullGeo = new THREE.BoxGeometry(1.4, 0.5, 4);
  const sailGeo = new THREE.ConeGeometry(1.4, 5, 3).translate(0, 2.8, 0);
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const z = z0 - rand() * CHUNK_LENGTH;
    const x = roadX(z) + 60 + rand() * 200;
    if (terrainY(x, z) > waterY(z) - 1) continue;
    const boat = new THREE.Group();
    boat.add(new THREE.Mesh(hullGeo, redMaterial), new THREE.Mesh(sailGeo, whiteMaterial));
    boat.position.set(x, waterY(z) + 0.2, z);
    boat.rotation.y = rand() * Math.PI;
    boat.scale.setScalar(1.6 + rand() * 1.4);
    group.add(boat);
  }
}

/** 도로 양옆 가드레일(레일 + 기둥), 급커브 표지판, 가로등 */
function buildRoadside(group: THREE.Group, z0: number, z1: number): void {
  const rails: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const edge = side * (ROAD_HALF_WIDTH + 0.9);
    rails.push(wall(z0, z1, edge, 0.5, 0.88));
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();

  const postZs: number[] = [];
  for (let z = z0; z > z1; z -= 4) postZs.push(z);
  const posts = new THREE.InstancedMesh(postGeometry, postMaterial, postZs.length * 2);
  postZs.forEach((z, i) => {
    q.setFromAxisAngle(up, Math.atan(-roadDX(z)));
    [-1, 1].forEach((side, k) => {
      roadPoint(z, side * (ROAD_HALF_WIDTH + 0.9), 0, p);
      m.compose(p, q, one);
      posts.setMatrixAt(i * 2 + k, m);
    });
  });
  group.add(posts);
  const railMesh = new THREE.Mesh(mergeGeometries(rails), railMaterial);
  rails.forEach((g) => g.dispose());
  railMesh.castShadow = true;
  group.add(railMesh);

  // 커브가 심하면 노란 다이아몬드 표지판, 일정 간격으로 가로등
  const zs = Math.floor(-z0 / 40);
  const lampZ = z0 - 20;
  const lampSide = zs % 2 === 0 ? 1 : -1;
  const lampBase = roadPoint(lampZ, lampSide * (ROAD_HALF_WIDTH + 2), 0, new THREE.Vector3());
  const lampPole = new THREE.Mesh(lampPoleGeometry, postMaterial);
  lampPole.position.copy(lampBase);
  const lampGlow = new THREE.Mesh(lampGlowGeometry, lampGlowMaterial);
  lampGlow.position.copy(lampBase);
  lampPole.userData.shared = lampGlow.userData.shared = true;
  group.add(lampPole, lampGlow);

  const curve = Math.abs(roadDX(z0 - 40) - roadDX(z0));
  if (curve > 0.35) {
    const side = roadDX(z0 - 40) > roadDX(z0) ? -1 : 1;
    const base = roadPoint(z0 - 10, side * (ROAD_HALF_WIDTH + 2.2), 0, new THREE.Vector3());
    const pole = new THREE.Mesh(signPoleGeometry, postMaterial);
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    pole.position.copy(base);
    sign.position.copy(base);
    sign.rotation.y = Math.atan(-roadDX(z0 - 10)) + Math.PI;
    pole.userData.shared = sign.userData.shared = true;
    group.add(pole, sign);
  }
}

class Chunk {
  readonly group = new THREE.Group();

  constructor(readonly index: number) {
    const z0 = -index * CHUNK_LENGTH;
    const z1 = z0 - CHUNK_LENGTH;
    const rand = mulberry32(index * 9973 + 17);

    const terrain = new THREE.Mesh(buildTerrain(z0, rand), terrainMaterial);
    terrain.receiveShadow = true;
    this.group.add(terrain);

    const road = new THREE.Mesh(ribbon(z0, z1, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0.02), roadMaterial);
    road.receiveShadow = true;
    this.group.add(road);
    // 중앙 점선과 양쪽 실선을 한 메쉬로
    const lines = [
      ribbon(z0, z1, -0.12, 0.12, 0.04, [4, 6]),
      ribbon(z0, z1, -ROAD_HALF_WIDTH + 0.3, -ROAD_HALF_WIDTH + 0.5, 0.04),
      ribbon(z0, z1, ROAD_HALF_WIDTH - 0.5, ROAD_HALF_WIDTH - 0.3, 0.04),
    ];
    this.group.add(new THREE.Mesh(mergeGeometries(lines), lineMaterial));
    lines.forEach((g) => g.dispose());

    buildRoadside(this.group, z0, z1);
    buildScenery(this.group, z0, index, rand);
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
      else if (obj instanceof THREE.Mesh && obj.userData.shared !== true) obj.geometry.dispose();
    });
  }
}

/** 차 앞쪽으로 청크를 만들고, 지나간 청크는 버린다. 메모리는 항상 일정하다. */
export class ChunkManager {
  private chunks = new Map<number, Chunk>();

  constructor(private scene: THREE.Scene) {}

  update(carZ: number): void {
    const current = Math.floor(-carZ / CHUNK_LENGTH);
    const min = current - CHUNKS_BEHIND;
    const max = current + CHUNKS_AHEAD;

    for (const [index, chunk] of this.chunks) {
      if (index < min || index > max) {
        this.scene.remove(chunk.group);
        chunk.dispose();
        this.chunks.delete(index);
      }
    }
    // 한 프레임에 하나씩만 만들어 끊김을 줄인다 (첫 프레임은 전부)
    const budget = this.chunks.size === 0 ? Infinity : 1;
    let built = 0;
    for (let i = min; i <= max && built < budget; i++) {
      if (!this.chunks.has(i)) {
        const chunk = new Chunk(i);
        this.chunks.set(i, chunk);
        this.scene.add(chunk.group);
        built++;
      }
    }
  }
}
