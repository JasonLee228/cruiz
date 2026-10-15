import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roadDX, roadX, roadY, waterY } from './path';
import { mulberry32, noise2 } from './random';

/**
 * 원경 랜드마크: 섬 마을과 등대, 대교와 도시, 터널.
 * 끝없는 도로를 SECTION 길이 구간으로 나누고 구간마다 하나씩 차례로 놓는다.
 * 모두 코드로 만든 로우폴리 모양이고, 랜드마크 하나는 재질별로 합친 메쉬 몇 개(그리기 호출 2~4번)뿐이다.
 * 만들 때 한 번 계산하고 이후 프레임에는 밤 정도에 따라 재질 색만 바꾼다.
 */

const SECTION = 1400;
const FIRST = 440; // 출발 직후 시작 화면에서 첫 랜드마크(섬 마을)가 보이도록
const AHEAD = 1500;
const BEHIND = 500;
type Kind = 'harbor' | 'bay' | 'tunnel';
const KINDS: Kind[] = ['harbor', 'bay', 'tunnel'];

/**
 * 멀리 있는 랜드마크는 안개를 덜 받게 한다. 그렇지 않으면 300m만 넘어도 하늘색에 묻혀 사라진다.
 * k=1이면 기본 안개와 같다.
 */
function softFog<T extends THREE.Material>(m: T, k: number): T {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth ) * ${k.toFixed(2)};
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #endif`,
    );
  };
  m.customProgramCacheKey = () => `softfog${k}`;
  return m;
}

const solidMaterial = softFog(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.55);
/** 창문: 낮에는 유리색, 밤에는 따뜻하게 빛난다 */
const windowMaterial = softFog(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.25);
/** 등대 불빛, 다리 조명, 항공 경고등: 밤에만 번질 만큼 밝아진다 */
const beaconMaterial = softFog(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.3);
/** 터널은 가까이 지나가므로 기본 안개 + 그림자 */
const tunnelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
/** 터널 안쪽: 천장 조명의 따뜻한 빛을 조금 받은 것처럼 */
const tunnelInsideMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#4a3e34') });
const tunnelLampMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a8').multiplyScalar(1.6) });
const WINDOW_GLOW = new THREE.Color('#ffc978');

const C = (hex: string) => new THREE.Color(hex);
const WALLS = ['#fff1dc', '#ffd9c2', '#d9ecf7', '#fbe3a8', '#f6d6de'].map(C);
const ROOFS = ['#ee8b72', '#e57a8a', '#f2a65a', '#d9705f'].map(C);
const TOWERS = ['#f3e6d8', '#e6dff2', '#f7d9cc', '#d6e6f3', '#efe4c4', '#dcd3ec'].map(C);
const GLASS = C('#9fb4cf');
const GRASS = C('#8fd283');
const FOREST = C('#5cb87a');
const CLIFF = C('#e3d3b4');
const STONE = C('#c9c2d4');
const WHITE = C('#ffffff');
const RED = C('#e8606a');
const BRIDGE = C('#e9826e');
const LAMP = C('#ffe6a6');

/** 같은 재질로 그릴 삼각형을 모은다. 면마다 색을 조금씩 흔들어 로우폴리 질감을 낸다. */
class Builder {
  private pos: number[] = [];
  private col: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private c2 = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(private rand: () => number) {}

  add(geo: THREE.BufferGeometry, color: THREE.Color, x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, vary = 0.04): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (i % 3 === 0) this.c.copy(color).multiplyScalar(1 + (this.rand() - 0.5) * vary * 2);
      this.v.fromBufferAttribute(p, i).applyMatrix4(this.m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  /** 미리 월드 좌표로 계산한 삼각형 */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < 3; k++) this.col.push(color.r, color.g, color.b);
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** 앞면이 toward 쪽을 보도록 감는 방향을 맞춘 삼각형 (한쪽 면만 그려야 그림자 얼룩이 안 생긴다) */
  facing(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, toward: THREE.Vector3, color: THREE.Color): void {
    const n = this.v.subVectors(b, a).cross(this.c2.subVectors(c, a));
    if (n.dot(toward) >= 0) this.tri(a, b, c, color);
    else this.tri(a, c, b, color);
  }

