import * as THREE from 'three';
import { ROAD_HALF_WIDTH, roadDX, roadX, roadY, terrainY } from './path';
import { mulberry32 } from './random';

const CHUNK_LENGTH = 80;
const CHUNKS_AHEAD = 9;
const CHUNKS_BEHIND = 2;
const TERRAIN_HALF_WIDTH = 220;
const TERRAIN_COLS = 44;
const TERRAIN_ROWS = 12;
const ROAD_STEP = 2;

const GRASS = [new THREE.Color('#7fb069'), new THREE.Color('#6a9c5a'), new THREE.Color('#93bf6e')];
const HILL = new THREE.Color('#5d8a55');
const SAND = new THREE.Color('#d9c27a');

const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const roadMaterial = new THREE.MeshLambertMaterial({ color: '#4a4658' });
const lineMaterial = new THREE.MeshBasicMaterial({ color: '#fff3d6' });
const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#7a5235', flatShading: true });
const leafMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
const rockMaterial = new THREE.MeshLambertMaterial({ color: '#9a96a6', flatShading: true });

const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5).translate(0, 0.8, 0);
const pineGeometry = new THREE.ConeGeometry(1.6, 4.2, 6).translate(0, 3.4, 0);
const roundTreeGeometry = new THREE.IcosahedronGeometry(1.7, 0).translate(0, 2.9, 0);
const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

const LEAF_COLORS = ['#3f7d4e', '#4f9a5a', '#2f6b48', '#e3a14b', '#d9734e'].map((c) => new THREE.Color(c));

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
    else {
      color.copy(GRASS[Math.floor(rand() * GRASS.length)]);
      color.lerp(HILL, Math.min(Math.max(rise / 14, 0), 1));
    }
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

function buildScenery(group: THREE.Group, z0: number, rand: () => number): void {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  type Item = { x: number; y: number; z: number; scale: number; rot: number; kind: 'pine' | 'round' | 'rock' };
  const items: Item[] = [];
  const count = 70;
  for (let i = 0; i < count; i++) {
    const z = z0 - rand() * CHUNK_LENGTH;
    const side = rand() < 0.5 ? -1 : 1;
    // 도로 가까이는 듬성듬성, 멀수록 빽빽하게
    const offset = ROAD_HALF_WIDTH + 6 + Math.pow(rand(), 1.6) * 150;
    const x = roadX(z) + side * offset;
    const r = rand();
    const kind = r < 0.5 ? 'pine' : r < 0.85 ? 'round' : 'rock';
    items.push({ x, y: terrainY(x, z), z, scale: 0.7 + rand() * 0.9, rot: rand() * Math.PI * 2, kind });
  }

  const trees = items.filter((it) => it.kind !== 'rock');
  const pines = items.filter((it) => it.kind === 'pine');
  const rounds = items.filter((it) => it.kind === 'round');
  const rocks = items.filter((it) => it.kind === 'rock');

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  const pineMesh = new THREE.InstancedMesh(pineGeometry, leafMaterial, pines.length);
  const roundMesh = new THREE.InstancedMesh(roundTreeGeometry, leafMaterial, rounds.length);
  const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rocks.length);

  const place = (mesh: THREE.InstancedMesh, list: Item[], withColor: boolean, extraScale = 1) => {
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot);
      s.setScalar(it.scale * extraScale);
      p.set(it.x, it.y - (it.kind === 'rock' ? 0.3 : 0), it.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (withColor) mesh.setColorAt(i, LEAF_COLORS[Math.floor(rand() * (it.kind === 'pine' ? 3 : LEAF_COLORS.length))]);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  place(trunks, trees, false);
  place(pineMesh, pines, true);
  place(roundMesh, rounds, true);
  place(rockMesh, rocks, false, 1.3);
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
    this.group.add(new THREE.Mesh(ribbon(z0, z1, -0.12, 0.12, 0.04, [4, 6]), lineMaterial));
    this.group.add(new THREE.Mesh(ribbon(z0, z1, -ROAD_HALF_WIDTH + 0.3, -ROAD_HALF_WIDTH + 0.5, 0.04), lineMaterial));
    this.group.add(new THREE.Mesh(ribbon(z0, z1, ROAD_HALF_WIDTH - 0.5, ROAD_HALF_WIDTH - 0.3, 0.04), lineMaterial));

    buildScenery(this.group, z0, rand);
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
      else if (obj instanceof THREE.Mesh) obj.geometry.dispose();
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
