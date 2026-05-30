import { lerp, lerpAngle } from './geometry';
import { SERVER_INTERVAL_MS } from '../constants/sim';

/**
 * 레이스 게임식 Snapshot Interpolation 버퍼.
 * 서버는 SERVER_INTERVAL_MS 마다 띄엄띄엄 위치를 보내고,
 * 렌더 프레임마다 직전 스냅샷 → 최신 스냅샷 사이를 보간해 부드럽게 그린다.
 */
export interface Snapshot {
  prevX: number;
  prevY: number;
  prevAngle: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
  /** target 을 받은 시각 (performance.now()). */
  lastUpdate: number;
  renderX: number;
  renderY: number;
  renderAngle: number;
}

/** 이 거리(유닛) 이상 점프하면 보간하지 않고 즉시 순간이동시킨다. */
const TELEPORT_THRESHOLD = 50;
const TELEPORT_THRESHOLD_SQ = TELEPORT_THRESHOLD * TELEPORT_THRESHOLD;

/** 다음 스냅샷이 늦어도 멈추지 않도록 살짝(1.2배) 외삽 허용. */
const MAX_EXTRAPOLATION = 1.2;

export function createSnapshot(x: number, y: number, angle: number): Snapshot {
  return {
    prevX: x, prevY: y, prevAngle: angle,
    targetX: x, targetY: y, targetAngle: angle,
    lastUpdate: 0,
    renderX: x, renderY: y, renderAngle: angle,
  };
}

/**
 * 새 권위(서버) 위치를 반영한다. 위치가 실제로 바뀐 경우에만 보간 구간을 재설정.
 * 큰 점프는 순간이동으로 간주해 즉시 스냅한다.
 */
export function pushTarget(s: Snapshot, x: number, y: number, angle: number, now: number): void {
  if (x === s.targetX && y === s.targetY) return;

  const dx = x - s.targetX;
  const dy = y - s.targetY;
  if (dx * dx + dy * dy > TELEPORT_THRESHOLD_SQ) {
    s.renderX = x;
    s.renderY = y;
    s.renderAngle = angle;
  }

  s.prevX = s.renderX;
  s.prevY = s.renderY;
  s.prevAngle = s.renderAngle;
  s.targetX = x;
  s.targetY = y;
  s.targetAngle = angle;
  s.lastUpdate = now;
}

/** 시각 now 기준 보간 포즈를 계산해 render* 필드를 갱신한다 (in-place). */
export function sampleSnapshot(s: Snapshot, now: number): void {
  const t = Math.min((now - s.lastUpdate) / SERVER_INTERVAL_MS, MAX_EXTRAPOLATION);
  s.renderX = lerp(s.prevX, s.targetX, t);
  s.renderY = lerp(s.prevY, s.targetY, t);
  s.renderAngle = lerpAngle(s.prevAngle, s.targetAngle, Math.min(t, 1));
}
