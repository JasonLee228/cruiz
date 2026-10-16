// 주행 소리: 파일 없이 Web Audio로 만든다 (엔진 웅웅, 바람·노면, 멀리 파도).
// 브라우저는 사용자가 누르기 전에는 소리를 막으므로, 첫 클릭·터치·키 입력에서 켠다.

import type { CarId, CarSpec } from './car/models';

const KEY = 'cruiz.sound';

interface EngineVoice { type: OscillatorType; ratio: number; detune: number }
/** 차종별 엔진 성격. 음높이는 차의 최고 속도 대비 비율로 올라간다. */
interface EngineProfile {
  voices: [EngineVoice, EngineVoice];
  /** 공회전 음높이(Hz)와 최고 속도에서 더해지는 폭 */
  base: number;
  range: number;
  /** 저역 통과 필터: 기본값과 속도에 따라 열리는 폭 (클수록 거칠고 밝다) */
  cutoff: number;
  cutoffRange: number;
  gain: number;
  /** 실린더 폭발처럼 떨리는 정도와 속도(음높이 대비 비율) */
  chug: number;
  chugRate: number;
}

const ENGINES: Record<CarId, EngineProfile> = {
  // 무난한 세단: 부드러운 웅웅
  classic: { voices: [{ type: 'sawtooth', ratio: 1, detune: 0 }, { type: 'triangle', ratio: 1, detune: 7 }], base: 38, range: 70, cutoff: 220, cutoffRange: 500, gain: 1, chug: 0.15, chugRate: 0.5 },
  // 작은 해치백: 높고 가벼운 붕붕
  hatch: { voices: [{ type: 'square', ratio: 1, detune: 0 }, { type: 'triangle', ratio: 2, detune: -5 }], base: 52, range: 90, cutoff: 260, cutoffRange: 650, gain: 0.75, chug: 0.2, chugRate: 0.5 },
  // 스포츠카: 높게 치솟는 거친 배기음
  sports: { voices: [{ type: 'sawtooth', ratio: 1, detune: 0 }, { type: 'sawtooth', ratio: 1, detune: 14 }], base: 50, range: 150, cutoff: 350, cutoffRange: 1500, gain: 1.15, chug: 0.08, chugRate: 1 },
  // SUV: 낮고 묵직한 저음 (한 옥타브 아래 음을 섞는다)
  suv: { voices: [{ type: 'sawtooth', ratio: 1, detune: 0 }, { type: 'sine', ratio: 0.5, detune: 0 }], base: 32, range: 50, cutoff: 170, cutoffRange: 350, gain: 1.25, chug: 0.2, chugRate: 0.5 },
  // 레트로 밴: 느리게 털털거리는 옛날 엔진
  van: { voices: [{ type: 'triangle', ratio: 1, detune: 0 }, { type: 'square', ratio: 0.5, detune: 10 }], base: 30, range: 42, cutoff: 200, cutoffRange: 300, gain: 1, chug: 0.5, chugRate: 0.25 },
};
const VOLUME = 0.5;

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

export class Sound {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engine: OscillatorNode[] = [];
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private chug!: OscillatorNode;
  private chugDepth!: GainNode;
  private profile: EngineProfile = ENGINES.classic;
  private maxSpeed = 33;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private waveGain!: GainNode;
  private nextUpdate = 0;

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* 무시 */ }
    this.enabled = saved !== '0';
    const unlock = (): void => {
      if (this.enabled) this.resume();
    };
    // capture 단계에서 받아야 다른 핸들러가 막아도 제스처 안에서 열린다.
    for (const type of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(type, unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 무시 */ }
    if (on) this.resume();
    else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      const ctx = this.ctx;
      setTimeout(() => { if (!this.enabled) void ctx.suspend(); }, 300);
    }
  }

  /** 반드시 사용자 입력 핸들러 안에서 불러야 한다 (iOS Safari 오디오 잠금). */
  private resume(): void {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state !== 'running') void ctx.resume();
    this.master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.3);
  }

  private build(): void {
    // iOS: 'playback'으로 두면 무음 스위치가 켜져 있어도 들린다 (Safari 16.4+).
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try { session.type = 'playback'; } catch { /* 무시 */ }
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // 엔진: 낮은 톱니파 두 개를 살짝 어긋나게 겹치고 저역 통과로 부드럽게.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineFilter.Q.value = 0.7;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 40;
      osc.connect(this.engineFilter);
      osc.start();
      this.engine.push(osc);
    }
    // 엔진 떨림: 느린 LFO로 엔진 음량을 흔든다.
    this.chug = ctx.createOscillator();
    this.chugDepth = ctx.createGain();
    this.chug.connect(this.chugDepth).connect(this.engineGain.gain);
    this.chug.start();
    this.applyProfile();

    // 바람·노면: 갈색 잡음을 속도에 따라 크게, 밝게.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 3, true);
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // 파도: 어두운 잡음을 아주 느린 LFO로 밀려왔다 빠지게.
    const sea = ctx.createBufferSource();
    sea.buffer = noiseBuffer(ctx, 4, false);
    sea.loop = true;
    const seaFilter = ctx.createBiquadFilter();
    seaFilter.type = 'lowpass';
    seaFilter.frequency.value = 500;
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.03;
    lfo.connect(lfoDepth).connect(this.waveGain.gain);
    lfo.start();
    sea.connect(seaFilter).connect(this.waveGain).connect(this.master);
    sea.start();
  }

  /** 차종이 바뀌면 바로 그 차의 엔진 소리로 바꾼다. */
  setCar(spec: CarSpec): void {
    this.profile = ENGINES[spec.id] ?? ENGINES.classic;
    this.maxSpeed = spec.maxSpeed;
    if (!this.ctx) return;
    // 바뀌는 순간 툭 끊기지 않게 엔진 음량을 잠깐 내렸다가 update()가 다시 올린다.
    this.engineGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    this.applyProfile();
    this.nextUpdate = this.ctx.currentTime + 0.12;
  }

  private applyProfile(): void {
    const p = this.profile;
    this.engine.forEach((osc, i) => {
      osc.type = p.voices[i].type;
      osc.detune.value = p.voices[i].detune;
    });
  }

  /** 매 프레임 불러도 되지만 실제 갱신은 0.1초마다 몇 개의 값만 바꾼다. */
  update(speed: number, throttle: number, night: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t < this.nextUpdate) return;
    this.nextUpdate = t + 0.1;
    const p = this.profile;
    const s = Math.min(speed / 33, 1.2);
    const r = Math.min(speed / this.maxSpeed, 1.1);
    const load = Math.max(throttle, 0);
    const pitch = p.base + r * p.range + load * p.range * 0.12;
    this.engine.forEach((osc, i) => osc.frequency.setTargetAtTime(pitch * p.voices[i].ratio, t, 0.15));
    this.engineFilter.frequency.setTargetAtTime(p.cutoff + r * p.cutoffRange + load * 200, t, 0.15);
    const level = (0.05 + r * 0.07 + load * 0.03) * p.gain;
    this.engineGain.gain.setTargetAtTime(level, t, 0.2);
    this.chug.frequency.setTargetAtTime(pitch * p.chugRate, t, 0.15);
    this.chugDepth.gain.setTargetAtTime(level * p.chug, t, 0.2);
    this.windGain.gain.setTargetAtTime(s * s * 0.35, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(250 + s * 900, t, 0.3);
    // 밤에는 파도를 조금 더 또렷하게 (주변이 조용해진 느낌).
    this.waveGain.gain.setTargetAtTime(0.04 + night * 0.02, t, 1);
  }
}
