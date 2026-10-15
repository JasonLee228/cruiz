import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './random';
import { roadX, waterY } from './path';
import { addHaze } from './haze';

/**
 * 바다 건너 원경 랜드마크: 등대가 있는 섬마을, 현수교와 도시 스카이라인.
 * 도로를 따라 일정 간격으로 번갈아 놓는다. 멀리서는 하늘빛에 거의 묻혀 있다가 가까워질수록 또렷해진다.
 * 랜드마크 하나는 몸체·창문·등불 메쉬 세 개로 그린다 (그림자 없음).
 */
const FIRST = 450; // 첫 랜드마크까지 거리 (시작 화면에서 보이도록)
const SPACING = 1300;
const SHOW_AHEAD = 1100; // 이 거리 안에 들어오면 만든다
const KEEP_BEHIND = 350; // 지나간 뒤 이만큼 멀어지면 치운다
const HAZE_NEAR = 200;
const MIN_HAZE = 0.18;
const BRIDGE_ANGLE = 1.0;
const ISLAND_SCALE = 1.6;

const WINDOW_DAY = new THREE.Color('#7d8db0');
const WINDOW_NIGHT = new THREE.Color('#ffd68a').multiplyScalar(1.5);
const LAMP_DAY = new THREE.Color('#fff4c8');
const LAMP_NIGHT = new THREE.Color('#fff0b0').multiplyScalar(2.2);

type Kind = 'island' | 'bridge';

interface Built {
  group: THREE.Group;
  windows?: THREE.MeshBasicMaterial;
  lamps?: THREE.MeshBasicMaterial;
  haze: { value: number };
  center: THREE.Vector3;
}

/** 색을 칠한 비색인 지오메트리 조각들 */
class Parts {
  list: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();

  /** geo를 변환 없이 받아 면마다 color(또는 함수)로 칠한다 */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((ny: number, y: number) => THREE.ColorRepresentation)): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let f = 0; f < pos.count; f += 3) {
      if (typeof color === 'function') {
        const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
        this.c.set(color(nor.getY(f), cy));
      } else this.c.set(color);
      for (let k = 0; k < 3; k++) this.c.toArray(colors, (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.list.push(g);
  }

  /** a에서 b까지 이어지는 각진 막대 (케이블·기둥) */
  beam(a: THREE.Vector3, b: THREE.Vector3, thick: number, color: THREE.ColorRepresentation): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = new THREE.BoxGeometry(thick, thick, len);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(g, color);
  }

  merge(): THREE.BufferGeometry | null {
    if (!this.list.length) return null;
    const g = mergeGeometries(this.list);
    this.list.forEach((p) => p.dispose());
    this.list = [];
    return g;
  }
}

/** 울퉁불퉁한 섬 덩어리: 윗면은 풀, 옆면은 바위 */
function islandRock(parts: Parts, rand: () => number, rx: number, rz: number, top: number, x: number, z: number): void {
  const g = new THREE.CylinderGeometry(1, 1.25, 1, 11, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const moved = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = moved.get(key);
    if (k === undefined) { k = 0.8 + rand() * 0.35; moved.set(key, k); }
    pos.setXYZ(i, pos.getX(i) * k * rx, (pos.getY(i) + 0.5) * (top + 14) - 14, pos.getZ(i) * k * rz);
  }
  g.translate(x, 0, z);
  parts.add(g, (ny) => (ny > 0.6 ? '#9fdc8a' : rand() < 0.5 ? '#e3d3b4' : '#d8c5a2'));
}

const WALLS = ['#fff6e6', '#ffe1cf', '#f3ecff', '#fff0c9', '#e2f0f7'];
const ROOFS = ['#ee8b72', '#e57a6a', '#f2a65a', '#d9705f'];

function house(body: Parts, windows: Parts, rand: () => number, x: number, y: number, z: number, s: number): void {
  const w = (4 + rand() * 2.5) * s;
  const h = (3.5 + rand() * 3) * s;
  const d = (4 + rand() * 2) * s;
  body.add(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), WALLS[Math.floor(rand() * WALLS.length)]);
  const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.45 + 1.2 * s, 4).rotateY(Math.PI / 4);
  roof.scale(w / Math.max(w, d), 1, d / Math.max(w, d));
  body.add(roof.translate(x, y + h + (h * 0.45 + 1.2 * s) / 2, z), ROOFS[Math.floor(rand() * ROOFS.length)]);
  // 도로 쪽(-x)과 뒤쪽(+z, 다가오는 방향) 벽에 창 한두 개
  const ws = 1.4 * s;
  for (let i = 0; i < 2; i++) {
    const wy = y + h * (0.35 + i * 0.3);
    if (wy + ws > y + h - 0.3) break;
    windows.add(new THREE.BoxGeometry(0.2, ws, ws).translate(x - w / 2 - 0.05, wy, z + (rand() - 0.5) * d * 0.4), WINDOW_DAY);
    windows.add(new THREE.BoxGeometry(ws, ws, 0.2).translate(x + (rand() - 0.5) * w * 0.4, wy, z + d / 2 + 0.05), WINDOW_DAY);
  }
}

