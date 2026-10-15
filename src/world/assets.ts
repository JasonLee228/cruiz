import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Kenney Nature Kit (CC0)의 로우폴리 모델. 모델 하나는 수십~수백 삼각형이라 가볍다.
 * 재질 이름으로 잎/줄기/돌을 구분해 두고, 색은 청크를 만들 때 팔레트로 칠한다.
 */
export type Part = 0 | 1 | 2; // 0 잎, 1 줄기, 2 돌
export const LEAF = 0, BARK = 1, STONE = 2;

export interface Variant {
  position: Float32Array;
  normal: Float32Array;
  index: Uint16Array;
  part: Uint8Array;
  height: number;
}

export interface ScenerySet {
  roundTrees: Variant[];
  pines: Variant[];
  rocks: Variant[];
  bushes: Variant[];
}

const FILES = {
  roundTrees: ['tree_default', 'tree_oak', 'tree_fat', 'tree_tall', 'tree_simple', 'tree_plateau', 'tree_small'],
  pines: ['tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineSmallA', 'tree_pineSmallC', 'tree_pineDefaultA'],
  rocks: ['stone_largeA', 'stone_largeC', 'stone_largeE', 'stone_tallA', 'stone_tallC', 'stone_tallE', 'stone_smallA', 'stone_smallD', 'stone_smallG'],
  bushes: ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed'],
} as const;

/** 불러오기가 끝나면 채워진다. 실패하면 null이라 기존 코드 생성 모양을 쓴다. */
export let scenery: ScenerySet | null = null;

function partOf(material: THREE.Material | THREE.Material[]): Part {
  const name = (Array.isArray(material) ? material[0] : material).name.toLowerCase();
  if (name.startsWith('wood')) return BARK;
  if (name.includes('stone') || name.includes('dirt')) return STONE;
  return LEAF;
}

function toVariant(root: THREE.Object3D): Variant {
  root.updateMatrixWorld(true);
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let height = 0;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const part = partOf(obj.material);
    const base = positions.length / 3;
    normalMatrix.getNormalMatrix(obj.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      positions.push(v.x, v.y, v.z);
      height = Math.max(height, v.y);
      v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      normals.push(v.x, v.y, v.z);
      parts.push(part);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) indices.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) indices.push(base + i);
  });
  return {
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    index: new Uint16Array(indices),
    part: new Uint8Array(parts),
    height: Math.max(height, 0.01),
  };
}

/** 에셋을 모두 받아 둔다. 하나라도 실패하면 조용히 포기하고 기존 모양을 쓴다. */
export async function loadScenery(): Promise<void> {
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}models/nature/`;
  try {
    const load = (names: readonly string[]) =>
      Promise.all(names.map((n) => loader.loadAsync(`${base}${n}.glb`).then((g) => toVariant(g.scene))));
    const [roundTrees, pines, rocks, bushes] = await Promise.all([
      load(FILES.roundTrees), load(FILES.pines), load(FILES.rocks), load(FILES.bushes),
    ]);
    scenery = { roundTrees, pines, rocks, bushes };
  } catch (err) {
    console.warn('자연 에셋을 불러오지 못해 기본 모양을 씁니다', err);
    scenery = null;
  }
}
