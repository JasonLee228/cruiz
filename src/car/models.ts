import * as THREE from 'three';

export type CarId = 'hatch' | 'sports' | 'suv' | 'van';

export interface CarSpec {
  id: CarId;
  name: string;
  /** 시작 화면 버튼에 쓰는 대표 색 */
  swatch: string;
  body: { w: number; h: number; l: number; y: number; color: string };
  cabin: { w: number; h: number; l: number; y: number; z: number; color: string };
  glassColor: string;
  /** 바퀴: 반지름, 폭, x 간격, 앞/뒤 z */
  wheel: { r: number; width: number; x: number; zFront: number; zRear: number };
  /** 추가 장식 */
  extras?: 'spoiler' | 'roofrack' | 'stripe';
  /** 최고 속도(m/s)와 가속 성향 */
  maxSpeed: number;
}

export const CARS: CarSpec[] = [
  {
    id: 'hatch', name: '해치백', swatch: '#e85d5d',
    body: { w: 1.9, h: 0.6, l: 4.1, y: 0.65, color: '#e85d5d' },
    cabin: { w: 1.6, h: 0.55, l: 2.1, y: 1.22, z: 0.25, color: '#f4f1e8' },
    glassColor: '#4b6a88',
    wheel: { r: 0.38, width: 0.3, x: 0.9, zFront: -1.35, zRear: 1.35 },
    maxSpeed: 33,
  },
  {
    id: 'sports', name: '스포츠카', swatch: '#f2c14e',
    body: { w: 2.0, h: 0.5, l: 4.5, y: 0.52, color: '#f2c14e' },
    cabin: { w: 1.5, h: 0.42, l: 1.8, y: 0.96, z: 0.5, color: '#2f2a3a' },
    glassColor: '#3a4e66',
    wheel: { r: 0.36, width: 0.36, x: 0.95, zFront: -1.5, zRear: 1.5 },
    extras: 'spoiler',
    maxSpeed: 44,
  },
  {
    id: 'suv', name: 'SUV', swatch: '#5a9e7a',
    body: { w: 2.0, h: 0.8, l: 4.4, y: 0.95, color: '#5a9e7a' },
    cabin: { w: 1.8, h: 0.7, l: 2.8, y: 1.7, z: 0.3, color: '#e9e4d4' },
    glassColor: '#4b6a88',
    wheel: { r: 0.5, width: 0.4, x: 1.0, zFront: -1.45, zRear: 1.45 },
    extras: 'roofrack',
    maxSpeed: 28,
  },
  {
    id: 'van', name: '레트로 밴', swatch: '#6fa8dc',
    body: { w: 1.95, h: 1.3, l: 4.2, y: 1.0, color: '#6fa8dc' },
    cabin: { w: 1.9, h: 0.5, l: 3.6, y: 1.9, z: 0.3, color: '#f4f1e8' },
    glassColor: '#3f5d7a',
    wheel: { r: 0.42, width: 0.3, x: 0.95, zFront: -1.4, zRear: 1.4 },
    extras: 'stripe',
    maxSpeed: 26,
  },
];

export function getSpec(id: string | null): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  mesh.castShadow = true;
  return mesh;
}

export interface CarModel {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  headlight: THREE.SpotLight;
  tail: THREE.MeshBasicMaterial;
  wheelRadius: number;
}

/** 로우폴리 차량. 박스와 원기둥 몇 개로 만든다. 앞바퀴는 wheels[0], wheels[1]. */
export function buildCar(spec: CarSpec): CarModel {
  const root = new THREE.Group();
  const { body: b, cabin: c, wheel: w } = spec;
  const halfL = b.l / 2;

  const body = box(b.w, b.h, b.l, b.color);
  body.position.y = b.y;
  root.add(body);

  const cabin = box(c.w, c.h, c.l, c.color);
  cabin.position.set(0, c.y, c.z);
  root.add(cabin);

  const glass = box(c.w + 0.02, c.h * 0.65, c.l * 0.95, spec.glassColor);
  glass.position.set(0, c.y + 0.03, c.z);
  root.add(glass);

  const bumperY = b.y - b.h / 2 + 0.1;
  for (const z of [-halfL, halfL]) {
    const bumper = box(b.w + 0.05, 0.25, 0.25, '#3a3546');
    bumper.position.set(0, bumperY, z);
    root.add(bumper);
  }

  const lampY = b.y + b.h * 0.15;
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff4c2' });
  const tail = new THREE.MeshBasicMaterial({ color: '#8a2a2a' });
  for (const x of [-b.w * 0.34, b.w * 0.34]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.05), lampMat);
    head.position.set(x, lampY, -halfL - 0.01);
    root.add(head);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), tail);
    rear.position.set(x, lampY, halfL + 0.01);
    root.add(rear);
  }

  if (spec.extras === 'spoiler') {
    const wing = box(b.w * 0.9, 0.07, 0.45, '#2f2a3a');
    wing.position.set(0, b.y + b.h / 2 + 0.38, halfL - 0.35);
    root.add(wing);
    for (const x of [-0.6, 0.6]) {
      const post = box(0.07, 0.35, 0.1, '#2f2a3a');
      post.position.set(x, b.y + b.h / 2 + 0.18, halfL - 0.35);
      root.add(post);
    }
  } else if (spec.extras === 'roofrack') {
    const rack = box(c.w * 0.85, 0.08, c.l * 0.8, '#2f2a3a');
    rack.position.set(0, c.y + c.h / 2 + 0.08, c.z);
    root.add(rack);
    const box1 = box(c.w * 0.6, 0.3, 0.7, '#d9a75b');
    box1.position.set(0, c.y + c.h / 2 + 0.27, c.z + 0.3);
    root.add(box1);
  } else if (spec.extras === 'stripe') {
    const stripe = box(b.w + 0.02, 0.18, b.l + 0.02, '#f4f1e8');
    stripe.position.y = b.y;
    root.add(stripe);
  }

  const wheelGeo = new THREE.CylinderGeometry(w.r, w.r, w.width, 8).rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#2b2733', flatShading: true });
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[-w.x, w.zFront], [w.x, w.zFront], [-w.x, w.zRear], [w.x, w.zRear]]) {
    const wm = new THREE.Mesh(wheelGeo, wheelMat);
    wm.position.set(x, w.r, z);
    wm.castShadow = true;
    root.add(wm);
    wheels.push(wm);
  }

  const headlight = new THREE.SpotLight('#fff1c9', 0, 60, 0.5, 0.6, 1.2);
  headlight.position.set(0, lampY, -halfL + 0.1);
  headlight.target.position.set(0, 0, -20);
  root.add(headlight, headlight.target);

  return { root, wheels, headlight, tail, wheelRadius: w.r };
}
