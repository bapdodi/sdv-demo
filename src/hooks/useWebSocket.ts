import { useCallback, useEffect, useRef, useState } from 'react';
import type { Vehicle } from '../types';

const WS_URL = `ws://${window.location.hostname}:9102`;

/**
 * 수동 제어 시 상류로 보내는 "입력"값.
 * 위치는 서버(자율주행)가 계산하므로 포즈가 아니라 페달/조향 입력만 보낸다.
 */
export interface ControlInput {
  /** 0..1 가속 페달. */
  accel: number;
  /** 0..1 브레이크. */
  brake: number;
  /** -1..1 조향. */
  steer: number;
}

export function useWebSocket() {
  const [fleet, setFleet] = useState<Vehicle[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // 제어 입력을 서버(9102)로 상류 전송. 연결이 없으면 조용히 무시.
  const sendControl = useCallback((vin: string, input: ControlInput) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'control', vin, data: input }));
    }
  }, []);

  const releaseControl = useCallback((vin: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'control_release', vin }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => { if (mounted) setConnected(true); };
      ws.onclose = () => {
        if (mounted) setConnected(false);
        setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'fleet' && Array.isArray(msg.data)) {
            if (mounted) setFleet(msg.data);
          }
        } catch { /* ignore */ }
      };
    }

    connect();
    return () => { mounted = false; wsRef.current?.close(); };
  }, []);

  return { fleet, connected, sendControl, releaseControl };
}
