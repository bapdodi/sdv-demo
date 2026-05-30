import type { Vehicle } from '../../types';
import { COLORS, FONT, glassCardStyle, alpha } from '../../theme';
import type { LiveTelemetry } from './ThreeCanvas';

interface Props {
  vehicle: Vehicle | null;
  connected: boolean;
  controlledVin: string | null;
  onToggleControl: () => void;
  liveState?: LiveTelemetry | null;
}

const KEYPAD: { key: string }[] = [
  { key: '' }, { key: 'W' }, { key: '' },
  { key: 'A' }, { key: 'S' }, { key: 'D' },
];

export default function Panel({ vehicle: v, connected, controlledVin, onToggleControl, liveState }: Props) {
  const isControlled = !!controlledVin && v?.vin === controlledVin;
  const live = isControlled ? liveState : null;
  const spd   = live ? live.speed : (v ? Math.round(v.speed) : 0);
  const accel = live ? Math.round(live.accel * 100) : (v ? Math.round(v.accel * 100) : 0);
  const brake = live ? Math.round(live.brake * 100) : (v ? Math.round(v.brake * 100) : 0);
  const road  = v?.road ?? null;

  return (
    <div style={{
      position: 'absolute', top: 50, right: 12, bottom: 12, width: 220,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 10,
    }}>
      {/* Connection */}
      <div style={{ ...glassCardStyle, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: alpha(connected ? COLORS.accent : COLORS.danger, 0.15),
          border: `1px solid ${alpha(connected ? COLORS.accent : COLORS.danger, 0.3)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={connected ? COLORS.accent : COLORS.danger} strokeWidth="2">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>SDV Control</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
            {connected ? 'PLATFORM CONNECTED' : 'DISCONNECTED'}
          </div>
        </div>
      </div>

      {/* Speed */}
      <div style={{
        ...glassCardStyle, padding: '16px 18px',
        border: `1px solid ${isControlled ? alpha(COLORS.warning, 0.3) : COLORS.border}`,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>SPEED</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: COLORS.text, lineHeight: 1 }}>
            {connected && v ? spd : '—'}
          </span>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>km/h</span>
        </div>
        <div style={{ marginTop: 8, height: 4, background: alpha(COLORS.accent, 0.12), borderRadius: 2 }}>
          <div style={{ width: `${Math.min(spd/110,1)*100}%`, height: '100%', background: isControlled ? COLORS.warning : COLORS.accent, borderRadius: 2, transition: 'width 0.1s' }} />
        </div>
      </div>

      {/* Accel / Brake */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: 'ACCEL', value: accel, color: COLORS.warning },
          { label: 'BRAKE', value: brake, color: COLORS.danger },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...glassCardStyle, flex: 1, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: 11, color: COLORS.textDim }}>%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Road */}
      <div style={{ ...glassCardStyle, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>CURRENT ROAD</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginTop: 4 }}>{road ? road.name : '—'}</div>
        <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
          {road ? `${road.type} · ${road.speed_limit} km/h` : '—'}
        </div>
      </div>

      {/* Position */}
      <div style={{ ...glassCardStyle, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>POSITION</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.text, marginTop: 4, fontFamily: FONT.mono }}>
          x: {v ? Math.round(v.x) : '—'} / y: {v ? Math.round(v.y) : '—'}
        </div>
      </div>

      {/* Control toggle */}
      {v && (
        <button
          onClick={onToggleControl}
          style={{
            background: alpha(isControlled ? COLORS.warning : COLORS.accent, isControlled ? 0.15 : 0.12),
            border: `1px solid ${alpha(isControlled ? COLORS.warning : COLORS.accent, isControlled ? 0.5 : 0.3)}`,
            borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: isControlled ? COLORS.warning : COLORS.accent }}>
              {isControlled ? '■ 제어 중' : '▶ 차량 제어'}
            </span>
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4,
              background: alpha(isControlled ? COLORS.warning : COLORS.accent, 0.2),
              color: isControlled ? COLORS.warning : COLORS.accent, fontWeight: 700,
            }}>
              {isControlled ? 'ACTIVE' : 'SPACE'}
            </span>
          </div>
          {isControlled ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {KEYPAD.map((k, i) => (
                <div key={i} style={{
                  background: k.key ? '#1a1a2e' : 'transparent',
                  border: k.key ? '1px solid #2a2a4a' : 'none',
                  borderRadius: 4, textAlign: 'center', padding: '4px 0',
                  fontSize: 10, fontWeight: 700, color: k.key ? '#888' : 'transparent',
                }}>
                  {k.key}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 9, color: COLORS.textFaint }}>
              선택한 차량을 직접 주행합니다
            </div>
          )}
        </button>
      )}

      {/* Tracking badge */}
      {v && (
        <div style={{
          ...glassCardStyle, padding: '10px 14px',
          border: `1px solid ${alpha(v.color, 0.27)}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>TRACKING</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: v.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
              {v.name || v.vin}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