  facingQuad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, toward: THREE.Vector3, color: THREE.Color): void {
    this.facing(a, b, c, toward, color);
    this.facing(a, c, d, toward, color);
  }

  build(material: THREE.Material): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

/** 울퉁불퉁한 바위 덩어리 (정점을 흔든 이십면체) */
function rock(rand: () => number, detail = 0, amount = 0.22): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const g = mergeVertices(base);
  base.dispose();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rand() - 0.5) * amount * 2;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  return g;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);

/** 구간 [z0, z1] 에서 도로가 가장 오른쪽(바다 쪽)으로 나간 x. 랜드마크가 도로를 덮지 않게 이보다 바깥에 둔다. */
function seaEdge(z0: number, z1: number): number {
  let x = -Infinity;
  for (let z = z0; z >= z1; z -= 10) x = Math.max(x, roadX(z));
  return x;
}

function lowestWater(z0: number, z1: number): number {
  let y = Infinity;
  for (let z = z0; z >= z1; z -= 10) y = Math.min(y, waterY(z));
  return y;
}

/** 창문 하나: (x, y, z) 에 angle 방향(+z 를 angle 만큼 돌린 쪽)을 보는 사각형. 밤에 켜질 창은 lit, 나머지는 dark 쪽에 유리색으로. */
const paneCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const DARK_GLASS = GLASS.clone().multiplyScalar(0.8);
function windowPane(lit: Builder, dark: Builder, rand: () => number, litRatio: number, x: number, y: number, z: number, angle: number, w: number, h: number): void {
  // 면을 따라가는 가로 방향 (평면의 +x 를 angle 만큼 돌린 것)
  const ax = Math.cos(angle) * (w / 2);
  const az = -Math.sin(angle) * (w / 2);
  const [a, b, c, d] = paneCorners;
  a.set(x - ax, y - h / 2, z - az);
  b.set(x + ax, y - h / 2, z + az);
  c.set(x + ax, y + h / 2, z + az);
  d.set(x - ax, y + h / 2, z - az);
  if (rand() < litRatio) lit.quad(a, b, c, d, GLASS);
  else dark.quad(a, b, c, d, DARK_GLASS);
}

/** 축에 나란한 상자 건물의 바다 쪽을 뺀 세 면(-x, +z, -z)에 창문 격자를 붙인다. */
function windowGrid(lit: Builder, dark: Builder, rand: () => number, litRatio: number, cx: number, y0: number, cz: number, w: number, h: number, d: number, floor: number, col: number, pane: [number, number]): void {
  const faces: [number, number, number, number][] = [
    // 면 중심 오프셋 x, z, 면의 너비, 회전
    [-w / 2 - 0.06, 0, d, -Math.PI / 2],
    [0, d / 2 + 0.06, w, 0],
    [0, -d / 2 - 0.06, w, Math.PI],
  ];
  for (const [ox, oz, width, angle] of faces) {
    const cols = Math.max(1, Math.floor((width - 1) / col));
    const rows = Math.max(1, Math.floor((h - 2) / floor));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = (c + 0.5) / cols - 0.5;
        const along = t * (width - 1);
        // 면을 따라가는 방향: 회전 angle 의 오른쪽
        const ax = Math.cos(angle) * along;
        const az = -Math.sin(angle) * along;
        windowPane(lit, dark, rand, litRatio, cx + ox + ax, y0 + 2 + (r + 0.5) * floor, cz + oz + az, angle, pane[0], pane[1]);
      }
    }
  }
}

