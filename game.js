import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { NPCManager, StudentNPC } from './modules/npcs.js';

/* ---------- DOM ---------- */
const canvas = document.getElementById('canvas');
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start-btn');
const interactEl = document.getElementById('interact-prompt');
const flashStateEl = document.getElementById('flashlight-state');
const suspicionFill = document.getElementById('suspicion-fill');
const msgEl = document.getElementById('msg');

/* ---------- game state ---------- */
let scene, camera, renderer, controls;
let flashlight;
let move = { forward: 0, backward: 0, left: 0, right: 0 };
let isSprinting = false;
let flashlightOn = true;
let suspicion = 0; // 0..100
let isLocked = false;

const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;
const SPEED = 5.5;
const SPRINT = 9.5;

const interactables = []; // {mesh, text, dist}

let msgTimer = 0;
let prevTime = performance.now();

/* ---------- mobile detection ---------- */
let isMobile = false;
let touchYaw = 0;
let touchPitch = 0;
let lastTouchX = 0;
let lastTouchY = 0;
const TOUCH_SENSITIVITY = 0.004;

/* ---------- virtual joystick (mobile only) ---------- */
let joystickBaseEl, joystickKnobEl;
let joystickCenter = { x: 0, y: 0 };
let joystickMaxDist = 50;
let joystickTouchId = null;
let joystickVec = { x: 0, y: 0 }; // -1 ~ 1
let activeTouches = new Map(); // identifier -> { clientX, clientY }

/* ---------- mobile action buttons ---------- */
let btnInteractEl, btnFlashlightEl;

function getJoystickAreaRect() {
  const rect = canvas.getBoundingClientRect();
  // 왼쪽 아래 45% x 45% 영역을 조이스틱 전용으로 지정
  return {
    left: rect.left,
    top: rect.top + rect.height * 0.55,
    right: rect.left + rect.width * 0.45,
    bottom: rect.top + rect.height,
  };
}

function isInJoystickArea(clientX, clientY) {
  const area = getJoystickAreaRect();
  return clientX >= area.left && clientX <= area.right &&
         clientY >= area.top && clientY <= area.bottom;
}

function isInButtonArea(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const btnSize = Math.min(rect.width * 0.18, 120);
  const margin = Math.min(rect.width * 0.05, 30);
  // 오른쪽 아래 영역 (조이스틱과 대칭)
  return clientX >= rect.left + rect.width - btnSize - margin &&
         clientX <= rect.left + rect.width - margin &&
         clientY >= rect.top + rect.height - btnSize * 2.5 - margin &&
         clientY <= rect.top + rect.height - margin;
}

function updateJoystickVisual(clientX, clientY) {
  if (!joystickBaseEl || !joystickKnobEl) return;
  const dx = clientX - joystickCenter.x;
  const dy = clientY - joystickCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const clampedDist = Math.min(dist, joystickMaxDist);
  const angle = Math.atan2(dy, dx);
  const knobX = joystickCenter.x + Math.cos(angle) * clampedDist;
  const knobY = joystickCenter.y + Math.sin(angle) * clampedDist;
  joystickKnobEl.style.transform = `translate(${knobX - joystickCenter.x}px, ${knobY - joystickCenter.y}px) translate(-50%, -50%)`;

  // 정규화된 벡터 (-1 ~ 1)
  joystickVec.x = (clampedDist / joystickMaxDist) * Math.cos(angle);
  joystickVec.y = (clampedDist / joystickMaxDist) * Math.sin(angle);
}

function resetJoystick() {
  joystickTouchId = null;
  joystickVec = { x: 0, y: 0 };
  if (joystickKnobEl) {
    // CSS의 top/left 50%와 함께 translate(-50%, -50%)로 정확히 중앙 배치
    joystickKnobEl.style.transform = `translate(-50%, -50%)`;
  }
}

/* ---------- school walls (for NPC raycast occlusion) ---------- */
let wallMeshes = [];
let npcManager;

function detectMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0);
}

