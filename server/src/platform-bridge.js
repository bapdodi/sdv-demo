/**
 * 차량 허브 브릿지 — 단일 WebSocket 서버(VEHICLE_PORT)
 *
 * C++ 플랫폼이 접속하면 스스로 VIN을 등록한다.
 * platforms.json 에 등록된 외부 차량은 DisplayFeature WS 로 직접 연결한다.
 * 내부에서 Map<vin, ws>로 이벤트 라우팅 (이벤트 버스 패턴).
 */
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VEHICLE_PORT = parseInt(process.env.VEHICLE_WS_PORT || '9003');

const MAP_W = 750, MAP_H = 465;
/** 맵 범위를 크게 벗어났거나 현재 위치에서 비현실적으로 먼 좌표는 C++ 초기값/노이즈로 판단해 무시 */
function isValidPosition(nx, ny, curX, curY) {
  const MARGIN = 80;
  if (nx < -MARGIN || nx > MAP_W + MARGIN || ny < -MARGIN || ny > MAP_H + MARGIN) return false;
  // 차량이 이미 이동한 상태라면 최대 이동 거리(MAX_JUMP) 이내인지 확인
  if (curX !== 0 || curY !== 0) {
    const MAX_JUMP_SQ = 250 * 250; // ~250 유닛: 고속 주행 1초 한계치
    const dx = nx - curX, dy = ny - curY;
    if (dx * dx + dy * dy > MAX_JUMP_SQ) return false;
  }
  return true;
}

const COLOR_PALETTE = [
  '#ff6b6b', '#ffd93d', '#6bcbff', '#a29bfe', '#55efc4',
  '#fd79a8', '#fdcb6e', '#74b9ff', '#00cec9', '#e17055',
];
let colorIndex = 0;
function nextColor() {
  return COLOR_PALETTE[colorIndex++ % COLOR_PALETTE.length];
}

// vin → { vin, name, color, x, y, speed, steer, accel, brake, angle, connected, ws, lastSeen, isExternal }
const vehicles = new Map();

export function startBridge(onVehicleUpdate) {
  const wss = new WebSocketServer({ port: VEHICLE_PORT });

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ✗ 포트 ${VEHICLE_PORT} 가 이미 사용 중입니다 — 이전 서버가 떠 있어요.`);
      console.error(`    이전 프로세스를 종료한 뒤 다시 시작하세요: lsof -ti:${VEHICLE_PORT} | xargs kill\n`);
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
            // 재접속: ws 교체 + 위치 상태 리셋 (이전 위치가 남아 있으면 새 위치가 MAX_JUMP로 차단됨)
            const v = vehicles.get(vin);
            v.ws = ws;
            v.connected = true;
            v.lastSeen = Date.now();
            v.x = 0; v.y = 0;
            v.hasPosition = false;
            v.displayPos = undefined;
            if (msg.model) v.model = msg.model;
          } else {
            vehicles.set(vin, {
              vin,
              name: vin,          // 이름 = VIN 고정
              model: msg.model || "",
              color: nextColor(), // 색상 = 자동 배정
              x: 0, y: 0,
              hasPosition: false, // 첫 location 수신 전까지 스냅샷에서 제외
              speed: 0, steer: 0, accel: 0, brake: 0,
              angle: 0,
              connected: true,
              lastSeen: Date.now(),
              isExternal: true,
              ws,
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
          if (!isValidPosition(d.x, d.y, vehicle.x, vehicle.y)) return;
          // DisplayFeature 자체 고정 위치(angle 명시 + speed=0)를 NavigationFeature 실제 위치와 분리.
          // 첫 수신 시 기준점으로 기록하고, 이후 동일 좌표는 무시해 두 소스가 번갈아 튀는 현상 방지.
          if (d.angle != null && (d.speed === 0 || d.speed == null)) {
            if (!vehicle.displayPos) vehicle.displayPos = { x: d.x, y: d.y };
            if (vehicle.hasPosition && d.x === vehicle.displayPos.x && d.y === vehicle.displayPos.y) return;
          }
          const prevX = vehicle.x, prevY = vehicle.y;
          vehicle.x = d.x;
          vehicle.y = d.y ?? vehicle.y;
          vehicle.hasPosition = true;
          if (d.speed != null) vehicle.speed = d.speed; // NavigationFeature 가 location 에 speed 포함
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
  for (const v of vehicles.values()) {
    if (v.lastSeen === 0) continue;
    if (!v.hasPosition) continue; // 실제 위치 수신 전 (0,0) 브로드캐스트 차단
    result.push({
      vin:       v.vin,
      name:      v.name,
      model:     v.model || "",
      color:     v.color,
      x:         Math.round(v.x * 10) / 10,
      y:         Math.round(v.y * 10) / 10,
      speed:     v.speed,
      steer:     v.steer,
      accel:     v.accel,
      brake:     v.brake,
      angle:     v.angle,
      connected: v.connected,
      isExternal: true,
    });
  }
  return result;
}

/* ── 아웃바운드 연결 (DisplayFeature_v2 WS → 브릿지 클라이언트) ───── */
// platforms.json 에 등록된 플랫폼의 DisplayFeature WS 에 브릿지가 직접 연결.
// vehicle_state 메시지에 x,y,angle 이 포함된 경우 위치도 함께 갱신.
function connectPlatformDisplayFeature({ vin, name, host, port, color, model }) {
  function tryConnect() {
    console.log(`[bridge] ${vin} DisplayFeature 접속 시도 (${host}:${port})`);
    const ws = new WebSocket(`ws://${host}:${port}`);

    ws.on('open', () => {
      console.log(`[bridge] ${vin} DisplayFeature 연결 (${host}:${port})`);
      if (!vehicles.has(vin)) {
        vehicles.set(vin, {
          vin, name: name || vin, color: color || nextColor(),
          model: model || "",
          x: 0, y: 0, hasPosition: false,
          speed: 0, steer: 0, accel: 0, brake: 0, angle: 0,
          connected: true, lastSeen: Date.now(), isExternal: true,
          ws: null,
        });
      } else {
        vehicles.get(vin).connected = true;
        vehicles.get(vin).lastSeen = Date.now();
      }
    });

    ws.on('unexpected-response', (_req, res) => {
      console.error(`[bridge] ${vin} DisplayFeature 응답 오류 (${host}:${port}) - ${res.statusCode}`);
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
          if (d.x != null && isValidPosition(d.x, d.y ?? 0, vehicle.x, vehicle.y)) {
            const prevX = vehicle.x, prevY = vehicle.y;
            vehicle.x = d.x;
            vehicle.y = d.y ?? vehicle.y;
            vehicle.hasPosition = true;
            if (d.angle != null) {
              vehicle.angle = d.angle;
            } else {
              const dx = vehicle.x - prevX, dy = vehicle.y - prevY;
              if (dx * dx + dy * dy > 0.01) vehicle.angle = Math.atan2(dy, dx);
            }
          }
        } else if (msg.type === 'location' && msg.data) {
          const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
          if (d && d.x != null && isValidPosition(d.x, d.y ?? 0, vehicle.x, vehicle.y)) {
            const prevX = vehicle.x, prevY = vehicle.y;
            vehicle.x = d.x; vehicle.y = d.y ?? vehicle.y;
            vehicle.hasPosition = true;
            if (d.speed != null) vehicle.speed = d.speed;
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

    ws.on('error', (err) => {
      console.error(`[bridge] ${vin} DisplayFeature 연결 실패 (${host}:${port}) - ${err.message}`);
      ws.close();
    });
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
