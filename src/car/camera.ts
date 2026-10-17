import * as THREE from 'three';
import { RAIL_LATERAL } from '../world/path';
import type { Car } from './car';

type Mode = 'chase' | 'cockpit' | 'cinematic';
const MODES: Mode[] = ['chase', 'cockpit', 'cinematic'];

const BASE_FOV = 62;
/** 운전석 뷰 시야각. 빠를수록 넓어져 속도감을 준다. */
const COCKPIT_FOV = 66;
const COCKPIT_FOV_GAIN = 14;

/** 시네마틱 카메라가 가드레일 안쪽으로 남겨 두는 여유 (m) */
const RAIL_MARGIN = 0.8;
/** 도로의 가장 급한 굽이보다 조금 큰 곡률 (1/m). 차 앞뒤로 떨어진 만큼 도로가 휘는 폭을 여유에 더한다. */
const MAX_CURVATURE = 0.02;

/** 추적 / 운전석 / 시네마틱 카메라 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private mode: Mode = 'chase';
  /**
   * 카메라 위치는 차 기준 좌표(오른쪽, 위, 앞)로 부드럽게 따라간다.
   * 월드 좌표로 따라가면 빠를수록 카메라가 뒤처져(속도/감쇠율, 158km/h에서 약 11m) 차가 화면 구석으로 밀려난다.
   */
  private offset = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private lookOffset = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  /** 회전만 살짝 늦게 따라가 굽이에서 카메라가 흔들리는 맛을 남긴다. */
  private camYaw = 0;
  /** 카메라가 따라갈 방향. 시네마틱은 도로 방향을 따라 옆 거리가 곧 도로 기준 거리가 되게 한다. */
  private yawTarget = 0;
  /** 시네마틱: 카메라가 있을 쪽 (+1 오른쪽, -1 왼쪽). 늘 도로 가운데 쪽에 둔다. */
  private side = -1;
  private sideSmooth = -1;
  /** 시네마틱: 카메라가 가드레일 안쪽에 머무는 옆 범위 (차 기준, m) */
  private minX = -Infinity;
  private maxX = Infinity;
  private first = true;
  private target = new THREE.Vector3();
  /** 운전석: 굽이 쪽으로 살짝 고개를 돌린 각도 */
  private glance = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1500);
  }

  next(): void {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.first = true;
  }

  update(dt: number, car: Car, elapsed: number): void {
    const p = car.object.position;
    car.setCockpit(this.mode === 'cockpit');

    if (this.mode === 'cockpit') {
      this.updateCockpit(dt, car, elapsed);
      return;
    }
    if (this.mode !== 'cinematic') {
      this.minX = -Infinity;
      this.maxX = Infinity;
    }
    this.yawTarget = this.mode === 'cinematic' ? car.yaw - car.heading : car.yaw;
    if (this.mode === 'chase') {
      // 속도감: 빠를수록 뒤로 물러나고(158km/h에서 약 18m) 시야각이 넓어진다.
      this.desired.set(0, 3.0, -(7.5 + car.speed * 0.24));
      this.desiredLook.set(0, 1.0, 8);
    } else {
      this.cinematic(dt, car, elapsed);
    }
    if (this.first) {
      this.camYaw = this.yawTarget;
      this.offset.copy(this.desired);
      this.lookOffset.copy(this.desiredLook);
    } else {
      // 시네마틱은 도로 방향을 그대로 따른다. 늦게 돌면 굽이에서 옆 거리가 틀어져 가드레일 밖으로 나간다.
      this.camYaw = this.mode === 'cinematic' ? this.yawTarget : THREE.MathUtils.damp(this.camYaw, this.yawTarget, 4, dt);
      this.offset.lerp(this.desired, 1 - Math.exp(-dt * 4));
      this.lookOffset.lerp(this.desiredLook, 1 - Math.exp(-dt * 8));
    }
    // 차가 옆으로 빠르게 움직여도 따라오는 카메라가 가드레일 밖으로 밀리지 않게
    this.offset.x = THREE.MathUtils.clamp(this.offset.x, this.minX, this.maxX);
    this.first = false;

    this.setFov(this.mode === 'chase' ? BASE_FOV + Math.min(car.speed / 44, 1) * 8 : BASE_FOV, dt);

    // 차 기준 좌표 → 월드. 차의 전방 = (-sin, 0, -cos), 오른쪽 = (cos, 0, -sin)
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    const o = this.offset;
    this.camera.position.set(p.x + cos * o.x - sin * o.z, p.y + o.y, p.z - sin * o.x - cos * o.z);
    const l = this.lookOffset;
    this.target.set(p.x + cos * l.x - sin * l.z, p.y + l.y, p.z - sin * l.x - cos * l.z);
    this.camera.lookAt(this.target);
  }

  private setFov(fov: number, dt: number): void {
    if (Math.abs(fov - this.camera.fov) < 0.01) return;
    this.camera.fov = this.first ? fov : THREE.MathUtils.damp(this.camera.fov, fov, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  /**
   * 운전석 1인칭 뷰. 눈은 차에 붙어 있어 언덕에서는 차와 함께 기울고, 굽이에서는 도는 쪽으로 살짝 고개를 돌린다.
   * 빠를수록 시야각이 넓어지고 차가 잘게 떨려 속도감이 난다.
   */
  private updateCockpit(dt: number, car: Car, elapsed: number): void {
    // 세로 화면은 가로 시야가 좁아 핸들만 보이므로 세로 시야각을 넓힌다.
    const portrait = THREE.MathUtils.clamp((1.2 - this.camera.aspect) / 0.7, 0, 1);
    const speedT = Math.min(car.speed / 44, 1);
    this.setFov(COCKPIT_FOV + speedT * COCKPIT_FOV_GAIN + portrait * 12, dt);
    this.glance = this.first ? 0 : THREE.MathUtils.damp(this.glance, car.wheelTurn * 0.12, 3, dt);
    this.first = false;

    const o = car.object;
    o.updateMatrixWorld();
    const e = car.cockpit.eye;
    const shake = speedT * speedT * 0.004;
    this.camera.position.set(e.x, e.y + Math.sin(elapsed * 37) * shake + Math.sin(elapsed * 23) * shake * 0.6, e.z);
    // 차의 앞은 -z. 고개를 아주 조금 숙여 대시보드 너머 도로가 화면 가운데 오게 한다.
    this.target.set(e.x + Math.sin(this.glance) * 10, e.y - 1.3 - portrait * 0.3, e.z - Math.cos(this.glance) * 10);
    o.localToWorld(this.camera.position);
    o.localToWorld(this.target);
    this.camera.lookAt(this.target);
  }

  /** 차 옆을 천천히 오가는 시네마틱 뷰. 차가 화면에 다 들어오고, 가드레일·가로등 너머로 나가지 않게 한다. */
  private cinematic(dt: number, car: Car, elapsed: number): void {
    // 화면 비율에 맞춰 차가 다 들어오는 거리. 세로 화면은 가로 시야가 좁아 더 멀리 선다.
    const halfV = THREE.MathUtils.degToRad(BASE_FOV / 2);
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const radius = car.length * 0.62;
    const dist = Math.max(6.5, (radius / Math.sin(Math.min(halfV, halfH))) * 1.2);

    // 도로 가운데 쪽에 선다. 차선을 바꿀 때만 반대편으로 넘어간다.
    if (car.lateral > 0.8) this.side = -1;
    else if (car.lateral < -0.8) this.side = 1;
    this.sideSmooth = this.first ? this.side : THREE.MathUtils.damp(this.sideSmooth, this.side, 1.5, dt);

    const swing = Math.sin(elapsed * 0.15) * 1.1;
    // 반대편으로 넘어가는 동안에는 차 뒤로 돌아서 지나간다.
    const along = THREE.MathUtils.lerp(dist * Math.sin(swing), -dist * 0.8, 1 - Math.abs(this.sideSmooth));
    // 지금 카메라가 있는 쪽의 가드레일까지 남은 거리
    const sgn = this.sideSmooth >= 0 ? 1 : -1;
    const edge = RAIL_LATERAL - RAIL_MARGIN - 0.5 * MAX_CURVATURE * along * along;
    this.minX = Math.min(0, -edge - car.lateral);
    this.maxX = Math.max(0, edge - car.lateral);
    const room = sgn > 0 ? this.maxX : -this.minX;
    const across = Math.min(dist * Math.cos(swing), room) * this.sideSmooth;
    // 옆으로 물러설 공간이 모자라면 위로 올라가 거리를 지킨다(세로 화면처럼 멀리 서야 할 때).
    const lift = Math.min(Math.sqrt(Math.max(0, dist * dist - across * across - along * along)), dist * 0.8);
    this.desired.set(across, 1.8 + lift + Math.sin(elapsed * 0.23) * 0.6, along);
    this.desiredLook.set(0, 0.8, 0);
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