/* ---------- scene setup ---------- */
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080c);
  scene.fog = new THREE.FogExp2(0x08080c, 0.03);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, PLAYER_HEIGHT, 1.5);

  const ambient = new THREE.AmbientLight(0x404050, 0.3);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x556677, 0x121216, 0.35);
  scene.add(hemi);

  // ceiling lights (flicker for ambience)
  const ceilingLights = [];
  for (let i = -2; i <= 2; i++) {
    const pl = new THREE.PointLight(0xfff3e0, 0.5, 14);
    pl.position.set(i * 4.2, 3.0, -5 + i * 3);
    pl.castShadow = true;
    scene.add(pl);
    ceilingLights.push(pl);
  }

  flashlight = new THREE.SpotLight(0xffffff, 3.2, 26, Math.PI / 6, 0.45, 1);
  flashlight.position.set(0, PLAYER_HEIGHT - 0.05, 0);
  flashlight.target.position.set(0, PLAYER_HEIGHT - 0.05, -1);
  flashlight.target.updateMatrixWorld();
  scene.add(flashlight);
  scene.add(flashlight.target);

  buildSchool();

  // ---------- 모바일 감지 ----------
  isMobile = detectMobile();

  // ---------- 가상 조이스틱 (모바일만) ----------
  joystickBaseEl = document.getElementById('joystick-base');
  joystickKnobEl = document.getElementById('joystick-knob');
  if (isMobile) {
    const joystickEl = document.getElementById('joystick');
    if (joystickEl) joystickEl.classList.remove('hidden');
    // 조이스틱 베이스 중심점 (화면 기준)
    const baseRect = joystickBaseEl.getBoundingClientRect();
    joystickCenter.x = baseRect.left + baseRect.width / 2;
    joystickCenter.y = baseRect.top + baseRect.height / 2;
  }

  // ---------- 모바일 조작 버튼 ----------
  btnInteractEl = document.getElementById('btn-interact');
  btnFlashlightEl = document.getElementById('btn-flashlight');
  if (isMobile && btnInteractEl && btnFlashlightEl) {
    const btnContainer = document.getElementById('mobile-buttons');
    if (btnContainer) btnContainer.classList.remove('hidden');

    const handleInteract = (e) => {
      e.preventDefault();
      e.stopPropagation();
      doInteract();
    };
    const handleFlashlight = (e) => {
      e.preventDefault();
      e.stopPropagation();
      flashlightOn = !flashlightOn;
      flashlight.intensity = flashlightOn ? 3.2 : 0;
      flashStateEl.textContent = flashlightOn ? 'ON' : 'OFF';
      btnFlashlightEl.className = 'mobile-btn ' + (flashlightOn ? 'flashlight-on' : 'flashlight-off');
    };

    btnInteractEl.addEventListener('touchstart', handleInteract, { passive: false });
    btnInteractEl.addEventListener('click', handleInteract);
    btnFlashlightEl.addEventListener('touchstart', handleFlashlight, { passive: false });
    btnFlashlightEl.addEventListener('click', handleFlashlight);
  }

  // ---------- 학생 NPC (테스트: 복도에 1명 배치) ----------
  npcManager = new NPCManager();
  npcManager.setOccluders(wallMeshes);

  const testNPC = new StudentNPC({ moveSpeed: 7.0, stopDistance: 1.5, sightAngle: 1.0 });
  testNPC.setPosition(-8, 0, -8); // 복도 왼쪽 부근
  scene.add(testNPC.mesh);
  npcManager.add(testNPC);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  if (!isMobile) {
    // 데스크톱: 기존 PointerLockControls 사용
    controls = new PointerLockControls(camera, document.body);

    startBtn.addEventListener('click', () => {
      canvas.focus();
      controls.lock();
    });
    controls.addEventListener('lock', () => {
      isLocked = true;
      startScreen.classList.add('hidden');
      hud.classList.remove('hidden');
    });
    controls.addEventListener('unlock', () => {
      isLocked = false;
      startScreen.classList.remove('hidden');
      hud.classList.add('hidden');
    });
  } else {
    // 모바일: 터치 드래그로 카메라 회전
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    startBtn.addEventListener('click', () => {
      canvas.focus();
      isLocked = true;
      startScreen.classList.add('hidden');
      hud.classList.remove('hidden');
    });
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);

  setInterval(() => flickerLights(ceilingLights), 450);
  updateSuspicion();
  animate();
}

