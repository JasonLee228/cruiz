import * as THREE from 'three';
import { mulberry32 } from './random';
import { STONE, type Variant } from './assets';

/**
 * 길가 절벽 바위. 시안처럼 면이 크게 꺾인 연한 베이지 바위에 윗면만 풀이 덮인 모양.
 * 코드로 몇 가지 모양을 만들어 두고 청크마다 골라 쓴다 (내려받을 파일 없음).
 */
const ROCK_TONES = ['#e8d9bb', '#dccaa8', '#efe3c9', '#d3c09e'].map((c) => new THREE.Color(c));
const GRASS_TONES = ['#8fd283', '#7cc678', '#9fdc8a'].map((c) => new THREE.Color(c));
const VARIANTS = 6;

function cliffVariant(seed: number): Variant {
  const rand = mulberry32(seed);
  // 세분 1단계 정이십면체(80면)를 울퉁불퉁하게 밀고 세로로 늘린다
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  // 같은 꼭짓점은 같은 양만큼 밀어야 면 사이에 틈이 안 생긴다
  const pushed = new Map<string, number>();
  // 도로를 따라 길고(z) 도로 쪽으로는 얇으며(x) 높게 세워 바위 벽처럼 보이게 한다
  const sx = 0.7 + rand() * 0.2;
  const sy = 1.5 + rand() * 0.6;
  const sz = 1.15 + rand() * 0.4;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = pushed.get(key);
    if (k === undefined) {
      k = 0.78 + rand() * 0.4;
      pushed.set(key, k);
    }
    v.multiplyScalar(k);
    // 윗부분은 살짝 평평하게 깎아 풀이 앉을 자리를 만든다
    if (v.y > 0.5) v.y = 0.5 + (v.y - 0.5) * 0.3;
    pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals(); // 정점을 공유하지 않는 지오메트리라 면 법선이 된다
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  g.translate(0, -minY, 0);

  const n = g.attributes.normal as THREE.BufferAttribute;
  const color = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  let radius = 0;
  let height = 0;
  for (let i = 0; i < pos.count; i += 3) {
    // 면 하나에 한 색: 위를 향한 면은 풀, 나머지는 바위 (아래쪽은 조금 어둡게)
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    if (ny > 0.72) c.copy(GRASS_TONES[Math.floor(rand() * GRASS_TONES.length)]);
    else c.copy(ROCK_TONES[Math.floor(rand() * ROCK_TONES.length)]).multiplyScalar(0.86 + Math.min(y / 2, 1) * 0.14);
    for (let k = 0; k < 3; k++) {
      c.toArray(color, (i + k) * 3);
      radius = Math.max(radius, Math.hypot(pos.getX(i + k), pos.getZ(i + k)));
      height = Math.max(height, pos.getY(i + k));
    }
  }
  const index = new Uint16Array(pos.count);
  for (let i = 0; i < pos.count; i++) index[i] = i;
  const variant: Variant = {
    position: new Float32Array(pos.array as Float32Array),
    normal: new Float32Array(n.array as Float32Array),
    index,
    part: new Uint8Array(pos.count).fill(STONE),
    color,
    height,
    radius,
    tris: pos.count / 3,
  };
  g.dispose();
  return variant;
}

export const cliffVariants: Variant[] = Array.from({ length: VARIANTS }, (_, i) => cliffVariant(1000 + i * 7919));
