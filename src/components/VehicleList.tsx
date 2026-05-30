import type { Vehicle } from '../types';
import { COLORS, cardStyle, alpha } from '../theme';

interface Props {
  fleet: Vehicle[];
  selectedVin?: string | null;
  onSelect?: (vin: string) => void;
}

function pedalLabel(v: Vehicle): string {
  if (v.accel > 0) return `가속 ${Math.round(v.accel * 100)}%`;
  if (v.brake > 0) return `제동 ${Math.round(v.brake * 100)}%`;
  return '관성';
}

export default function VehicleList({ fleet, selectedVin, onSelect }: Props) {
  return (
    <div style={{
      ...cardStyle, padding: '12px 14px', flex: 1, minHeight: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 1, color: COLORS.textDim,
        textTransform: 'uppercase', marginBottom: 8, flexShrink: 0,
      }}>
        차량 목록
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        {fleet.length === 0 && (
          <div style={{ fontSize: 11, color: COLORS.textFaint, textAlign: 'center', padding: '10px 0' }}>
            수신 대기 중...
          </div>
        )}
        {fleet.map(v => {
          const selected = v.vin === selectedVin;
          const offline = v.isExternal && v.connected === false;
          return (
            <div
              key={v.vin}
              onClick={() => onSelect?.(v.vin)}
              style={{
                background: selected ? alpha(COLORS.accent, 0.10) : COLORS.cardAlt,
                borderRadius: 8, padding: '8px 10px',
                borderLeft: `3px solid ${v.color}`,
                outline: selected ? `1px solid ${alpha(COLORS.accent, 0.4)}` : 'none',
                opacity: offline ? 0.5 : 1,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: v.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {v.vin}
                  {v.isExternal && (
                    <span style={{
                      fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                      background: alpha(offline ? COLORS.danger : COLORS.success, 0.2),
                      color: offline ? COLORS.danger : COLORS.success,
                    }}>
                      {offline ? 'OFFLINE' : 'REAL'}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: v.color }}>
                  {v.speed}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.5, marginLeft: 1 }}>km/h</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 9, color: COLORS.textDim }}>
                <span>{pedalLabel(v)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.road ? v.road.name : '도로 외'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
