/**
 * 차량 허브 브릿지 — 단일 WebSocket 서버(VEHICLE_PORT)
 *
 * 차량(시뮬레이터 또는 실제 플랫폼)이 접속하면 스스로 VIN을 등록한다.
 * platforms.json / 포트 배정 없이 차량이 자동 인식된다.
 * 내부에서 Map<vin, ws>로 이벤트 라우팅 (이벤트 버스 패턴).
 */
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VEHICLE_PORT = parseInt(process.env.VEHICLE_WS_PORT || '9003');
const CONTROL_TTL_MS = 600;

const COLOR_PALETTE = [
  '#ff6b6b', '#ffd93d', '#6bcbff', '#a29bfe', '#55efc4',
  '#fd79a8', '#fdcb6e', '#74b9ff', '#00cec9', '#e17055',
];
let colorIndex = 0;
function nextColor() {
  return COLOR_PALETTE[colorIndex++ % COLOR_PALETTE.length];
}

// vin → { vin, name, color, x, y, speed, steer, accel, brake, angle, connected, ws, controlledUntil, lastSeen, isExternal }
const vehicles = new Map();

export function startBridge(onVehicleUpdate) {
  const wss = new WebSocketServer({ port: VEHICLE_PORT });

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ✗ 포트 ${VEHICLE_PORT} 가 이미 사용 중입니다 — 이전 서버가 떠 있어요.`);
      console.error(`    pkill -f simulator.js  또는  lsof -ti:${VEHICLE_PORT} | xargs kill\n`);
    } else {
      console.error('[bridge] 오류:', err.message);
    }
    process.exit(1);
  });

  wss.on('connection', (ws) => {
    let vin = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // ── 차량 등록 ──────────────────────────────────────────
        if (msg.type === 'register' && msg.vin) {
          vin = msg.vin;
          if (vehicles.has(vin)) {
            // 재접속: ws 핸들만 교체
            const v = vehicles.get(vin);
            v.ws = ws;
            v.connected = true;
            v.lastSeen = Date.now();
          } else {
            vehicles.set(vin, {
              vin,
              name: vin,          // 이름 = VIN 고정
              color: nextColor(), // 색상 = 자동 배정
              x: 0, y: 0,
              speed: 0, steer: 0, accel: 0, brake: 0,
              angle: 0,
              connected: true,
              lastSeen: Date.now(),
              isExternal: true,
              ws,
              controlledUntil: 0,
            });
          }
          console.log(`[bridge] ${vin} 자동 등록`);
          if (onVehicleUpdate) onVehicleUpdate(getExternalSnapshot());
          return;
        }

        // 등록 전 메시지는 무시
        if (!vin) return;
        const vehicle = vehicles.get(vin);
        if (!vehicle) return;
        vehicle.lastSeen = Date.now();

        // ── 상태/위치 업데이트 ─────────────────────────────────
        // C++ DisplayFeature 는 data 를 JSON 문자열로 전송하므로 양쪽 포맷을 모두 처리.
        // JSON 파싱 실패 = NavigationFeature 텍스트("서울 강남구...") → 조용히 무시.
        const parseData = (d) => {
          try { return typeof d === 'string' ? JSON.parse(d) : d; } catch { return null; }
        };

        if (msg.type === 'vehicle_state' && msg.data) {
          const d = parseData(msg.data);
          if (!d) { /* NavigationFeature 텍스트 무시 */ }
          else {
            vehicle.speed = d.speed ?? vehicle.speed;
            vehicle.accel = d.accel ?? 0;
            vehicle.brake = d.brake ?? 0;
            vehicle.steer = d.steer ?? 0;
          }
        } else if (msg.type === 'location' && msg.data) {
          const d = parseData(msg.data);
          if (!d || d.x == null) { /* 텍스트 location 무시 */ return; }
          // (0,0)이 기본값으로 흘러들어오는 경우(VehicleControlFeature가 x/y 없는 명령 수신 시)
          // 이미 이동한 차량의 위치를 덮어쓰지 않도록 순간이동 방어.
          if (d.x === 0 && d.y === 0 && (vehicle.x !== 0 || vehicle.y !== 0)) return;
          const prevX = vehicle.x, prevY = vehicle.y;
          vehicle.x = d.x ?? vehicle.x;
          vehicle.y = d.y ?? vehicle.y;
          if (d.angle != null) {
            vehicle.angle = d.angle;
          } else {
            const dx = vehicle.x - prevX, dy = vehicle.y - prevY;
            if (dx * dx + dy * dy > 0.01) vehicle.angle = Math.atan2(dy, dx);
          }
        }

        if (onVehicleUpdate) onVehicleUpdate(getExternalSnapshot());
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      if (vin && vehicles.has(vin)) {
        vehicles.get(vin).connected = false;
        console.log(`[bridge] ${vin} 연결 끊김`);
        if (onVehicleUpdate) onVehicleUpdate(getExternalSnapshot());
      }
    });

    ws.on('error', () => ws.close());
  });

  console.log(`[bridge] 차량 허브 대기 중 (포트 ${VEHICLE_PORT})`);
  return wss;
}

/* ── 스냅샷 ────────────────────────────────────────────── */
export function getExternalSnapshot() {
  const result = [];
  const now = Date.now();
  for (const v of vehicles.values()) {
    if (v.lastSeen === 0) continue;
    result.push({
      vin:       v.vin,
      name:      v.name,
      color:     v.color,
      x:         Math.round(v.x * 10) / 10,
      y:         Math.round(v.y * 10) / 10,
      speed:     v.speed,
      steer:     v.steer,
      accel:     v.accel,
      brake:     v.brake,
      angle:     v.angle,
      connected: v.connected,
      controlled: now < v.controlledUntil,
      isExternal: true,
    });
  }
  return result;
}

/* ── 수동 제어 라우팅 ───────────────────────────────────── */
export function applyControl(vin, data) {
  const v = vehicles.get(vin);
  if (!v) return false;
  v.controlledUntil = Date.now() + CONTROL_TTL_MS;
  if (v.ws && v.ws.readyState === 1) {
    v.ws.send(JSON.stringify({ type: 'control', data }));
  }
  return true;
}

export function releaseExternalControl(vin) {
  const v = vehicles.get(vin);
  if (!v) return false;
  v.controlledUntil = 0;
  if (v.ws && v.ws.readyState === 1) {
    v.ws.send(JSON.stringify({ type: 'control_release' }));
  }
  return true;
}

/* ── 아웃바운드 연결 (DisplayFeature_v2 WS → 브릿지 클라이언트) ───── */
// platforms.json 에 등록된 플랫폼의 DisplayFeature WS 에 브릿지가 직접 연결.
// vehicle_state 메시지에 x,y,angle 이 포함된 경우 위치도 함께 갱신.
function connectPlatformDisplayFeature({ vin, name, host, port, color }) {
  function tryConnect() {
    const ws = new WebSocket(`ws://${host}:${port}`);

    ws.on('open', () => {
      console.log(`[bridge] ${vin} DisplayFeature 연결 (${host}:${port})`);
      if (!vehicles.has(vin)) {
        vehicles.set(vin, {
          vin, name: name || vin, color: color || nextColor(),
          x: 0, y: 0, speed: 0, steer: 0, accel: 0, brake: 0, angle: 0,
          connected: true, lastSeen: Date.now(), isExternal: true,
          ws: null, controlledUntil: 0,
        });
      } else {
        vehicles.get(vin).connected = true;
        vehicles.get(vin).lastSeen = Date.now();
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const vehicle = vehicles.get(vin);
        if (!vehicle) return;
        vehicle.lastSeen = Date.now();

        if (msg.type === 'vehicle_state' && msg.data) {
          const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
          vehicle.speed  = d.speed  ?? vehicle.speed;
          vehicle.accel  = d.accel  ?? 0;
          vehicle.brake  = d.brake  ?? 0;
          vehicle.steer  = d.steer  ?? 0;
          // d.x가 명시적으로 포함된 경우에만 위치 갱신.
          // (0,0)이 기본값으로 흘러들어와 NavigationFeature 위치를 덮어쓰는 문제 방지:
          // 이미 이동한 차량에 (0,0)이 오면 순간이동으로 간주해 무시.
          if (d.x != null && !(d.x === 0 && d.y === 0 && (vehicle.x !== 0 || vehicle.y !== 0))) {
            const prevX = vehicle.x, prevY = vehicle.y;
            vehicle.x = d.x;
            vehicle.y = d.y ?? vehicle.y;
            if (d.angle != null) {
              vehicle.angle = d.angle;
            } else {
              const dx = vehicle.x - prevX, dy = vehicle.y - prevY;
              if (dx * dx + dy * dy > 0.01) vehicle.angle = Math.atan2(dy, dx);
            }
          }
        } else if (msg.type === 'location' && msg.data) {
          const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
          if (d && d.x != null && !(d.x === 0 && d.y === 0 && (vehicle.x !== 0 || vehicle.y !== 0))) {
            const prevX = vehicle.x, prevY = vehicle.y;
            vehicle.x = d.x; vehicle.y = d.y ?? vehicle.y;
            if (d.angle != null) vehicle.angle = d.angle;
            else {
              const dx = vehicle.x - prevX, dy = vehicle.y - prevY;
              if (dx * dx + dy * dy > 0.01) vehicle.angle = Math.atan2(dy, dx);
            }
          }
        }
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      if (vehicles.has(vin)) vehicles.get(vin).connected = false;
      console.log(`[bridge] ${vin} DisplayFeature 끊김 — 5s 후 재시도`);
      setTimeout(tryConnect, 5000);
    });

    ws.on('error', () => ws.close());
  }
  tryConnect();
}

export function connectPlatforms() {
  const cfgPath = path.resolve(__dirname, '..', 'config', 'platforms.json');
  if (!existsSync(cfgPath)) return;
  try {
    const platforms = JSON.parse(readFileSync(cfgPath, 'utf8'));
    for (const p of platforms) connectPlatformDisplayFeature(p);
    console.log(`[bridge] platforms.json 에서 ${platforms.length}개 플랫폼 아웃바운드 연결 시작`);
  } catch (e) {
    console.error('[bridge] platforms.json 로드 실패:', e.message);
  }
}

/* ── 정리 ──────────────────────────────────────────────── */
export function stopBridge() {
  vehicles.clear();
}
