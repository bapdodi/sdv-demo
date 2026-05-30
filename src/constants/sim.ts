/**
 * 시뮬레이션 전역 상수.
 * 맵 좌표계 / 서버 브로드캐스트 주기 / 로컬 주행 물리 파라미터를 한곳에 모은다.
 */

/** 맵 논리 좌표 범위 (2D 미니맵·3D 씬 공통). */
export const MAP_WIDTH = 750;
export const MAP_HEIGHT = 465;

/**
 * 서버가 fleet 상태를 내보내는 주기(ms).
 * server/src/index.js 의 setInterval 값과 반드시 일치해야
 * Snapshot Interpolation 타이밍이 맞는다.
 */
export const SERVER_INTERVAL_MS = 200;

/** 로컬 주행(키보드 제어) 물리 파라미터. 단위: units/s, units/s², rad/s. */
export const PHYSICS = {
  MAX_SPEED: 28,
  ACCEL_RATE: 18,
  BRAKE_RATE: 38,
  FRICTION: 4,
  STEER_RATE: 1.6,
  STEER_DECAY: 5.5,
} as const;