/** 박공 지붕 집. 앞면(+z, -x)에 창 한두 개. */
function house(solid: Builder, lit: Builder, rand: () => number, x: number, y: number, z: number, s: number): void {
  const w = (3.6 + rand() * 2.4) * s;
  const d = (3.2 + rand() * 2) * s;
  const h = (2.6 + (rand() < 0.35 ? 2.6 : 0) + rand() * 1.2) * s;
  solid.add(box(w, h, d), WALLS[Math.floor(rand() * WALLS.length)], x, y - 0.5, z, 0, 1, 1, 1, 0.03);
  // 지붕: 네모뿔을 늘려 박공처럼 보이게
  const roof = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  solid.add(roof, ROOFS[Math.floor(rand() * ROOFS.length)], x, y - 0.5 + h, z, 0, w * 1.25, h * 0.45 + 1.2 * s, d * 1.25, 0.05);
  windowPane(lit, solid, rand, 0.75, x - w / 2 - 0.06, y - 0.5 + h * 0.55, z, -Math.PI / 2, 0.9 * s, 1.1 * s);
  windowPane(lit, solid, rand, 0.75, x, y - 0.5 + h * 0.55, z + d / 2 + 0.06, 0, 0.9 * s, 1.1 * s);
}

function pine(solid: Builder, x: number, y: number, z: number, s: number): void {
  solid.add(new THREE.CylinderGeometry(0.3, 0.4, 2, 5).translate(0, 1, 0), C('#7a5235'), x, y, z, 0, s, s, s);
  solid.add(new THREE.ConeGeometry(2, 4, 6).translate(0, 3.6, 0), FOREST, x, y, z, 0, s, s, s, 0.08);
  solid.add(new THREE.ConeGeometry(1.4, 3, 6).translate(0, 5.6, 0), FOREST, x, y, z, 0.5, s, s, s, 0.08);
}

/** 등대: 흰 탑, 빨간 띠, 난간, 등실(밤에 빛남), 빨간 지붕 */
function lighthouse(solid: Builder, beacon: Builder, x: number, y: number, z: number, s: number): void {
  solid.add(new THREE.CylinderGeometry(3.2, 3.6, 2, 10), STONE, x, y + 1 * s, z, 0, s, s, s);
  solid.add(new THREE.CylinderGeometry(1.7, 2.5, 18, 10).translate(0, 9, 0), WHITE, x, y + 2 * s, z, 0, s, s, s, 0.02);
  solid.add(new THREE.CylinderGeometry(2.15, 2.3, 3, 10), RED, x, y + 8 * s, z, 0, s, s, s, 0.02);
  solid.add(new THREE.CylinderGeometry(1.9, 2.05, 2.6, 10), RED, x, y + 15 * s, z, 0, s, s, s, 0.02);
  solid.add(new THREE.CylinderGeometry(2.6, 2.6, 0.6, 10), STONE, x, y + 20.3 * s, z, 0, s, s, s);
  beacon.add(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 8), LAMP, x, y + 21.8 * s, z, 0, s, s, s, 0);
  solid.add(new THREE.ConeGeometry(2.1, 2.6, 10), RED, x, y + 24.3 * s, z, 0, s, s, s, 0.02);
}

/** 섬 하나: 물 아래에서 솟은 절벽과 풀 덮인 꼭대기 */
function island(solid: Builder, rand: () => number, x: number, top: number, z: number, r: number, bottom: number, sx = 1): void {
  const h = top - bottom;
  const g = new THREE.CylinderGeometry(r * 0.82, r, h, 12, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  g.dispose();
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rand() - 0.5) * 0.18;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) + (p.getY(i) > h / 2 - 0.01 ? 0 : (rand() - 0.5) * 2), p.getZ(i) * k);
  }
  solid.add(m, CLIFF, x, bottom + h / 2, z, 0, sx, 1, 1, 0.06);
  // 꼭대기 풀밭
  const lawn = new THREE.CylinderGeometry(r * 0.8, r * 0.82, 0.6, 12);
  solid.add(lawn, GRASS, x, top + 0.2, z, 0, sx, 1, 1, 0.05);
  // 물가 바위
  for (let i = 0; i < 7 * sx; i++) {
    const a = rand() * Math.PI * 2;
    const s = r * (0.12 + rand() * 0.1);
    solid.add(rock(rand), STONE, x + Math.cos(a) * r * sx * 0.95, bottom + h * 0.55, z + Math.sin(a) * r * 0.95, rand() * 3, s, s * 0.7, s, 0.08);
  }
}