/** 시안 01: 계단식으로 집이 들어선 섬과 등대 */
function buildIsland(rand: () => number, body: Parts, windows: Parts, lamps: Parts): void {
  islandRock(body, rand, 62, 48, 6, 0, 0);
  islandRock(body, rand, 24, 20, 14, 12, -6);
  islandRock(body, rand, 20, 18, 4, -48, 34); // 등대 곶
  // 아랫단과 윗단에 집을 빽빽이
  for (let i = 0; i < 28; i++) {
    const a = rand() * Math.PI * 2;
    const r = 30 + rand() * 16;
    house(body, windows, rand, Math.cos(a) * r * 0.95, 6, Math.sin(a) * r * 0.75, 1.3);
  }
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 15;
    house(body, windows, rand, 12 + Math.cos(a) * r, 14, -6 + Math.sin(a) * r * 0.8, 1.3);
  }
  // 섬 꼭대기 나무 몇 그루
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const r = 26 + rand() * 10;
    const tx = 12 + Math.cos(a) * r * 0.9, tz = -6 + Math.sin(a) * r * 0.7;
    const th = 6 + rand() * 4;
    body.add(new THREE.ConeGeometry(2.4, th, 6).translate(tx, 6 + th / 2 + 1, tz), rand() < 0.5 ? '#4fae78' : '#5cbd82');
  }
  // 등대: 흰 탑에 빨간 띠, 꼭대기 등불
  const lx = -48, lz = 34, base = 4;
  body.add(new THREE.CylinderGeometry(2.4, 3.2, 26, 10).translate(lx, base + 13, lz), '#fbfaf6');
  for (const y of [8, 17]) body.add(new THREE.CylinderGeometry(2.75, 2.95, 3, 10).translate(lx, base + y, lz), '#e0605a');
  body.add(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 10).translate(lx, base + 26.4, lz), '#e0605a');
  lamps.add(new THREE.CylinderGeometry(2, 2, 3, 10).translate(lx, base + 28.3, lz), LAMP_DAY);
  body.add(new THREE.ConeGeometry(2.8, 3.2, 10).translate(lx, base + 31.4, lz), '#e0605a');
  body.add(new THREE.BoxGeometry(5, 4, 6).translate(lx + 6, base + 2, lz + 2), '#fbfaf6');
}

const CITY = ['#cfc8ea', '#f2cdb4', '#bcd3ea', '#f1e6cf', '#d8e6f2', '#e9c7d4'];

/** 시안 02: 붉은 현수교와 그 너머 도시 */
function buildBridge(rand: () => number, body: Parts, windows: Parts): void {
  const half = 260, towerZ = 130, deckY = 22, top = 64;
  const red = '#d9705f';
  body.add(new THREE.BoxGeometry(14, 2, half * 2).translate(0, deckY, 0), red);
  body.add(new THREE.BoxGeometry(15, 0.8, half * 2).translate(0, deckY + 1.4, 0), '#a65a4f');
  for (const tz of [-towerZ, towerZ]) {
    for (const tx of [-6, 6]) body.add(new THREE.BoxGeometry(2.6, top + 30, 2.6).translate(tx, top / 2 - 15, tz), red);
    for (const y of [deckY + 10, deckY + 26, top - 1]) body.add(new THREE.BoxGeometry(14, 2, 2).translate(0, y, tz), red);
  }
  // 끝단 받침과 낮은 교각
  for (const ez of [-half, half]) body.add(new THREE.BoxGeometry(16, deckY + 20, 10).translate(0, deckY / 2 - 10, ez), '#c9c2d4');
  for (let z = -half + 40; z < half; z += 40) {
    if (Math.abs(Math.abs(z) - towerZ) < 20) continue;
    body.add(new THREE.BoxGeometry(5, deckY + 20, 5).translate(0, deckY / 2 - 10, z), '#c9c2d4');
  }
  // 주 케이블: 끝단 → 탑 꼭대기 → 가운데로 처졌다가 다시 탑 → 끝단. 행어는 일정 간격.
  const cableY = (z: number): number => {
    const az = Math.abs(z);
    if (az >= towerZ) return top - ((az - towerZ) / (half - towerZ)) * (top - deckY - 2);
    const t = az / towerZ;
    return deckY + 6 + (top - deckY - 6) * t * t;
  };
  for (const cx of [-6, 6]) {
    let prev = new THREE.Vector3(cx, cableY(-half), -half);
    for (let z = -half + 20; z <= half; z += 20) {
      const p = new THREE.Vector3(cx, cableY(z), z);
      body.beam(prev, p, 0.7, red);
      prev = p;
      if (Math.abs(Math.abs(z) - towerZ) > 6 && p.y > deckY + 3) {
        body.beam(new THREE.Vector3(cx, deckY + 1, z), new THREE.Vector3(cx, p.y, z), 0.3, red);
      }
    }
  }
  // 다리 너머 도시: 파스텔 빌딩 숲, 층마다 창 띠
  body.add(new THREE.BoxGeometry(150, 14, 460).translate(170, -4, 0), '#b9d7a4');
  for (let i = 0; i < 46; i++) {
    const bx = 120 + rand() * 100;
    const bz = (rand() - 0.5) * 400;
    const tall = rand() < 0.2;
    const h = tall ? 70 + rand() * 60 : 18 + rand() * 40;
    const w = 10 + rand() * 12;
    const d = 10 + rand() * 12;
    const color = CITY[Math.floor(rand() * CITY.length)];
    body.add(new THREE.BoxGeometry(w, h, d).translate(bx, 3 + h / 2, bz), color);
    if (tall) body.add(new THREE.BoxGeometry(w * 0.6, 8, d * 0.6).translate(bx, 3 + h + 4, bz), color);
    for (let y = 8; y < h - 3; y += 7) windows.add(new THREE.BoxGeometry(w + 0.3, 1.6, d + 0.3).translate(bx, 3 + y, bz), WINDOW_DAY);
  }
}

