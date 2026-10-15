import * as THREE from 'three';
import { Car } from './car/car';
import { CameraRig } from './car/camera';
import { Input } from './input';
import { ChunkManager } from './world/chunks';
import { Sky } from './world/sky';
import { loadCarId, mountCarPicker } from './ui/carPicker';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sky = new Sky(scene);
const world = new ChunkManager(scene);
const car = new Car(loadCarId() ?? undefined);
scene.add(car.object);
const rig = new CameraRig();
const input = new Input(canvas);

const hud = document.getElementById('hud')!;
const hudSpeed = document.getElementById('hud-speed')!;
const hudDistance = document.getElementById('hud-distance')!;
const hudMode = document.getElementById('hud-mode')!;
const startScreen = document.getElementById('start')!;
const startButton = document.getElementById('start-button')!;

mountCarPicker(document.getElementById('car-picker')!, (spec) => car.setType(spec));

input.onToggleCamera = () => rig.next();
input.onToggleAutopilot = (on) => (hudMode.hidden = !on);

// 출발 전에는 자동 주행으로 천천히 달리며 배경처럼 보여준다.
let started = false;
input.state.autopilot = true;
car.targetSpeed = 12;

function start(): void {
  if (started) return;
  started = true;
  startScreen.classList.add('hidden');
  hud.hidden = false;
  input.state.autopilot = false;
  car.targetSpeed = 22;
}
startButton.addEventListener('click', start);
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest?.('#car-picker')) return;
  if (!started && (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow'))) start();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize();
});

const clock = new THREE.Clock();
let elapsed = 0;

function frame(): void {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  elapsed += dt;

  if (started) input.update();
  car.update(dt, input.state);
  world.update(car.z);
  sky.update(dt, car.object.position);
  car.setNight(sky.night);
  rig.update(dt, car, elapsed);

  hudSpeed.textContent = Math.round(car.speed * 3.6).toString();
  hudDistance.textContent = (car.distance / 1000).toFixed(1);

  renderer.render(scene, rig.camera);
  requestAnimationFrame(frame);
}

// 테스트·스크린샷용 훅
(window as unknown as { cruiz: unknown }).cruiz = { car, sky, rig, start };

requestAnimationFrame(frame);