/** 섬 마을과 등대 (레퍼런스 낮 장면 오른쪽) */
function buildHarbor(group: THREE.Group, anchor: number, rand: () => number): void {
  const solid = new Builder(rand);
  const lit = new Builder(rand);
  const beacon = new Builder(rand);
  const R = 72;
  const cx = seaEdge(anchor + R + 40, anchor - R - 40) + 40 + R;
  const cz = anchor;
  const bottom = lowestWater(anchor + R, anchor - R) - 10;
  const top = waterY(anchor) + 7;
  island(solid, rand, cx, top, cz, R, bottom);
  // 뒤쪽 언덕: 마을이 비탈을 따라 올라가는 느낌
  solid.add(rock(rand, 1, 0.12), GRASS, cx + R * 0.25, top - 4, cz - R * 0.1, rand(), R * 0.55, 16, R * 0.5, 0.06);
  // 집들: 앞쪽(도로 쪽) 평지와 언덕 비탈에
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * R * 0.68;
    const hx = cx + Math.cos(a) * rr;
    const hz = cz + Math.sin(a) * rr;
    // 언덕 위면 그만큼 올린다 (언덕 타원체 높이 근사)
    const dx = (hx - (cx + R * 0.25)) / (R * 0.55);
    const dz = (hz - (cz - R * 0.1)) / (R * 0.5);
    const hill = Math.max(0, 1 - dx * dx - dz * dz);
    const y = top + 0.4 + (hill > 0 ? Math.sqrt(hill) * 12 - 2 : 0);
    if (Math.hypot(hx - (cx - R * 0.55), hz - (cz + R * 0.5)) < 14) continue; // 등대 자리
    house(solid, lit, rand, hx, Math.max(y, top + 0.4), hz, 2.3);
  }
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const rr = (0.5 + rand() * 0.25) * R;
    pine(solid, cx + Math.cos(a) * rr, top + 0.4, cz + Math.sin(a) * rr, 1.2 + rand() * 0.8);
  }
  // 등대는 도로 쪽, 다가오는 차에서 잘 보이는 끝자리에
  lighthouse(solid, beacon, cx - R * 0.55, top + 0.4, cz + R * 0.5, 2.2);
  addMeshes(group, solid, lit, beacon);
}

/** 만(灣)의 배치: 다리가 시작하는 x 와 다리·도시 아래 가장 낮은 수면 */
function bayLayout(anchor: number): { x0: number; water: number } {
  return { x0: seaEdge(anchor + 80, anchor - 120) + 60, water: lowestWater(anchor + 60, anchor - 420) };
}

