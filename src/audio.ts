// 주행 소리: 파일 없이 Web Audio로 만든다 (엔진 웅웅, 바람·노면, 멀리 파도).
// 브라우저는 사용자가 누르기 전에는 소리를 막으므로, 첫 클릭·터치·키 입력에서 켠다.

const KEY = 'cruiz.sound';
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
    for (const [type, detune] of [['sawtooth', 0], ['triangle', 7]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 40;
      osc.detune.value = detune;
      osc.connect(this.engineFilter);
      osc.start();
      this.engine.push(osc);
    }

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

  /** 매 프레임 불러도 되지만 실제 갱신은 0.1초마다 몇 개의 값만 바꾼다. */
  update(speed: number, throttle: number, night: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t < this.nextUpdate) return;
    this.nextUpdate = t + 0.1;
    const s = Math.min(speed / 33, 1.2);
    const load = Math.max(throttle, 0);
    const pitch = 38 + s * 70 + load * 8;
    for (const osc of this.engine) osc.frequency.setTargetAtTime(pitch, t, 0.15);
    this.engineFilter.frequency.setTargetAtTime(220 + s * 500 + load * 200, t, 0.15);
    this.engineGain.gain.setTargetAtTime(0.05 + s * 0.07 + load * 0.03, t, 0.2);
    this.windGain.gain.setTargetAtTime(s * s * 0.35, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(250 + s * 900, t, 0.3);
    // 밤에는 파도를 조금 더 또렷하게 (주변이 조용해진 느낌).
    this.waveGain.gain.setTargetAtTime(0.04 + night * 0.02, t, 1);
  }
}
