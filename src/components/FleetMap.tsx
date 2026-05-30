import { useRef, useEffect } from 'react';
import type { Vehicle } from '../types';
import { MAP } from '../data/map';
import { lighten } from '../lib/color';
import { COLORS, alpha } from '../theme';

const ROAD_STYLE: Record<string, { color: string; width: number }> = {
  highway:  { color: '#2563eb', width: 6 },
  arterial: { color: '#92500a', width: 4 },
  urban:    { color: '#3a3a4a', width: 3 },
};

interface Props {
  fleet: Vehicle[];
  selectedVin?: string | null;
  onSelect?: (vin: string) => void;
}

export default function FleetMap({ fleet, selectedVin, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 렌더 루프가 항상 최신 prop 을 읽도록 ref 로 미러링 (effect 재생성 방지)
  const fleetRef = useRef(fleet);
  const selectedVinRef = useRef(selectedVin ?? null);
  const onSelectRef = useRef(onSelect);
  fleetRef.current = fleet;
  selectedVinRef.current = selectedVin ?? null;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const baseCtx = canvasEl.getContext('2d');
    if (!baseCtx) return;
    // 명시적 비-null 타입으로 캡처 → 중첩 클로저(draw/resize/onClick)에서 내로잉 유지
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = baseCtx;
    const wrap = canvas.parentElement!;

    // 정적 레이어(배경/그리드/도로/노드)는 리사이즈 때만 오프스크린에 그려 캐시한다.
    const bg = document.createElement('canvas');
    const bgCtx = bg.getContext('2d')!;

    function drawStatic(W: number, H: number) {
      bg.width = W;
      bg.height = H;
      bgCtx.fillStyle = '#111114';
      bgCtx.fillRect(0, 0, W, H);

      bgCtx.strokeStyle = 'rgba(255,255,255,0.025)';
      bgCtx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, H); bgCtx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(W, y); bgCtx.stroke();
      }

      for (const e of MAP.edges) {
        const f = MAP.nodes[e.from], t = MAP.nodes[e.to];
        const st = ROAD_STYLE[e.type] || ROAD_STYLE.urban;
        bgCtx.strokeStyle = st.color + '66';
        bgCtx.lineWidth = st.width;
        bgCtx.lineCap = 'round';
        bgCtx.beginPath(); bgCtx.moveTo(f.x, f.y); bgCtx.lineTo(t.x, t.y); bgCtx.stroke();
      }

      for (const n of MAP.nodes) {
        bgCtx.beginPath(); bgCtx.arc(n.x, n.y, 5, 0, Math.PI * 2);
        bgCtx.fillStyle = '#1c1c20'; bgCtx.fill();
        bgCtx.strokeStyle = '#48484a'; bgCtx.lineWidth = 1.5; bgCtx.stroke();
        bgCtx.fillStyle = '#8e8e93'; bgCtx.font = '9px Inter, system-ui, sans-serif';
        bgCtx.textAlign = 'center'; bgCtx.fillText(n.name, n.x, n.y - 10);
      }
    }

    function resize() {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      drawStatic(canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    // 클릭 → 가장 가까운 차량 선택 (ref 로 최신 fleet 읽음)
    const onClick = (e: MouseEvent) => {
      const handler = onSelectRef.current;
      if (!handler) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: Vehicle | null = null, bestD = Infinity;
      for (const v of fleetRef.current) {
        const d = Math.hypot(v.x - mx, v.y - my);
        if (d < 20 && d < bestD) { bestD = d; best = v; }
      }
      if (best) handler(best.vin);
    };
    canvas.addEventListener('click', onClick);

    let rafId = 0;
    function draw() {
      const W = canvas.width, H = canvas.height;
      const fleet = fleetRef.current;
      const selVin = selectedVinRef.current;

      // 캐시된 정적 레이어를 한 번에 blit
      ctx!.clearRect(0, 0, W, H);
      ctx!.drawImage(bg, 0, 0);

      // Vehicles (동적)
      const now = Date.now() / 1000;
      for (let idx = 0; idx < fleet.length; idx++) {
        const v = fleet[idx];
        const pulse = (Math.sin(now * 2.5 + idx) + 1) / 2;
        const isExt = v.isExternal;

        // Pulse ring
        ctx.beginPath();
        ctx.arc(v.x, v.y, 14 + pulse * 6, 0, Math.PI * 2);
        ctx.strokeStyle = v.color + Math.round((0.25 - pulse * 0.18) * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = isExt ? 2.5 : 1.5;
        ctx.stroke();

        // Glow
        ctx.shadowColor = v.color;
        ctx.shadowBlur = isExt ? 24 : 16;

        // Body (sim: circle, real: diamond)
        if (isExt) {
          ctx.beginPath();
          const s = 9;
          ctx.moveTo(v.x, v.y - s);
          ctx.lineTo(v.x + s, v.y);
          ctx.lineTo(v.x, v.y + s);
          ctx.lineTo(v.x - s, v.y);
          ctx.closePath();
          const grad = ctx.createRadialGradient(v.x - 2, v.y - 2, 0, v.x, v.y, s);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, lighten(v.color));
          grad.addColorStop(1, v.color);
          ctx.fillStyle = grad;
          ctx.fill();
          // REAL badge
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('●REAL', v.x, v.y - 20);
        } else {
          ctx.beginPath();
          ctx.arc(v.x, v.y, 9, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(v.x - 2, v.y - 2, 0, v.x, v.y, 9);
          grad.addColorStop(0, lighten(v.color));
          grad.addColorStop(1, v.color);
          ctx.fillStyle = grad;
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // 선택된 차량 강조 링
        if (v.vin === selVin) {
          ctx.beginPath();
          ctx.arc(v.x, v.y, 18, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff88';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // VIN label
        ctx.fillStyle = v.vin === selVin ? '#ffffff' : '#ccc';
        ctx.font = v.vin === selVin ? 'bold 9px monospace' : 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(v.isExternal && v.connected === false ? v.vin + ' (offline)' : v.vin, v.x, v.y - 16);
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div style={{ flex: 1, position: 'relative', background: COLORS.surface, borderRadius: 18, overflow: 'hidden', border: `1px solid ${COLORS.border}` }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: alpha(COLORS.surface, 0.82), backdropFilter: 'blur(10px)',
        border: `1px solid ${COLORS.border}`, borderRadius: 12,
        padding: '6px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.8px',
        color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="2.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5"/>
        </svg>
        FLEET MAP
      </div>
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: 12,
        background: alpha(COLORS.surface, 0.75), backdropFilter: 'blur(8px)',
        border: `1px solid ${COLORS.border}`, borderRadius: 12,
        padding: '7px 10px', maxHeight: 60, overflowY: 'auto',
        fontSize: 10, color: COLORS.textFaint,
        display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none',
      }}>
        <div style={{ color: COLORS.textDim }}>
          {new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {'  '}fleet: {fleet.length} vehicles
        </div>
      </div>
    </div>
  );
}