/** 현수교 (레퍼런스 노을 장면). 다가오는 차에서 옆모습이 보이게 바다를 가로지른다. */
function buildBridge(group: THREE.Group, anchor: number, rand: () => number): void {
  const solid = new Builder(rand);
  const lit = new Builder(rand);
  const beacon = new Builder(rand);
  const { x0, water } = bayLayout(anchor);
  const L = 380;
  const T1 = 95, T2 = 285; // 주탑 위치
  const theta = 0.12; // 먼 끝이 살짝 앞쪽(-z)으로
  const dir = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
  const start = new THREE.Vector3(x0, 0, anchor);
  const deck = waterY(anchor) + 14;
  const at = (s: number, y: number, lateral = 0) =>
    new THREE.Vector3(start.x + dir.x * s - dir.z * lateral, y, start.z + dir.z * s + dir.x * lateral);
  const rotY = Math.atan2(dir.x, dir.z); // 상자의 +z 를 다리 방향으로

  // 양 끝 교대: 바위 곶
  for (const s of [-16, L + 16]) {
    const p = at(s, 0);
    solid.add(rock(rand, 1, 0.14), CLIFF, p.x, water, p.z, rand(), 26, deck - water + 2, 22, 0.08);
  }
  // 상판
  const mid = at(L / 2, 0);
  solid.add(box(10, 1.8, L + 20), C('#d8d2e4'), mid.x, deck - 1.8, mid.z, rotY, 1, 1, 1, 0.02);
  solid.add(box(10.6, 0.6, L + 20), BRIDGE, mid.x, deck - 2.4, mid.z, rotY, 1, 1, 1, 0.02);
  // 접속교 교각
  for (let s = 32; s < L - 10; s += 32) {
    if (Math.abs(s - T1) < 14 || Math.abs(s - T2) < 14 || (s > T1 && s < T2)) continue;
    const p = at(s, 0);
    solid.add(box(3.2, deck - water + 4, 3.2), STONE, p.x, water - 6, p.z, rotY);
  }
  // 주탑 두 개
  const towerTop = deck + 52;
  for (const s of [T1, T2]) {
    const base = at(s, 0);
    solid.add(box(16, 8, 10), STONE, base.x, water - 6, base.z, rotY);
    for (const side of [-5.8, 5.8]) {
      const leg = at(s, 0, side);
      solid.add(box(2.8, towerTop - water + 2, 3), BRIDGE, leg.x, water, leg.z, rotY, 1, 1, 1, 0.03);
      beacon.add(box(1.4, 1.4, 1.4), RED, leg.x, towerTop + 2.4, leg.z, 0, 1, 1, 1, 0);
    }
    for (const y of [deck + 14, deck + 32, towerTop - 2]) {
      const c = at(s, y);
      solid.add(box(14, 2.4, 2), BRIDGE, c.x, y, c.z, rotY, 1, 1, 1, 0.03);
    }
  }
  // 주케이블: 탑 사이는 늘어진 포물선, 양 끝은 상판으로 내려온다
  const side = T1;
  const cableY = (s: number) => {
    if (s <= T1) return deck + 1 + (towerTop - deck - 1) * (s / side) - Math.sin((Math.PI * s) / side) * 4;
    if (s >= T2) return deck + 1 + (towerTop - deck - 1) * ((L - s) / side) - Math.sin((Math.PI * (L - s)) / side) * 4;
    const t = (s - (T1 + T2) / 2) / ((T2 - T1) / 2);
    return deck + 3 + (towerTop - deck - 3) * t * t;
  };
  const STEP = 9.5;
  for (const lat of [-5.8, 5.8]) {
    for (let s = 0; s < L; s += STEP) {
      const s1 = Math.min(s + STEP, L);
      const a = at(s, cableY(s), lat);
      const b = at(s1, cableY(s1), lat);
      const len = a.distanceTo(b);
      // a → b 방향으로 눕힌 가는 상자
      const g = new THREE.BoxGeometry(0.8, 0.8, len).rotateX(-Math.asin((b.y - a.y) / len));
      solid.add(g, BRIDGE, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, rotY, 1, 1, 1, 0);
    }
    // 행어: 케이블에서 상판으로 내려오는 가는 줄
    for (let s = 8; s < L - 4; s += 9.5) {
      const y = cableY(s);
      if (y - deck < 1.5) continue;
      const p = at(s, deck, lat);
      solid.add(box(0.3, y - deck, 0.3), C('#f0a090'), p.x, deck, p.z, rotY, 1, 1, 1, 0);
    }
    // 가로등: 상판 가장자리를 따라
    for (let s = 6; s < L; s += 16) {
      const p = at(s, deck, lat * 0.85);
      beacon.add(box(1.1, 1.1, 1.1), LAMP, p.x, deck + 2.4, p.z, 0, 1, 1, 1, 0);
    }
  }

  addMeshes(group, solid, lit, beacon);
}

