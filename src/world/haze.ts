import * as THREE from 'three';

/**
 * 재질의 최종 색에 하늘(안개)빛을 amount 비율로 섞는다. 안개를 끈 먼 배경(산, 랜드마크)에 공기 원근감을 준다.
 * color·amount는 uniform 객체라 바깥에서 값을 바꾸면 바로 반영된다.
 */
export function addHaze<M extends THREE.Material>(
  material: M, color: { value: THREE.Color }, amount: { value: number },
): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = color;
    shader.uniforms.hazeAmount = amount;
    shader.fragmentShader = 'uniform vec3 hazeColor;\nuniform float hazeAmount;\n' + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      'gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, hazeAmount);\n#include <dithering_fragment>',
    );
  };
  return material;
}
