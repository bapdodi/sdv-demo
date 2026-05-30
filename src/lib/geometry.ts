import { node, type MapEdge } from '../data/map';

/** 선형 보간. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 각도 보간 — ±π 경계를 넘어 최단 경로로 회전한다. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export interface EdgeVector {
  from: { x: number; y: number };
  to: { x: number; y: number };
  dx: number;
  dy: number;
  /** 끝점 사이 거리. */
  len: number;
}

/** 엣지의 양 끝점과 방향 벡터를 한 번에 계산한다. */
export function edgeVector(edge: MapEdge): EdgeVector {
  const from = node(edge.from);
  const to = node(edge.to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { from, to, dx, dy, len: Math.hypot(dx, dy) };
}

/** 점 (px,py) 과 선분 a–b 사이의 최단 거리. */
export function pointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
