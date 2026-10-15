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

  const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const part = (geo: THREE.BufferGeometry, color: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.castShadow = true;
    return mesh;
  };
  /** 옆모습(앞이 +x)을 그려 폭만큼 밀어낸 뒤 앞이 -z가 되도록 돌린다. 모서리는 살짝 깎아 둥글게. */
  const extrude = (shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 3 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  };
  const rounded = (l: number, h: number, r: number): THREE.Shape => {
    const sh = new THREE.Shape();
    const x0 = -l / 2, x1 = l / 2;
    sh.moveTo(x0 + r, 0);
    sh.lineTo(x1 - r, 0);
    sh.quadraticCurveTo(x1, 0, x1, r);
    sh.lineTo(x1, h * 0.55);
    sh.quadraticCurveTo(x1, h, x1 - h * 0.7, h); // 보닛
    sh.lineTo(x0 + r * 1.5, h);
    sh.quadraticCurveTo(x0, h, x0, h - r);
    sh.lineTo(x0, r);
    sh.quadraticCurveTo(x0, 0, x0 + r, 0);
    return sh;
  };

  const bevel = 0.16;
  const body = part(extrude(rounded(b.l - bevel * 2, b.h - bevel * 2, 0.5), b.w, bevel), b.color);
  body.position.y = b.y - b.h / 2 + bevel;
  root.add(body);

  // 캐빈: 앞유리가 눕고 뒤는 완만하게 떨어진다
  const cl = c.l - bevel * 2;
  const ch = c.h - bevel * 2;
  const cab = new THREE.Shape();
  cab.moveTo(-cl / 2, 0);
  cab.lineTo(cl / 2, 0);
  cab.lineTo(cl * 0.26, ch);
  cab.lineTo(-cl * 0.34, ch);
  cab.lineTo(-cl * 0.56, 0);
  // 앞이 -z 이므로 shape의 +x(앞)가 -z로 간다. c.z는 뒤쪽(+z) 오프셋.
  const cabBase = c.y - c.h / 2 + bevel;
  const cabin = part(extrude(cab, c.w * 0.94, bevel), c.color);
  cabin.position.set(0, cabBase, c.z);
  root.add(cabin);

  // 유리: 옆창은 캐빈 옆면에 테두리를 남기고 붙이고, 앞·뒷유리는 경사면에 판을 얹는다
  const glassMat = new THREE.MeshLambertMaterial({ color: spec.glassColor, flatShading: true });
  const side = new THREE.Shape();
  side.moveTo(-cl * 0.44, ch * 0.12);
  side.lineTo(cl * 0.36, ch * 0.12);
  side.lineTo(cl * 0.22, ch * 0.86);
  side.lineTo(-cl * 0.3, ch * 0.86);
  side.quadraticCurveTo(-cl * 0.4, ch * 0.7, -cl * 0.44, ch * 0.12);
  const sideGeo = new THREE.ShapeGeometry(side).rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const pane = new THREE.Mesh(sideGeo, glassMat);
    pane.position.set(sx * (c.w * 0.47 + bevel + 0.01), cabBase, c.z);
    if (sx < 0) pane.scale.x = -1; // 왼쪽 면은 거울처럼 뒤집어 바깥을 보게
    root.add(pane);
  }
  /** 캐빈 경사면(shape 좌표의 두 점 사이) 바로 바깥에 유리판을 얹는다. 차 좌표에서 z = c.z - x */
  const slopePane = (ax: number, ay: number, bx: number, by: number, width: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    // 캐빈 중심에서 멀어지는 쪽 법선
    let nx = dy / len;
    let ny = -dx / len;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (nx * mx + ny * (my - ch / 2) < 0) { nx = -nx; ny = -ny; }
    const off = bevel + 0.02;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(width, len * 0.82, 0.03), glassMat);
    pane.position.set(0, cabBase + my + ny * off, c.z - (mx + nx * off));
    pane.rotation.x = Math.atan2(-dx, dy);
    return pane;
  };
  root.add(slopePane(cl * 0.26, ch, cl * 0.5, 0, c.w * 0.8)); // 앞유리
  root.add(slopePane(-cl * 0.34, ch, -cl * 0.56, 0, c.w * 0.76)); // 뒷유리

  // 사이드 미러
  for (const sx of [-1, 1]) {
    const mirror = part(new THREE.BoxGeometry(0.16, 0.14, 0.2), b.color);
    mirror.position.set(sx * (c.w * 0.5 + 0.1), c.y - c.h * 0.15, c.z - cl * 0.28);
    root.add(mirror);
  }

  const bumperY = b.y - b.h / 2 + 0.1;
  for (const z of [-halfL, halfL]) {
    const bumper = box(b.w - 0.1, 0.22, 0.25, '#e6e3ee');
    bumper.position.set(0, bumperY, z);
    root.add(bumper);
  }

  const lampY = b.y + b.h * 0.15;
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c2').multiplyScalar(2.5) });
  const tail = new THREE.MeshBasicMaterial({ color: '#8a2a2a' });
  for (const x of [-b.w * 0.34, b.w * 0.34]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12).rotateX(Math.PI / 2), lampMat);
    head.position.set(x, lampY, -halfL + 0.02);
    root.add(head);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.17, 0.08), tail);
    rear.position.set(x, lampY, halfL - 0.01);
    root.add(rear);
    // 옆으로 살짝 감싸는 후미등
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.22), tail);
    wrap.position.set(Math.sign(x) * (b.w / 2 - 0.02), lampY, halfL - 0.14);
    root.add(wrap);
    const ring = part(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 12).rotateX(Math.PI / 2), '#f1eff6');
    ring.position.set(x, lampY, -halfL + 0.0);
    root.add(ring);
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

  const wheelGeo = new THREE.CylinderGeometry(w.r, w.r, w.width, 28).rotateZ(Math.PI / 2);
  // 바퀴는 매끈하게 음영을 줘야 굴러갈 때 각져 보이지 않는다
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#2b2733' });
  const capGeo = new THREE.CylinderGeometry(w.r * 0.55, w.r * 0.55, w.width + 0.02, 20).rotateZ(Math.PI / 2);
  const capMat = new THREE.MeshLambertMaterial({ color: '#d9dce8' });
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[-w.x, w.zFront], [w.x, w.zFront], [-w.x, w.zRear], [w.x, w.zRear]]) {
    const wm = new THREE.Mesh(wheelGeo, wheelMat);
    wm.position.set(x, w.r, z);
    wm.castShadow = true;
    // 조향(y) 후에 회전(x)이 적용되도록 순서를 바꾼다. 기본 순서면 핸들을 꺾을 때 바퀴축이 흔들린다.
    wm.rotation.order = 'YXZ';
    const cap = new THREE.Mesh(capGeo, capMat);
    wm.add(cap);
    root.add(wm);
    wheels.push(wm);
  }

  // 차체 아래 어두운 하부: 바퀴와 차체 사이 틈을 가려 땅에 붙어 보이게 한다
  const skirt = part(new THREE.BoxGeometry(b.w * 0.86, 0.22, b.l * 0.8), '#3b3748');
  skirt.position.set(0, b.y - b.h / 2 + 0.02, 0);
  root.add(skirt);
  // 앞 그릴, 뒤 트림, 배기구
  const grille = part(new THREE.BoxGeometry(b.w * 0.36, b.h * 0.22, 0.05), '#4a4658');
  grille.position.set(0, lampY - 0.02, -halfL + 0.01);
  root.add(grille);
  const trim = part(new THREE.BoxGeometry(b.w * 0.42, 0.05, 0.05), '#f1eff6');
  trim.position.set(0, lampY, halfL + 0.0);
  root.add(trim);
  const exhaust = part(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8).rotateX(Math.PI / 2), '#8d8a99');
  exhaust.position.set(b.w * 0.3, bumperY - 0.06, halfL + 0.05);
  root.add(exhaust);

  const plate = part(new THREE.BoxGeometry(0.5, 0.18, 0.04), '#f7d86a');
  plate.position.set(0, b.y - b.h * 0.2, halfL + 0.03);
  root.add(plate);

  const headlight = new THREE.SpotLight('#fff1c9', 0, 60, 0.5, 0.6, 1.2);
  headlight.position.set(0, lampY, -halfL + 0.1);
  headlight.target.position.set(0, 0, -20);
  root.add(headlight, headlight.target);

  return { root, wheels, headlight, tail, wheelRadius: w.r };
}