/** 다리 너머 맞은편 해안의 도시 (다가오는 차에서 다리 뒤로 스카이라인이 보인다) */
function buildCity(group: THREE.Group, anchor: number, rand: () => number): void {
  const solid = new Builder(rand);
  const lit = new Builder(rand);
  const beacon = new Builder(rand);
  const { x0, water } = bayLayout(anchor);
  const R = 70;
  const SX = 2.0;
  const city = new THREE.Vector3(x0 + 90 + R * SX, 0, anchor - 175);
  const top = waterY(anchor) + 3;
  island(solid, rand, city.x, top, city.z, R, water - 10, SX);
  const placed: [number, number, number][] = [];
  for (let i = 0; i < 160 && placed.length < 70; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * 0.74;
    const x = city.x + Math.cos(a) * rr * R * SX;
    const z = city.z + Math.sin(a) * rr * R;
    const w = 9 + rand() * 9;
    if (placed.some(([px, pz, pw]) => Math.abs(px - x) < (pw + w) / 2 + 2 && Math.abs(pz - z) < (pw + w) / 2 + 2)) continue;
    placed.push([x, z, w]);
    // 가운데로 갈수록 높은 스카이라인
    const core = Math.exp(-((rr / 0.42) ** 2));
    const h = 12 + core * (40 + rand() * 50) + rand() * 14;
    const d = w * (0.8 + rand() * 0.4);
    const color = TOWERS[Math.floor(rand() * TOWERS.length)];
    solid.add(box(w, h, d), color, x, top, z, 0, 1, 1, 1, 0.03);
    windowGrid(lit, solid, rand, 0.6, x, top, z, w, h, d, 5, 3.6, [2.2, 2.8]);
    if (h > 45 && rand() < 0.6) {
      // 꼭대기 단 + 안테나 경고등
      solid.add(box(w * 0.6, 7, d * 0.6), color, x, top + h, z, 0, 1, 1, 1, 0.03);
      solid.add(box(0.5, 7, 0.5), STONE, x, top + h + 7, z, 0, 1, 1, 1, 0);
      beacon.add(box(1.3, 1.3, 1.3), RED, x, top + h + 14, z, 0, 1, 1, 1, 0);
    }
  }
  // 물가 가로등 줄 (밤에 점점이)
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    beacon.add(box(1.1, 1.1, 1.1), LAMP, city.x + Math.cos(a) * R * SX * 0.8, top + 3, city.z + Math.sin(a) * R * 0.8, 0, 1, 1, 1, 0);
  }
  addMeshes(group, solid, lit, beacon);
}

/** 도로 중심에서 옆으로 lateral, 위로 lift 만큼 떨어진 점 (chunks.ts 의 roadPoint 와 같다) */
function roadPoint(z: number, lateral: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const dx = roadDX(z);
  const len = Math.hypot(dx, 1);
  return out.set(roadX(z) + lateral / len, roadY(z) + lift, z - (dx / len) * lateral);
}

