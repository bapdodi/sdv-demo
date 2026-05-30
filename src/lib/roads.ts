import { MAP, type MapEdge } from '../data/map';
import { pointToSegment } from './geometry';

/** 도로 분류별 3D 차선 폭 (차선 오프셋·가드레일 위치 계산의 기준). */
export const ROAD_WIDTH: Record<MapEdge['type'], number> = {
  highway: 12.0,
  arterial: 10.0,
  urban: 8.0,
};

/** 이 거리(맵 유닛) 안에 도로가 없으면 "도로 외"로 본다. */
const SNAP_RADIUS = 60;

/** 월드 좌표 (x,y) 에 가장 가까운 도로 엣지. SNAP_RADIUS 밖이면 null. */
export function nearestEdge(x: number, y: number): MapEdge | null {
  let best: MapEdge | null = null;
  let bestDist = Infinity;
  for (const e of MAP.edges) {
    const f = MAP.nodes[e.from];
    const t = MAP.nodes[e.to];
    const d = pointToSegment(x, y, f.x, f.y, t.x, t.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return bestDist < SNAP_RADIUS ? best : null;
}
