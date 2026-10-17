import * as THREE from 'three';

export type CarId = 'classic' | 'hatch' | 'sports' | 'suv' | 'van';
type Style = 'sedan' | 'hatch' | 'sports' | 'suv' | 'van';

export interface CarSpec {
  id: CarId;
  name: string;
  style: Style;
  /** 차체 색, 윗부분(캐빈) 색(투톤일 때), 유리 색 */
  color: string;
  upper?: string;
  glass: string;
  length: number;
  width: number;
  /** 차체 바닥 높이 */
  bottom: number;
  /** 차체 윗선 [z, y]. 앞(-z)에서 뒤(+z) 순서 */
  top: [number, number][];
  /** 캐빈: 앞유리 시작, 지붕 앞, 지붕 뒤, 뒷유리 끝(z), 지붕 높이, 지붕 좁아짐(1=수직), 기둥 위치 */
  cabin: { front: number; roofFront: number; roofRear: number; rear: number; height: number; top: number; pillars: number[] };
  /** 바퀴: 반지름, 폭, 앞/뒤 z */
  wheel: { r: number; width: number; zFront: number; zRear: number };
  /** 최고 속도(m/s) */
  maxSpeed: number;
  /** 운전석 눈 위치 z. 운전석 뷰의 카메라와 핸들·대시보드 위치가 여기서 정해진다. */
  seatZ: number;
}

export const CARS: CarSpec[] = [
  {
    // 시안의 주인공 차 (기본 차종)
    id: 'classic', name: 'Classic', style: 'sedan',
    color: '#a6d8d4', glass: '#41607c',
    length: 4.3, width: 1.86, bottom: 0.3,
    top: [[-2.15, 0.78], [-1.9, 0.9], [-0.8, 0.97], [1.25, 0.99], [2.15, 0.93]],
    cabin: { front: -0.8, roofFront: -0.22, roofRear: 0.72, rear: 1.28, height: 0.56, top: 0.9, pillars: [0.24] },
    wheel: { r: 0.36, width: 0.26, zFront: -1.35, zRear: 1.32 },
    maxSpeed: 33, seatZ: 0.12,
  },
  {
    id: 'hatch', name: 'Hatchback', style: 'hatch',
    color: '#e85d5d', glass: '#41607c',
    length: 3.95, width: 1.8, bottom: 0.3,
    top: [[-1.98, 0.74], [-1.75, 0.87], [-0.7, 0.95], [1.98, 0.98]],
    cabin: { front: -0.7, roofFront: -0.12, roofRear: 1.5, rear: 1.92, height: 0.6, top: 0.9, pillars: [0.55] },
    wheel: { r: 0.35, width: 0.26, zFront: -1.25, zRear: 1.25 },
    maxSpeed: 33, seatZ: 0.22,
  },
  {
    id: 'sports', name: 'Sports', style: 'sports',
    color: '#f2c14e', glass: '#2e3b4e',
    length: 4.5, width: 1.98, bottom: 0.24,
    top: [[-2.25, 0.54], [-1.95, 0.74], [-1.4, 0.8], [-0.55, 0.8], [1.3, 0.84], [2.25, 0.86]],
    cabin: { front: -0.55, roofFront: 0.08, roofRear: 0.55, rear: 1.8, height: 0.42, top: 0.84, pillars: [] },
    wheel: { r: 0.34, width: 0.32, zFront: -1.45, zRear: 1.4 },
    maxSpeed: 44, seatZ: 0.5,
  },
  {
    id: 'suv', name: 'SUV', style: 'suv',
    color: '#e07a5f', glass: '#41607c',
    length: 4.4, width: 2.0, bottom: 0.55,
    top: [[-2.2, 1.05], [-1.95, 1.18], [-0.9, 1.25], [2.2, 1.28]],
    cabin: { front: -0.9, roofFront: -0.42, roofRear: 2.0, rear: 2.14, height: 0.72, top: 0.95, pillars: [0.36, 1.42] },
    wheel: { r: 0.46, width: 0.36, zFront: -1.4, zRear: 1.4 },
    maxSpeed: 28, seatZ: -0.05,
  },
  {
    id: 'van', name: 'Retro Van', style: 'van',
    color: '#7fb2e0', upper: '#f4f1e8', glass: '#3f5d7a',
    length: 4.3, width: 1.95, bottom: 0.38,
    top: [[-2.15, 1.04], [-1.95, 1.12], [2.15, 1.12]],
    cabin: { front: -2.1, roofFront: -1.88, roofRear: 1.96, rear: 2.12, height: 0.85, top: 0.95, pillars: [-1.15, -0.25, 0.65] },
    wheel: { r: 0.4, width: 0.3, zFront: -1.35, zRear: 1.4 },
    maxSpeed: 26, seatZ: -1.35,
  },
];

export function getSpec(id: string | null): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

