import { CARS, getSpec, type CarSpec } from '../car/models';

const CAR_KEY = 'cruiz.car';

export function loadCarId(): string | null {
  try { return localStorage.getItem(CAR_KEY); } catch { return null; }
}

/**
 * 차종 선택 UI. 시작 화면과 주행 중 패널처럼 여러 곳에 같은 버튼을 채우고,
 * 어느 곳에서 고르든 선택 상태를 함께 맞춘 뒤 onChange를 부른다.
 */
export function mountCarPicker(containers: HTMLElement[], onChange: (spec: CarSpec) => void): { current: () => CarSpec; next: () => void } {
  let current = getSpec(loadCarId()).id;
  const refresh = (): void => {
    for (const c of containers) {
      for (const b of c.querySelectorAll<HTMLElement>('.car-option')) {
        b.setAttribute('aria-checked', String(b.dataset.id === current));
      }
    }
  };
  const select = (spec: CarSpec): void => {
    if (spec.id === current) return;
    current = spec.id;
    try { localStorage.setItem(CAR_KEY, spec.id); } catch { /* 저장 불가 환경은 무시 */ }
    refresh();
    onChange(spec);
  };
  for (const container of containers) {
    for (const spec of CARS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'car-option';
      btn.dataset.id = spec.id;
      btn.setAttribute('role', 'radio');
      btn.textContent = spec.name;
      btn.addEventListener('click', () => select(spec));
      container.appendChild(btn);
    }
  }
  refresh();
  return {
    current: () => getSpec(current),
    next: () => select(CARS[(CARS.findIndex((s) => s.id === current) + 1) % CARS.length]),
  };
}
