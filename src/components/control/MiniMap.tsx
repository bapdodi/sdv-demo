import { useRef, useEffect } from 'react';
import { MAP, node } from '../../data/map';
import { lighten } from '../../lib/color';
import { nearestEdge } from '../../lib/roads';
import type { Vehicle } from '../../types';
import { COLORS, GLASS } from '../../theme';

const ROAD_STYLE: Record<string, { color: string; width: number }> = {
  highway:  { color:'#3a7bd5', width:4.5 },
  arterial: { color:'#c8880a', width:3   },
  urban:    { color:'#505060', width:2   },
};

interface Props {
  fleet: Vehicle[];
  selectedVin: string | null;
  onSelect: (vin: string) => void;
}

const W = 210, H = 138;
const SX = W / 750, SY = H / 465;

export default function MiniMap({ fleet, selectedVin, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fleetRef = useRef(fleet);
  const selectedRef = useRef(selectedVin);
  fleetRef.current = fleet;
  selectedRef.current = selectedVin;

  // 클릭 → 가장 가까운 차량 선택
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const handler = (e: MouseEvent) => {
      const rect = cv.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / SX;
      const my = (e.clientY - rect.top) / SY;
      let best: Vehicle | null = null, bestD = Infinity;
      for (const v of fleetRef.current) {
        const d = Math.hypot(v.x - mx, v.y - my);
        if (d < 25 && d < bestD) { bestD = d; best = v; }
      }
      if (best) onSelect(best.vin);
    };
    cv.addEventListener('click', handler);
    return () => cv.removeEventListener('click', handler);
  }, [onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 정적 베이스(그리드/도로/노드)는 한 번만 오프스크린에 렌더해 캐시한다.
    // 매 프레임 14개 도로 + 10개 노드/라벨 + 그리드를 다시 그리지 않는다.
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    const baseCtx = base.getContext('2d')!;
    baseCtx.scale(SX, SY);
    baseCtx.strokeStyle = '#111120'; baseCtx.lineWidth = 0.8;
    for (let x = 0; x < 750; x += 50) {
      baseCtx.beginPath(); baseCtx.moveTo(x, 0); baseCtx.lineTo(x, 465); baseCtx.stroke();
    }
    for (let y = 0; y < 465; y += 50) {
      baseCtx.beginPath(); baseCtx.moveTo(0, y); baseCtx.lineTo(750, y); baseCtx.stroke();
    }
    for (const e of MAP.edges) {
      const f = node(e.from), t = node(e.to);
      const st = ROAD_STYLE[e.type] || ROAD_STYLE.urban;
      baseCtx.strokeStyle = st.color; baseCtx.lineWidth = st.width; baseCtx.lineCap = 'round';
      baseCtx.beginPath(); baseCtx.moveTo(f.x, f.y); baseCtx.lineTo(t.x, t.y); baseCtx.stroke();
    }
    for (const n of MAP.nodes) {
      baseCtx.beginPath(); baseCtx.arc(n.x, n.y, 4, 0, Math.PI * 2);
      baseCtx.fillStyle = '#1a1a2e'; baseCtx.fill();
      baseCtx.strokeStyle = '#555'; baseCtx.lineWidth = 1.2; baseCtx.stroke();
      baseCtx.fillStyle = '#555'; baseCtx.font = '8px monospace';
      baseCtx.textAlign = 'center';
      baseCtx.fillText(n.name, n.x, n.y - 7);
    }

    let rafId = 0;

    function frame() {
      const vehicles = fleetRef.current;
      const selVin = selectedRef.current;
      const sel = vehicles.find(v => v.vin === selVin) ?? null;

      ctx!.clearRect(0, 0, W, H);
      ctx!.drawImage(base, 0, 0);

      ctx!.save();
      ctx!.scale(SX, SY);

      // 선택 차량 근처 도로 1개만 하이라이트 (동적)
      const nearEdge = sel ? nearestEdge(sel.x, sel.y) : null;
      if (nearEdge) {
        const f = node(nearEdge.from), t = node(nearEdge.to);
        const st = ROAD_STYLE[nearEdge.type] || ROAD_STYLE.urban;
        ctx!.strokeStyle = lighten(st.color, 55);
        ctx!.lineWidth = st.width + 1.5;
        ctx!.lineCap = 'round';
        ctx!.beginPath(); ctx!.moveTo(f.x, f.y); ctx!.lineTo(t.x, t.y); ctx!.stroke();
      }

      // 차량 표시
      for (const v of vehicles) {
        const isSel = v.vin === selVin;
        ctx!.save();
        ctx!.translate(v.x, v.y);
        ctx!.rotate(v.angle);

        if (isSel) {
          // 선택 차량: 초록 글로우 + 화살표
          const glow = ctx!.createRadialGradient(0,0,1,0,0,14);
          glow.addColorStop(0,'rgba(0,255,136,0.45)');
          glow.addColorStop(1,'rgba(0,255,136,0)');
          ctx!.beginPath(); ctx!.arc(0,0,14,0,Math.PI*2);
          ctx!.fillStyle = glow; ctx!.fill();
          ctx!.fillStyle = '#00ff88';
          ctx!.beginPath();
          ctx!.moveTo(10,0); ctx!.lineTo(-6,-5); ctx!.lineTo(-6,5);
          ctx!.closePath(); ctx!.fill();
        } else {
          // 나머지 차량: 색상 다이아몬드
          const colorHex = v.color || '#aaaaaa';
          ctx!.beginPath();
          ctx!.moveTo(0,-6); ctx!.lineTo(6,0); ctx!.lineTo(0,6); ctx!.lineTo(-6,0);
          ctx!.closePath();
          ctx!.fillStyle = colorHex + 'cc';
          ctx!.fill();
          ctx!.strokeStyle = colorHex;
          ctx!.lineWidth = 1.2;
          ctx!.stroke();
        }
        ctx!.restore();
      }

      ctx!.restore();
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 10,
      width: W, height: H,
      borderRadius: 10,
      background: GLASS.bg, backdropFilter: GLASS.blur,
      border: `1px solid ${COLORS.border}`,
      overflow: 'hidden',
      cursor: 'pointer',
    }}>
      <div style={{
        position: 'absolute', top: 4, left: 0, right: 0,
        textAlign: 'center', fontSize: 8, fontWeight: 600,
        color: '#555', letterSpacing: 2, fontFamily: 'monospace',
        pointerEvents: 'none',
      }}>MINIMAP</div>
      <canvas ref={canvasRef} width={W} height={H} style={{ display: 'block' }} />
    </div>
  );
}
