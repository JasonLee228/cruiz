import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 하루 한 바퀴 (초). 4분이면 노을과 밤을 금방 만난다. */
const DAY_LENGTH = 240;

interface Mood {
  sky: string;
  top: string;
  fog: string;
  sun: string;
  sunIntensity: number;
  ambient: number;
  night: number;
}

// 시간 0 = 아침. 순서대로 보간하며 돈다.
const MOODS: Mood[] = [
  { sky: '#bfe3f2', top: '#6fb6ea', fog: '#d3ebf2', sun: '#fff3d8', sunIntensity: 1.9, ambient: 1.7, night: 0 }, // 아침
  { sky: '#c4e6f5', top: '#5aa9e6', fog: '#d6edf5', sun: '#ffffff', sunIntensity: 2.0, ambient: 1.8, night: 0 }, // 한낮
  { sky: '#ffd0a8', top: '#a98ad6', fog: '#f9cfb3', sun: '#ffb88a', sunIntensity: 1.6, ambient: 1.4, night: 0 }, // 노을
  { sky: '#f4a6b6', top: '#7a6bc2', fog: '#e9a8bc', sun: '#ff9a86', sunIntensity: 0.9, ambient: 1.0, night: 0.5 }, // 해질녘
  { sky: '#4a4a8c', top: '#171a45', fog: '#3a3a78', sun: '#9fb0ff', sunIntensity: 0.7, ambient: 1.05, night: 1 }, // 밤
  { sky: '#8a78c0', top: '#2b2c66', fog: '#6c5ea6', sun: '#d2bfff', sunIntensity: 0.8, ambient: 1.1, night: 0.7 }, // 새벽
];

export class Sky {
  readonly sun = new THREE.DirectionalLight('#ffffff', 2.5);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#8fb27a', 1);
  readonly fog: THREE.Fog;
  readonly background = new THREE.Color();
  /** 0..1, 헤드라이트 켤 정도 */
  night = 0;
  time: number;

