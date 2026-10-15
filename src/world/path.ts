import { noise1, noise2 } from './random';

/**
 * 도로 중심선. 차는 -z 방향으로 달리고, 도로는 z의 함수로 정의된다.
 * 함수로 정의하므로 청크 경계에서 이음매가 생기지 않고, 끝없이 이어진다.
 */

export const ROAD_HALF_WIDTH = 4.2;

/** 도로 중심 x. 큰 굽이 + 작은 굽이를 겹쳐 자연스러운 곡선을 만든다. */
export function roadX(z: number): number {
  const s = -z;
  const big = (noise1(s / 420) - 0.5) * 160;
  const small = (noise1(s / 130 + 50) - 0.5) * 36;
  return big + small;
}

/** 도로 높이. 완만한 언덕. */
export function roadY(z: number): number {
  const s = -z;
  return (noise1(s / 300 + 100) - 0.5) * 22 + (noise1(s / 90 + 200) - 0.5) * 4;
}

/** z에 대한 미분 (수치 미분) */
export function roadDX(z: number): number {
  return (roadX(z + 0.5) - roadX(z - 0.5)) / 1;
}

export function roadDY(z: number): number {
  return (roadY(z + 0.5) - roadY(z - 0.5)) / 1;
}

/** 도로 주변 지형 높이. 도로에서 멀수록 언덕이 솟는다. */
/** 수면 높이. 도로를 따라 완만하게 오르내린다. */
export function waterY(z: number): number {
  return roadY(z) - 9;
}

/** 도로 오른쪽(+x)은 바다, 왼쪽은 산과 숲 */
export function terrainY(x: number, z: number): number {
  const cx = roadX(z);
  const base = roadY(z);
  const d = Math.abs(x - cx);
  if (x > cx) {
    // 바다 쪽: 해안 절벽 → 물 속으로 내려간다. 가끔 곶이 솟는다.
    const cape = Math.max(0, noise2(x / 60 + 11, z / 60 + 5) - 0.62) * 70;
    const drop = Math.min(Math.max((d - 10) / 26, 0), 1);
    const sea = waterY(z) - 5;
    const land = base - 0.25;
    return land + (sea - land) * drop * drop * (3 - 2 * drop) + cape * Math.min(d / 60, 1);
  }
  const shoulder = ROAD_HALF_WIDTH + 2;
  const t = Math.min(Math.max((d - shoulder) / 40, 0), 1);
  const hills =
    noise2(x / 45, z / 45) * 14 + noise2(x / 14 + 7, z / 14 + 3) * 3 + Math.max(0, d - 60) * 0.18;
  return base - 0.25 + t * t * hills;
}
