import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** 부드러운 색보정: 그림자에 보랏빛을 살짝 깔고, 채도를 올리고, 가장자리를 은은히 어둡게 한다. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tint: { value: new THREE.Color('#ffe6cf') },
    amount: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 tint; uniform float amount; varying vec2 vUv;
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // 채도 +18%
      c = max(mix(vec3(l), c, 1.18), 0.0);
      // 그림자는 차갑고 보랏빛으로, 밝은 곳은 따뜻하게
      c = mix(c, c * vec3(0.92, 0.9, 1.08), (1.0 - smoothstep(0.0, 0.5, l)) * 0.6);
      c = mix(c, c * tint * 1.04, smoothstep(0.45, 1.0, l) * 0.35);
      // 대비는 부드럽게 (S 커브)
      vec3 sc = clamp(c, 0.0, 1.0);
      c += (sc * sc * (3.0 - 2.0 * sc) - sc) * 0.25 * amount;
      // 비네트
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 0.55;
      gl_FragColor = vec4(c, src.a);
    }`,
};

export interface Post {
  render(dt: number): void;
  resize(w: number, h: number): void;
  /** 밤에는 블룸을 키워 가로등·헤드라이트를 번지게 한다 */
  setNight(n: number): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Post {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(size, 0.32, 0.9, 0.82);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  return {
    render: (dt) => composer.render(dt),
    resize: (w, h) => composer.setSize(w, h),
    setNight: (n) => {
      bloom.strength = 0.32 + n * 0.3;
      bloom.threshold = 0.82 - n * 0.08;
    },
  };
}
