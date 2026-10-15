import * as THREE from 'three';
import { ROAD_HALF_WIDTH, roadDX, roadDY, roadX, roadY } from '../world/path';
import type { InputState } from '../input';

const MAX_SPEED = 33; // m/s ≈ 120 km/h
const ACCEL = 7;
const BRAKE = 12;
const STEER_RATE = 0.55;

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  mesh.castShadow = true;
  return mesh;
}

/** 로우폴리 해치백. 박스 몇 개로 만든다. */
function buildModel(): { root: THREE.Group; wheels: THREE.Mesh[]; headlight: THREE.SpotLight; tail: THREE.MeshBasicMaterial } {
  const root = new THREE.Group();
  const body = box(1.9, 0.6, 4.1, '#e85d5d');
  body.position.y = 0.65;
  root.add(body);

  const cabin = box(1.6, 0.55, 2.1, '#f4f1e8');
  cabin.position.set(0, 1.22, 0.25);
  root.add(cabin);

  const glass = box(1.62, 0.36, 2.0, '#4b6a88');
  glass.position.set(0, 1.25, 0.25);
  glass.scale.set(1.001, 1, 0.9);
  root.add(glass);

  const bumperF = box(1.95, 0.25, 0.25, '#3a3546');
  bumperF.position.set(0, 0.45, -2.1);
  root.add(bumperF);
  const bumperR = box(1.95, 0.25, 0.25, '#3a3546');
  bumperR.position.set(0, 0.45, 2.1);
  root.add(bumperR);

  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff4c2' });
  for (const x of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.05), lampMat);
    lamp.position.set(x, 0.75, -2.06);
    root.add(lamp);
  }
  const tail = new THREE.MeshBasicMaterial({ color: '#8a2a2a' });
  for (const x of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.05), tail);
    lamp.position.set(x, 0.78, 2.06);
    root.add(lamp);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 8).rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#2b2733', flatShading: true });
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.9, -1.35], [0.9, -1.35], [-0.9, 1.35], [0.9, 1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.38, z);
    w.castShadow = true;
    root.add(w);
    wheels.push(w);
  }

  const headlight = new THREE.SpotLight('#fff1c9', 0, 60, 0.5, 0.6, 1.2);
  headlight.position.set(0, 0.9, -2);
  headlight.target.position.set(0, 0, -20);
  root.add(headlight, headlight.target);

  return { root, wheels, headlight, tail };
}

export class Car {
  readonly object: THREE.Group;
  /** 진행 거리 (z는 -distance) */
  distance = 0;
  /** 도로 중심에서 오른쪽(+)으로 떨어진 거리 */
  lateral = 1.9;
  speed = 0;
  targetSpeed = 22;
  /** 바퀴 조향 (-1..1), 화면 표현용 */
  steer = 0;
  yaw = 0;

  private wheels: THREE.Mesh[];
  readonly headlight: THREE.SpotLight;
  private tail: THREE.MeshBasicMaterial;

  constructor() {
    const model = buildModel();
    this.object = model.root;
    this.object.rotation.order = 'YXZ';
    this.wheels = model.wheels;
    this.headlight = model.headlight;
    this.tail = model.tail;
    this.place();
  }

  get z(): number {
    return -this.distance;
  }

  setNight(amount: number): void {
    this.headlight.intensity = amount * 160;
    this.tail.color.setRGB(0.54 + amount * 0.46, 0.16 + amount * 0.1, 0.16 + amount * 0.1);
  }

  update(dt: number, input: InputState): void {
    // 속도: ↑↓ 로 크루즈 속도를 바꾸고, 차는 그 속도로 부드럽게 맞춘다.
    if (input.throttle > 0) this.targetSpeed = Math.min(MAX_SPEED, this.targetSpeed + ACCEL * dt);
    if (input.throttle < 0) this.targetSpeed = Math.max(0, this.targetSpeed - BRAKE * dt);

    let steerInput = input.steer;
    if (input.autopilot) {
      // 자동 주행: 오른쪽 차선 중앙을 유지
      const error = 1.9 - this.lateral;
      steerInput = THREE.MathUtils.clamp(error * 0.8, -1, 1);
    }
    this.steer = THREE.MathUtils.damp(this.steer, steerInput, 8, dt);

    const offRoad = Math.abs(this.lateral) > ROAD_HALF_WIDTH - 0.8;
    const limit = offRoad ? Math.min(this.targetSpeed, 14) : this.targetSpeed;
    this.speed = THREE.MathUtils.damp(this.speed, limit, 1.2, dt);

    // 조향은 속도에 비례해 옆으로 이동. 너무 멀리 나가면 부드럽게 끌어당긴다.
    this.lateral += this.steer * STEER_RATE * Math.min(this.speed, 20) * dt * 0.35;
    const edge = ROAD_HALF_WIDTH + 2;
    if (Math.abs(this.lateral) > edge) this.lateral = THREE.MathUtils.damp(this.lateral, Math.sign(this.lateral) * edge, 6, dt);

    this.distance += this.speed * dt;
    this.place();

    const spin = (this.speed * dt) / 0.38;
    for (const w of this.wheels) w.rotation.x -= spin;
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = -this.steer * 0.35;
  }

  private place(): void {
    const z = this.z;
    const dx = roadDX(z);
    const len = Math.hypot(dx, 1);
    const x = roadX(z) + this.lateral / len;
    const lz = z - (dx / len) * this.lateral;
    this.object.position.set(x, roadY(lz) + 0.02, lz);
    this.yaw = Math.atan(dx) - this.steer * 0.12 * Math.min(this.speed / 10, 1);
    this.object.rotation.y = this.yaw;
    this.object.rotation.x = -Math.atan(roadDY(z));
    this.object.rotation.z = -this.steer * 0.03 * Math.min(this.speed / 15, 1);
  }
}