export interface CarModel {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  headlight: THREE.SpotLight;
  tail: THREE.MeshBasicMaterial;
  wheelRadius: number;
  cockpit: Cockpit;
}

/** 운전석 뷰에서만 보이는 실내. 차체 껍데기는 안쪽에서 보면 면이 뒤집혀 그려지지 않으므로 따로 만든다. */
export interface Cockpit {
  /** 대시보드·기둥·천장·문 + 계기판 + 핸들. 평소에는 숨겨 둔다. */
  group: THREE.Group;
  /** 핸들 (자기 축으로 돌린다) */
  steering: THREE.Object3D;
  /** 운전석 눈 위치 (차 기준 좌표) */
  eye: THREE.Vector3;
  /** 눈을 뒤로 물릴 수 있는 거리 (천장 안쪽에 머무는 만큼, m) */
  maxBack: number;
  /** 계기판·화면. 밤에는 은은하게 빛난다. */
  dial: THREE.MeshBasicMaterial;
  /** 실내 재질. 밤낮 밝기를 색으로 맞춘다. */
  interior: THREE.MeshBasicMaterial;
  /** 운전석에서는 안 보여 숨겨도 되는 것 (바퀴, 후미등) */
  hidden: THREE.Object3D[];
}

const CHROME = '#e4e6ee';
const DARK = '#3b3748';
const DASH = '#5d5670';
const TRIM = '#f1ebe0';
const FASCIA = '#6d6583';
const VENT = '#8a83a0';
const GLOVEBOX = '#7a7290';

/**
 * 삼각형을 모아 하나의 지오메트리로 만든다. 색은 버텍스 컬러로 넣어
 * 차체·유리·크롬 등 여러 부품이 한 번의 draw call로 그려진다.
 */
class Builder {
  private pos: number[] = [];
  private col: number[] = [];
  private nor: number[] = [];
  private c = new THREE.Color();

  constructor(private withNormals = false) {}

  tri(a: number[], b: number[], d: number[], color: THREE.Color): void {
    this.pos.push(...a, ...b, ...d);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }

  /** 기존 지오메트리를 색을 입혀 합친다. 받은 지오메트리는 정리한다. */
  add(g: THREE.BufferGeometry, color: string): void {
    const n = g.index ? g.toNonIndexed() : g;
    const p = n.attributes.position;
    const nr = n.attributes.normal;
    this.c.set(color);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
      if (this.withNormals) this.nor.push(nr.getX(i), nr.getY(i), nr.getZ(i));
    }
    if (n !== g) n.dispose();
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.withNormals) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    else g.computeVertexNormals();
    return g;
  }
}

/** 단면의 오른쪽 절반 (x 비율, y 비율). 아래 중앙에서 시작해 위 중앙에서 끝난다. */
type Ring = [number, number][];
const BODY_RING: Ring = [[0, 0], [0.86, 0], [0.97, 0.08], [1, 0.3], [1, 0.62], [0.985, 0.8], [0.94, 0.93], [0.82, 1], [0.3, 1], [0.12, 1], [0, 1]];
const CABIN_RING: Ring = [[0, 0], [1, 0], [0.99, 0.12], [0.93, 0.84], [0.88, 0.95], [0.78, 1], [0.3, 1], [0.12, 1], [0, 1]];
const ROUND_RING: Ring = [[0, 0], [0.7, 0], [0.95, 0.1], [1, 0.35], [1, 0.65], [0.95, 0.9], [0.7, 1], [0, 1]];

interface Section {
  z: number;
  y0: number;
  y1: number;
  /** 아래쪽 반폭 */
  hw: number;
  /** 위로 갈수록 좁아지는 비율 (1 = 수직) */
  top?: number;
  x?: number;
}

/** 면 색을 고른다. xf, yf: 변 중앙의 단면 좌표 비율, seg: 몇 번째 단면 사이인지 */
type Paint = (xf: number, yf: number, seg: number) => THREE.Color;

/**
 * 단면을 z 방향으로 이어 붙여 둥근 덩어리를 만든다 (로프트).
 * flat shading이라 면이 살짝 꺾여 보이는 로우폴리 느낌이 난다.
 */
