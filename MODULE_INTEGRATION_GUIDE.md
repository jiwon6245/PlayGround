# 모듈 연계 가이드 (기존 src/game.js 유지)

기존 `src/game.js`의 1인칭 컨트롤러, 손전등, 상호작용, 의심도 게이지는 그대로 두고,
아래 모듈들만 추가 연계하면 된다.

---

## 1. garbled.js 연계 — 깨진 문자열 표시

`src/index.html`의 상호작용 메시지 영역(`#msg`)이나 NPC 대사 출력 시 사용.

```html
<!-- index.html 내 #msg 근처에 스타일 추가 예시 -->
<style>
  .garbled {
    color: #888;
    font-family: 'Courier New', monospace;
    letter-spacing: 2px;
    opacity: 0.85;
  }
</style>
```

```js
// game.js 상단 imports에 추가
import { garble, garbledClass } from './modules/garbled.js';

// 기존 showMessage 함수 수정 예시
function showMessage(t, options = {}) {
  msgEl.textContent = t;
  if (options.garbled) {
    msgEl.classList.add(garbledClass());
  } else {
    msgEl.classList.remove(garbledClass());
  }
  msgEl.classList.remove('hidden');
  msgTimer = 110;
}
```

사용 예: `showMessage(garble('안녕하세요'), { garbled: true })`

---

## 2. npcs.js 연계 — 학생 NPC 시선 반응

### A. 임포트 추가 (`game.js` 상단)

```js
import { NPCManager, StudentNPC } from './modules/npcs.js';
```

### B. 전역 변수 추가

```js
let npcManager;
let isWearingUniform = false;
```

### C. 초기화 시 NPC 생성 (`init()` 안, `buildSchool()` 이후)

```js
npcManager = new NPCManager();

// 예시: 교실 앞에 마네킹 느낌의 단순 박스 NPC 배치
for (let i = 0; i < 3; i++) {
  const geo = new THREE.BoxGeometry(0.6, 1.7, 0.6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(-12 + i * 2, 0.85, -10 - i * 3);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const npc = new StudentNPC(mesh, { moveSpeed: 5.0 });
  if (i === 1) npc.canLendUniform = true; // 한 명만 교복 대여 가능 (게임 전용 설정)
  npcManager.add(npc);
}
```

### D. 애니메이션 루프에서 호출 (`animate()` 안)

```js
if (controls.isLocked) {
  // ... 기존 이동 코드 ...
  const dt = Math.min(0.05, (now - prevTime) / 1000);
  npcManager.update(camera, dt, isWearingUniform);
}
```

### E. 상호작용 연계 (`doInteract()` 안)

```js
function doInteract() {
  // ... 기존 interactables 문/오브젝트 판정 ...

  // 가까운 학생 NPC와 상호작용 시도
  const nearest = npcManager.getNearest(camera, 4);
  if (nearest) {
    const msg = nearest.interact();
    if (msg.includes('교복을 빌렸습니다')) {
      isWearingUniform = true;
      showMessage(msg);
    } else {
      showMessage(msg);
    }
    return;
  }

  if (best) showMessage(best.text + ' — ' + (best.mesh.userData.open ? '열림' : '잠김'));
  else showMessage('상어작용할 대상이 없습니다.');
}
```

---

## 3. 위장(의심도) 연계

기존 `updateSuspicion()`에 `isWearingUniform` 조건을 추가해, 교복을 입은 상태에서는
달리더라도 의심도 상승률을 낮게 설정할 수 있다.

```js
function updateSuspicion() {
  const moving = move.forward || move.backward || move.left || move.right;
  if (isLocked && moving) {
    const base = isSprinting ? 1.1 : 0.25;
    const multiplier = isWearingUniform ? 0.4 : 1.0; // 위장 중에는 덜 수상해 보임
    suspicion += base * multiplier;
  } else {
    suspicion = Math.max(0, suspicion - 0.12);
  }
  // ... resto 동일 ...
}
```

---

## 4. 확인 체크리스트

- [ ] `src/modules/garbled.js` 파일 생성 완료
- [ ] `src/modules/npcs.js` 파일 생성 완료
- [ ] `src/index.html`에 `.garbled` CSS 클래스 추가
- [ ] `src/game.js`에 임포트 및 호출 코드 추가
- [ ] 로컬 서버 실행 후 NPC가 시선 벗어나면 이동하는지 확인

---

## 5. 원작 설정 vs 게임 전용 설정 구분 (표)

| 항목 | 원작 명시 설정 | 게임 전용 추가 (미확인) |
|------|--------------|----------------------|
| 학생 외형 | 마네킹/밀랍인형처럼 부자연 | 단순 박스 모델로 프로토타입 |
| 시선 반응 | 바라보면 정지, 시선 떠나면 빠른 이동 | 무작위 배회 목적지 추가 |
| 목소리 | 없음 | (추가 없음) |
| 교복 대여 | 학생에게 허락받아 빌림 | 특정 NPC만 대여 가능 (게임 단순화) |
| 소리 반응 | 비명·고함·욕설 등에 반응 | 달리기/손전등 등을 '소리 이벤트'로 시뮬레이션 |
| 깨진 문자열 | ASCII 코드처럼 깨짐 | garble() 유틸리티로 구현 |
