/**
 * SDV Platform Simulator — DisplayFeature 프로토콜로 여러 대의 차량 시뮬레이션
 * 각 차량은 독립 WebSocket 서버로 동작하며, Demo 브릿지가 연결함
 *
 * 사용: node simulator.js
 */
import { WebSocketServer } from 'ws';
import { MAP, node } from './src/map.js';

const VEHICLES = [
  { vin: 'SDV-SIM-001', name: '테헤란로 차량', color: '#ff6b6b', startX: 100, startY: 80 },
  { vin: 'SDV-SIM-002', name: '판교 차량',     color: '#ffd93d', startX: 300, startY: 150 },
  { vin: 'SDV-SIM-003', name: '동탄 차량',     color: '#6bcbff', startX: 500, startY: 250 },
];

// 차량이 주행하는 도로 = 화면(클라이언트)이 그리는 도로와 동일한 MAP 그래프.
// 좌표계를 별도로 두면 차량이 그려진 도로를 벗어나므로, MAP 엣지를 그대로 사용한다.
const ROADS = MAP.edges.map(e => {
  const f = node(e.from), t = node(e.to);
  return { x1: f.x, y1: f.y, x2: t.x, y2: t.y, name: e.name };
});

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// 현재 도로의 끝점(종점)과 연결된 도로를 찾아 반환 (순간이동 방지)
function nextConnectedRoad(current, forward) {
  const ex = forward ? current.x2 : current.x1;
  const ey = forward ? current.y2 : current.y1;
  const candidates = ROADS.filter(r => {
    if (r === current) return false;
    return dist2(r.x1, r.y1, ex, ey) < 25 || dist2(r.x2, r.y2, ex, ey) < 25;
  });
  if (!candidates.length) {
    // 연결 도로 없으면 방향 반전 (U-turn)
    return { road: current, forward: !forward };
  }
  const r = candidates[Math.floor(Math.random() * candidates.length)];
  // 선택한 도로의 어느 끝이 현재 끝점에 닿는지 확인
  const startFromX1 = dist2(r.x1, r.y1, ex, ey) < 25;
  return { road: r, forward: startFromX1 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function runVehicle(vehicle, port) {
  const wss = new WebSocketServer({ port });
  console.log(`[${vehicle.vin}] WebSocket on port ${port}`);

  // 포트 충돌 시 명확히 안내 (이전 시뮬레이터가 살아있으면 새 인스턴스가 여기서 죽는다).
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ✗ 포트 ${port} 가 이미 사용 중입니다 — 이전 시뮬레이터가 떠 있어요.`);
      console.error('    종료 후 다시 실행하세요:  pkill -f simulator.js\n');
    } else {
      console.error(`[${vehicle.vin}] 오류:`, err.message);
    }
    process.exit(1);
  });

  let road = ROADS[Math.floor(Math.random() * ROADS.length)];
  let forward = true; // x1→x2 방향으로 주행
  let progress = Math.random();
  let speed = 30 + Math.random() * 50;
  let accel = 0;
  let brake = 0;
  let steer = 0;

  // 수동 제어 입력 오버레이 상태 (자율주행은 계속, 입력만 얹는다)
  let ctrl = null;       // { accel, brake, steer } — 클라이언트 입력
  let ctrlUntil = 0;     // 이 시각까지 입력 유효
  let lateral = 0;       // 도로 중심선 기준 현재 횡방향 오프셋

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  wss.on('connection', (ws) => {
    console.log(`[${vehicle.vin}] client connected`);

    // 서버(브리지) → 시뮬레이터 제어 입력
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'control' && msg.data) {
          ctrl = msg.data;
          ctrlUntil = Date.now() + 600;
        } else if (msg.type === 'control_release') {
          ctrlUntil = 0;
        }
      } catch { /* ignore */ }
    });

    const DT = 0.2; // 틱 간격(초)

    const interval = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(interval); return; }

      const controlled = Date.now() < ctrlUntil && ctrl;
      const inAccel = controlled ? (ctrl.accel ?? 0) : 0;
      const inBrake = controlled ? (ctrl.brake ?? 0) : 0;
      const inSteer = controlled ? (ctrl.steer ?? 0) : 0;

      // ── 종방향 ── 자율 진행속도에 가/감속 입력을 곱해 얹는다.
      //   W(accel) → 최대 ~2.8배 가속, S(brake) → 0까지 감속(정지)
      let speedMul = 1;
      if (inAccel > 0.05) speedMul = 1 + inAccel * 1.8;
      if (inBrake > 0.05) speedMul = Math.max(0, 1 - inBrake * 1.5);

      // Move along road (자율주행 — 입력과 무관하게 경로는 유지)
      progress += (0.005 + speed / 10000) * speedMul;
      if (progress >= 1) {
        const next = nextConnectedRoad(road, forward);
        road = next.road;
        forward = next.forward;
        progress = 0;
        speed = 20 + Math.random() * 70;
        accel = Math.random() > 0.7 ? 0.3 + Math.random() * 0.5 : 0;
        brake = Math.random() > 0.85 ? 0.1 + Math.random() * 0.4 : 0;
        steer = (Math.random() - 0.5) * 0.3;
      }

      // ── 횡방향 ── A/D(steer) 입력으로 도로 중심선 기준 좌우 오프셋.
      //   입력이 없으면 서서히 중심선으로 복귀.
      if (Math.abs(inSteer) > 0.02) {
        lateral = clamp(lateral + inSteer * 22 * DT, -18, 18);
      } else {
        lateral *= 0.9;
      }

      const [ax, ay, bx, by] = forward
        ? [road.x1, road.y1, road.x2, road.y2]
        : [road.x2, road.y2, road.x1, road.y1];
      let x = lerp(ax, bx, progress);
      let y = lerp(ay, by, progress);
      let angle = Math.atan2(by - ay, bx - ax);

      // 진행방향 법선으로 횡 오프셋 적용 + 약간의 yaw 로 조향감
      x += -Math.sin(angle) * lateral;
      y += Math.cos(angle) * lateral;
      if (controlled) angle += inSteer * 0.25;

      // Send location (angle 포함 — 브리지에서 방향 계산용)
      ws.send(JSON.stringify({
        type: 'location',
        data: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, angle },
      }));

      // Send vehicle state — 제어 중이면 입력값을, 아니면 자율값을 보고
      const jitter = (Math.random() - 0.5) * 5;
      ws.send(JSON.stringify({
        type: 'vehicle_state',
        data: {
          speed: Math.max(0, Math.round(speed * speedMul + jitter)),
          steer: Math.round((controlled ? inSteer : steer) * 100) / 100,
          accel: Math.round((controlled ? inAccel : accel) * 100) / 100,
          brake: Math.round((controlled ? inBrake : brake) * 100) / 100,
        },
      }));

      // Send road info periodically
      if (Math.random() < 0.3) {
        ws.send(JSON.stringify({
          type: 'road_info',
          data: {
            position: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, angle },
            road: road.name,
            speed_limit: 60 + Math.floor(Math.random() * 50),
          },
        }));
      }
    }, 200);

    ws.on('close', () => clearInterval(interval));
  });
}

// Start each vehicle on its own port
VEHICLES.forEach((v, i) => runVehicle(v, 9003 + i));

console.log(`\n  SDV Platform Simulator running`);
console.log(`  ──────────────────────────`);
VEHICLES.forEach((v, i) => {
  console.log(`  ${v.vin.padEnd(16)} → ws://localhost:${9003 + i}`);
});
console.log(`\n  Add these to Demo's server/config/platforms.json\n`);