function loft(b: Builder, sections: Section[], ring: Ring, paint: Paint, capColor: THREE.Color): void {
  // 오른쪽 절반 + 거울 왼쪽 절반 (양 끝 중앙점 제외) = 닫힌 고리
  const full: Ring = [...ring, ...ring.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];
  const n = full.length;
  const pts = sections.map((s) => full.map(([xf, yf]) => {
    const narrow = 1 - (1 - (s.top ?? 1)) * yf;
    return [(s.x ?? 0) + xf * s.hw * narrow, s.y0 + yf * (s.y1 - s.y0), s.z];
  }));
  for (let s = 0; s < sections.length - 1; s++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const color = paint(Math.abs(full[k][0] + full[k2][0]) / 2, (full[k][1] + full[k2][1]) / 2, s);
      b.tri(pts[s][k], pts[s][k2], pts[s + 1][k], color);
      b.tri(pts[s][k2], pts[s + 1][k2], pts[s + 1][k], color);
    }
  }
  // 앞(-z)과 뒤(+z) 마개
  for (const [s, front] of [[0, true], [sections.length - 1, false]] as const) {
    const ring2 = pts[s];
    const c = [sections[s].x ?? 0, (sections[s].y0 + sections[s].y1) / 2, sections[s].z];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      if (front) b.tri(c, ring2[k2], ring2[k], capColor);
      else b.tri(c, ring2[k], ring2[k2], capColor);
    }
  }
}

/** z0~z1 사이에 모서리가 둥근 막대(범퍼, 램프, 그릴 등)를 만든다. */
function bar(b: Builder, x: number, y: number, z0: number, z1: number, hw: number, hh: number, color: string): void {
  const c = new THREE.Color(color);
  const sec = (z: number): Section => ({ z, x, y0: y - hh, y1: y + hh, hw });
  loft(b, [sec(z0), sec(z1)], ROUND_RING, () => c, c);
}

/** z에서 선을 따라 직선 보간 */
function lerpLine(line: [number, number][], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [z1, y1] = line[i];
    if (z <= z1) {
      const [z0, y0] = line[i - 1];
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
  }
  return line[line.length - 1][1];
}

