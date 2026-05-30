import { PHYSICS, MAP_WIDTH, MAP_HEIGHT } from '../constants/sim';

export interface DriveKeys {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
}

export interface PhysicsState {
  x: number;
  y: number;
  angle: number;
  /** units/s. */
  speed: number;
  /** rad/s. */
  angVel: number;
  /** 0..1 가속 페달. */
  accel: number;
  /** 0..1 브레이크. */
  brake: number;
  /** -1..1 조향. */
  steer: number;
}

export function createPhysicsState(x: number, y: number, angle: number): PhysicsState {
  return { x, y, angle, speed: 0, angVel: 0, accel: 0, brake: 0, steer: 0 };
}

function wrap(v: number, max: number): number {
  return ((v % max) + max) % max;
}

/**
 * 물리 상태를 dt(초)만큼 전진시킨다 (in-place).
 * W=가속, S=제동, A/D=조향. 키 입력이 없으면 마찰로 감속하고 조향은 0으로 복원.
 */
export function stepPhysics(s: PhysicsState, keys: DriveKeys, dt: number): void {
  const { MAX_SPEED, ACCEL_RATE, BRAKE_RATE, FRICTION, STEER_RATE, STEER_DECAY } = PHYSICS;

  // 종방향: 가속 / 제동 / 마찰
  if (keys.w) {
    s.speed = Math.min(MAX_SPEED, s.speed + ACCEL_RATE * dt);
    s.accel = s.speed / MAX_SPEED;
    s.brake = 0;
  } else if (keys.s) {
    s.speed = Math.max(0, s.speed - BRAKE_RATE * dt);
    s.brake = s.speed > 0 ? 1 - s.speed / MAX_SPEED : 1;
    s.accel = 0;
  } else {
    s.speed = Math.max(0, s.speed - FRICTION * dt);
    s.accel = 0;
    s.brake = 0;
  }

  // 횡방향: 저속일수록 조향 효과 감소
  const speedFactor = Math.min(s.speed / (MAX_SPEED * 0.3), 1);
  if (keys.a) {
    s.angVel = -STEER_RATE * speedFactor;
    s.steer = Math.max(-1, s.steer - 0.08);
  } else if (keys.d) {
    s.angVel = STEER_RATE * speedFactor;
    s.steer = Math.min(1, s.steer + 0.08);
  } else {
    s.angVel = 0;
    s.steer = s.steer > 0
      ? Math.max(0, s.steer - STEER_DECAY * dt)
      : Math.min(0, s.steer + STEER_DECAY * dt);
  }

  // 적분 + 맵 경계 랩어라운드
  s.angle += s.angVel * dt;
  s.x = wrap(s.x + Math.cos(s.angle) * s.speed * dt, MAP_WIDTH);
  s.y = wrap(s.y + Math.sin(s.angle) * s.speed * dt, MAP_HEIGHT);
}

/** 내부 units/s 속도를 표시용 km/h 로 변환. */
export function speedKmh(s: PhysicsState): number {
  return Math.round(s.speed * 3.6);
}
