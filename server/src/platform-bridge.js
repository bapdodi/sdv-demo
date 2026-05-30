import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', 'config', 'platforms.json');

/* ── 외부 플랫폼 상태 ──────────────────────────────────── */
// vin -> { vin, name, color, x, y, speed, steer, accel, brake, angle, connected, host, ws, controlledUntil }
const externalVehicles = new Map();

/**
 * "제어 중" 표시(controlled 플래그) 유지 시간(ms).
 * 클라이언트가 SERVER_INTERVAL_MS(200ms)마다 control 을 보내므로,
 * 그보다 넉넉히 길게 잡아 패킷 한두 개가 누락돼도 깜빡이지 않게 한다.
 * 이 시간 동안 control 갱신이 없으면 순수 자율주행 상태로 표시된다.
 */
const CONTROL_TTL_MS = 600;

/* ── 설정 로드 ─────────────────────────────────────────── */
function loadConfig() {
  // 1. JSON config file 우선
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (Array.isArray(data) && data.length) {
        console.log(`[bridge] loaded ${data.length} platforms from config`);
        return data;
      }
    }
  } catch (e) {
    console.warn(`[bridge] config parse error:`, e.message);
  }

  // 2. PLATFORM_BRIDGE 환경변수 ("host:port:vin:name,host:port:vin:name")
  const env = process.env.PLATFORM_BRIDGE || '';
  if (!env) return [];

  return env.split(',').filter(Boolean).map((entry, i) => {
    const parts = entry.split(':');
    return {
      vin: parts[2] || `EXT-${String(i + 1).padStart(3, '0')}`,
      name: parts[3] || `External ${i + 1}`,
      host: parts[0],
      port: parseInt(parts[1]) || 9002,
      color: ['#ff6b6b', '#ffd93d', '#6bcbff', '#c084fc', '#fb923c'][i % 5],
    };
  });
}

/* ── 플랫폼 연결 관리 ──────────────────────────────────── */
const connections = [];

export function startBridge(onVehicleUpdate) {
  const platforms = loadConfig();
  if (!platforms.length) {
    console.log('[bridge] no platforms configured');
    return [];
  }

  for (const p of platforms) {
    connectToPlatform(p, onVehicleUpdate);
  }

  return platforms.map(p => p.vin);
}

function connectToPlatform(p, onUpdate) {
  const url = `ws://${p.host}:${p.port}`;

  // 초기 상태 등록
  const vehicle = {
    vin: p.vin,
    name: p.name,
    color: p.color,
    x: 0, y: 0,
    speed: 0, steer: 0, accel: 0, brake: 0,
    angle: 0,
    connected: false,
    host: p.host,
    lastSeen: 0,
    isExternal: true,
    ws: null,            // 현재 플랫폼 연결 (control 상류 전송용)
    controlledUntil: 0,  // 이 시각까지 수동 제어 override 유효
  };
  externalVehicles.set(p.vin, vehicle);

  function connect() {
    const ws = new WebSocket(url);
    vehicle.ws = ws;

    ws.on('open', () => {
      console.log(`[bridge] ${p.vin} (${p.host}:${p.port}) connected`);
      vehicle.connected = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        vehicle.lastSeen = Date.now();

        // 제어 중에도 위치는 플랫폼(자율주행 + 입력 오버레이)이 계산하므로
        // 들어오는 포즈/상태를 그대로 반영한다. (override 하지 않음)
        if (msg.type === 'vehicle_state' && msg.data) {
          vehicle.speed = msg.data.speed ?? vehicle.speed;
          vehicle.accel = msg.data.accel ?? 0;
          vehicle.brake = msg.data.brake ?? 0;
          vehicle.steer = msg.data.steer ?? 0;
        } else if (msg.type === 'location' && msg.data) {
          const prevX = vehicle.x, prevY = vehicle.y;
          vehicle.x = msg.data.x ?? vehicle.x;
          vehicle.y = msg.data.y ?? vehicle.y;
          if (msg.data.angle != null) {
            vehicle.angle = msg.data.angle;
          } else {
            const dx = vehicle.x - prevX, dy = vehicle.y - prevY;
            if (dx * dx + dy * dy > 0.01) vehicle.angle = Math.atan2(dy, dx);
          }
        } else if (msg.type === 'road_info' && msg.data) {
          if (msg.data.position) {
            const prevX = vehicle.x, prevY = vehicle.y;
            vehicle.x = msg.data.position.x ?? vehicle.x;
            vehicle.y = msg.data.position.y ?? vehicle.y;
            if (msg.data.position.angle != null) {
              vehicle.angle = msg.data.position.angle;
            } else {
              const dx = vehicle.x - prevX, dy = vehicle.y - prevY;
              if (dx * dx + dy * dy > 0.01) vehicle.angle = Math.atan2(dy, dx);
            }
          }
        }

        // 상태 업데이트 콜백
        if (onUpdate) onUpdate(getExternalSnapshot());
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      console.log(`[bridge] ${p.vin} disconnected, retry 5s...`);
      vehicle.connected = false;
      setTimeout(connect, 5000);
    });

    ws.on('error', () => ws.close());

    connections.push(ws);
  }

  connect();
}

/* ── 스냅샷 ────────────────────────────────────────────── */
export function getExternalSnapshot() {
  const result = [];
  for (const v of externalVehicles.values()) {
    if (v.lastSeen === 0) continue;  // 아직 데이터 없음
    result.push({
      vin: v.vin,
      name: v.name,
      color: v.color,
      x: Math.round(v.x * 10) / 10,
      y: Math.round(v.y * 10) / 10,
      speed: v.speed,
      steer: v.steer,
      accel: v.accel,
      brake: v.brake,
      angle: v.angle,
      connected: v.connected,
      controlled: Date.now() < v.controlledUntil,
      isExternal: true,
      // road는 생략 (클라이언트에서 MAP 기반 계산)
    });
  }
  return result;
}

/* ── 수동 제어 (상류) ──────────────────────────────────── */
/**
 * 클라이언트의 입력(가속/브레이크/조향)을 플랫폼으로 전달한다.
 * 위치는 플랫폼이 자율주행 위에 입력을 얹어 계산하므로 여기서 포즈를 덮지 않는다.
 * controlledUntil 은 UI 의 제어중 표시(controlled 플래그) 용도로만 유지한다.
 * @param {{accel?:number, brake?:number, steer?:number}} data 제어 입력
 * @returns {boolean} 대상 차량이 존재하면 true
 */
export function applyControl(vin, data) {
  const v = externalVehicles.get(vin);
  if (!v) return false;

  v.controlledUntil = Date.now() + CONTROL_TTL_MS;
  if (v.ws && v.ws.readyState === 1) {
    v.ws.send(JSON.stringify({ type: 'control', data }));
  }
  return true;
}

/** 수동 제어 해제 — override 를 즉시 끄고 플랫폼에 자율주행 복귀를 알린다. */
export function releaseExternalControl(vin) {
  const v = externalVehicles.get(vin);
  if (!v) return false;
  v.controlledUntil = 0;
  if (v.ws && v.ws.readyState === 1) {
    v.ws.send(JSON.stringify({ type: 'control_release' }));
  }
  return true;
}

/* ── 정리 ──────────────────────────────────────────────── */
export function stopBridge() {
  for (const ws of connections) {
    try { ws.close(); } catch { /* ignore */ }
  }
  connections.length = 0;
  externalVehicles.clear();
}