  private clouds = new THREE.Group();
  private cloudMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false });
  private mountains = new THREE.Group();
  private stars: THREE.Points;
  private sunDisc: THREE.Mesh;
  private dome: THREE.Mesh;
  private domeUniforms = {
    top: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
    glow: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0.1, 0.2, -1) },
    glowAmount: { value: 0 },
  };
  private mountainMaterial!: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, startTime = 0.08) {
    this.time = startTime;
    this.fog = new THREE.Fog('#d3ebf2', 70, 560);
    scene.fog = this.fog;
    scene.background = this.background;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -45; cam.right = 45; cam.top = 45; cam.bottom = -45; cam.near = 1; cam.far = 260;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun, this.sun.target, this.hemi);

    this.buildMountains();
    this.buildClouds();
    this.stars = this.buildStars();
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: '#fff4c8', fog: false, depthWrite: false }),
    );
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1300, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.domeUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sunDir; uniform float glowAmount;
          void main(){
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 c = mix(bottom, top, smoothstep(0.0, 0.55, h));
            float g = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 6.0);
            c += glow * g * glowAmount;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.dome.renderOrder = -10;
    scene.add(this.dome, this.mountains, this.clouds, this.stars, this.sunDisc);
  }

  /** UI 테마용: 지금이 낮 / 노을 / 밤 중 어디인지 */
  get phase(): 'day' | 'sunset' | 'night' {
    const f = this.time * MOODS.length;
    if (f >= 2 && f < 4) return 'sunset';
    if (f >= 4 && f < 5.5) return 'night';
    return 'day';
  }

  setPhase(phase: 'day' | 'sunset' | 'night'): void {
    this.time = { day: 0.1, sunset: 0.37, night: 0.7 }[phase];
  }

  private buildMountains(): void {
    // 산과 눈덮인 꼭대기를 각각 한 메쉬로 합쳐 그리기 호출을 줄인다
    this.mountainMaterial = new THREE.MeshLambertMaterial({ color: '#a7b6dc', flatShading: true, fog: false });
    const snow = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false });
    const peaks: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + Math.random() * 0.2;
      const h = 70 + Math.random() * 130;
      const r = 70 + Math.random() * 70;
      const sides = 5 + Math.floor(Math.random() * 3);
      const rot = Math.random() * Math.PI;
      const x = Math.cos(a) * 780;
      const z = Math.sin(a) * 780;
      peaks.push(new THREE.ConeGeometry(r, h, sides).rotateY(rot).translate(x, h / 2 - 25, z).toNonIndexed());
      if (h > 120) {
        caps.push(new THREE.ConeGeometry(r * 0.3 * 1.06, h * 0.3 * 1.02, sides).rotateY(rot).translate(x, h - 25 - h * 0.15, z).toNonIndexed());
      }
    }
    this.mountains.add(new THREE.Mesh(mergeGeometries(peaks), this.mountainMaterial));
    if (caps.length) this.mountains.add(new THREE.Mesh(mergeGeometries(caps), snow));
  }

  private buildClouds(): void {
    // 구름 조각을 모두 한 InstancedMesh로 그린다 (조각마다 그리기 호출이 생기지 않게)
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const puffs: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 200 + Math.random() * 380;
      const cx = Math.cos(a) * r;
      const cy = 80 + Math.random() * 50;
      const cz = Math.sin(a) * r;
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        puffs.push(new THREE.Matrix4().compose(
          new THREE.Vector3(cx + j * 16 - n * 8, cy + Math.random() * 4, cz + Math.random() * 8),
          q,
          new THREE.Vector3(14 + Math.random() * 10, 7 + Math.random() * 5, 12 + Math.random() * 8),
        ));
      }
    }
    const mesh = new THREE.InstancedMesh(geo, this.cloudMaterial, puffs.length);
    puffs.forEach((m, i) => mesh.setMatrixAt(i, m));
    this.clouds.add(mesh);
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
    this.domeUniforms.bottom.value.copy(this.background);
    this.domeUniforms.top.value.set(a.top).lerp(new THREE.Color(b.top), t);
    this.fog.color.set(a.fog).lerp(new THREE.Color(b.fog), t);
    this.sun.color.set(a.sun).lerp(new THREE.Color(b.sun), t);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    this.hemi.intensity = THREE.MathUtils.lerp(a.ambient, b.ambient, t);
    this.hemi.color.copy(this.fog.color).lerp(new THREE.Color('#ffffff'), 0.5);
    this.night = THREE.MathUtils.lerp(a.night, b.night, t);
    // 구름 아랫면이 너무 어두워지지 않도록 하늘빛을 받아 은은하게 밝힌다.
    this.cloudMaterial.emissive.copy(this.fog.color).multiplyScalar(0.7);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, this.night - 0.3) * 1.4;

    // 해는 하루 동안 하늘을 가로지른다. 그림자는 차 주변에만 드리운다.
    const angle = this.time * Math.PI * 2;
    this.sun.position.set(focus.x + Math.cos(angle) * 80 + 40, focus.y + 90 + Math.sin(angle) * 30, focus.z + 50);
    this.sun.target.position.copy(focus);

    // 해 원반: 낮에는 높이, 노을에는 수평선 근처에 걸린다.
    const elev = Math.cos((this.time - 0.17) * Math.PI * 2);
    this.sunDisc.visible = elev > -0.05;
    this.sunDisc.position.set(focus.x + 120, Math.max(elev, -0.05) * 380 + 20, focus.z - 760);
    this.sunDisc.scale.setScalar(55 + (1 - Math.max(elev, 0)) * 30);
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(this.sun.color).lerp(new THREE.Color('#fff4c8'), 0.4).multiplyScalar(1.6);
    this.domeUniforms.glow.value.copy(this.sun.color);
    this.domeUniforms.glowAmount.value = 0.5 * (1 - Math.max(elev, 0) * 0.6) * (this.night > 0.8 ? 0.3 : 1);
    this.domeUniforms.sunDir.value.set(120, this.sunDisc.position.y, -760);
    this.mountainMaterial.color.set('#a7b6dc').lerp(this.fog.color, 0.45);
    this.dome.position.set(focus.x, 0, focus.z);
    this.sunDisc.lookAt(focus.x, this.sunDisc.position.y, focus.z + 400);

    // 먼 배경은 차를 따라다녀 끝없이 멀리 있는 것처럼 보인다.
    this.mountains.position.set(focus.x, 0, focus.z);
    this.stars.position.set(focus.x, 0, focus.z);
    this.clouds.position.set(focus.x, 0, focus.z);
    this.clouds.rotation.y += dt * 0.004;
  }
}
