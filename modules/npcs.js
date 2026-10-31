// src/modules/npcs.js
//
// 원작 《검은 그늘 속에서》 설정:
// - 학생들은 인간의 신체 비율을 갖지만 마네킹/밀랍인형처럼 부자연스럽다.
// - 누군가 자신을 바라보는 동안 움직이지 않는다.
// - 시선이 사라지면 빠르고 비정상적인 속도로 이동한다.
// - 목소리가 없다.
// - 플레이어가 내는 특정 소리에 반응한다.
//
// 본 모듈은 Three.js 레이캐스트를 활용해 "시선 응시 시 정지 / 시선 이탈 시 이동"
// 학생 NPC 행위를 구현한다. 원작 미설명 부분(이동 속도 구체 수치 등)은
// 게임 전용 설정으로 둔다.

import * as THREE from 'three';

export class StudentNPC {
  /**
   * @param {THREE.Mesh} mesh - NPC 메시 (원래는 glTF 모델, 프로토타입은 단순 블록)
   * @param {Object} opts
   * @param {number} opts.moveSpeed - 시선 이탈 시 이동 속도 (유닛/초)
   * @param {number} opts.stopDistance - 플레이어와 너무 가까우면 멈추는 거리
   * @param {number} opts.sightAngle - 플레이어가 NPC를 '보고 있다'고判定하는 시야 각도(라디안)
   */
  constructor(mesh, { moveSpeed = 4.5, stopDistance = 2.2, sightAngle = 1.2 } = {}) {
    this.mesh = mesh;
    this.moveSpeed = moveSpeed;
    this.stopDistance = stopDistance;
    this.sightAngle = sightAngle;

    this.startPos = mesh.position.clone();
    this.targetPos = mesh.position.clone();
    this.isMoving = false;
    this.wanderTimer = 0;
    this.wanderInterval = 3 + Math.random() * 4; // 초 단위, 목적지 변경 주기

    // 상호작용 플래그 (원작 미설명: 교복 대여 허락 여부 등은 게임 전용)
    this.canLendUniform = false;
    this.lent = false;
  }

  /**
   * NPC 업데이트. 매 프레임 호출.
   * @param {THREE.Camera} camera - 플레이어 카메라
   * @param {number} dt - 델타타임(초)
   * @param {boolean} isWearingUniform - 플레이어 교복 착용 여부
   */
  update(camera, dt, isWearingUniform) {
    // 1. 플레이어가 이 NPC를 직접 보고 있는지 판정 (레이캐스트 + 각도)
    const isLookedAt = this.isObservedBy(camera);

    // 2. 교복을 입었으면 NPC의 경계심이 낮아져 이동 속도 감소 (위장 효과)
    const effectiveSpeed = isWearingUniform ? this.moveSpeed * 0.5 : this.moveSpeed;

    // 3. 시선 응시 중에는 정지
    if (isLookedAt) {
      this.isMoving = false;
      return;
    }

    // 4. 시선이 아니면 목적지 쪽으로 이동 (비정상 속도)
    this.isMoving = true;
    this.wanderTimer -= dt;

    // 주기적으로 새로운 무작위 목적지 설정 (학교 내부 배회)
    if (this.wanderTimer <= 0) {
      this.pickNewWanderTarget();
      this.wanderTimer = this.wanderInterval;
    }

    this.moveTowardTarget(dt, effectiveSpeed);
  }

  /**
   * 카메라에서 NPC로 레이캐스트를 쏴, 장애물 없이 직접 보이는지 확인하고,
   * 화면 중앙 영역에 들어와 있으며 각도 조건도 만족하는지 판정한다.
   */
  isObservedBy(camera) {
    const raycaster = new THREE.Raycaster();
    const origin = camera.position.clone();
    const dir = new THREE.Vector3().subVectors(this.mesh.position, origin).normalize();
    raycaster.set(origin, dir);

    // 간단한 장애물 판정: 여기서는 학교 벽 메시 목록을 외부에서 주입받지 못해
    // 거리 기반 판정만 수행. 실제 벽 충돌 판정은 buildSchool 쪽에서 wallMeshes를 주입받아 확장 가능.
    const dist = origin.distanceTo(this.mesh.position);
    if (dist > 18) return false; // 너무 멀리 있으면 '본다'고 보지 않음

    // 카메라 정면 방향과 NPC 방향 사이의 각도
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const angle = Math.acos(Math.max(-1, Math.min(1, camDir.dot(dir))));
    if (angle > this.sightAngle) return false;

    return true;
  }

  pickNewWanderTarget() {
    // 시작 지점 주변 반경 6 유닛 안에서 무작위 목적지 선택
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 12,
      0,
      (Math.random() - 0.5) * 12
    );
    this.targetPos.copy(this.startPos).add(offset);
    this.targetPos.y = this.mesh.position.y;
  }

  moveTowardTarget(dt, speed) {
    const current = this.mesh.position;
    const step = speed * dt;
    current.lerp(this.targetPos, Math.min(1, step / current.distanceTo(this.targetPos) || 0));
    // 간단한 바닥 고정 (y 고정)
    current.y = this.startPos.y;
  }

  /** 교복 대여 상호작용 (원작 미설명 부분은 게임 전용 단순화) */
  interact() {
    if (this.lent) return '이미 교복을 빌려 드렸습니다.';
    if (!this.canLendUniform) return '학생이 아무런 반응을 보이지 않습니다.';
    this.lent = true;
    return '교복을 빌렸습니다. 위장 상태가 됩니다.';
  }
}

/**
 * 모든 학생 NPC를 관리하는 매니저.
 * 카메라 시선에 따라 각 NPC의 정지/이동을 제어한다.
 */
export class NPCManager {
  constructor() {
    this.npcs = [];
  }

  add(npc) {
    this.npcs.push(npc);
  }

  update(camera, dt, isWearingUniform) {
    for (const npc of this.npcs) {
      npc.update(camera, dt, isWearingUniform);
    }
  }

  getNearest(camera, maxDist = 6) {
    let nearest = null;
    let nearestD = maxDist;
    const pos = camera.position;
    for (const npc of this.npcs) {
      const d = pos.distanceTo(npc.mesh.position);
      if (d < nearestD) {
        nearestD = d;
        nearest = npc;
      }
    }
    return nearest;
  }
}
