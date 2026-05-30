import type { Vehicle } from '../types';
import { COLORS, FONT, alpha } from '../theme';

/** 선택한 차량 한 대의 상세 패널 (속도 게이지 · 가/감속 · 도로/좌표). */
export default function VehicleDetail({ v }: { v: Vehicle }) {
  const CIRC = 2 * Math.PI * 22;
  const pct = Math.min(v.speed / 120, 1);
  const overspeed = v.road ? v.speed > v.road.speed_limit : false;
  const accelPct = Math.round(v.accel * 100);
  const brakePct = Math.round(v.brake * 100);
  const offline = v.connected === false;

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${alpha(v.color, 0.2)}`,
      borderRadius: 18, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: v.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.name || v.vin}
        </span>
        {v.isExternal && (
          <span style={{
            fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
            background: alpha(offline ? COLORS.danger : COLORS.success, 0.2),
            color: offline ? COLORS.danger : COLORS.success,
          }}>
            {offline ? 'OFFLINE' : 'REAL'}
          </span>
        )}
      </div>

      {/* Speed + gauge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>속도</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 3 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: overspeed ? COLORS.danger : COLORS.text, lineHeight: 1 }}>
              {v.speed}
            </span>
            <span style={{ fontSize: 11, color: COLORS.textDim }}>km/h</span>
          </div>
          {overspeed && (
            <div style={{ fontSize: 9, fontWeight: 600, color: COLORS.danger, marginTop: 2 }}>
              ⚠ 제한 {v.road!.speed_limit}km/h 초과
            </div>
          )}
        </div>
        <svg viewBox="0 0 54 54" width={54} height={54}>
          <circle cx="27" cy="27" r="22" fill="none" stroke={alpha(COLORS.accent, 0.12)} strokeWidth="5" />
          <circle cx="27" cy="27" r="22" fill="none" stroke={overspeed ? COLORS.danger : COLORS.accent} strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(pct * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`}
            transform="rotate(-90 27 27)"
            style={{ transition: 'stroke-dasharray 0.3s' }}
          />
        </svg>
      </div>

      {/* Accel / Brake */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: '가속', value: accelPct, color: COLORS.warning },
          { label: '제동', value: brakePct, color: COLORS.danger },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, background: COLORS.cardAlt, borderRadius: 10, padding: '8px 10px',
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: COLORS.textDim, letterSpacing: 0.5 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: 10, color: COLORS.textDim }}>%</span>
            </div>
            <div style={{ marginTop: 6, height: 3, background: alpha(color, 0.12), borderRadius: 2 }}>
              <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.2s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Road + Position */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: COLORS.textDim }}>도로</span>
          <span style={{ color: COLORS.text, fontWeight: 600 }}>
            {v.road ? `${v.road.name} · ${v.road.speed_limit}km/h` : '도로 외'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
          <span style={{ color: COLORS.textDim }}>위치</span>
          <span style={{ color: COLORS.textDim, fontFamily: FONT.mono }}>
            {Math.round(v.x)}, {Math.round(v.y)}
          </span>
        </div>
      </div>
    </div>
  );
}