/** 직접 만든 로우폴리 차량. 차체는 단면을 이어 붙여 둥글게, 앞바퀴는 wheels[0], wheels[1]. */
export function buildCar(spec: CarSpec): CarModel {
  const root = new THREE.Group();
  const { wheel: w, cabin: cb, style } = spec;
  const L = spec.length;
  const halfL = L / 2;
  const hw0 = spec.width / 2;
  const body = new Builder();
  const paint = new THREE.Color(spec.color);
  const upper = new THREE.Color(spec.upper ?? spec.color);
  const glass = new THREE.Color(spec.glass);
  const dark = new THREE.Color(DARK);
  const stripe = new THREE.Color('#2f2a3a');

  const topAt = (z: number): number => lerpLine(spec.top, z);
  const hwAt = (z: number): number => {
    const t = Math.abs(z) / halfL;
    return t > 0.7 ? hw0 * (1 - 0.06 * ((t - 0.7) / 0.3) ** 2) : hw0;
  };
  // 바퀴집: 바퀴 위로 차체 아랫선이 반원을 그리며 올라간다
  const arch = w.r * 1.1;
  const wheelZ = [w.zFront, w.zRear];
  const bottomAt = (z: number): number => {
    let y = spec.bottom;
    for (const wz of wheelZ) {
      const d = Math.abs(z - wz);
      if (d <= arch + 1e-4) y = Math.max(y, w.r + Math.sqrt(Math.max(arch * arch - d * d, 0)));
    }
    return y;
  };

  // ── 차체 아랫부분
  const zs: number[] = [];
  const step = 0.32;
  for (let z = -halfL + 0.14; z <= halfL - 0.14; z += step) {
    if (wheelZ.every((wz) => Math.abs(z - wz) > arch + 0.06)) zs.push(z);
  }
  for (const wz of wheelZ) {
    for (let i = 0; i <= 8; i++) zs.push(wz - arch * Math.cos((i / 8) * Math.PI));
    zs.push(wz - arch - 0.02, wz + arch + 0.02);
  }
  zs.push(-halfL + 0.14, halfL - 0.14);
  zs.sort((a, b) => a - b);
  const lower: Section[] = [];
  const chamfer = (z: number, k: number): Section => {
    const y0 = bottomAt(z);
    const y1 = topAt(z);
    return { z, y0: y0 + k * 0.06, y1: y1 - k * 0.06, hw: hwAt(z) * (1 - k * 0.07), top: 0.97 };
  };
  lower.push(chamfer(-halfL, 1));
  let last = -Infinity;
  for (const z of zs) {
    if (z - last < 0.015) continue;
    last = z;
    lower.push(chamfer(z, 0));
  }
  lower.push(chamfer(halfL, 1));
  loft(body, lower, BODY_RING, (xf, yf, seg) => {
    // 줄무늬는 보닛과 지붕 위에만
    const z = lower[seg].z;
    if (style === 'sports' && yf > 0.99 && xf > 0.12 && xf < 0.3 && z < cb.front) return stripe;
    if (style === 'suv' && yf < 0.3) return dark;
    return paint;
  }, paint);

  // ── 캐빈: 기둥과 지붕은 차체 색, 창은 유리 색
  type Kind = 'front' | 'win' | 'pillar' | 'rear';
  const cabSecs: Section[] = [];
  const kinds: Kind[] = [];
  const cabSec = (z: number, h: number): Section => {
    const y0 = topAt(z) - 0.06;
    return { z, y0, y1: y0 + 0.06 + h, hw: hwAt(z) * 0.95, top: cb.top };
  };
  cabSecs.push(cabSec(cb.front, 0.02));
  kinds.push('front');
  cabSecs.push(cabSec(cb.roofFront, cb.height));
  for (const pz of cb.pillars) {
    kinds.push('win', 'pillar');
    cabSecs.push(cabSec(pz - 0.07, cb.height), cabSec(pz + 0.07, cb.height));
  }
  kinds.push('win', 'rear');
  cabSecs.push(cabSec(cb.roofRear, cb.height), cabSec(cb.rear, 0.02));
  loft(body, cabSecs, CABIN_RING, (xf, yf, seg) => {
    const kind = kinds[seg];
    if ((kind === 'front' || kind === 'rear') && yf > 0.9 && xf < 0.8) return glass;
    // 옆창은 기둥 사이 전체. 앞뒤 경사 구간까지 이어져 지붕선을 따라 비스듬히 끝난다
    if (kind !== 'pillar' && yf > 0.1 && yf < 0.85) return glass;
    if (style === 'sports' && kind === 'win' && yf > 0.99 && xf > 0.12 && xf < 0.3) return stripe;
    return upper;
  }, upper);

  // ── 범퍼, 그릴, 번호판, 하부
  const bumperColor = style === 'suv' ? DARK : style === 'sports' ? spec.color : CHROME;
  const bumperY = spec.bottom + 0.1;
  bar(body, 0, bumperY, halfL - 0.12, halfL + 0.07, hw0 * 0.97, 0.08, bumperColor);
  bar(body, 0, bumperY, -halfL - 0.07, -halfL + 0.12, hw0 * 0.97, 0.08, bumperColor);
  const frontTop = topAt(-halfL);
  const rearTop = topAt(halfL);
  const headY = Math.max(bumperY + 0.2, frontTop - (style === 'van' ? 0.32 : 0.17));
  const tailY = rearTop - (style === 'sports' ? 0.16 : 0.2);
  bar(body, 0, (bumperY + frontTop) / 2 - 0.02, -halfL - 0.02, -halfL + 0.05, hw0 * (style === 'van' ? 0.18 : 0.34), style === 'van' ? 0.05 : 0.08, '#4a4658');
  const plate = new THREE.BoxGeometry(0.52, 0.15, 0.04).translate(0, bumperY + 0.2, halfL + 0.02);
  body.add(plate, '#f7d86a');
  body.add(new THREE.BoxGeometry(spec.width * 0.82, 0.25, L * 0.86).translate(0, spec.bottom + 0.06, 0), DARK);
  // 바퀴집 안을 막아 차 너머가 비쳐 보이지 않게 하는 어두운 판
  for (const wz of wheelZ) body.add(new THREE.BoxGeometry(spec.width * 0.7, arch, arch * 1.6).translate(0, w.r + arch * 0.5, wz), DARK);
  const exhaust = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8).rotateX(Math.PI / 2).translate(hw0 * 0.55, spec.bottom + 0.02, halfL);
  body.add(exhaust, '#8d8a99');

  // 사이드 미러
  for (const sx of [-1, 1]) {
    const mz = cb.roofFront + (cb.front - cb.roofFront) * 0.35;
    const mirror = new THREE.BoxGeometry(0.14, 0.12, 0.18).translate(sx * (hwAt(mz) + 0.06), topAt(mz) + 0.12, mz);
    body.add(mirror, spec.upper ?? spec.color);
  }

  // ── 램프 (앞은 항상 밝게, 뒤는 밤에 켜짐)
  const head = new Builder();
  const tailB = new Builder();
  const lampX = hw0 * 0.66;
  for (const sx of [-1, 1]) {
    if (style === 'sedan' || style === 'hatch' || style === 'van') {
      const lens = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14).rotateX(Math.PI / 2).translate(sx * lampX, headY, -halfL - 0.02);
      head.add(lens, '#ffffff');
      const ring = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14).rotateX(Math.PI / 2).translate(sx * lampX, headY, -halfL);
      body.add(ring, CHROME);
    } else {
      bar(head, sx * lampX, headY, -halfL - 0.03, -halfL + 0.03, 0.22, style === 'suv' ? 0.1 : 0.06, '#ffffff');
    }
    if (style === 'sports') {
      // 둥근 쌍 후미등
      for (const dx of [0.1, 0.36]) {
        const g = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateX(Math.PI / 2).translate(sx * (hw0 - dx - 0.12), tailY, halfL + 0.01);
        tailB.add(g, '#ffffff');
      }
    } else if (style === 'sedan') {
      bar(tailB, sx * hw0 * 0.6, tailY, halfL - 0.03, halfL + 0.03, 0.24, 0.1, '#ffffff');
    } else {
      bar(tailB, sx * hw0 * 0.78, tailY - 0.12, halfL - 0.03, halfL + 0.03, 0.12, 0.2, '#ffffff');
    }
  }

  // ── 차종별 장식
  if (style === 'sedan' || style === 'hatch') {
    // 문 손잡이
    const handles = style === 'sedan' ? [cb.pillars[0] - 0.28, cb.pillars[0] + 0.5] : [cb.pillars[0] - 0.28];
    for (const hz of handles) for (const sx of [-1, 1]) {
      body.add(new THREE.BoxGeometry(0.03, 0.04, 0.16).translate(sx * (hwAt(hz) + 0.005), topAt(hz) - 0.1, hz), CHROME);
    }
  }
  if (style === 'sedan') {
    // 허리선 크롬 몰딩과 트렁크 트림
    for (const sx of [-1, 1]) {
      const y = topAt(0) - 0.2;
      body.add(new THREE.BoxGeometry(0.03, 0.04, L * 0.8).translate(sx * (hw0 + 0.005), y, 0), CHROME);
    }
    body.add(new THREE.BoxGeometry(hw0 * 0.6, 0.04, 0.04).translate(0, tailY, halfL + 0.01), CHROME);
  } else if (style === 'sports') {
    // 낮은 리어 윙
    body.add(new THREE.BoxGeometry(spec.width * 0.78, 0.05, 0.3).translate(0, rearTop + 0.17, halfL - 0.24), spec.color);
    for (const sx of [-1, 1]) body.add(new THREE.BoxGeometry(0.05, 0.16, 0.1).translate(sx * 0.5, rearTop + 0.07, halfL - 0.24), '#2f2a3a');
  } else if (style === 'suv') {
    const roofY = topAt(0) - 0.06 + 0.06 + cb.height;
    for (const sx of [-1, 1]) body.add(new THREE.BoxGeometry(0.07, 0.07, (cb.roofRear - cb.roofFront) * 0.85).translate(sx * hw0 * 0.72, roofY + 0.06, (cb.roofFront + cb.roofRear) / 2), '#2f2a3a');
    body.add(new THREE.BoxGeometry(hw0 * 1.1, 0.28, 1.0).translate(0, roofY + 0.2, (cb.roofFront + cb.roofRear) / 2 - 0.1), '#d9a75b');
    // 뒤에 단 스페어 타이어
    const spare = new THREE.TorusGeometry(0.3, 0.12, 6, 18).translate(0, rearTop - 0.42, halfL + 0.14);
    body.add(spare, '#2b2733');
    body.add(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14).rotateX(Math.PI / 2).translate(0, rearTop - 0.42, halfL + 0.14), spec.color);
  } else if (style === 'van') {
    // 앞의 둥근 엠블럼
    body.add(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14).rotateX(Math.PI / 2).translate(0, frontTop - 0.05, -halfL - 0.01), CHROME);
  }

  const bodyMesh = new THREE.Mesh(body.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  bodyMesh.castShadow = true;
  root.add(bodyMesh);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c2').multiplyScalar(2.5) });
  root.add(new THREE.Mesh(head.build(), lampMat));
  const tail = new THREE.MeshBasicMaterial({ color: '#8a2a2a' });
  const tailMesh = new THREE.Mesh(tailB.build(), tail);
  root.add(tailMesh);

  // ── 바퀴: 도넛 모양 타이어 + 휠캡 + 허브 + 볼트를 한 지오메트리로. 볼트가 있어 굴러가는 게 보인다.
  // 매끈한 음영 + 48분할이면 화면에서는 완전한 원으로 보인다.
  const tube = w.r * 0.3;
  const wb = new Builder(true);
  wb.add(new THREE.TorusGeometry(w.r - tube, tube, 8, 48).rotateY(Math.PI / 2).scale(w.width / (tube * 2), 1, 1), '#2b2733');
  wb.add(new THREE.CylinderGeometry(w.r - tube * 0.9, w.r - tube * 0.9, w.width * 0.7, 48).rotateZ(Math.PI / 2), '#d9dce8');
  wb.add(new THREE.CylinderGeometry(w.r * 0.3, w.r * 0.3, w.width * 0.8, 16).rotateZ(Math.PI / 2), '#aeb0bf');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    wb.add(new THREE.CylinderGeometry(0.025, 0.025, w.width * 0.86, 6).rotateZ(Math.PI / 2).translate(0, Math.cos(a) * w.r * 0.18, Math.sin(a) * w.r * 0.18), '#6f6c7c');
  }
  const wheelGeo = wb.build();
  const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wheels: THREE.Mesh[] = [];
  const wx = hw0 - w.width / 2 + 0.03;
  for (const [x, z] of [[-wx, w.zFront], [wx, w.zFront], [-wx, w.zRear], [wx, w.zRear]]) {
    const wm = new THREE.Mesh(wheelGeo, wheelMat);
    wm.position.set(x, w.r, z);
    wm.castShadow = true;
    // 조향(y) 후에 회전(x)이 적용되도록 순서를 바꾼다. 기본 순서면 핸들을 꺾을 때 바퀴축이 흔들린다.
    wm.rotation.order = 'YXZ';
    root.add(wm);
    wheels.push(wm);
  }

  const headlight = new THREE.SpotLight('#fff1c9', 0, 60, 0.5, 0.6, 1.2);
  headlight.position.set(0, headY, -halfL + 0.1);
  headlight.target.position.set(0, 0, -20);
  root.add(headlight, headlight.target);

  const cockpit = buildCockpit(spec, topAt, hwAt);
  cockpit.hidden.push(tailMesh, ...wheels);
  root.add(cockpit.group);

  return { root, wheels, headlight, tail, wheelRadius: w.r, cockpit };
}

