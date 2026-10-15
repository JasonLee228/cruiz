import * as THREE from 'three';
import type { CarModel, CarSpec } from './models';

/**
 * 시안의 주인공 차: 보닛·캐빈·트렁크가 또렷한 클래식 세단.
 * 옆모습을 그려 밀어내는 방식으로 몸체를 만들고, 바퀴 자리는 아치 모양으로 파낸다.
 * 앞이 -z, 바닥이 y=0. 단위는 미터.
 */
const L = 4.3; // 전장
const W = 1.82; // 전폭
const WHEEL_R = 0.36;
const WHEEL_Z = 1.3; // 축거의 절반
const ARCH_R = 0.47;
const SILL = 0.3; // 차체 밑면 높이
const BELT = 0.95; // 창문 아래 선
const ROOF = 1.52;
const CHROME = '#eef0f5';
const TRIM_DARK = '#3b3748';

export function buildClassic(spec: CarSpec): CarModel {
  const root = new THREE.Group();
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const mat = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      materials.set(color, m);
    }
    return m;
  };
  const part = (geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  /** 옆모습(앞이 +x)을 폭만큼 밀어내고 앞이 -z가 되도록 돌린다. 모서리는 살짝 깎는다. */
  const extrude = (shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6,
    });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  };

  // 몸체 옆모습: 각진 앞코, 낮은 보닛, 평평한 트렁크. 바퀴 자리는 반원으로 파낸다.
  const bevel = 0.07;
  const hx = L / 2 - bevel;
  const body = new THREE.Shape();
  body.moveTo(-hx, SILL + 0.08);
  body.lineTo(-WHEEL_Z - ARCH_R, SILL);
  body.absarc(-WHEEL_Z, SILL, ARCH_R, Math.PI, 0, true);
  body.lineTo(WHEEL_Z - ARCH_R, SILL);
  body.absarc(WHEEL_Z, SILL, ARCH_R, Math.PI, 0, true);
  body.lineTo(hx, SILL + 0.08);
  body.lineTo(hx + 0.02, 0.68); // 앞면
  body.lineTo(hx - 0.12, 0.86);
  body.lineTo(0.72, BELT - 0.03); // 보닛
  body.lineTo(-1.45, BELT); // 창문 아래 선
  body.lineTo(-hx + 0.1, BELT - 0.04); // 트렁크
  body.lineTo(-hx, 0.66);
  body.closePath();
  part(extrude(body, W, bevel), spec.body.color);

  // 캐빈: 유리 덩어리 위에 차체색 지붕과 기둥을 얹어 창틀이 보이게 한다
  const cab = new THREE.Shape();
  const front = 0.68, frontTop = 0.08, rearTop = -1.0, rear = -1.48;
  const ch = ROOF - BELT;
  cab.moveTo(rear, 0);
  cab.lineTo(front, 0);
  cab.lineTo(frontTop, ch);
  cab.lineTo(rearTop, ch);
  cab.closePath();
  const cabW = W * 0.86;
  part(extrude(cab, cabW, 0.03), spec.glassColor, 0, BELT - 0.02, 0);

  const roofGeo = new THREE.BoxGeometry(cabW + 0.06, 0.07, frontTop - rearTop + 0.1);
  part(roofGeo, spec.body.color, 0, ROOF + 0.01, -(frontTop + rearTop) / 2);
  /** 옆모습 두 점 사이에 기둥을 세운다 (양쪽 모두) */
  const pillar = (ax: number, ay: number, bx: number, by: number, thick: number) => {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const geo = new THREE.BoxGeometry(0.07, len + 0.04, thick);
    for (const sx of [-1, 1]) {
      const m = part(geo, spec.body.color, sx * (cabW / 2 + 0.005), BELT - 0.02 + (ay + by) / 2, -(ax + bx) / 2);
      m.rotation.x = Math.atan2(-dx, dy);
    }
  };
  pillar(front, 0, frontTop, ch, 0.09); // 앞기둥
  pillar(-0.42, 0, -0.42, ch, 0.12); // 가운데 기둥
  pillar(rear, 0, rearTop, ch, 0.16); // 뒷기둥
  // 앞·뒷유리 가장자리의 차체색 테두리 (위아래)
  part(new THREE.BoxGeometry(cabW, 0.05, 0.06), spec.body.color, 0, BELT, -front + 0.02);
  part(new THREE.BoxGeometry(cabW, 0.05, 0.06), spec.body.color, 0, BELT, -rear - 0.02);

  // 크롬 범퍼(양끝을 살짝 감싼다)와 옆 몰딩
  for (const sz of [-1, 1]) {
    const z = sz * (L / 2 + 0.05);
    part(new THREE.BoxGeometry(W * 0.98, 0.16, 0.14), CHROME, 0, 0.42, z);
    for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.1, 0.16, 0.3), CHROME, sx * (W * 0.49 - 0.02), 0.42, z - sz * 0.12);
  }
  for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.03, 0.04, L * 0.86), CHROME, sx * (W / 2 + 0.005), 0.66, 0);

  // 앞: 가로로 긴 그릴, 동그란 전조등 두 쌍
  const faceZ = -L / 2 - 0.005;
  part(new THREE.BoxGeometry(W * 0.5, 0.17, 0.04), TRIM_DARK, 0, 0.62, faceZ);
  part(new THREE.BoxGeometry(W * 0.54, 0.03, 0.05), CHROME, 0, 0.72, faceZ);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c2').multiplyScalar(2.5) });
  const lampGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14).rotateX(Math.PI / 2);
  const ringGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 14).rotateX(Math.PI / 2);
  for (const x of [-0.72, -0.48, 0.48, 0.72]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 0.62, faceZ - 0.02);
    root.add(lamp);
    part(ringGeo, CHROME, x, 0.62, faceZ);
  }

  // 뒤: 세로로 긴 후미등, 트렁크 손잡이 크롬, 번호판
  const backZ = L / 2 + 0.005;
  const tail = new THREE.MeshBasicMaterial({ color: '#8a2a2a' });
  const tailGeo = new THREE.BoxGeometry(0.26, 0.2, 0.05);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(tailGeo, tail);
    t.position.set(sx * 0.66, 0.68, backZ);
    root.add(t);
    part(new THREE.BoxGeometry(0.3, 0.24, 0.03), CHROME, sx * 0.66, 0.68, backZ - 0.01);
  }
  part(new THREE.BoxGeometry(0.5, 0.17, 0.04), '#f7d86a', 0, 0.58, backZ + 0.01);
  part(new THREE.BoxGeometry(0.62, 0.03, 0.04), CHROME, 0, 0.74, backZ);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8).rotateX(Math.PI / 2), '#8d8a99', W * 0.3, 0.3, backZ + 0.05);

  // 사이드미러, 문 손잡이
  for (const sx of [-1, 1]) {
    part(new THREE.BoxGeometry(0.14, 0.1, 0.16), CHROME, sx * (W / 2 + 0.06), BELT + 0.04, -0.45);
    for (const z of [-0.2, -0.95]) part(new THREE.BoxGeometry(0.03, 0.04, 0.16), CHROME, sx * (W / 2 + 0.01), 0.84, z);
  }

  // 바퀴 아치 안쪽과 차체 밑을 어둡게 막아 바퀴가 박혀 보이게 한다
  part(new THREE.BoxGeometry(W * 0.7, 0.5, L * 0.9), TRIM_DARK, 0, 0.5, 0);

  // 타이어(도넛)와 크롬 휠캡
  const tube = WHEEL_R * 0.3;
  const width = 0.26;
  const wheelGeo = new THREE.TorusGeometry(WHEEL_R - tube, tube, 12, 40).rotateY(Math.PI / 2).scale(width / (tube * 2), 1, 1);
  const capGeo = new THREE.CylinderGeometry(WHEEL_R - tube * 0.9, WHEEL_R - tube * 0.9, width * 0.7, 32).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.22, WHEEL_R * 0.22, width * 0.8, 12).rotateZ(Math.PI / 2);
  const wheels: THREE.Mesh[] = [];
  const wheelX = W / 2 - width / 2 - 0.02;
  for (const [x, z] of [[-wheelX, -WHEEL_Z], [wheelX, -WHEEL_Z], [-wheelX, WHEEL_Z], [wheelX, WHEEL_Z]]) {
    const wm = new THREE.Mesh(wheelGeo, mat('#2b2733'));
    wm.position.set(x, WHEEL_R, z);
    wm.castShadow = true;
    wm.rotation.order = 'YXZ';
    wm.add(new THREE.Mesh(capGeo, mat('#dfe2ea')), new THREE.Mesh(hubGeo, mat('#9a97a6')));
    root.add(wm);
    wheels.push(wm);
  }

  const headlight = new THREE.SpotLight('#fff1c9', 0, 60, 0.5, 0.6, 1.2);
  headlight.position.set(0, 0.62, -L / 2 + 0.1);
  headlight.target.position.set(0, 0, -20);
  root.add(headlight, headlight.target);

  return { root, wheels, headlight, tail, wheelRadius: WHEEL_R };
}
