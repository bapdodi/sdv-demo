import { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import FleetMap from '../components/FleetMap';
import FleetStats from '../components/FleetStats';
import VehicleList from '../components/VehicleList';
import VehicleDetail from '../components/VehicleDetail';
import { COLORS, FONT, alpha } from '../theme';

export default function FleetPage() {
  const { fleet, connected } = useWebSocket();
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const selected = fleet.find(v => v.vin === selectedVin) ?? fleet[0] ?? null;

  const status = connected ? COLORS.success : COLORS.danger;

  return (
    <div style={{
      background: COLORS.surface, color: COLORS.text, fontFamily: FONT.ui,
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
    }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 38,
        background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: COLORS.text }}>
          ⬡ SDV FLEET MONITOR
        </span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20,
          fontSize: 11, fontWeight: 500,
          background: alpha(status, 0.12), border: `1px solid ${alpha(status, 0.25)}`, color: status,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
          <span>{connected ? '연결됨' : '연결 끊김'}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 10, padding: 8 }}>
        <FleetMap fleet={fleet} selectedVin={selected?.vin} onSelect={setSelectedVin} />

        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          <FleetStats fleet={fleet} />
          <VehicleList fleet={fleet} selectedVin={selected?.vin} onSelect={setSelectedVin} />
          {selected && <VehicleDetail v={selected} />}
        </div>
      </div>
    </div>
  );
}
