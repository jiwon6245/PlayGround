// src/modules/npcs.js
//
// 원작 《검은 그늘 속에서》 설정:
// - 학생들은 인간의 신체 비율을 갖지만 마네킹/밀랍인형처럼 부자연스럽다.
// - 누군가 자신을 바라보는 동안 움직이지 않는다.
// - 시선이 사라지면 빠르고 비정상적인 속도로 이동한다.
// - 목소리가 없다.
//
// 본 모듈은 Three.js 레이캐스트를 활용해 "시선 응시 시 정지 / 시선 이탈 시 이동"
// 학생 NPC 행위를 구현한다. 원작 미설명 부분(이동 속도 구체 수치 등)은
// 게임 전용 설정으로 둔다.

import * as THREE from 'three';

/**
 * 학생 NPC (임시 외형: 마네킹/밀랍인형풍)
 * 몸 전체를 THREE.Group으로 구성해 하나의 메시처럼 다룬다.
 */
export class StudentNPC {
  /**
   * @param {Object} opts
   * @param {number} opts.moveSpeed - 시선 이탈 시 이동 속도 (유닛/초)
   * @param {number} opts.stopDistance - 플레이어에게 이 거리 이상 가까우면 이동 중단
   * @param {number} opts.sightAngle - 플레이어가 NPC를 "보고 있다"고 판정하는 시야 각도(라디안)
   */
  constructor({ moveSpeed = 7.0, stopDistance = 1.5, sightAngle = 1.0 } = {}) {
    // ---------- 외형 구성 (마네킹/밀랍인형풍) ----------
    this.mesh = new THREE.Group();

    const mannequinMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      roughness: 0.15,
      metalness: 0.1,
    });

    // 머리: 약간 큰 큐브 (언캐니 밸리 연출)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mannequinMat);
    head.position.y = 1.55;
    this.mesh.add(head);

    // 몸통
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.3), mannequinMat);
    torso.position.y = 0.95;
    this.mesh.add(torso);

    // 팔: 비정상적으로 길게
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.18), mannequinMat);
    lArm.position.set(-0.4, 1.15, 0);
    this.mesh.add(lArm);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.18), mannequinMat);
    rArm.position.set(0.4, 1.15, 0);
    this.mesh.add(rArm);

    // 다리
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.95, 0.22), mannequinMat);
    lLeg.position.set(-0.18, 0.42, 0);
    this.mesh.add(lLeg);

    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.95, 0.22), mannequinMat);
    rLeg.position.set(0.18, 0.42, 0);
    this.mesh.add(rLeg);

    // ---------- 행동 설정 ----------
    this.moveSpeed = moveSpeed;
    this.stopDistance = stopDistance;
    this.sightAngle = sightAngle;

    this.startPos = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.isMoving = false;
    this.wanderTimer = 0;
    this.wanderInterval = 4 + Math.random() * 4;
  }

  /** NPC를 월드 좌표에 배치하고 시작점을 기록한다. */
  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    this.startPos.copy(this.mesh.position);
    this.targetPos.copy(this.mesh.position);
  }

  /**
   * 매 프레임 호출.
   * @param {THREE.Camera} camera - 플레이어 카메라
   * @param {number} dt - 델타타임(초)
   * @param {THREE.Object3D[]} occluders - 시야를 가릴 장애물 메시 목록(벽 등)
   */
  update(camera, dt, occluders = []) {
    const isLookedAt = this.isObservedBy(camera, occluders);

    // 시선이 닿는 동안에는 완전히 정지
    if (isLookedAt) {
      this.isMoving = false;
      return;
    }

    // 시선이 떨어지면 플레이어 쪽으로 비정상 속도로 이동 (위치 보간)
    this.isMoving = true;

    const playerPos = camera.position.clone();
    playerPos.y = this.mesh.position.y; // 바닥 고정

    const current = this.mesh.position;
    const distToPlayer = current.distanceTo(playerPos);

    if (distToPlayer > this.stopDistance) {
      const step = this.moveSpeed * dt;
      const t = Math.min(1, step / distToPlayer);
      current.lerp(playerPos, t);
      current.y = this.startPos.y; // y축 고정
    }
  }

  /**
   * 플레이어가 이 NPC를 직접 보고 있는지 판정한다.
   * 1) 카메라 정면 방향과 NPC 방향 사이 각도 확인
   * 2) 카메라에서 NPC로 레이캐스트, 중간에 장애물이 있으면 false
   */
  isObservedBy(camera, occluders) {
    const origin = camera.position.clone();
    // NPC 몸통 중심부를 목표점으로 삼음 (머리보다 약간 아래)
    const target = this.mesh.position.clone();
    target.y += 0.9;

    const dir = new THREE.Vector3().subVectors(target, origin);
    const dist = dir.length();
    if (dist > 20) return false; // 너무 멀리 있으면 "본다"고 보지 않음
    dir.normalize();

    // 각도 판정 (화면 중앙 근처에 들어와 있어야 함)
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const angle = Math.acos(Math.max(-1, Math.min(1, camDir.dot(dir))));
    if (angle > this.sightAngle) return false;

    // 장애물 raycast 판정
    const raycaster = new THREE.Raycaster(origin, dir, 0, dist);
    const hits = raycaster.intersectObjects(occluders);

    for (const hit of hits) {
      // NPC 자신보다 가까운 곳에 벽 등이 있으면 시야 차단
      if (hit.distance < dist - 0.15) {
        return false;
      }
    }

    return true;
  }
}

/**
 * 모든 학생 NPC를 관리한다. 각각 독립적으로 gaze 반응을 보인다.
 */
export class NPCManager {
  constructor() {
    this.npcs = [];
    this.occluders = [];
  }

  /** 장애물 메시 목록을 설정한다. (벽 등) */
  setOccluders(meshes) {
    this.occluders = meshes;
  }

  add(npc) {
    this.npcs.push(npc);
  }

  update(camera, dt) {
    for (const npc of this.npcs) {
      npc.update(camera, dt, this.occluders);
    }
  }
}
