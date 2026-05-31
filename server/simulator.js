/**
 * SDV Platform Simulator
 *
 * 각 차량은 config/vehicles.json 에서 VIN/메타를 읽어
 * 단일 브릿지 포트(BRIDGE_URL)에 접속 후 자기 자신을 등록한다.
 * 포트 배정·platforms.json 없이 차량 추가 = vehicles.json 한 줄 추가.
 */
import { WebSocket } from 'ws';
import { MAP, node } from './src/map.js';

const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:9003';

// 시뮬레이션할 VIN 목록 — 이름·색상은 브릿지가 자동 배정
const VEHICLES = (process.env.SIM_VINS || 'SDV-SIM-001,SDV-SIM-002,SDV-SIM-003')
  .split(',').filter(Boolean).map(vin => ({ vin: vin.trim() }));

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
  const startFromX1 = dist2(r.x1, r.y1, ex, ey) < 25;
  return { road: r, forward: startFromX1 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function nearestRoadProgress(x, y, heading) {
  let best = ROADS[0], bestT = 0, bestD = Infinity;
  for (const r of ROADS) {
    const dx = r.x2 - r.x1, dy = r.y2 - r.y1, len2 = dx * dx + dy * dy;
    const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - r.x1) * dx + (y - r.y1) * dy) / len2));
    const d = dist2(x, y, r.x1 + t * dx, r.y1 + t * dy);
    if (d < bestD) { bestD = d; best = r; bestT = t; }
  }
  const fwdAngle = Math.atan2(best.y2 - best.y1, best.x2 - best.x1);
  const fwdDiff = Math.abs(Math.atan2(Math.sin(fwdAngle - heading), Math.cos(fwdAngle - heading)));
  return { road: best, progress: bestT, forward: fwdDiff <= Math.PI / 2 };
}

