import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './random';

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

const FAR_ROCK = { low: new THREE.Color('#8e9dcc'), high: new THREE.Color('#b9c4e6') };
const NEAR_HILL = { low: new THREE.Color('#7fa48e'), high: new THREE.Color('#a3c19b') };
const SNOW = new THREE.Color('#f7f9ff');

/**
 * 각진 산 하나. 원뿔을 울퉁불퉁하게 비틀고, 면마다 높이에 따라 색을 칠한다 (높은 산은 꼭대기가 눈).
 * 바닥은 수평선 아래(-25)에 묻는다.
 */
function mountain(
  rand: () => number, x: number, z: number, radius: number, height: number, snow: boolean,
  tone: { low: THREE.Color; high: THREE.Color },
): THREE.BufferGeometry {
  const sides = 7 + Math.floor(rand() * 3);
  const g = new THREE.ConeGeometry(radius, height, sides, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const moved = new Map<string, [number, number, number]>();
  const leanX = (rand() - 0.5) * radius * 0.35;
  const leanZ = (rand() - 0.5) * radius * 0.35;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const key = `${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)}`;
    let m = moved.get(key);
    if (!m) {
      const t = py / height + 0.5; // 0 바닥 .. 1 꼭대기
      const k = 0.75 + rand() * 0.5;
      // 꼭대기 쪽은 한쪽으로 기울여 비대칭 능선을 만든다
      m = [px * k + leanX * t, py + (t > 0 && t < 1 ? (rand() - 0.5) * height * 0.08 : 0), pz * k + leanZ * t];
      moved.set(key, m);
    }
    pos.setXYZ(i, m[0], m[1], m[2]);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.translate(x, height / 2 - 25, z);
  flat.computeVertexNormals();
  const p = flat.attributes.position as THREE.BufferAttribute;
  const n = flat.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < p.count; f += 3) {
    const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const t = THREE.MathUtils.clamp((cy + 25) / height, 0, 1);
    const up = n.getY(f);
    if (snow && t > 0.62 + (1 - up) * 0.15) c.copy(SNOW);
    else c.copy(tone.low).lerp(tone.high, t).multiplyScalar(0.92 + rand() * 0.12);
    for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

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
  private haze = { value: new THREE.Color() };

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
    // 먼 산맥(푸른빛, 눈 덮인 봉우리)과 그 앞 낮은 언덕 두 겹. 겹마다 한 메쉬로 합친다.
    const rand = mulberry32(4242);
    const far: THREE.BufferGeometry[] = [];
    const near: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + rand() * 0.15;
      const h = 70 + rand() * 90;
      far.push(mountain(rand, Math.cos(a) * 820, Math.sin(a) * 820, 110 + rand() * 80, h, h > 120, FAR_ROCK));
    }
    // 정면 오른쪽(해 옆)에 시안처럼 크게 솟은 설산 하나
    far.push(mountain(rand, 420, -900, 330, 210, true, FAR_ROCK));
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
      const r = 540 + rand() * 60;
      near.push(mountain(rand, Math.cos(a) * r, Math.sin(a) * r, 90 + rand() * 70, 45 + rand() * 45, false, NEAR_HILL));
    }
    this.mountains.add(
      new THREE.Mesh(mergeGeometries(far), this.hazeMaterial(0.42)),
      new THREE.Mesh(mergeGeometries(near), this.hazeMaterial(0.3)),
    );
    far.forEach((g) => g.dispose());
    near.forEach((g) => g.dispose());
  }

  /** 정점 색에 하늘(안개)빛을 일정 비율 섞는 재질. 멀수록 많이 섞어 공기 원근감을 낸다. */
  private hazeMaterial(amount: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.hazeColor = this.haze;
      shader.uniforms.hazeAmount = { value: amount };
      shader.fragmentShader = 'uniform vec3 hazeColor;\nuniform float hazeAmount;\n' + shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, hazeAmount);\n#include <dithering_fragment>',
      );
    };
    return m;
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
    this.haze.value.copy(this.fog.color);
    this.dome.position.set(focus.x, 0, focus.z);
    this.sunDisc.lookAt(focus.x, this.sunDisc.position.y, focus.z + 400);

    // 먼 배경은 차를 따라다녀 끝없이 멀리 있는 것처럼 보인다.
    this.mountains.position.set(focus.x, 0, focus.z);
    this.stars.position.set(focus.x, 0, focus.z);
    this.clouds.position.set(focus.x, 0, focus.z);
    this.clouds.rotation.y += dt * 0.004;
  }
}
