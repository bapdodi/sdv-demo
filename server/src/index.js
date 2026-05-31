import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  startBridge, getExternalSnapshot, applyControl, releaseExternalControl,
} from './platform-bridge.js';
import { nearestEdge } from './road-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJ_DIR = path.resolve(__dirname, '..', '..');
const CLIENT_DIR = path.resolve(PROJ_DIR, 'client');
const DIST_DIR = path.resolve(PROJ_DIR, 'dist');

/**
 * fleet 상태 브로드캐스트 주기(ms).
 * 클라이언트의 src/constants/sim.ts(SERVER_INTERVAL_MS)와 반드시 일치해야
 * Snapshot Interpolation 타이밍이 맞는다.
 */
const BROADCAST_INTERVAL_MS = 200;

/* ── Express ─────────────────────────────────────────────────────────── */
const app = express();
const server = createServer(app);

app.use(express.static(DIST_DIR));
app.use('/control-legacy', express.static(path.join(CLIENT_DIR, 'vehicle-control')));
app.use('/display-legacy', express.static(path.join(CLIENT_DIR, 'vehicle-display')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

/* ── 차량 허브 브리지 (단일 포트, 자동 등록) ────────────────────────── */
startBridge();

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

  // 클라이언트 → 서버 수동 제어 명령 (상류)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'control' && msg.vin && msg.data) {
        applyControl(msg.vin, msg.data);
      } else if (msg.type === 'control_release' && msg.vin) {
        releaseExternalControl(msg.vin);
      }
    } catch { /* ignore malformed */ }
  });

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
  console.log(`  HTTP    ${PORT}   → React App`);
  console.log(`\n  시뮬레이터:  node simulator.js`);
  console.log(`  차량 추가:   config/vehicles.json 편집 후 재시작\n`);
});
