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
    maxSpeed: 33,
  },
  {
    id: 'hatch', name: 'Hatchback', style: 'hatch',
    color: '#e85d5d', glass: '#41607c',
    length: 3.95, width: 1.8, bottom: 0.3,
    top: [[-1.98, 0.74], [-1.75, 0.87], [-0.7, 0.95], [1.98, 0.98]],
    cabin: { front: -0.7, roofFront: -0.12, roofRear: 1.5, rear: 1.92, height: 0.6, top: 0.9, pillars: [0.55] },
    wheel: { r: 0.35, width: 0.26, zFront: -1.25, zRear: 1.25 },
    maxSpeed: 33,
  },
  {
    id: 'sports', name: 'Sports', style: 'sports',
    color: '#f2c14e', glass: '#2e3b4e',
    length: 4.5, width: 1.98, bottom: 0.24,
    top: [[-2.25, 0.54], [-1.95, 0.74], [-1.4, 0.8], [-0.55, 0.8], [1.3, 0.84], [2.25, 0.86]],
    cabin: { front: -0.55, roofFront: 0.08, roofRear: 0.55, rear: 1.8, height: 0.42, top: 0.84, pillars: [] },
    wheel: { r: 0.34, width: 0.32, zFront: -1.45, zRear: 1.4 },
    maxSpeed: 44,
  },
  {
    id: 'suv', name: 'SUV', style: 'suv',
    color: '#e07a5f', glass: '#41607c',
    length: 4.4, width: 2.0, bottom: 0.55,
    top: [[-2.2, 1.05], [-1.95, 1.18], [-0.9, 1.25], [2.2, 1.28]],
    cabin: { front: -0.9, roofFront: -0.42, roofRear: 2.0, rear: 2.14, height: 0.72, top: 0.95, pillars: [0.36, 1.42] },
    wheel: { r: 0.46, width: 0.36, zFront: -1.4, zRear: 1.4 },
    maxSpeed: 28,
  },
  {
    id: 'van', name: 'Retro Van', style: 'van',
    color: '#7fb2e0', upper: '#f4f1e8', glass: '#3f5d7a',
    length: 4.3, width: 1.95, bottom: 0.38,
    top: [[-2.15, 1.04], [-1.95, 1.12], [2.15, 1.12]],
    cabin: { front: -2.1, roofFront: -1.88, roofRear: 1.96, rear: 2.12, height: 0.85, top: 0.95, pillars: [-1.15, -0.25, 0.65] },
    wheel: { r: 0.4, width: 0.3, zFront: -1.35, zRear: 1.4 },
    maxSpeed: 26,
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
}

const CHROME = '#e4e6ee';
const DARK = '#3b3748';

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
  root.add(new THREE.Mesh(tailB.build(), tail));

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

  return { root, wheels, headlight, tail, wheelRadius: w.r };
}
