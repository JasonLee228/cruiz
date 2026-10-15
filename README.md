# Cruiz

웹브라우저에서 바로 시작하는, 끝없이 달리는 드라이빙. 회원가입도, 목적지도 없어요.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 에 정적 빌드
```

## 조작

| 키 | 동작 |
|---|---|
| ← → | 핸들 |
| ↑ ↓ | 속도 |
| A | 자동 주행 |
| C | 카메라 (추적 / 운전석 / 시네마틱) |

모바일에서는 화면 왼쪽/오른쪽을 눌러 핸들을 돌려요.

## 구조

```
src/
  main.ts           진입점, 게임 루프
  input.ts          키보드/터치 입력
  car/car.ts        로우폴리 차량과 주행
  car/camera.ts     카메라 모드
  world/path.ts     도로 중심선과 지형 높이 (z의 함수라 이음매 없이 무한)
  world/chunks.ts   80m 청크 단위로 지형·도로·나무 생성/제거
  world/sky.ts      하루 순환(아침→한낮→노을→밤→새벽), 구름, 산, 별
```

백엔드 없음. `npm run build` 결과물을 GitHub Pages 등 정적 호스팅에 올리면 돼요.