/** a에서 c까지 이어지는 각진 기둥 */
function beam(b: Builder, a: THREE.Vector3, c: THREE.Vector3, r: number, color: string): void {
  const d = new THREE.Vector3().subVectors(c, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  b.add(g, color);
}

/**
 * 운전석 실내: 대시보드, 계기판, 핸들, A필러, 천장, 문 안쪽.
 * 실내 1 + 계기판 1 + 핸들 1 메시. 대신 운전석에서는 바퀴 4개와 후미등을 숨겨 draw call이 오히려 준다.
 */
function buildCockpit(spec: CarSpec, topAt: (z: number) => number, hwAt: (z: number) => number): Cockpit {
  const { cabin: cb, seatZ } = spec;
  const roofAt = (z: number): number => topAt(z) + cb.height;
  // 캐빈 껍데기 안쪽 반폭: 허리선 높이와 지붕 높이 (단면 고리의 둥근 윗모서리만큼 더 좁다)
  const innerLow = (z: number): number => hwAt(z) * 0.95 * 0.96;
  const innerTop = (z: number): number => hwAt(z) * 0.95 * cb.top * 0.84;

  const eye = new THREE.Vector3(-spec.width * 0.2, roofAt(seatZ) - Math.min(0.17, cb.height * 0.3), seatZ);
  // 핸들과 대시보드는 눈높이 기준으로 둔다. 밴처럼 높이 앉는 차는 대시보드도 높다.
  const wheelZ = seatZ - 0.52;
  // 허리선보다 낮으면 차체에 묻히므로 그 위로 올린다 (스포츠카처럼 낮게 앉는 차)
  const wheelY = Math.max(eye.y - 0.3, topAt(seatZ) + 0.06);
  const dashRear = seatZ - 0.68;
  const dashTop = Math.max(topAt(cb.front) + 0.04, eye.y - 0.4);
  const floor = spec.bottom + 0.12;
  const lap = topAt(seatZ) + 0.01;

  const b = new Builder();
  const paint = spec.upper ?? spec.color;

  // 대시보드: 앞유리 밑에서 핸들 앞까지. 위는 어두운 패드, 운전자 쪽 면에 차체 색 띠 (레트로 대시)
  const dw = innerLow(cb.front) * 2;
  const dz = dashRear - cb.front;
  const dzc = cb.front + dz / 2;
  b.add(new THREE.BoxGeometry(dw, dashTop - floor, dz).translate(0, (dashTop + floor) / 2, dzc), DASH);
  b.add(new THREE.BoxGeometry(dw, 0.02, dz).translate(0, dashTop + 0.01, dzc), DARK);
  b.add(new THREE.BoxGeometry(dw, 0.05, 0.01).translate(0, dashTop - 0.17, dashRear + 0.005), paint);
  // 계기판 통: 대시보드 위, 핸들 너머로 보이는 자리
  b.add(new THREE.BoxGeometry(0.34, 0.12, 0.12).translate(eye.x, dashTop + 0.06, dashRear - 0.06), DARK);
  b.add(new THREE.BoxGeometry(0.38, 0.02, 0.17).translate(eye.x, dashTop + 0.13, dashRear - 0.05), DARK);
  // 다리 쪽 바닥: 차체 윗면이 안에서 비쳐 보이지 않게 덮는다
  b.add(new THREE.BoxGeometry(dw, 0.02, seatZ + 0.7 - dashRear).translate(0, lap, (seatZ + 0.7 + dashRear) / 2), DASH);
  // 아래 대시: 대시보드 끝에서 다리 쪽으로 비스듬히 내려오는 면. 화면·송풍구·글로브박스가 여기 붙는다.
  const fd = 0.16;
  const slope = Math.atan2(dashTop - lap, fd);
  const fc = new THREE.Color(FASCIA);
  const [fl, fr] = [-dw / 2, dw / 2];
  const f0 = [dashRear, dashTop + 0.002];
  const f1 = [dashRear + fd, lap + 0.012];
  b.tri([fl, f0[1], f0[0]], [fl, f1[1], f1[0]], [fr, f1[1], f1[0]], fc);
  b.tri([fl, f0[1], f0[0]], [fr, f1[1], f1[0]], [fr, f0[1], f0[0]], fc);
  /** 비스듬한 면 위에 납작한 부품을 얹는다. t: 0 = 위 끝, 1 = 아래 끝 */
  const onFascia = (g: THREE.BufferGeometry, x: number, t: number, lift: number, color: string): void => {
    const nz = Math.sin(slope);
    const ny = Math.cos(slope);
    b.add(g.rotateX(slope).translate(x, f0[1] + (f1[1] - f0[1]) * t + ny * lift, f0[0] + (f1[0] - f0[0]) * t + nz * lift), color);
  };
  const stackX = 0.04;
  // 송풍구 (화면 양옆, 운전석 왼쪽, 조수석 오른쪽)
  for (const vx of [stackX - 0.2, stackX + 0.2, -dw / 2 + 0.12, dw / 2 - 0.12]) {
    onFascia(new THREE.BoxGeometry(0.11, 0.012, 0.06), vx, 0.3, 0.004, DARK);
    for (const dz2 of [-0.015, 0.015]) onFascia(new THREE.BoxGeometry(0.1, 0.008, 0.008).translate(0, 0, dz2), vx, 0.3, 0.01, VENT);
  }
  // 라디오 손잡이
  for (const kx of [-0.08, 0.08]) onFascia(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), stackX + kx, 0.78, 0.01, CHROME);
  // 글로브박스: 조수석 앞 조금 밝은 판과 손잡이
  onFascia(new THREE.BoxGeometry(0.4, 0.01, 0.09), dw / 2 - 0.42, 0.55, 0.004, GLOVEBOX);
  onFascia(new THREE.BoxGeometry(0.08, 0.016, 0.016), dw / 2 - 0.42, 0.42, 0.01, CHROME);
  // 센터 콘솔: 기어 레버와 컵홀더
  const cz0 = dashRear + fd;
  const cz1 = seatZ + 0.5;
  b.add(new THREE.BoxGeometry(0.2, 0.05, cz1 - cz0).translate(stackX, lap + 0.025, (cz0 + cz1) / 2), DARK);
  for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(0.01, 0.01, cz1 - cz0).translate(stackX + sx * 0.1, lap + 0.05, (cz0 + cz1) / 2), paint);
  const gz = cz0 + 0.08;
  b.add(new THREE.BoxGeometry(0.07, 0.01, 0.08).translate(stackX, lap + 0.055, gz), '#4a4658');
  b.add(new THREE.CylinderGeometry(0.007, 0.009, 0.07, 6).translate(stackX, lap + 0.09, gz), CHROME);
  b.add(new THREE.IcosahedronGeometry(0.02, 0).translate(stackX, lap + 0.13, gz), paint);
  for (const cx of [-0.045, 0.045]) b.add(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 10).translate(stackX + cx, lap + 0.052, gz + 0.13), '#2a2635');
  // 핸들 기둥
  const tilt = -0.45;
  const axis = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const hub = new THREE.Vector3(eye.x, wheelY, wheelZ);
  beam(b, hub.clone().addScaledVector(axis, -0.03), hub.clone().addScaledVector(axis, -0.32), 0.035, DARK);

  // A필러: 앞유리 양옆
  const rf = cb.roofFront;
  const roofY = roofAt(rf);
  for (const sx of [-1, 1]) {
    const a = new THREE.Vector3(sx * innerLow(cb.front), topAt(cb.front), cb.front);
    const c = new THREE.Vector3(sx * innerTop(rf), roofY - 0.03, rf);
    beam(b, a, c, 0.034, paint);
  }

  // 천장, 앞유리 위 테두리, 룸미러
  // 천장은 지붕이 끝나도 눈 뒤까지 잇는다 (실내는 운전석 뷰에서만 보여 밖에서 튀어나와 보일 일이 없다)
  const roofEnd = seatZ + 0.9;
  const rw = innerTop(rf) * 2;
  b.add(new THREE.BoxGeometry(rw, 0.03, roofEnd - rf).translate(0, roofY - 0.04, (rf + roofEnd) / 2), TRIM);
  b.add(new THREE.BoxGeometry(rw, 0.04, 0.06).translate(0, roofY - 0.06, rf + 0.02), paint);
  // 룸미러는 앞유리에 바짝 붙여 단다 (눈에서 멀수록 작고 화면 안쪽에 보인다)
  const mz = rf + ((cb.front - rf) * 0.12) / (roofY - topAt(cb.front)) + 0.05;
  b.add(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 5).translate(0, roofY - 0.08, mz), DARK);
  b.add(new THREE.BoxGeometry(0.17, 0.05, 0.025).translate(0, roofY - 0.12, mz), DARK);
  b.add(new THREE.BoxGeometry(0.145, 0.032, 0.005).translate(0, roofY - 0.12, mz + 0.014), spec.glass);

  // 문 안쪽: 크림색 패널, 위 테두리는 차체 색, 팔걸이
  const doorEnd = seatZ + 0.7;
  const zc = (cb.front + doorEnd) / 2;
  for (const sx of [-1, 1]) {
    const x = sx * (innerLow(zc) - 0.03);
    // 문 위 테두리는 허리선보다 조금 낮춰 옆 아래 시야를 넓힌다 (눈 가까이에 있어 화면을 크게 가린다)
    const top = topAt(zc) - 0.05;
    b.add(new THREE.BoxGeometry(0.04, top - floor, doorEnd - cb.front).translate(x + sx * 0.01, (top + floor) / 2, zc), TRIM);
    b.add(new THREE.BoxGeometry(0.05, 0.025, doorEnd - cb.front).translate(x + sx * 0.01, top, zc), paint);
    b.add(new THREE.BoxGeometry(0.08, 0.04, 0.45).translate(x - sx * 0.05, top - 0.17, seatZ + 0.1), DASH);
  }

  const group = new THREE.Group();
  group.visible = false;
  // 실내는 조명 대신 면 방향에 따른 밝기를 색에 구워 넣는다. 천장처럼 아래를 보는 면이 땅 반사광(초록)에 물들지 않고,
  // 밤낮 밝기는 재질 색 하나로 맞춘다.
  const interior = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(bakeShade(b.build()), interior));

  // 계기판 두 개와 가운데 화면
  const d = new Builder();
  for (const dx of [-0.08, 0.08]) {
    d.add(new THREE.CylinderGeometry(0.044, 0.044, 0.01, 18).rotateX(Math.PI / 2).translate(eye.x + dx, dashTop + 0.06, dashRear + 0.002), '#f6efe0');
    d.add(new THREE.BoxGeometry(0.006, 0.036, 0.004).translate(0, 0.014, 0).rotateZ(dx > 0 ? -0.9 : 0.6).translate(eye.x + dx, dashTop + 0.06, dashRear + 0.009), '#e0716a');
  }
  // 가운데 화면은 비스듬한 아래 대시 위에 놓는다
  {
    const t = 0.32;
    const lift = 0.008;
    d.add(new THREE.BoxGeometry(0.22, 0.008, 0.09).rotateX(slope).translate(0.04, dashTop + (lap - dashTop) * t + Math.cos(slope) * lift, dashRear + fd * t + Math.sin(slope) * lift), '#b9e4ee');
  }
  const dial = new THREE.MeshBasicMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(d.build(), dial));

  // 핸들: 자기 축(z)으로 돌도록 기울인 받침 안에 넣는다
  const s = new Builder(true);
  // 깊이 검사 없이 맨 마지막에 그리므로 뒤에 올 부품을 나중에 넣는다 (테 → 살 → 허브 → 엠블럼)
  s.add(new THREE.TorusGeometry(0.16, 0.021, 6, 24), DARK);
  for (const sx of [-1, 1]) s.add(new THREE.BoxGeometry(0.12, 0.03, 0.02).translate(sx * 0.1, -0.01, 0), DARK);
  s.add(new THREE.BoxGeometry(0.03, 0.11, 0.02).translate(0, -0.1, 0), DARK);
  s.add(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 10).rotateX(Math.PI / 2), '#4a4658');
  s.add(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 10).rotateX(Math.PI / 2), paint);
  // 핸들 아래쪽은 허리선(다리 덮개)보다 낮아 가려진다. 핸들은 눈에 가장 가까운 물체라 늘 위에 그린다.
  const steering = new THREE.Mesh(s.build(), new THREE.MeshLambertMaterial({ vertexColors: true, depthTest: false }));
  steering.renderOrder = 10;
  const mount = new THREE.Group();
  mount.position.copy(hub);
  mount.rotation.x = tilt;
  mount.add(steering);
  group.add(mount);

  return { group, steering, eye, maxBack: Math.max(0, roofEnd - seatZ - 0.2), dial, interior, hidden: [] };
}

/** 면 방향에 따라 버텍스 색을 어둡게 한다: 위를 보는 면이 가장 밝고, 운전자 쪽(+z) 면이 그다음. */
function bakeShade(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.normal;
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const k = THREE.MathUtils.clamp(0.84 + 0.14 * n.getY(i) + 0.08 * n.getZ(i), 0.7, 1);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  g.deleteAttribute('normal');
  return g;
}
