import { useState, useRef, useEffect, useCallback } from 'react';
import type { LiveTelemetry } from '../components/control/ThreeCanvas';
import type { DriveKeys } from '../lib/vehiclePhysics';

const NO_KEYS: DriveKeys = { w: false, s: false, a: false, d: false };

/**
 * 3D HUD의 키보드 주행 제어를 한곳에 캡슐화한다.
 *  - WASD / 방향키 → keysRef (렌더 루프가 ref로 읽음, 리렌더 없음)
 *  - SPACE → 제어 모드 토글
 *  - 추적 차량(effectiveVin)이 바뀌면 제어 해제
 *
 * @param effectiveVin 카메라가 추적/제어 대상으로 삼는 차량 VIN.
 */
export function useDriveControls(effectiveVin: string | null) {
  const [controlledVin, setControlledVin] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveTelemetry | null>(null);
  const keysRef = useRef<DriveKeys>({ ...NO_KEYS });

  const releaseControl = useCallback(() => {
    keysRef.current = { ...NO_KEYS };
    setLiveState(null);
    setControlledVin(null);
  }, []);

  const toggleControl = useCallback(() => {
    setControlledVin((prev) => {
      if (prev) {
        keysRef.current = { ...NO_KEYS };
        setLiveState(null);
        return null;
      }
      return effectiveVin;
    });
  }, [effectiveVin]);

  // 선택 차량이 바뀌면 제어 모드 해제
  useEffect(() => {
    releaseControl();
  }, [effectiveVin, releaseControl]);

  // 키보드 입력 — deps에 toggleControl을 넣어 최신 클로저를 유지하면서
  // (원본의 deps 누락으로 매 렌더 리스너를 재등록하던 문제 제거)
  useEffect(() => {
    const setKey = (k: string, down: boolean): boolean => {
      switch (k) {
        case 'w': case 'arrowup':    keysRef.current.w = down; return true;
        case 's': case 'arrowdown':  keysRef.current.s = down; return true;
        case 'a': case 'arrowleft':  keysRef.current.a = down; return true;
        case 'd': case 'arrowright': keysRef.current.d = down; return true;
        default: return false;
      }
    };
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === ' ') { toggleControl(); e.preventDefault(); return; }
      if (setKey(k, true)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => { setKey(e.key.toLowerCase(), false); };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [toggleControl]);

  const onPhysicsUpdate = useCallback((_vin: string, telemetry: LiveTelemetry) => {
    setLiveState(telemetry);
  }, []);

  return { keysRef, controlledVin, liveState, toggleControl, onPhysicsUpdate };
}
