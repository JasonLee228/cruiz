import * as THREE from 'three';
import { RAIL_LATERAL, ROAD_HALF_WIDTH, roadDX, roadDY, roadX, roadY } from '../world/path';
import type { InputState } from '../input';
import { buildCar, getSpec, type CarModel, type CarSpec } from './models';

const ACCEL = 7;
const BRAKE = 12;
const STEER_RATE = 0.55;

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

  private wheels: THREE.Mesh[] = [];
  private wheelRadius = 0.38;
  private maxSpeed = 33;
  /** 차체 절반 폭. 가드레일에 닿는 위치를 정한다. */
  private halfWidth = 0.95;
  private night = 0;
  headlight!: THREE.SpotLight;
  private tail!: THREE.MeshBasicMaterial;
  private model!: THREE.Group;
  /** 한 번 만든 차는 보관해 두고, 다시 고를 때 그대로 꺼내 쓴다. */
  private built = new Map<string, CarModel>();

  constructor(id?: string) {
    this.object = new THREE.Group();
    this.object.rotation.order = 'YXZ';
    this.setType(getSpec(id ?? null));
  }

  /** 차종을 바꾼다. 위치와 속도는 그대로 유지한다. */
  setType(spec: CarSpec): void {
    if (this.model) this.object.remove(this.model);
    let m = this.built.get(spec.id);
    if (!m) {
      m = buildCar(spec);
      this.built.set(spec.id, m);
    }
    this.model = m.root;
    this.object.add(m.root);
    this.wheels = m.wheels;
    this.wheelRadius = m.wheelRadius;
    this.headlight = m.headlight;
    this.tail = m.tail;
    this.maxSpeed = spec.maxSpeed;
    this.halfWidth = spec.width / 2;
    this.targetSpeed = Math.min(this.targetSpeed, this.maxSpeed);
    this.setNight(this.night);
    this.place();
  }

  get z(): number {
    return -this.distance;
  }

  setNight(amount: number): void {
    this.night = amount;
    this.headlight.intensity = amount * 160;
    this.tail.color.setRGB(0.54 + amount * 0.46, 0.16 + amount * 0.1, 0.16 + amount * 0.1);
  }

  update(dt: number, input: InputState): void {
    // 속도: ↑↓ 로 크루즈 속도를 바꾸고, 차는 그 속도로 부드럽게 맞춘다.
    if (input.throttle > 0) this.targetSpeed = Math.min(this.maxSpeed, this.targetSpeed + ACCEL * dt);
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

    // 조향은 속도에 비례해 옆으로 이동한다.
    this.lateral += this.steer * STEER_RATE * Math.min(this.speed, 20) * dt * 0.35;
    // 가드레일: 차체 옆면이 레일에 닿으면 더 나가지 못하고, 레일을 긁는 동안 속도가 줄어든다.
    // 차가 조향으로 살짝 틀어지는 만큼(앞 모서리)과 여유를 빼 차체가 레일을 뚫고 보이지 않게 한다.
    const edge = RAIL_LATERAL - this.halfWidth - 0.35;
    if (Math.abs(this.lateral) > edge) {
      this.lateral = Math.sign(this.lateral) * edge;
      this.speed = THREE.MathUtils.damp(this.speed, Math.min(this.speed, 10), 1.5, dt);
    }

    this.distance += this.speed * dt;
    this.place();

    const spin = (this.speed * dt) / this.wheelRadius;
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
