import * as THREE from 'three';
import { RAIL_LATERAL, ROAD_HALF_WIDTH, roadDX, roadDY, roadX, roadY } from '../world/path';
import type { InputState } from '../input';
import { buildCar, getSpec, type CarModel, type CarSpec, type Cockpit } from './models';

const ACCEL = 7;
const BRAKE = 12;
const STEER_RATE = 0.55;
/** 매뉴얼: 핸들을 끝까지 돌렸을 때의 회전 곡률 (1/m). 도로의 가장 급한 굽이(약 0.015)의 두 배 정도. */
const MANUAL_CURVATURE = 0.03;
/** 매뉴얼: 도로 방향과 차 방향이 벌어질 수 있는 최대 각도 (rad) */
const MAX_HEADING = 0.5;
/** 오토: 두 차선의 중앙 (도로 중심에서 옆으로). +는 오른쪽 차선. */
const LANE = 1.9;
/** 오토: 차선을 옮기는 데 걸리는 시간 (s) */
const LANE_CHANGE_TIME = 3.5;
/** 오토: 이보다 느리면 차선을 바꾸지 않는다 (m/s) */
const LANE_CHANGE_MIN_SPEED = 8;

function roadYaw(z: number): number {
  return Math.atan(roadDX(z));
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
  /** 도로 방향에 대한 차의 방향 (rad, +는 왼쪽). 매뉴얼에서만 벌어지고, 다른 모드에서는 0으로 돌아온다. */
  heading = 0;
  private manual = false;
  /** 차 길이 (m). 카메라가 차를 화면에 담을 거리를 정할 때 쓴다. */
  length = 4.3;
  /** 운전석 실내 (차종마다 다르다). 운전석 뷰의 눈 위치도 여기 있다. */
  cockpit!: Cockpit;
  /** 핸들이 돌아간 정도 (-1..1, +는 오른쪽). 굽이를 따라 도는 만큼도 들어간다. */
  wheelTurn = 0;
  private inCockpit = false;
  /** 오토: 차선 변경. 지금 향하는 차선과, 옮겨 가는 경로(from → to, 진행도 t). */
  private lane = { from: LANE, to: LANE, t: 1, wait: 0 };
  private wasAuto = false;

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
    if (this.cockpit && this.cockpit !== m.cockpit) this.showCockpit(this.cockpit, false);
    this.cockpit = m.cockpit;
    this.showCockpit(m.cockpit, this.inCockpit);
    this.maxSpeed = spec.maxSpeed;
    this.halfWidth = spec.width / 2;
    this.length = spec.length;
    this.targetSpeed = Math.min(this.targetSpeed, this.maxSpeed);
    this.setNight(this.night);
    this.place();
  }

  /** 운전석 뷰에서는 실내를 보이고, 안에서 안 보이는 바퀴·후미등은 숨긴다. */
  setCockpit(on: boolean): void {
    if (on === this.inCockpit) return;
    this.inCockpit = on;
    this.showCockpit(this.cockpit, on);
  }

  private showCockpit(c: Cockpit, on: boolean): void {
    c.group.visible = on;
    for (const o of c.hidden) o.visible = !on;
  }

  get z(): number {
    return -this.distance;
  }

  setNight(amount: number): void {
    this.night = amount;
    this.headlight.intensity = amount * 160;
    this.tail.color.setRGB(0.54 + amount * 0.46, 0.16 + amount * 0.1, 0.16 + amount * 0.1);
    // 실내: 낮에는 제 색, 밤에는 푸르스름하게 어두워진다. 계기판은 밤에도 은은하게 보인다.
    this.cockpit.interior.color.setRGB(1 - amount * 0.72, 1 - amount * 0.72, 1 - amount * 0.6);
    this.cockpit.dial.color.setRGB(0.85 - amount * 0.25, 0.85 - amount * 0.2, 0.85 - amount * 0.12);
  }

  update(dt: number, input: InputState): void {
    // 속도: ↑↓ 로 크루즈 속도를 바꾸고, 차는 그 속도로 부드럽게 맞춘다.
    if (input.throttle > 0) this.targetSpeed = Math.min(this.maxSpeed, this.targetSpeed + ACCEL * dt);
    if (input.throttle < 0) this.targetSpeed = Math.max(0, this.targetSpeed - BRAKE * dt);

    const manual = (this.manual = input.mode === 'manual');
    let steerInput = input.steer;
    const auto = input.mode === 'auto';
    if (auto) steerInput = this.autoSteer(dt, !this.wasAuto);
    this.wasAuto = auto;
    this.steer = THREE.MathUtils.damp(this.steer, steerInput, 8, dt);

    const offRoad = Math.abs(this.lateral) > ROAD_HALF_WIDTH - 0.8;
    const limit = offRoad ? Math.min(this.targetSpeed, 14) : this.targetSpeed;
    this.speed = THREE.MathUtils.damp(this.speed, limit, 1.2, dt);

    const yaw0 = roadYaw(this.z);
    if (manual) {
      // 매뉴얼: 차는 제 방향으로 곧게 달린다. 도로가 휘면 그만큼 도로와 어긋나므로 직접 핸들을 돌려야 한다.
      this.heading -= this.steer * MANUAL_CURVATURE * this.speed * dt;
      this.heading = THREE.MathUtils.clamp(this.heading, -MAX_HEADING, MAX_HEADING);
    } else {
      // 오토·어시스트: 차가 도로 굽이를 따라간다. 조향은 속도에 비례해 옆으로 이동한다.
      this.heading = THREE.MathUtils.damp(this.heading, 0, 3, dt);
      this.lateral += this.steer * STEER_RATE * Math.min(this.speed, 20) * dt * 0.35;
    }
    this.lateral -= Math.sin(this.heading) * this.speed * dt;
    // 가드레일: 차체 옆면이 레일에 닿으면 더 나가지 못하고, 레일을 긁는 동안 속도가 줄어든다.
    // 차가 조향으로 살짝 틀어지는 만큼(앞 모서리)과 여유를 빼 차체가 레일을 뚫고 보이지 않게 한다.
    const edge = RAIL_LATERAL - this.halfWidth - 0.35;
    if (Math.abs(this.lateral) > edge) {
      this.lateral = Math.sign(this.lateral) * edge;
      this.speed = THREE.MathUtils.damp(this.speed, Math.min(this.speed, 10), 1.5, dt);
      // 레일 쪽으로 향하던 차는 레일을 따라 나란히 펴진다.
      if (Math.sign(-this.heading) === Math.sign(this.lateral)) this.heading = THREE.MathUtils.damp(this.heading, 0, 6, dt);
    }

    this.distance += this.speed * Math.cos(this.heading) * dt;
    // 도로가 휜 만큼 도로 기준 방향이 바뀐다 (차의 실제 방향은 그대로).
    if (manual) this.heading -= roadYaw(this.z) - yaw0;
    this.place();

    const spin = (this.speed * dt) / this.wheelRadius;
    for (const w of this.wheels) w.rotation.x -= spin;
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = -this.steer * 0.35;

    if (this.inCockpit) {
      // 핸들: 매뉴얼은 조향 그대로, 오토·어시스트는 도로가 휘는 만큼도 돌린다 (+곡률은 왼쪽).
      const curve = manual ? 0 : (roadYaw(this.z - 3) - roadYaw(this.z + 3)) / 6;
      const turn = THREE.MathUtils.clamp(this.steer * (manual ? 1 : 0.7) - curve * 30, -1, 1);
      this.wheelTurn = THREE.MathUtils.damp(this.wheelTurn, turn, 6, dt);
      this.cockpit.steering.rotation.z = -this.wheelTurn * 1.7;
    }
  }

  /**
   * 자동 주행: 차선 중앙을 따라가다가 가끔 옆 차선으로 부드럽게 옮긴다.
   * 왼쪽 차선에는 오래 머물지 않고 추월하듯 다시 오른쪽으로 돌아온다.
   */
  private autoSteer(dt: number, entered: boolean): number {
    const lane = this.lane;
    if (entered) {
      // 다른 모드에서 넘어오면 가까운 차선으로 천천히 들어간다.
      lane.from = this.lateral;
      lane.to = this.lateral < 0 ? -LANE : LANE;
      lane.t = 0;
      lane.wait = 8 + Math.random() * 12;
    }
    if (lane.t >= 1) {
      lane.wait -= dt;
      if (lane.wait <= 0 && this.speed > LANE_CHANGE_MIN_SPEED) {
        lane.from = lane.to;
        lane.to = -lane.to;
        lane.t = 0;
        // 오른쪽 차선에서는 12~35초, 왼쪽 차선에서는 5~12초 머문다.
        lane.wait = lane.to > 0 ? 12 + Math.random() * 23 : 5 + Math.random() * 7;
      }
    }
    lane.t = Math.min(1, lane.t + dt / LANE_CHANGE_TIME);
    const e = lane.t * lane.t * (3 - 2 * lane.t);
    const target = lane.from + (lane.to - lane.from) * e;
    // 목표가 옮겨 가는 속도만큼 미리 핸들을 돌리고(앞먹임), 남은 오차는 비례 제어로 메운다.
    const rate = ((lane.to - lane.from) * 6 * lane.t * (1 - lane.t)) / LANE_CHANGE_TIME;
    const gain = STEER_RATE * Math.max(Math.min(this.speed, 20), 1) * 0.35;
    return THREE.MathUtils.clamp(rate / gain + (target - this.lateral) * 0.8, -1, 1);
  }

  private place(): void {
    const z = this.z;
    const dx = roadDX(z);
    const len = Math.hypot(dx, 1);
    const x = roadX(z) + this.lateral / len;
    const lz = z - (dx / len) * this.lateral;
    this.object.position.set(x, roadY(lz) + 0.02, lz);
    // 오토·어시스트에서는 차선을 옮길 때 차를 살짝 틀어 보여 준다. 매뉴얼은 heading이 실제 방향이다.
    const lean = this.manual ? 0 : this.steer * 0.12 * Math.min(this.speed / 10, 1);
    this.yaw = Math.atan(dx) + this.heading - lean;
    this.object.rotation.y = this.yaw;
    this.object.rotation.x = -Math.atan(roadDY(z));
    this.object.rotation.z = -this.steer * 0.03 * Math.min(this.speed / 15, 1);
  }
}