/** 도로를 덮는 바위산 터널 (레퍼런스 낮 장면 왼쪽) */
function buildTunnel(group: THREE.Group, anchor: number, rand: () => number): void {
  const rockFace = new Builder(rand);
  const inside = new Builder(rand);
  const lamps = new Builder(rand);
  const HALF = 45;
  const z0 = anchor + HALF;
  const z1 = anchor - HALF;
  const seed = anchor * 0.013;
  // 단면: 세로 벽(높이 3) 위에 반원 지붕. 안쪽 반지름 7, 입구 테두리 바깥 8.6
  const arc = (r: number) => {
    const pts: [number, number][] = [[-r, 0]];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      pts.push([Math.cos(a) * r, 3 + Math.sin(a) * r]);
    }
    pts.push([r, 0]);
    return pts;
  };
  const inner = arc(7);
  const rim = arc(8.6);
  const INSIDE = C('#c9c0d8');
  const CEILING = C('#f0d2cc');
  const PORTAL = C('#f3ead6');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const e3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // 터널 안쪽 벽과 천장 조명
  const STEP = 3;
  for (let z = z0; z > z1; z -= STEP) {
    const zn = Math.max(z - STEP, z1);
    for (let i = 0; i < inner.length - 1; i++) {
      roadPoint(z, inner[i][0], inner[i][1], a);
      roadPoint(z, inner[i + 1][0], inner[i + 1][1], b);
      roadPoint(zn, inner[i + 1][0], inner[i + 1][1], c);
      roadPoint(zn, inner[i][0], inner[i][1], d);
      // 안쪽 면은 터널 중심축을 본다
      const axis = roadPoint(z, 0, 3, e3).sub(a);
      // 천장은 아래를 보아 하늘빛(초록 땅빛)을 받으니 따뜻한 색으로 기울여 둔다
      const tone = i === 0 || i === inner.length - 2 ? INSIDE : CEILING;
      inside.facingQuad(a, b, c, d, axis, tone.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.04));
    }
    if (Math.round((z0 - z) / STEP) % 3 === 1) {
      for (const lat of [-2.6, 2.6]) {
        const p = roadPoint(z, lat, 9.55);
        lamps.add(new THREE.BoxGeometry(0.7, 0.2, 1.6), LAMP, p.x, p.y, p.z, Math.atan(-roadDX(z)), 1, 1, 1, 0);
      }
    }
  }

  // 터널을 덮는 바위산: 도로를 따라 휘는 높이장. 가운데는 지붕(11.6)보다 늘 높고,
  // 왼쪽은 산으로, 오른쪽은 바다 쪽 비탈 아래까지 내려간다.
  const ground = (lat: number) => (lat < 0 ? -1 : -1 - Math.max(0, lat - 10) * 0.4);
  const hillH = (lat: number, z: number) => {
    const core = 15 + noise2(lat / 9 + seed, z / 14 + seed) * 8;
    const t = lat < 0 ? (-lat - 10) / 34 : (lat - 10) / 24;
    const f = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
    // 가장자리로 갈수록 울퉁불퉁하게
    const bump = (noise2(lat / 5 + 40, z / 6 + seed) - 0.5) * 5 * (1 - f) * f * 4;
    return ground(lat) + (core - ground(lat)) * f + bump;
  };
  // 옆 방향 표본점: 입구 테두리 점과 똑같이 맞춰야 정면과 산 사이에 틈이 안 생긴다
  const lats: number[] = [];
  for (let l = -44; l < -9; l += 3.5) lats.push(l);
  for (const [x] of rim) lats.push(x);
  for (let l = 12; l <= 34; l += 3.5) lats.push(l);
  lats.sort((p, q) => p - q);
  const uniq = lats.filter((v, i) => i === 0 || Math.abs(v - lats[i - 1]) > 0.01);
  const rows: number[] = [];
  for (let z = z0; z > z1; z -= 6) rows.push(z);
  rows.push(z1);
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const face = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    n.crossVectors(e1.subVectors(q, p), e2.subVectors(r, p)).normalize();
    const color = Math.abs(n.y) > 0.8 ? GRASS : CLIFF;
    rockFace.facing(p, q, r, UP, color.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.06));
  };
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < uniq.length - 1; i++) {
      roadPoint(rows[j], uniq[i], hillH(uniq[i], rows[j]), a);
      roadPoint(rows[j], uniq[i + 1], hillH(uniq[i + 1], rows[j]), b);
      roadPoint(rows[j + 1], uniq[i + 1], hillH(uniq[i + 1], rows[j + 1]), c);
      roadPoint(rows[j + 1], uniq[i], hillH(uniq[i], rows[j + 1]), d);
      face(a, b, c);
      face(a, c, d);
    }
  }
  // 양쪽 입구의 절벽 정면: 산 높이에서 땅(아치 자리는 테두리 위)까지 내려오는 벽
  const rimTop = (lat: number) => {
    const k = rim.findIndex(([x]) => Math.abs(x - lat) < 0.01);
    return k >= 0 ? rim[k][1] : null;
  };
  for (const z of [z0, z1]) {
    // 정면은 터널 밖(도로 진행 방향의 반대쪽 끝은 +z 쪽)을 본다
    const out = new THREE.Vector3(roadDX(z), 0, 1).multiplyScalar(z === z0 ? 1 : -1);
    for (let i = 0; i < uniq.length - 1; i++) {
      const l0 = uniq[i], l1 = uniq[i + 1];
      const inArch = l0 >= -8.61 && l1 <= 8.61;
      const lo0 = inArch ? rimTop(l0)! : ground(l0) - 1;
      const lo1 = inArch ? rimTop(l1)! : ground(l1) - 1;
      roadPoint(z, l0, lo0, a);
      roadPoint(z, l1, lo1, b);
      roadPoint(z, l1, hillH(l1, z), c);
      roadPoint(z, l0, hillH(l0, z), d);
      rockFace.facingQuad(a, b, c, d, out, CLIFF.clone().multiplyScalar(0.96).offsetHSL(0, 0, (rand() - 0.5) * 0.06));
    }
    // 입구 테두리 (밝은 돌)
    for (let i = 0; i < inner.length - 1; i++) {
      roadPoint(z, inner[i][0], inner[i][1], a);
      roadPoint(z, inner[i + 1][0], inner[i + 1][1], b);
      roadPoint(z, rim[i + 1][0], rim[i + 1][1], c);
      roadPoint(z, rim[i][0], rim[i][1], d);
      rockFace.facingQuad(a, b, c, d, out, PORTAL);
    }
  }
  // 산 위의 나무
  for (let i = 0; i < 16; i++) {
    const lat = -30 + rand() * 45;
    const z = z1 + 6 + rand() * (z0 - z1 - 12);
    const p = roadPoint(z, lat, hillH(lat, z) - 0.3);
    pine(rockFace, p.x, p.y, p.z, 1 + rand() * 0.8);
  }

  for (const mesh of [rockFace.build(tunnelMaterial)!, inside.build(tunnelInsideMaterial)!]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const l = lamps.build(tunnelLampMaterial);
  if (l) group.add(l);
}

