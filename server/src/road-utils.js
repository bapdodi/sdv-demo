import { MAP, node } from './map.js';

// 엣지별 끝점 좌표를 모듈 로드 시 1회 평탄화해 캐시한다.
// nearestEdge/getNearbyRoads 가 호출마다 node() 를 엣지당 2번씩 조회하던 것을 제거.
const SEGMENTS = MAP.edges.map(e => {
  const f = node(e.from), t = node(e.to);
  return { edge: e, ax: f.x, ay: f.y, bx: t.x, by: t.y };
});

// 제곱거리만으로 최근접 비교 (sqrt 생략). 실제 거리가 필요할 때만 hypot.
function ptToSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) { const ex = px - ax, ey = py - ay; return ex * ex + ey * ey; }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

export function nearestEdge(x, y) {
  let best = null, bestD = Infinity;
  for (const s of SEGMENTS) {
    const d = ptToSegDist2(x, y, s.ax, s.ay, s.bx, s.by);
    if (d < bestD) { bestD = d; best = s.edge; }
  }
  return best;
}

export function getNearbyRoads(x, y, radius) {
  const result = [];
  const radius2 = radius * radius;
  for (const s of SEGMENTS) {
    const e = s.edge;
    const d2 = ptToSegDist2(x, y, s.ax, s.ay, s.bx, s.by);
    if (d2 <= radius2) {
      const f = node(e.from), t = node(e.to);
      const d = Math.sqrt(d2);
      result.push({
        id: e.id,
        name: e.name,
        type: e.type,
        speed_limit: e.speed_limit,
        from: f.name,
        to: t.name,
        distance: Math.round(d * 10) / 10
      });
    }
  }
  result.sort((a, b) => a.distance - b.distance);
  return result;
}
