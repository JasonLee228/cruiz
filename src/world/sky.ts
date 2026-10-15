import * as THREE from 'three';

/** 하루 한 바퀴 (초). 4분이면 노을과 밤을 금방 만난다. */
const DAY_LENGTH = 240;

interface Mood {
  sky: string;
  fog: string;
  sun: string;
  sunIntensity: number;
  ambient: number;
  night: number;
}

// 시간 0 = 아침. 순서대로 보간하며 돈다.
const MOODS: Mood[] = [
  { sky: '#9fd3e6', fog: '#cfe6dc', sun: '#fff1d0', sunIntensity: 2.4, ambient: 1.1, night: 0 }, // 아침
  { sky: '#7cc4e8', fog: '#bfe0e6', sun: '#ffffff', sunIntensity: 2.8, ambient: 1.2, night: 0 }, // 한낮
  { sky: '#f2b880', fog: '#f5c9a0', sun: '#ffb070', sunIntensity: 2.0, ambient: 0.9, night: 0 }, // 노을
  { sky: '#c0688a', fog: '#b8708e', sun: '#ff8a6a', sunIntensity: 0.9, ambient: 0.6, night: 0.5 }, // 해질녘
  { sky: '#1d1f3d', fog: '#262850', sun: '#8fa0ff', sunIntensity: 0.35, ambient: 0.35, night: 1 }, // 밤
  { sky: '#3a3866', fog: '#4b4878', sun: '#c7b0ff', sunIntensity: 0.6, ambient: 0.5, night: 0.7 }, // 새벽
];

export class Sky {
  readonly sun = new THREE.DirectionalLight('#ffffff', 2.5);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#5d7a4a', 1);
  readonly fog: THREE.Fog;
  readonly background = new THREE.Color();
  /** 0..1, 헤드라이트 켤 정도 */
  night = 0;
  time: number;

  private clouds = new THREE.Group();
  private cloudMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false });
  private mountains = new THREE.Group();
  private stars: THREE.Points;

  constructor(scene: THREE.Scene, startTime = 0.08) {
    this.time = startTime;
    this.fog = new THREE.Fog('#cfe6dc', 60, 520);
    scene.fog = this.fog;
    scene.background = this.background;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 260;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun, this.sun.target, this.hemi);

    this.buildMountains();
    this.buildClouds();
    this.stars = this.buildStars();
    scene.add(this.mountains, this.clouds, this.stars);
  }

  private buildMountains(): void {
    const mat = new THREE.MeshLambertMaterial({ color: '#7d8fb0', flatShading: true, fog: false });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const h = 70 + Math.random() * 120;
      const m = new THREE.Mesh(new THREE.ConeGeometry(70 + Math.random() * 70, h, 5 + Math.floor(Math.random() * 3)), mat);
      m.position.set(Math.cos(a) * 780, h / 2 - 25, Math.sin(a) * 780);
      m.rotation.y = Math.random() * Math.PI;
      this.mountains.add(m);
    }
  }

  private buildClouds(): void {
    const mat = this.cloudMaterial;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < puffs; j++) {
        const p = new THREE.Mesh(geo, mat);
        p.scale.set(14 + Math.random() * 10, 7 + Math.random() * 5, 12 + Math.random() * 8);
        p.position.set(j * 16 - puffs * 8, Math.random() * 4, Math.random() * 8);
        cloud.add(p);
      }
      const a = Math.random() * Math.PI * 2;
      const r = 200 + Math.random() * 380;
      cloud.position.set(Math.cos(a) * r, 110 + Math.random() * 60, Math.sin(a) * r);
      this.clouds.add(cloud);
    }
  }

  private buildStars(): THREE.Points {
    const positions: number[] = [];
    for (let i = 0; i < 600; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      const r = 900;
      positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 });
    return new THREE.Points(g, m);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    const f = this.time * MOODS.length;
    const a = MOODS[Math.floor(f) % MOODS.length];
    const b = MOODS[(Math.floor(f) + 1) % MOODS.length];
    const t = THREE.MathUtils.smoothstep(f - Math.floor(f), 0, 1);

    this.background.set(a.sky).lerp(new THREE.Color(b.sky), t);
    this.fog.color.set(a.fog).lerp(new THREE.Color(b.fog), t);
    this.sun.color.set(a.sun).lerp(new THREE.Color(b.sun), t);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    this.hemi.intensity = THREE.MathUtils.lerp(a.ambient, b.ambient, t);
    this.hemi.color.copy(this.fog.color).lerp(new THREE.Color('#ffffff'), 0.5);
    this.night = THREE.MathUtils.lerp(a.night, b.night, t);
    // 구름 아랫면이 너무 어두워지지 않도록 하늘빛을 받아 은은하게 밝힌다.
    this.cloudMaterial.emissive.copy(this.fog.color).multiplyScalar(0.55);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, this.night - 0.3) * 1.4;

    // 해는 하루 동안 하늘을 가로지른다. 그림자는 차 주변에만 드리운다.
    const angle = this.time * Math.PI * 2;
    this.sun.position.set(focus.x + Math.cos(angle) * 80 + 40, focus.y + 90 + Math.sin(angle) * 30, focus.z + 50);
    this.sun.target.position.copy(focus);

    // 먼 배경은 차를 따라다녀 끝없이 멀리 있는 것처럼 보인다.
    this.mountains.position.set(focus.x, 0, focus.z);
    this.stars.position.set(focus.x, 0, focus.z);
    this.clouds.position.set(focus.x, 0, focus.z);
    this.clouds.rotation.y += dt * 0.004;
  }
}
