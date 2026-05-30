import { MAP, node } from './map.js';

function ptToSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function nearestEdge(x, y) {
  let best = null, bestD = Infinity;
  for (const e of MAP.edges) {
    const f = node(e.from), t = node(e.to);
    const d = ptToSegDist(x, y, f.x, f.y, t.x, t.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function getNearbyRoads(x, y, radius) {
  const result = [];
  for (const e of MAP.edges) {
    const f = node(e.from), t = node(e.to);
    const d = ptToSegDist(x, y, f.x, f.y, t.x, t.y);
    if (d <= radius) {
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
