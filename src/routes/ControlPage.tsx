import { useState } from 'react';
import ThreeCanvas from '../components/control/ThreeCanvas';
import HudCanvas from '../components/control/HudCanvas';
import MiniMap from '../components/control/MiniMap';
import Panel from '../components/control/Panel';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDriveControls } from '../hooks/useDriveControls';
import { COLORS, FONT, GLASS, alpha } from '../theme';

export default function ControlPage() {
  const { fleet, connected, sendControl, releaseControl } = useWebSocket();
  const [selectedVin, setSelectedVin] = useState<string | null>(null);

  const selectedVehicle = fleet.find(v => v.vin === selectedVin) ?? fleet[0] ?? null;
  const effectiveVin = selectedVehicle?.vin ?? null;

  const { keysRef, controlledVin, liveState, toggleControl, onPhysicsUpdate } =
    useDriveControls(effectiveVin);

  const status = connected ? COLORS.success : COLORS.danger;

  return (
    <div
      tabIndex={0}
      style={{
        position: 'relative', width: '100%', height: '100%',
        background: COLORS.bg, overflow: 'hidden',
        fontFamily: FONT.ui, outline: 'none',
      }}
    >
      {/* Status bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 38,
        background: GLASS.bg, backdropFilter: GLASS.blur,
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 2, color: COLORS.hud, fontFamily: FONT.mono }}>
            ⬡ SDV VEHICLE CONTROL · 3D HUD
          </span>
          {controlledVin && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: alpha(COLORS.warning, 0.15), border: `1px solid ${alpha(COLORS.warning, 0.4)}`,
              color: COLORS.warning, animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              ● CONTROL MODE
            </span>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20,
          fontSize: 11, fontWeight: 500,
          background: alpha(status, 0.12), border: `1px solid ${alpha(status, 0.25)}`, color: status,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          <span>{connected ? '● PLATFORM' : '● DISCONNECTED'}</span>
        </div>
      </div>

      <ThreeCanvas
        fleet={fleet}
        selectedVin={effectiveVin}
        controlledVin={controlledVin}
        keysRef={keysRef}
        onPhysicsUpdate={onPhysicsUpdate}
        sendControl={sendControl}
        releaseControl={releaseControl}
      />
      <HudCanvas vehicle={selectedVehicle} connected={connected} />
      <MiniMap fleet={fleet} selectedVin={effectiveVin} onSelect={setSelectedVin} />
      <Panel
        vehicle={selectedVehicle}
        connected={connected}
        controlledVin={controlledVin}
        onToggleControl={toggleControl}
        liveState={liveState}
      />
    </div>
  );
}
