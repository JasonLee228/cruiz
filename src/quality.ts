import * as THREE from 'three';
import type { Post } from './post';

/**
 * 화질 단계. 실제 프레임을 재서 느리면 한 단계씩 낮춘다 (다시 올리지는 않아 깜빡임이 없다).
 * 고른 단계는 저장해 두고 다음 방문 때 그 단계부터 시작한다.
 *  - high: 후처리(블룸·색보정·MSAA), 픽셀 비율 최대 1.5
 *  - medium: 후처리 없이 바로 그림, 픽셀 비율 1
 *  - low: 픽셀 비율 0.75, 그림자 해상도 절반
 */
const LEVELS = ['high', 'medium', 'low'] as const;
type Level = (typeof LEVELS)[number];
const KEY = 'cruiz.quality';

function load(): Level {
  const param = new URLSearchParams(location.search).get('quality');
  if (param && (LEVELS as readonly string[]).includes(param)) return param as Level;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (LEVELS as readonly string[]).includes(saved)) return saved as Level;
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return 'high';
}

export class Quality {
  level: Level = load();
  private frames = 0;
  private time = 0;
  private warmup = 2; // 처음 몇 초는 청크 생성 등으로 느리니 재지 않는다

  constructor(private renderer: THREE.WebGLRenderer, private post: Post, private sun: THREE.DirectionalLight) {
    this.apply();
  }

  private apply(): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio = this.level === 'high' ? Math.min(dpr, 1.5) : this.level === 'medium' ? Math.min(dpr, 1) : 0.75;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.enabled = this.level === 'high';
    if (this.post.enabled) this.post.resize(window.innerWidth, window.innerHeight);
    const shadow = this.level === 'low' ? 512 : 1024;
    if (this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    try { localStorage.setItem(KEY, this.level); } catch { /* 무시 */ }
  }

  /** 매 프레임 호출. 3초 평균이 45fps 미만이면 한 단계 낮춘다. */
  update(dt: number): void {
    if (this.warmup > 0) { this.warmup -= dt; return; }
    this.frames++;
    this.time += dt;
    if (this.time < 3) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const i = LEVELS.indexOf(this.level);
    if (fps < 45 && i < LEVELS.length - 1) {
      this.level = LEVELS[i + 1];
      this.apply();
      this.warmup = 1;
    }
  }
}
