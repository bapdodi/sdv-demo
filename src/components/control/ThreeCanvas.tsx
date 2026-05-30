import { useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { initScene, updateCarAndCamera } from '../../lib/threeScene';
import { hexToInt } from '../../lib/color';
import {
  createPhysicsState, stepPhysics,
  type PhysicsState, type DriveKeys,
} from '../../lib/vehiclePhysics';
import {
  createSnapshot, pushTarget, sampleSnapshot, type Snapshot,
} from '../../lib/snapshotBuffer';
import type { Vehicle } from '../../types';
import type { ControlInput } from '../../hooks/useWebSocket';
import { SERVER_INTERVAL_MS } from '../../constants/sim';

export interface LiveTelemetry {
  speed: number;
  accel: number;
  brake: number;
  steer: number;
}

interface Props {
  fleet: Vehicle[];
  /** 카메라가 따라가는 차량. null 이면 fleet 첫 차량. */
  selectedVin: string | null;
  /** 키보드로 직접 주행 중인 차량. null 이면 전원 서버 추종. */
  controlledVin: string | null;
  keysRef: RefObject<DriveKeys>;
  /** 제어 중인 차량의 물리 텔레메트리를 패널에 전달. */
  onPhysicsUpdate?: (vin: string, telemetry: LiveTelemetry) => void;
  /** 제어 중인 차량의 입력(가속/브레이크/조향)을 서버로 상류 전송. */
  sendControl?: (vin: string, input: ControlInput) => void;
  /** 제어 해제를 서버에 통지. */
  releaseControl?: (vin: string) => void;
}

export default function ThreeCanvas({
  fleet, selectedVin, controlledVin, keysRef, onPhysicsUpdate,
  sendControl, releaseControl,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 렌더 루프가 항상 최신 prop 을 읽도록 ref 로 미러링.
  const fleetRef = useRef(fleet);
  const selectedVinRef = useRef(selectedVin);
  const controlledVinRef = useRef(controlledVin);
  const onPhysicsUpdateRef = useRef(onPhysicsUpdate);
  const sendControlRef = useRef(sendControl);
  const releaseControlRef = useRef(releaseControl);
  fleetRef.current = fleet;
  selectedVinRef.current = selectedVin;
  controlledVinRef.current = controlledVin;
  onPhysicsUpdateRef.current = onPhysicsUpdate;
  sendControlRef.current = sendControl;
  releaseControlRef.current = releaseControl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let sceneData: ReturnType<typeof initScene> | null = null;
    try {
      sceneData = initScene(canvas);
    } catch (e) {
      console.warn('WebGL init failed', e);
      return;
    }
    const { scene, camera, renderer, createCarMesh } = sceneData;

    const meshes = new Map<string, THREE.Group>();
    const snapshots = new Map<string, Snapshot>();   // 서버 추종 차량
    const physics = new Map<string, PhysicsState>();  // 로컬 제어 차량

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let prevControlledVin: string | null = null;  // 제어 해제 감지용
    let lastControlSent = 0;                       // 상류 전송 스로틀

    function placeMesh(mesh: THREE.Group, x: number, y: number, angle: number, tracked: boolean) {
      if (tracked) {
        updateCarAndCamera(camera, mesh, x, y, angle);
      } else {
        mesh.position.set(x, 0, y);
        mesh.rotation.y = Math.PI / 2 - angle;
      }
    }

    function frame() {
      if (disposed) return;
      const fleet = fleetRef.current;
      const controlledVin = controlledVinRef.current;
      const trackedVin = selectedVinRef.current ?? fleet[0]?.vin ?? null;
      const keys = keysRef.current ?? { w: false, s: false, a: false, d: false };

      // 제어 대상이 바뀌거나 해제되면, 이전 차량의 제어 해제를 서버에 통지.
      if (prevControlledVin && prevControlledVin !== controlledVin) {
        releaseControlRef.current?.(prevControlledVin);
      }
      prevControlledVin = controlledVin;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // fleet 에서 사라진 차량 메시·상태 정리
      const activeVins = new Set(fleet.map(v => v.vin));
      for (const [vin, mesh] of meshes) {
        if (!activeVins.has(vin)) {
          scene.remove(mesh);
          meshes.delete(vin);
          snapshots.delete(vin);
          physics.delete(vin);
        }
      }

      for (const v of fleet) {
        let mesh = meshes.get(v.vin);
        if (!mesh) {
          mesh = createCarMesh(hexToInt(v.color));
          meshes.set(v.vin, mesh);
        }
        const tracked = v.vin === trackedVin;

        // 위치는 항상 서버(자율주행 + 입력 오버레이) 권위 → 스냅샷 보간으로 렌더.
        let s = snapshots.get(v.vin);
        if (!s) {
          s = createSnapshot(v.x, v.y, v.angle);
          snapshots.set(v.vin, s);
        }
        pushTarget(s, v.x, v.y, v.angle, now);
        sampleSnapshot(s, now);
        placeMesh(mesh, s.renderX, s.renderY, s.renderAngle, tracked);

        if (v.vin === controlledVin) {
          // 입력 엔벨로프(가속/브레이크/조향)만 로컬에서 부드럽게 만든다.
          // 위치 적분 결과(p.x/p.y)는 쓰지 않고, 패널 즉시 피드백 + 서버 전송에만 사용.
          let p = physics.get(v.vin);
          if (!p) {
            p = createPhysicsState(0, 0, 0);
            physics.set(v.vin, p);
          }
          stepPhysics(p, keys as DriveKeys, dt);
          onPhysicsUpdateRef.current?.(v.vin, {
            speed: v.speed, accel: p.accel, brake: p.brake, steer: p.steer,
          });
          // 서버 브로드캐스트 주기에 맞춰 입력을 상류 전송.
          if (now - lastControlSent >= SERVER_INTERVAL_MS) {
            lastControlSent = now;
            sendControlRef.current?.(v.vin, { accel: p.accel, brake: p.brake, steer: p.steer });
          }
        } else {
          physics.delete(v.vin); // 제어 해제 시 입력 엔벨로프 폐기
        }
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      sceneData?.dispose();
    };
  }, [keysRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%', display: 'block',
        background: '#0a0a0c',
      }}
    />
  );
}