/* ---------- school geometry ---------- */
function buildSchool() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x212126, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeae6dc, roughness: 0.85 });
  function wall(x, y, z, ry, sx = 10, sy = 1, sz = 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(4 * sx, 3.4 * sy, 0.2 * sz), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    scene.add(m);
    wallMeshes.push(m);
    return m;
  }
  wall(0, 1.7, -22, 0);          // back
  wall(-22, 1.7, 0, Math.PI / 2); // left
  wall(22, 1.7, 0, Math.PI / 2);  // right
  wall(-7, 1.7, 0, 0);            // front left
  wall(7, 1.7, 0, 0);             // front right

  // classroom doors along left side
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 });
  for (let z = -6; z >= -18; z -= 4.6) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.16), doorMat);
    door.position.set(-20.9, 1.2, z);
    door.rotation.y = Math.PI / 2;
    door.castShadow = true;
    door.receiveShadow = true;
    door.userData = { isDoor: true, open: false };
    scene.add(door);
    wallMeshes.push(door);
    interactables.push({ mesh: door, text: '교실 문', dist: 3.2 });
  }

  // classroom interior visible at the end of the hall
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.6), deskMat);
      desk.position.set(-6 + c * 1.1, 0.55, -20 - r * 1.5);
      desk.castShadow = true;
      desk.receiveShadow = true;
      scene.add(desk);
    }
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 0.12), new THREE.MeshStandardMaterial({ color: 0x223a22 }));
  board.position.set(-6, 1.3, -25.4);
  scene.add(board);

  const chalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  chalk.position.set(-8.2, 1.1, -25.45);
  scene.add(chalk);

  // shoe rack at entrance (Korean school detail)
  const rack = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
  rack.position.set(0, 0.4, 1.2);
  rack.receiveShadow = true;
  scene.add(rack);

  // graduation banner
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0xfbc02d, emissive: 0x7a5a00, emissiveIntensity: 0.5 });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(11, 1, 0.1), bannerMat);
  banner.position.set(0, 2.7, -0.6);
  scene.add(banner);

  interactables.push({ mesh: rack, text: '신발장', dist: 2.6 });
}

/* ---------- 충돌 판정 ---------- */
// 특정 좌표에 플레이어 충돌 박스가 벽과 겹치는지 검사
function checkWallCollisionAt(x, z) {
  const r = PLAYER_RADIUS;
  const playerMin = new THREE.Vector3(x - r, 0, z - r);
  const playerMax = new THREE.Vector3(x + r, PLAYER_HEIGHT, z + r);
  const playerBox = new THREE.Box3(playerMin, playerMax);

  for (const wall of wallMeshes) {
    // 열린 문은 충돌에서 제외
    if (wall.userData && wall.userData.isDoor && wall.userData.open) {
      continue;
    }
    const wallBox = new THREE.Box3().setFromObject(wall);
    if (wallBox.intersectsBox(playerBox)) {
      return true;
    }
  }
  return false;
}

// X, Z 축을 개별적으로 시도해 벽을 따라 미끄러지도록 이동
function tryMove(dx, dz) {
  let nextX = camera.position.x;
  let nextZ = camera.position.z;
  let moved = false;

  // X 축 이동 시도
  if (Math.abs(dx) > 0.001) {
    const testX = camera.position.x + dx;
    if (!checkWallCollisionAt(testX, camera.position.z)) {
      nextX = testX;
      moved = true;
    }
  }

  // Z 축 이동 시도 (이미 X가 적용된 기준)
  if (Math.abs(dz) > 0.001) {
    const testZ = camera.position.z + dz;
    if (!checkWallCollisionAt(nextX, testZ)) {
      nextZ = testZ;
      moved = true;
    }
  }

  if (moved) {
    camera.position.x = nextX;
    camera.position.z = nextZ;
    camera.position.y = PLAYER_HEIGHT;
    // 학교 외부 경계 제한 (내부 벽은 checkWallCollisionAt에서 처리)
    camera.position.x = Math.max(-20, Math.min(20, camera.position.x));
    camera.position.z = Math.max(-26, Math.min(3, camera.position.z));
  }
  return moved;
}

/* ---------- input ---------- */
function onKeyDown(e) {
  if (e.code === 'KeyF') {
    flashlightOn = !flashlightOn;
    flashlight.intensity = flashlightOn ? 3.2 : 0;
    flashStateEl.textContent = flashlightOn ? 'ON' : 'OFF';
    return;
  }
  if (e.code === 'Escape') { controls.unlock(); return; }
  if (e.code === 'KeyE') { doInteract(); return; }
  if (!isLocked && e.code !== 'KeyW' && e.code !== 'KeyS' && e.code !== 'KeyA' && e.code !== 'KeyD') return;

  switch (e.code) {
    case 'KeyW': move.forward = 1; break;
    case 'KeyS': move.backward = 1; break;
    case 'KeyA': move.left = 1; break;
    case 'KeyD': move.right = 1; break;
    case 'ShiftLeft': isSprinting = true; break;
  }
}
function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': move.forward = 0; break;
    case 'KeyS': move.backward = 0; break;
    case 'KeyA': move.left = 0; break;
    case 'KeyD': move.right = 0; break;
    case 'ShiftLeft': isSprinting = false; break;
  }
}

