import type { Vehicle } from '../types';
import { COLORS, cardStyle } from '../theme';

interface Props {
  fleet: Vehicle[];
}

export default function FleetStats({ fleet }: Props) {
  const speeds = fleet.map(v => v.speed).filter(s => s > 0);
  const avg = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
  const max = speeds.length ? Math.max(...speeds) : 0;

  const stats = [
    { label: '차량', value: fleet.length, color: COLORS.text },
    { label: '평균', value: avg ? `${avg}km/h` : '—', color: COLORS.success },
    { label: '최고', value: max ? `${max}km/h` : '—', color: COLORS.accent },
  ];

  return (
    <div style={{ ...cardStyle, display: 'flex', gap: 4, padding: '10px 12px' }}>
      {stats.map(s => (
        <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.textFaint, marginBottom: 4 }}>
            {s.label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
