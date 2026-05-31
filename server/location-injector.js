/**
 * location-injector.js
 *
 * C++ SdvPlatform 의 VehicleControlFeature WebSocket (포트 9001) 으로
 * MAP 기반 주행 위치를 주입한다.
 *
 * 데이터 흐름:
 *   location-injector → ws://localhost:9001 (VehicleControlFeature)
 *     → EventBus gRPC (VehicleLocationUpdate / VehicleStateUpdate)
 *     → DisplayFeature → Demo bridge (9003) → React
 */
import { WebSocket } from 'ws';
import { MAP, node } from './src/map.js';

const TARGET_URL = process.env.VC_URL || 'ws://localhost:9001';

const ROADS = MAP.edges.map(e => {
  const f = node(e.from), t = node(e.to);
  return { x1: f.x, y1: f.y, x2: t.x, y2: t.y, name: e.name };
});

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function nextConnectedRoad(current, forward) {
  const ex = forward ? current.x2 : current.x1;
  const ey = forward ? current.y2 : current.y1;
  const candidates = ROADS.filter(r => {
    if (r === current) return false;
    return dist2(r.x1, r.y1, ex, ey) < 25 || dist2(r.x2, r.y2, ex, ey) < 25;
  });
  if (!candidates.length) return { road: current, forward: !forward };
  const r = candidates[Math.floor(Math.random() * candidates.length)];
  return { road: r, forward: dist2(r.x1, r.y1, ex, ey) < 25 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

let road    = ROADS[Math.floor(Math.random() * ROADS.length)];
let forward = true;
let progress = Math.random();
let speed   = 30 + Math.random() * 50;
let accel   = 0, brake = 0, steer = 0;
let tickInterval = null;

function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

function startTick(ws) {
  stopTick();
  tickInterval = setInterval(() => {
    if (ws.readyState !== 1) { stopTick(); return; }

    progress += 0.005 + speed / 10000;
    if (progress >= 1) {
      const next = nextConnectedRoad(road, forward);
      road = next.road; forward = next.forward; progress = 0;
      speed = 20 + Math.random() * 70;
      accel = Math.random() > 0.7 ? 0.3 + Math.random() * 0.5 : 0;
      brake = Math.random() > 0.85 ? 0.1 + Math.random() * 0.4 : 0;
      steer = (Math.random() - 0.5) * 0.3;
    }

    const [ax, ay, bx, by] = forward
      ? [road.x1, road.y1, road.x2, road.y2]
      : [road.x2, road.y2, road.x1, road.y1];

    const x = lerp(ax, bx, progress);
    const y = lerp(ay, by, progress);
    const jitter = (Math.random() - 0.5) * 5;

    // VehicleControlFeature 가 기대하는 포맷: { x, y, steer, accel, brake, speed }
    ws.send(JSON.stringify({
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      steer: Math.round(steer * 100) / 100,
      accel: Math.round(accel * 100) / 100,
      brake: Math.round(brake * 100) / 100,
      speed: Math.max(0, Math.round(speed + jitter)),
    }));
  }, 200);
}

function connect() {
  const ws = new WebSocket(TARGET_URL);

  ws.on('open', () => {
    console.log(`[injector] ${TARGET_URL} 연결 — 위치 주입 시작`);
    startTick(ws);
  });

  ws.on('close', () => {
    console.log('[injector] 연결 끊김 — 5s 후 재시도');
    stopTick();
    setTimeout(connect, 5000);
  });

  ws.on('error', () => ws.close());
}

connect();
console.log(`\n  SDV Location Injector`);
console.log(`  ──────────────────────`);
console.log(`  대상: ${TARGET_URL} (VehicleControlFeature)`);
console.log(`  MAP 기반 자동 주행 위치를 200ms 주기로 주입\n`);