/* ---------- mobile touch camera & joystick ---------- */
function onTouchStart(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    activeTouches.set(t.identifier, { clientX: t.clientX, clientY: t.clientY });
    if (joystickTouchId === null && isInJoystickArea(t.clientX, t.clientY)) {
      joystickTouchId = t.identifier;
      updateJoystickVisual(t.clientX, t.clientY);
    } else if (isInButtonArea(t.clientX, t.clientY)) {
      // 버튼 영역 터치는 카메라 입력에서 제외 (버튼 핸들러가 처리함)
    } else {
      // 조이스틱/버튼이 아닌 모든 터치는 카메라 회전용으로 기록
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }
}

function onTouchMove(e) {
  e.preventDefault();
  let cameraTouch = null;
  let cameraPrev = null;

  for (const t of e.changedTouches) {
    // 새 위치로 덮어쓰기 전에 이전 위치를 먼저 가져온다
    const prev = activeTouches.get(t.identifier);
    activeTouches.set(t.identifier, { clientX: t.clientX, clientY: t.clientY });

    if (t.identifier === joystickTouchId) {
      updateJoystickVisual(t.clientX, t.clientY);
    } else if (!isInButtonArea(t.clientX, t.clientY)) {
      cameraTouch = t;
      cameraPrev = prev || { clientX: t.clientX, clientY: t.clientY }; // 방어 코드
    }
  }

  // 카메라 회전 (조이스틱이나 버튼이 아닌 터치 중 하나)
  if (cameraTouch && cameraPrev) {
    const dx = cameraTouch.clientX - cameraPrev.clientX;
    const dy = cameraTouch.clientY - cameraPrev.clientY;
    touchYaw -= dx * TOUCH_SENSITIVITY;
    touchPitch -= dy * TOUCH_SENSITIVITY;

    // 상하 과도 회전 방지 (약 +/- 85도)
    const limit = Math.PI / 2 - 0.05;
    touchPitch = Math.max(-limit, Math.min(limit, touchPitch));
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    activeTouches.delete(t.identifier);
    if (t.identifier === joystickTouchId) {
      resetJoystick();
    }
  }
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // 창 크기 변경 시 조이스틱 중심점 재계산 (위치 어긋남 방지)
  if (isMobile && joystickBaseEl) {
    const baseRect = joystickBaseEl.getBoundingClientRect();
    joystickCenter.x = baseRect.left + baseRect.width / 2;
    joystickCenter.y = baseRect.top + baseRect.height / 2;
  }
}

/* ---------- interaction ---------- */
function doInteract() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const pos = camera.position.clone();
  let best = null, bestD = 1e9;
  for (const it of interactables) {
    const v = it.mesh.position.clone().sub(pos);
    const fwd = v.dot(dir);
    if (fwd < 0.6 || fwd > it.dist) continue;
    const vh = v.clone(); vh.y = 0; vh.normalize();
    const dh = dir.clone(); dh.y = 0; dh.normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, vh.dot(dh))));
    if (ang > 0.95) continue;
    if (fwd < bestD) { bestD = fwd; best = it; }
  }
  if (best) {
    const mesh = best.mesh;
    // 문 열기/닫기 토글
    if (mesh.userData && mesh.userData.isDoor) {
      mesh.userData.open = !mesh.userData.open;
      // 문 시각: 열린 상태면 벽면과 평행하게 회전 (열림), 닫힌 상태면 수직 (닫힘)
      mesh.rotation.y = mesh.userData.open ? 0 : Math.PI / 2;
      showMessage(best.text + ' — ' + (mesh.userData.open ? '열림' : '닫힘'));
    } else {
      showMessage(best.text + ' — ' + (mesh.userData.open ? '열림' : '잠김'));
    }
  } else {
    showMessage('상호작용할 대상이 없습니다.');
  }
}

