import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { startBridge, connectPlatforms, getExternalSnapshot } from './platform-bridge.js';
import { nearestEdge } from './road-utils.js';

/**
 * fleet 상태 브로드캐스트 주기(ms).
 * 차량 클라이언트가 다른 차량 위치를 지도에 올릴 때 사용하는 갱신 주기.
 */
const BROADCAST_INTERVAL_MS = 200;

/* ── Express ─────────────────────────────────────────────────────────── */
const app = express();
const server = createServer(app);

app.get('/', (_req, res) => {
  res.json({
    name: 'SDV Demo Server',
    status: 'ok',
    ports: {
      http: Number(process.env.PORT || 3030),
      vehicleHub: Number(process.env.VEHICLE_WS_PORT || 9003),
      fleetBroadcast: 9102,
    },
    websocket: {
      vehicleHub: `ws://localhost:${process.env.VEHICLE_WS_PORT || 9003}`,
      fleetBroadcast: 'ws://localhost:9102',
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Demo server only. React frontend routes are not served here.',
  });
});

/* ── 차량 허브 브리지 (단일 포트, 자동 등록) ────────────────────────── */
startBridge();
connectPlatforms();

/* ── WebSocket 9102 — vehicle-display ────────────────────────────────── */
const wssDisplay = new WebSocketServer({ port: 9102 });
const displayClients = new Set();

// 포트 충돌 시 조용히 죽지 않고 원인을 명확히 알린다 (좀비 서버가 흔한 원인).
wssDisplay.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  ✗ 포트 9102 가 이미 사용 중입니다 — 기존 서버가 떠 있어요.');
    console.error('    이전 프로세스를 종료 후 다시 실행하세요:');
    console.error('      lsof -ti:9102 | xargs -r kill   (또는: pkill -f "node src/index.js")\n');
  } else {
    console.error('[9102] WebSocket 서버 오류:', err.message);
  }
  process.exit(1);
});

wssDisplay.on('connection', (ws) => {
  displayClients.add(ws);
  console.log('[9102] vehicle-display connected (total:', displayClients.size, ')');
  sendFleetState();

  ws.on('close', () => {
    displayClients.delete(ws);
    console.log('[9102] vehicle-display disconnected (total:', displayClients.size, ')');
  });
});

function broadcastDisplay(msg) {
  const payload = JSON.stringify(msg);
  for (const client of displayClients) {
    if (client.readyState === 1) client.send(payload);
  }
}

// 스냅샷 객체는 매 틱 새로 만들어 바로 직렬화 후 버려지므로 제자리(in-place)에서
// road 필드를 채운다 — 차량당 한 번씩 일어나던 객체 스프레드 재할당을 제거.
function addRoadInfo(v) {
  const edge = nearestEdge(v.x, v.y);
  v.road = edge ? { name: edge.name, type: edge.type, speed_limit: edge.speed_limit } : null;
  return v;
}

function sendFleetState() {
  const external = getExternalSnapshot();
  for (const v of external) addRoadInfo(v);
  broadcastDisplay({ type: 'fleet', data: external });
}

setInterval(() => {
  if (displayClients.size === 0) return;
  sendFleetState();
}, BROADCAST_INTERVAL_MS);

/* ── Start ────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3030;
server.listen(PORT, () => {
  console.log(`\n  SDV Demo Server running`);
  console.log(`  ────────────────────────`);
  console.log(`  WebSocket 9003  → 차량 허브 (자동 등록)`);
  console.log(`  WebSocket 9102  → fleet state broadcast`);
  console.log(`  HTTP    ${PORT}   → server status`);
  console.log(`\n  C++ 플랫폼:  platforms.json 에 실제 차량 등록 후 재시작\n`);
});
