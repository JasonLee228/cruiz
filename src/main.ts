import * as THREE from 'three';
import { Car } from './car/car';
import { CameraRig } from './car/camera';
import { Input } from './input';
import { ChunkManager, lineMaterial } from './world/chunks';
import { loadScenery } from './world/assets';
import { Sky } from './world/sky';
import { Landmarks } from './world/landmarks';
import { loadCarId, mountCarPicker } from './ui/carPicker';
import { createPost } from './post';
import { Quality } from './quality';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const sky = new Sky(scene);
const world = new ChunkManager(scene);
const landmarks = new Landmarks(scene);
const car = new Car(loadCarId() ?? undefined);
scene.add(car.object);
const rig = new CameraRig();
const input = new Input(canvas);
const post = createPost(renderer, scene, rig.camera);
const quality = new Quality(renderer, post, sky.sun);

// FPS 표시 (설정에서 켜고 끈다, 켠 상태는 저장)
const fpsBox = document.getElementById('fps')!;
const fpsToggle = document.getElementById('opt-fps') as HTMLInputElement;
const FPS_KEY = 'cruiz.showFps';
try { fpsToggle.checked = localStorage.getItem(FPS_KEY) === '1'; } catch { /* 무시 */ }
fpsBox.hidden = !fpsToggle.checked;
fpsToggle.addEventListener('change', () => {
  fpsBox.hidden = !fpsToggle.checked;
  try { localStorage.setItem(FPS_KEY, fpsToggle.checked ? '1' : '0'); } catch { /* 무시 */ }
});
const QUALITY_LABEL = { high: '높음', medium: '중간', low: '낮음' } as const;
let fpsFrames = 0;
let fpsTime = 0;
function updateFps(raw: number): void {
  fpsFrames++;
  fpsTime += raw;
  if (fpsTime < 0.5) return;
  if (!fpsBox.hidden) fpsBox.textContent = `${Math.round(fpsFrames / fpsTime)} fps · 화질 ${QUALITY_LABEL[quality.level]}`;
  fpsFrames = 0;
  fpsTime = 0;
}

const hud = document.getElementById('hud')!;
const hudSpeed = document.getElementById('hud-speed')!;
const hudDistance = document.getElementById('hud-distance')!;
const hudMode = document.getElementById('hud-mode')!;
const startScreen = document.getElementById('start')!;
const startButton = document.getElementById('start-button')!;
const heroTitle = document.getElementById('hero-title')!;
const heroSub = document.getElementById('hero-sub')!;
const settingsBtn = document.getElementById('btn-settings')!;
const settingsPanel = document.getElementById('settings-panel')!;
const soundBtn = document.getElementById('btn-sound')!;

const COPY = {
  day: ['Just Drive', 'Beautiful roads, brighter days.'],
  sunset: ['A Softer Way to Anywhere', 'No destinations. Just good roads.'],
  night: ['Same Roads, New Feelings.', 'Day, sunset, or night — the road is always yours.'],
} as const;
let shownPhase = '';
function syncTheme(): void {
  const phase = sky.phase;
  if (phase === shownPhase) return;
  shownPhase = phase;
  document.body.dataset.phase = phase;
  [heroTitle.textContent, heroSub.textContent] = COPY[phase];
  document.querySelectorAll<HTMLElement>('[data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === phase));
}
document.querySelectorAll<HTMLElement>('[data-theme-set]').forEach((b) =>
  b.addEventListener('click', () => sky.setPhase(b.dataset.themeSet as 'day' | 'sunset' | 'night')),
);
settingsBtn.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsBtn.setAttribute('aria-expanded', String(!settingsPanel.hidden));
});
// 소리는 아직 없다. 버튼은 자리만 잡아 두고 상태만 토글한다.
soundBtn.addEventListener('click', () => soundBtn.setAttribute('aria-pressed', String(soundBtn.getAttribute('aria-pressed') !== 'true')));

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
  if (!started && (e.key.startsWith('Arrow') || (!(e.target instanceof HTMLButtonElement) && (e.key === 'Enter' || e.key === ' ')))) start();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.resize(window.innerWidth, window.innerHeight);
  rig.resize();
});

const clock = new THREE.Clock();
let elapsed = 0;

function frame(): void {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 20);
  quality.update(raw);
  updateFps(raw);
  elapsed += dt;

  if (started) input.update();
  car.update(dt, input.state);
  world.update(car.z);
  sky.update(dt, car.object.position);
  landmarks.update(car.z, sky.night);
  syncTheme();
  car.setNight(sky.night);
  rig.update(dt, car, elapsed);

  hudSpeed.textContent = Math.round(car.speed * 3.6).toString();
  hudDistance.textContent = (car.distance / 1000).toFixed(1);

  post.setNight(sky.night);
  // 차선은 조명을 받지 않는 재질이라, 밤에는 직접 어둡게 해 과하게 번지지 않게 한다
  lineMaterial.color.setScalar(0.9 * (1 - sky.night * 0.5));
  post.render(dt);
  requestAnimationFrame(frame);
}

// 테스트·스크린샷용 훅
(window as unknown as { cruiz: unknown }).cruiz = { car, sky, rig, start, quality, renderer };

// 자연 에셋(약 300KB)을 먼저 받고 시작한다. 실패해도 기본 모양으로 이어진다.
loadScenery().finally(() => requestAnimationFrame(frame));