function showMessage(t) {
  msgEl.textContent = t;
  msgEl.classList.remove('hidden');
  msgTimer = 110;
}

/* ---------- suspicion / disguise mechanic ---------- */
function updateSuspicion() {
  const moving = move.forward || move.backward || move.left || move.right;
  if (isLocked && moving) {
    suspicion += isSprinting ? 1.1 : 0.25;
  } else {
    suspicion = Math.max(0, suspicion - 0.12);
  }
  suspicion = Math.min(100, suspicion);
  suspicionFill.style.width = suspicion + '%';
  suspicionFill.style.backgroundColor =
    suspicion > 70 ? '#ef4444' : suspicion > 40 ? '#f59e0b' : '#22c55e';
  if (suspicion >= 100 && Math.random() < 0.02) showMessage('복도를 순회하는 인영이 당신을 주시합니다.');
}

/* ---------- ambience ---------- */
function flickerLights(lights) {
  for (const pl of lights) {
    if (Math.random() < 0.25) pl.intensity = 0.5 + Math.random() * 0.6;
  }
}

/* ---------- main loop ---------- */
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - prevTime) / 1000);
  prevTime = now;

  const isPointerLocked = controls ? controls.isLocked : false;
  const isActive = isPointerLocked || (isMobile && isLocked);

  if (isActive) {
    const speed = isSprinting ? SPRINT : SPEED;
    let moveDX = 0;
    let moveDZ = 0;

    if (isMobile && (Math.abs(joystickVec.x) > 0.15 || Math.abs(joystickVec.y) > 0.15)) {
      // ---------- 모바일: 가상 조이스틱 이동 ----------
      // 조이스틱 입력 정규화 (대각선 속도 보정)
      const joyLen = Math.sqrt(joystickVec.x * joystickVec.x + joystickVec.y * joystickVec.y);
      const nx = joystickVec.x / joyLen;           // 화면 오른쪽 = 양수 (카메라 우측)
      const ny = -joystickVec.y / joyLen;          // 화면 위쪽 = 양수 (카메라 전방, 화면 좌표계 반전)

      // 카메라 기준 수평 전방 벡터 (y=0 고정)
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      // 카메라 기준 우측 벡터
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

      // 월드 이동 방향 = 카메라 전방 * ny + 카메라 우측 * nx
      const worldMove = new THREE.Vector3();
      worldMove.addScaledVector(forward, ny);
      worldMove.addScaledVector(right, nx);
      worldMove.normalize();

      moveDX = worldMove.x * speed * dt;
      moveDZ = worldMove.z * speed * dt;

      // WASD 입력 잔여값 초기화 (모바일에서는 사용하지 않음)
      move.forward = 0;
      move.backward = 0;
      move.left = 0;
      move.right = 0;
    } else {
      // ---------- 데스크톱: WASD 이동 ----------
      const dir = new THREE.Vector3(move.left - move.right, 0, move.forward - move.backward);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        const offset = forward.clone().multiplyScalar(-dir.z).add(right.clone().multiplyScalar(dir.x));
        moveDX = offset.x * speed * dt;
        moveDZ = offset.z * speed * dt;
      }
    }

    // 충돌 판정을 거친 이동 적용 (모바일/데스크톱 공통)
    if (Math.abs(moveDX) > 0.001 || Math.abs(moveDZ) > 0.001) {
      tryMove(moveDX, moveDZ);
    }

    if (isMobile) {
      // 모바일 터치 카메라 회전 적용
      camera.rotation.set(touchPitch, touchYaw, 0);
      camera.rotation.order = 'YXZ';
      camera.updateMatrixWorld();
    }

    // 손전등 위치와 방향을 카메라 기준으로 업데이트 (카메라 시선 방향을 따라감)
    if (flashlight) {
      flashlight.position.copy(camera.position);
      flashlight.position.y = PLAYER_HEIGHT - 0.05;
      const target = new THREE.Vector3();
      camera.getWorldDirection(target);
      target.multiplyScalar(30);
      target.add(camera.position);
      flashlight.target.position.copy(target);
      flashlight.target.updateMatrixWorld();
    }

    // 학생 NPC 업데이트 (시선 반응 이동)
    npcManager.update(camera, dt);
  }

  if (msgTimer > 0) { msgTimer--; if (msgTimer === 0) msgEl.classList.add('hidden'); }

  updateSuspicion();
  renderer.render(scene, camera);
}

init();