export class Landmarks {
  private built = new Map<number, Built>();
  private hazeColor = { value: new THREE.Color() };
  private windowTint = new THREE.Color();
  private lampTint = new THREE.Color();

  constructor(private scene: THREE.Scene) {}

  /** 매 프레임: 범위에 들어온 랜드마크를 만들고 지나간 것은 치운다. 안개빛과 밤 정도를 반영한다. */
  update(carZ: number, camera: THREE.Vector3, fog: THREE.Color, night: number): void {
    this.hazeColor.value.copy(fog);
    const dist = -carZ;
    const first = Math.max(0, Math.ceil((dist - KEEP_BEHIND - FIRST) / SPACING));
    const last = Math.floor((dist + SHOW_AHEAD - FIRST) / SPACING);
    for (let k = first; k <= last; k++) if (!this.built.has(k)) this.built.set(k, this.build(k));
    for (const [k, b] of this.built) {
      if (k < first || k > last) {
        this.dispose(b);
        this.built.delete(k);
        continue;
      }
      const d = b.center.distanceTo(camera);
      b.haze.value = MIN_HAZE + (1 - MIN_HAZE) * THREE.MathUtils.smoothstep(d, HAZE_NEAR, SHOW_AHEAD + 100);
    }
    this.windowTint.copy(WINDOW_DAY).lerp(WINDOW_NIGHT, THREE.MathUtils.smoothstep(night, 0.3, 0.8));
    this.lampTint.copy(LAMP_DAY).lerp(LAMP_NIGHT, night);
    for (const b of this.built.values()) {
      b.windows?.color.copy(this.windowTint);
      b.lamps?.color.copy(this.lampTint);
    }
  }

  private build(k: number): Built {
    const rand = mulberry32(9000 + k * 131);
    const kind: Kind = k % 2 === 0 ? 'island' : 'bridge';
    const zc = -(FIRST + k * SPACING);
    const span = kind === 'bridge' ? 360 : 110;
    // 랜드마크가 걸치는 구간 전체에서 지형(도로에서 220m까지)보다 바깥에 있도록 옆으로 민다
    let edge = -Infinity;
    for (let s = -span; s <= span; s += 20) edge = Math.max(edge, roadX(zc + s));
    // 다리는 돌린 뒤 가까운 끝이 도로에서 250m쯤 되도록 더 민다
    const x = edge + (kind === 'bridge' ? 250 + 260 * Math.sin(BRIDGE_ANGLE) : 330);
    const y = waterY(zc);

    const body = new Parts();
    const windows = new Parts();
    const lamps = new Parts();
    if (kind === 'island') buildIsland(rand, body, windows, lamps);
    else buildBridge(rand, body, windows);

    const haze = { value: 1 };
    const group = new THREE.Group();
    const bodyGeo = body.merge();
    if (bodyGeo) group.add(new THREE.Mesh(bodyGeo, addHaze(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }), this.hazeColor, haze)));
    // 창과 등불은 조명을 받지 않는 재질: 낮에는 어두운 유리, 밤에는 따뜻한 불빛
    const glow = (geo: THREE.BufferGeometry | null, tint: THREE.Color): THREE.MeshBasicMaterial | undefined => {
      if (!geo) return undefined;
      const m = addHaze(new THREE.MeshBasicMaterial({ color: tint, fog: false }), this.hazeColor, haze);
      group.add(new THREE.Mesh(geo, m));
      return m;
    };
    const windowMat = glow(windows.merge(), this.windowTint);
    const lampMat = glow(lamps.merge(), this.lampTint);
    group.position.set(x, y, zc);
    // 다리는 비스듬히 돌려 바다를 가로지르는 모습이 보이게 한다
    if (kind === 'bridge') group.rotation.y = BRIDGE_ANGLE;
    else group.scale.setScalar(ISLAND_SCALE);
    group.updateMatrixWorld(true);
    group.matrixAutoUpdate = false;
    this.scene.add(group);
    return { group, haze, windows: windowMat, lamps: lampMat, center: new THREE.Vector3(x, y + 20, zc) };
  }

  private dispose(b: Built): void {
    this.scene.remove(b.group);
    b.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
