import { CARS, getSpec, type CarSpec } from '../car/models';

const CAR_KEY = 'cruiz.car';

export function loadCarId(): string | null {
  try { return localStorage.getItem(CAR_KEY); } catch { return null; }
}

/** 차종 선택 UI. container 안에 버튼을 채우고, 선택이 바뀌면 onChange를 부른다. */
export function mountCarPicker(container: HTMLElement, onChange: (spec: CarSpec) => void): void {
  let current = getSpec(loadCarId()).id;
  const refresh = (): void => {
    for (const b of container.querySelectorAll<HTMLElement>('.car-option')) {
      b.setAttribute('aria-checked', String(b.dataset.id === current));
    }
  };
  for (const spec of CARS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'car-option';
    btn.dataset.id = spec.id;
    btn.setAttribute('role', 'radio');
    btn.innerHTML = `<i style="--c:${spec.swatch}"></i>${spec.name}`;
    btn.addEventListener('click', () => {
      current = spec.id;
      try { localStorage.setItem(CAR_KEY, spec.id); } catch { /* 저장 불가 환경은 무시 */ }
      refresh();
      onChange(spec);
    });
    container.appendChild(btn);
  }
  refresh();
}