function addMeshes(group: THREE.Group, solid: Builder, lit: Builder, beacon: Builder): void {
  for (const mesh of [solid.build(solidMaterial), lit.build(windowMaterial), beacon.build(beaconMaterial)]) {
    if (mesh) group.add(mesh);
  }
}

type Part = (group: THREE.Group, anchor: number, rand: () => number) => void;
/** 랜드마크마다 나눠 만드는 조각. 한 프레임에 한 조각만 만들어 끊김을 줄인다. */
const PARTS: Record<Kind, Part[]> = {
  harbor: [buildHarbor],
  bay: [buildBridge, buildCity],
  tunnel: [buildTunnel],
};

interface Section {
  group: THREE.Group;
  built: number;
}

/** 차 앞쪽 구간의 랜드마크를 만들고, 지나간 것은 버린다. */
export class Landmarks {
  private sections = new Map<number, Section>();

  constructor(private scene: THREE.Scene) {}

  static kindAt(section: number): Kind {
    return KINDS[((section % KINDS.length) + KINDS.length) % KINDS.length];
  }

  static anchorOf(section: number): number {
    return -(section * SECTION + FIRST);
  }

  update(carZ: number, night: number): void {
    // 밤 정도에 따라 불빛 밝기만 바꾼다 (재질 공유라 랜드마크 수와 무관하게 상수 비용)
    windowMaterial.emissive.copy(WINDOW_GLOW).multiplyScalar(night * 1.4);
    beaconMaterial.color.setScalar(0.85 + night * 1.6);

    const min = Math.ceil((-carZ - BEHIND - FIRST) / SECTION);
    const max = Math.floor((-carZ + AHEAD - FIRST) / SECTION);
    for (const [s, section] of this.sections) {
      if (s < min || s > max) {
        this.scene.remove(section.group);
        section.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
        this.sections.delete(s);
      }
    }
    // 한 프레임에 한 조각만 만든다
    for (let s = Math.max(min, 0); s <= max; s++) {
      let section = this.sections.get(s);
      const parts = PARTS[Landmarks.kindAt(s)];
      if (section && section.built >= parts.length) continue;
      if (!section) {
        section = { group: new THREE.Group(), built: 0 };
        this.sections.set(s, section);
        this.scene.add(section.group);
      }
      parts[section.built](section.group, Landmarks.anchorOf(s), mulberry32(s * 7919 + section.built * 31 + 101));
      section.built++;
      break;
    }
  }
}
