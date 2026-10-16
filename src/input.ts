export interface InputState {
  /** -1 왼쪽 .. 1 오른쪽 */
  steer: number;
  /** -1 감속, 0 유지, 1 가속 */
  throttle: number;
  autopilot: boolean;
}

/** 키보드와 터치를 하나의 상태로 모은다. */
export class Input {
  readonly state: InputState = { steer: 0, throttle: 0, autopilot: false };
  onToggleCamera: () => void = () => {};
  onToggleAutopilot: (on: boolean) => void = () => {};

  private keys = new Set<string>();
  private touches = new Map<number, number>(); // pointerId → -1 | 1
  private pedals = new Map<number, number>(); // pointerId → -1 감속 | 1 가속

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      this.keys.add(key);
      if (key === 'c') this.onToggleCamera();
      if (key === 'a') this.toggleAutopilot();
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

  toggleAutopilot(): void {
    this.state.autopilot = !this.state.autopilot;
    this.onToggleAutopilot(this.state.autopilot);
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
    if (this.state.autopilot && steer !== 0) {
      this.state.autopilot = false;
      this.onToggleAutopilot(false);
    }
  }
}
