import type * as THREE from 'three';

/**
 * `?debug` 로 열면 장면 요소별로 켜고 끌 수 있는 진단 패널을 띄운다.
 * 어느 요소를 껐을 때 fps가 크게 오르는지 보고 무거운 부분을 찾는 용도.
 */
const CATS = {
  ui: '화면 UI 흐림 효과',
  terrain: '지형',
  road: '도로·가드레일·가로등',
  trees: '나무·바위·덤불',
  water: '바다',
  props: '마을·등대·배',
  mountains: '먼 산',
  clouds: '구름',
  sky: '하늘·해·별',
  car: '차',
} as const;
type Cat = keyof typeof CATS;

const hidden = new Set<Cat>();
export const debugEnabled = new URLSearchParams(location.search).has('debug');

export function mountDebugPanel(): void {
  if (!debugEnabled) return;
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:10;padding:10px 14px;border-radius:12px;' +
    'background:rgba(20,20,40,0.85);color:#fff;font:13px/1.7 sans-serif;';
  panel.innerHTML = '<b>진단: 끄면 fps가 오르는 항목을 찾아 주세요</b><br>';
  for (const [cat, label] of Object.entries(CATS) as [Cat, string][]) {
    const row = document.createElement('label');
    row.style.display = 'block';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => {
      if (box.checked) hidden.delete(cat);
      else hidden.add(cat);
      document.body.classList.toggle('no-blur', hidden.has('ui'));
    });
    row.append(box, ` ${label}`);
    panel.append(row);
  }
  const style = document.createElement('style');
  style.textContent = '.no-blur * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
  document.head.append(style);
  document.body.append(panel);
}

/** 매 프레임 호출. 장면 최상위와 청크 안쪽 한 단계까지 분류 표시를 보고 보이기를 정한다. */
export function applyDebug(scene: THREE.Scene, car: THREE.Object3D): void {
  if (!debugEnabled) return;
  car.visible = !hidden.has('car');
  for (const obj of scene.children) {
    const cat = obj.userData.cat as Cat | undefined;
    if (cat) obj.visible = !hidden.has(cat);
    else if (obj.type === 'Group') {
      for (const child of obj.children) {
        const c = child.userData.cat as Cat | undefined;
        if (c) child.visible = !hidden.has(c);
      }
    }
  }
}
