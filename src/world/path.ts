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
export function terrainY(x: number, z: number): number {
  const cx = roadX(z);
  const base = roadY(z);
  const d = Math.abs(x - cx);
  const shoulder = ROAD_HALF_WIDTH + 2;
  const t = Math.min(Math.max((d - shoulder) / 40, 0), 1);
  const hills =
    noise2(x / 45, z / 45) * 14 + noise2(x / 14 + 7, z / 14 + 3) * 3 + Math.max(0, d - 60) * 0.18;
  return base - 0.25 + t * t * hills;
}
