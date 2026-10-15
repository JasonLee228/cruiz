import * as THREE from 'three';
import type { Car } from './car';

type Mode = 'chase' | 'cockpit' | 'cinematic';
const MODES: Mode[] = ['chase', 'cockpit', 'cinematic'];

/** 추적 / 운전석 / 시네마틱 카메라 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private mode: Mode = 'chase';
  private desired = new THREE.Vector3();
  private look = new THREE.Vector3();
  private smoothLook = new THREE.Vector3();
  private first = true;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
  }

  next(): void {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.first = true;
  }

  update(dt: number, car: Car, elapsed: number): void {
    const p = car.object.position;
    const yaw = car.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // 차의 전방 = (-sin, 0, -cos)

    if (this.mode === 'cockpit') {
      this.desired.set(p.x - sin * 0.1 + cos * -0.35, p.y + 1.35, p.z - cos * 0.1 + sin * 0.35);
      this.look.set(p.x - sin * 30, p.y + 1.0, p.z - cos * 30);
      this.camera.position.copy(this.desired);
      this.smoothLook.copy(this.look);
    } else {
      const speedFactor = Math.min(car.speed / 33, 1);
      if (this.mode === 'chase') {
        const back = 7.5 + speedFactor * 1.5;
        this.desired.set(p.x + sin * back, p.y + 3.0, p.z + cos * back);
        this.look.set(p.x - sin * 8, p.y + 1.0, p.z - cos * 8);
      } else {
        // 차 옆에서 천천히 도는 시네마틱 뷰
        const a = yaw + Math.PI / 2 + Math.sin(elapsed * 0.15) * 1.1;
        this.desired.set(p.x + Math.sin(a) * 11, p.y + 2.4 + Math.sin(elapsed * 0.23) * 1.2, p.z + Math.cos(a) * 11);
        this.look.set(p.x, p.y + 0.9, p.z);
      }
      if (this.first) {
        this.camera.position.copy(this.desired);
        this.smoothLook.copy(this.look);
      } else {
        const k = 1 - Math.exp(-dt * 4);
        this.camera.position.lerp(this.desired, k);
        this.smoothLook.lerp(this.look, 1 - Math.exp(-dt * 8));
      }
    }
    this.first = false;
    this.camera.lookAt(this.smoothLook);
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
