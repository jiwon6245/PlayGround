// src/modules/garbled.js
//
// 원작 《검은 그늘 속에서》 설정:
// - 학생들의 대사는 ASCII 코드처럼 깨진 문자열로 표시된다.
// - 탐사자의 인식과 학교 세계의 실제 모습 사이에 차이가 존재한다.
//
// 본 모듈은 일반 한국어 텍스트를 '깨진 문자열'로 변환하는 유틸리티를 제공한다.
// 원작에서 설명되지 않은 부분(대체 규칙 등)은 미확인 설정으로 두고,
// 게임 전용 연출로 최소한의 치환만 수행한다.

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/**
 * 입력 텍스트 중 일부 문자를 무작위 기호로 치환해 '깨진 문자열'처럼 만든다.
 * 한글은 글자 단위로 치환, 영어/숫자는 그대로 두거나 일부만 치환해
 * '인식 오류' 분위기를 낸다.
 *
 * @param {string} text - 원본 텍스트
 * @param {number} rate - 치환 비율 (0 ~ 1). 기본 0.6
 * @returns {string}
 */
export function garble(text, rate = 0.6) {
  let result = '';
  for (const ch of text) {
    if (Math.random() < rate) {
      // 한글 음절은 깨진 기호로, 공백은 유지
      if (/\s/.test(ch)) {
        result += ch;
      } else if (/[가-힣]/.test(ch)) {
        result += randomGlyph();
      } else {
        // 영문/숫자/문자는 가끔만 치환해 가독성 최소화
        result += Math.random() < 0.5 ? randomGlyph() : ch;
      }
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * NPC 대사를 깨진 문자열로 표시할 때 함께 사용할 '흐릿함' 클래스명 반환.
 * CSS에서 해당 클래스에 filter: blur() 등을 적용하면 인식 오류 연출에 활용 가능.
 */
export function garbledClass() {
  return 'garbled';
}
