import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import FleetPage from './routes/FleetPage';
import { COLORS, FONT } from './theme';

// 3D HUD는 three.js 의존성이 무거우므로 해당 탭에 들어갈 때만 로드한다 (코드 스플리팅).
const ControlPage = lazy(() => import('./routes/ControlPage'));

const TABS = [
  { to: '/fleet', label: 'Fleet Map' },
  { to: '/control', label: '3D HUD' },
];

function PageLoader() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: COLORS.bg, color: COLORS.textDim, fontFamily: FONT.mono, fontSize: 12, letterSpacing: 1,
    }}>
      LOADING 3D HUD…
    </div>
  );
}

export default function App() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
      {/* Tab Navigation */}
      <nav style={{
        display: 'flex', gap: 2, padding: '6px 10px 0', background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0,
      }}>
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              padding: '8px 16px', borderRadius: '8px 8px 0 0', fontSize: 12, fontWeight: 600,
              textDecoration: 'none', transition: 'all 0.2s',
              color: isActive ? COLORS.accent : COLORS.textDim,
              background: isActive ? COLORS.surface : 'transparent',
              borderBottom: isActive ? `2px solid ${COLORS.accent}` : '2px solid transparent',
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/fleet"   element={<FleetPage />} />
            <Route path="/control" element={<ControlPage />} />
            <Route path="/"         element={<Navigate to="/fleet" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
