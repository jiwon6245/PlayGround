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
const SPEED = 5.5;
const SPRINT = 9.5;

const interactables = []; // {mesh, text, dist}

let msgTimer = 0;
let prevTime = performance.now();

/* ---------- school walls (for NPC raycast occlusion) ---------- */
let wallMeshes = [];
let npcManager;

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
    scene.add(door);
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
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  if (best) showMessage(best.text + ' — ' + (best.mesh.userData.open ? '열림' : '잠김'));
  else showMessage('상호작용할 대상이 없습니다.');
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

  if (controls.isLocked) {
    const speed = isSprinting ? SPRINT : SPEED;
    const dir = new THREE.Vector3(move.left - move.right, 0, move.forward - move.backward);
    if (dir.lengthSq() > 0) {
      dir.normalize();
      // move relative to camera facing
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      const offset = forward.clone().multiplyScalar(-dir.z).add(right.clone().multiplyScalar(dir.x));
      camera.position.add(offset.multiplyScalar(speed * dt));
    }
    camera.position.y = PLAYER_HEIGHT;
    // keep inside school bounds
    camera.position.x = Math.max(-20, Math.min(20, camera.position.x));
    camera.position.z = Math.max(-26, Math.min(3, camera.position.z));

    // 학생 NPC 업데이트 (시선 반응 이동)
    npcManager.update(camera, dt);
  }

  if (msgTimer > 0) { msgTimer--; if (msgTimer === 0) msgEl.classList.add('hidden'); }

  updateSuspicion();
  renderer.render(scene, camera);
}

init();
