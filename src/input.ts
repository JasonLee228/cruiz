export interface InputState {
  /** -1 왼쪽 .. 1 오른쪽 */
  steer: number;
  /** -1 감속, 0 유지, 1 가속 */
  throttle: number;
  mode: DriveMode;
}

/**
 * auto: 오른쪽 차선 중앙을 스스로 유지한다.
 * assist: 차가 도로 굽이를 따라가고, 핸들로 차선만 옮긴다.
 * manual: 도로를 따라가는 보조가 없다. 굽이마다 직접 핸들을 돌려야 하고, 가드레일만이 경계다.
 */
export type DriveMode = 'auto' | 'assist' | 'manual';

const MANUAL_KEY = 'cruiz.manual';

/** 키보드와 터치를 하나의 상태로 모은다. */
export class Input {
  readonly state: InputState = { steer: 0, throttle: 0, mode: 'assist' };
  /** 자동 주행을 끄면 돌아갈 모드 (어시스트 또는 매뉴얼). 매뉴얼 선택은 저장한다. */
  manual = false;
  /** 출발 전(시작 화면)에는 모드 키를 받지 않는다. */
  active = false;
  onToggleCamera: () => void = () => {};
  onModeChange: (mode: DriveMode) => void = () => {};

  private keys = new Set<string>();
  private touches = new Map<number, number>(); // pointerId → -1 | 1
  private pedals = new Map<number, number>(); // pointerId → -1 감속 | 1 가속

  constructor(target: HTMLElement) {
    try { this.manual = localStorage.getItem(MANUAL_KEY) === '1'; } catch { /* 무시 */ }
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      this.keys.add(key);
      if (key === 'c') this.onToggleCamera();
      if (this.active && key === 'a') this.toggleAutopilot();
      if (this.active && key === 'm') this.toggleManual();
      if (key.startsWith('arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touches.set(e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    });
    const release = (e: PointerEvent) => this.touches.delete(e.pointerId);
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
  }

  /** 터치 페달 버튼: 누르고 있는 동안만 가속/감속한다. 화면 터치(핸들)와 따로 센다. */
  bindPedal(button: HTMLElement, dir: 1 | -1): void {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { button.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      this.pedals.set(e.pointerId, dir);
      button.classList.add('pressed');
    });
    const release = (e: PointerEvent) => {
      this.pedals.delete(e.pointerId);
      if (![...this.pedals.values()].includes(dir)) button.classList.remove('pressed');
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get freeMode(): DriveMode {
    return this.manual ? 'manual' : 'assist';
  }

  setMode(mode: DriveMode): void {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    this.onModeChange(mode);
  }

  toggleAutopilot(): void {
    this.setMode(this.state.mode === 'auto' ? this.freeMode : 'auto');
  }

  /** 매뉴얼 ↔ 어시스트. 자동 주행 중이면 자동 주행도 끄고 바로 그 모드로 넘어간다. */
  toggleManual(): void {
    this.manual = !this.manual;
    try { localStorage.setItem(MANUAL_KEY, this.manual ? '1' : '0'); } catch { /* 무시 */ }
    this.setMode(this.freeMode);
  }

  update(): void {
    let steer = 0;
    if (this.keys.has('arrowleft')) steer -= 1;
    if (this.keys.has('arrowright')) steer += 1;
    for (const dir of this.touches.values()) steer += dir;
    this.state.steer = Math.max(-1, Math.min(1, steer));

    let throttle = 0;
    if (this.keys.has('arrowup') || this.keys.has('w')) throttle += 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) throttle -= 1;
    for (const dir of this.pedals.values()) throttle += dir;
    this.state.throttle = Math.max(-1, Math.min(1, throttle));

    // 직접 핸들을 잡으면 자동 주행을 끈다
    if (this.state.mode === 'auto' && steer !== 0) this.setMode(this.freeMode);
  }
}