function runVehicle(vehicle) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const normAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  let road = ROADS[Math.floor(Math.random() * ROADS.length)];
  let forward = true;
  let progress = Math.random();
  let speed = 30 + Math.random() * 50;
  let accel = 0, brake = 0, steer = 0;

  let ctrl = null, ctrlUntil = 0;
  let driveState = 'auto';
  let poseX = 0, poseY = 0, poseAngle = 0, poseInited = false;
  let retRoad = null, retProgress = 0, retForward = true, retJustEntered = false;
  const BLEND = 8;
  let blendTicks = 0, blendFromX = 0, blendFromY = 0, blendFromAngle = 0;
  let speedMul = 1;
  let tickInterval = null;

  function connect() {
    const ws = new WebSocket(BRIDGE_URL);

    ws.on('open', () => {
      // 접속 즉시 VIN만 전송 — 이름·색상은 브릿지가 자동 배정
      ws.send(JSON.stringify({ type: 'register', vin: vehicle.vin }));
      console.log(`[sim] ${vehicle.vin} → ${BRIDGE_URL} 등록`);
      startTick(ws);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'control' && msg.data) {
          ctrl = msg.data;
          ctrlUntil = Date.now() + 600;
          if (driveState !== 'manual') driveState = 'manual';
        } else if (msg.type === 'control_release') {
          ctrlUntil = 0;
        }
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      console.log(`[sim] ${vehicle.vin} 연결 끊김 — 5s 후 재시도`);
      stopTick();
      setTimeout(connect, 5000);
    });

    ws.on('error', () => ws.close());
  }

  function stopTick() {
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  }

  function startTick(ws) {
    stopTick();
    const DT = 0.2;

    tickInterval = setInterval(() => {
      if (ws.readyState !== 1) { stopTick(); return; }

      const nowControlled = Date.now() < ctrlUntil && ctrl;

      if (driveState === 'manual' && !nowControlled) {
        const snap = nearestRoadProgress(poseX, poseY, poseAngle);
        retRoad = snap.road; retProgress = snap.progress; retForward = snap.forward;
        retJustEntered = true;
        driveState = 'returning';
      }
      if (driveState === 'returning' && nowControlled) driveState = 'manual';
      if (driveState !== 'manual') speedMul = 1;

      progress += 0.005 + speed / 10000;
      if (progress >= 1) {
        const next = nextConnectedRoad(road, forward);
        road = next.road; forward = next.forward; progress = 0;
        speed = 20 + Math.random() * 70;
        accel = Math.random() > 0.7 ? 0.3 + Math.random() * 0.5 : 0;
        brake = Math.random() > 0.85 ? 0.1 + Math.random() * 0.4 : 0;
        steer = (Math.random() - 0.5) * 0.3;
      }
      if (driveState === 'returning') {
        retProgress += 0.005 + speed / 10000;
        if (retProgress >= 1) {
          const next = nextConnectedRoad(retRoad, retForward);
          retRoad = next.road; retForward = next.forward; retProgress = 0;
        }
      }

      const [ax, ay, bx, by] = forward
        ? [road.x1, road.y1, road.x2, road.y2]
        : [road.x2, road.y2, road.x1, road.y1];
      const autoAngle = Math.atan2(by - ay, bx - ax);
      const roadLen = Math.hypot(bx - ax, by - ay);
      const basePixels = (0.005 + speed / 10000) * roadLen;

      let x, y, angle;

      if (driveState === 'manual') {
        const inAccel = ctrl.accel ?? 0;
        const inBrake = ctrl.brake ?? 0;
        const inSteer = ctrl.steer ?? 0;
        speedMul = 1;
        if (inAccel > 0.05) speedMul = 1 + inAccel * 1.8;
        if (inBrake > 0.05) speedMul = Math.max(0, 1 - inBrake * 1.5);
        if (!poseInited) {
          poseX = lerp(ax, bx, progress); poseY = lerp(ay, by, progress);
          poseAngle = autoAngle; poseInited = true;
        }
        poseAngle += inSteer * 1.4 * DT;
        poseX += Math.cos(poseAngle) * basePixels * speedMul;
        poseY += Math.sin(poseAngle) * basePixels * speedMul;
        x = poseX; y = poseY; angle = poseAngle;

      } else if (driveState === 'returning') {
        const [rax, ray, rbx, rby] = retForward
          ? [retRoad.x1, retRoad.y1, retRoad.x2, retRoad.y2]
          : [retRoad.x2, retRoad.y2, retRoad.x1, retRoad.y1];
        const targetX = lerp(rax, rbx, retProgress);
        const targetY = lerp(ray, rby, retProgress);
        const distSq = (poseX - targetX) ** 2 + (poseY - targetY) ** 2;
        const dist = Math.sqrt(distSq);
        const roadDir = Math.atan2(rby - ray, rbx - rax);
        const toTarget = Math.atan2(targetY - poseY, targetX - poseX);
        const blend = Math.max(0, 1 - dist / 60);
        const desired = toTarget + normAngle(roadDir - toTarget) * blend;
        poseAngle += clamp(normAngle(desired - poseAngle) * 3 * DT, -1.4 * DT, 1.4 * DT);
        poseX += Math.cos(poseAngle) * basePixels;
        poseY += Math.sin(poseAngle) * basePixels;
        x = poseX; y = poseY; angle = poseAngle;
        if (!retJustEntered && distSq < 100) {
          road = retRoad; forward = retForward; progress = retProgress;
          blendFromX = poseX; blendFromY = poseY; blendFromAngle = poseAngle;
          blendTicks = BLEND;
          driveState = 'auto';
          poseInited = false;
        }
        retJustEntered = false;

      } else {
        const autoX = lerp(ax, bx, progress), autoY = lerp(ay, by, progress);
        if (blendTicks > 0) {
          const t = 1 - blendTicks / BLEND;
          x = blendFromX + (autoX - blendFromX) * t;
          y = blendFromY + (autoY - blendFromY) * t;
          angle = blendFromAngle + normAngle(autoAngle - blendFromAngle) * t;
          blendTicks--;
        } else {
          x = autoX; y = autoY; angle = autoAngle;
        }
      }

      ws.send(JSON.stringify({
        type: 'location',
        data: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, angle },
      }));

      const jitter = (Math.random() - 0.5) * 5;
      const isManual = driveState === 'manual';
      ws.send(JSON.stringify({
        type: 'vehicle_state',
        data: {
          speed: Math.max(0, Math.round(speed * speedMul + jitter)),
          steer: Math.round((isManual ? (ctrl?.steer ?? 0) : steer) * 100) / 100,
          accel: Math.round((isManual ? (ctrl?.accel ?? 0) : accel) * 100) / 100,
          brake: Math.round((isManual ? (ctrl?.brake ?? 0) : brake) * 100) / 100,
        },
      }));

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
  }

  connect();
}

VEHICLES.forEach(runVehicle);

console.log(`\n  SDV Platform Simulator`);
console.log(`  ──────────────────────`);
console.log(`  브릿지: ${BRIDGE_URL}`);
VEHICLES.forEach(v => console.log(`  ${v.vin.padEnd(16)} → 등록 대기 중`));
console.log(`\n  차량 추가: SIM_VINS=VIN1,VIN2,VIN3 node simulator.js\n`);
