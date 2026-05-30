import { useRef, useEffect } from 'react';
import { nearestEdge } from '../../lib/roads';
import type { Vehicle } from '../../types';

function hudRRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,   x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,   y + h, r);
  ctx.arcTo(x,   y + h, x,   y,   r);
  ctx.arcTo(x,   y,   x + w, y,   r);
  ctx.closePath();
}

function drawCarIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, sc: number, color: string, isEgo: boolean) {
  const w = sc * 0.44, h = sc * 0.78;
  ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.lineWidth = isEgo ? 2.2 : 1.5;
  ctx.fillStyle   = color + (isEgo ? '28' : '16');
  hudRRect(ctx, -w/2, -h/2, w, h, 3); ctx.fill(); ctx.stroke();
  if (isEgo) {
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(0, -h/2+4.5, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawVehicleDiagram(ctx: CanvasRenderingContext2D, cx: number, cy: number, sc: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  for (const dx of [-sc*0.88, sc*0.88]) {
    ctx.beginPath(); ctx.moveTo(cx+dx, cy-sc*2.4); ctx.lineTo(cx+dx, cy+sc*1.9); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,204,255,0.05)';
  ctx.fillRect(cx-sc*0.88, cy-sc*2.4, sc*1.76, sc*4.3);

  drawCarIcon(ctx, cx,           cy - sc*0.45, sc,     '#00ff88', false);
  drawCarIcon(ctx, cx - sc*1.35, cy + sc*0.3,  sc*0.9, '#00cc77', false);
  drawCarIcon(ctx, cx + sc*1.5,  cy - sc*0.1,  sc*0.9, '#009960', false);
  drawCarIcon(ctx, cx,           cy + sc*1.15, sc,     '#00ccff', true);
}

interface Props {
  /** 추적 중인 차량. null 이면 데이터 없음으로 표시. */
  vehicle: Vehicle | null;
  /** 플랫폼(서버) 연결 여부. */
  connected: boolean;
}

export default function HudCanvas({ vehicle, connected }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ vehicle, connected });
  stateRef.current = { vehicle, connected };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    function frame() {
      const { vehicle, connected } = stateRef.current;
      const W = canvas!.width, H = canvas!.height;
      ctx!.clearRect(0, 0, W, H);

      const hasData = connected && vehicle !== null;
      const spdKmh = vehicle ? Math.round(vehicle.speed) : 0;
      const nearEdge = hasData ? nearestEdge(vehicle.x, vehicle.y) : null;
      const limit = nearEdge ? nearEdge.speed_limit : 80;

      // ── 차선 가이드라인 ──
      const vpX = W * 0.5, vpY = H * 0.43;
      const bSprd = W * 0.074, tSprd = W * 0.016;
      const bY    = H * 0.78;

      const lg = ctx!.createLinearGradient(0, vpY, 0, bY);
      lg.addColorStop(0, 'rgba(0,255,136,0)');
      lg.addColorStop(1, 'rgba(0,255,136,0.08)');
      ctx!.fillStyle = lg;
      ctx!.beginPath();
      ctx!.moveTo(vpX-tSprd, vpY); ctx!.lineTo(vpX+tSprd, vpY);
      ctx!.lineTo(vpX+bSprd, bY);  ctx!.lineTo(vpX-bSprd, bY);
      ctx!.closePath(); ctx!.fill();

      ctx!.strokeStyle = 'rgba(0,255,136,0.82)'; ctx!.lineWidth = 2.5;
      ctx!.shadowColor = '#00ff88'; ctx!.shadowBlur = 10;
      for (const [bx, tx] of [[vpX-bSprd,vpX-tSprd],[vpX+bSprd,vpX+tSprd]]) {
        ctx!.beginPath(); ctx!.moveTo(bx,bY); ctx!.lineTo(tx,vpY); ctx!.stroke();
      }
      ctx!.shadowBlur = 0;

      ctx!.strokeStyle = 'rgba(255,255,255,0.28)'; ctx!.lineWidth = 1.5;
      ctx!.setLineDash([9,9]);
      ctx!.beginPath(); ctx!.moveTo(vpX,bY); ctx!.lineTo(vpX,vpY); ctx!.stroke();
      ctx!.setLineDash([]);

      // ── 속도 표시 (하단 중앙) ──
      const sx = W/2, sy = H * 0.865;
      ctx!.fillStyle = 'rgba(0,0,8,0.46)';
      hudRRect(ctx!, sx-58, sy-46, 116, 68, 9); ctx!.fill();

      ctx!.fillStyle = '#ffffff';
      ctx!.font = 'bold 58px "Courier New",monospace';
      ctx!.textAlign = 'center'; ctx!.textBaseline = 'alphabetic';
      ctx!.fillText(String(spdKmh), sx, sy-2);

      ctx!.fillStyle = 'rgba(255,255,255,0.52)';
      ctx!.font = '11px monospace';
      ctx!.fillText('km/h', sx, sy+14);

      ctx!.fillStyle = spdKmh > 0 ? '#00aa44' : '#334433';
      hudRRect(ctx!, sx-20, sy+18, 40, 14, 3); ctx!.fill();
      ctx!.fillStyle = '#fff'; ctx!.font = 'bold 8px monospace'; ctx!.textBaseline = 'middle';
      ctx!.fillText('AUTO', sx, sy+26);

      // ── 제한속도 원형 (좌하단) ──
      const lx = W/2 - 148, ly = H * 0.866;
      ctx!.beginPath(); ctx!.arc(lx, ly, 25, 0, Math.PI*2);
      ctx!.fillStyle = 'rgba(248,248,248,0.93)'; ctx!.fill();
      ctx!.strokeStyle = '#cc1e1e'; ctx!.lineWidth = 4.5; ctx!.stroke();
      ctx!.fillStyle = '#111'; ctx!.font = 'bold 16px "Courier New"';
      ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
      ctx!.fillText(String(limit), lx, ly);

      // ── HDA 표시 (좌상단) ──
      const hdaX = W*0.115, hdaY = H*0.19;
      ctx!.fillStyle = 'rgba(0,255,136,0.1)';
      hudRRect(ctx!, hdaX-30, hdaY-17, 60, 33, 5); ctx!.fill();
      ctx!.strokeStyle = '#00ff88'; ctx!.lineWidth = 1.2;
      hudRRect(ctx!, hdaX-30, hdaY-17, 60, 33, 5); ctx!.stroke();
      ctx!.fillStyle = '#00ff88'; ctx!.font = 'bold 13px monospace';
      ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
      ctx!.fillText('HDA', hdaX, hdaY-1);

      // ── 차량 감지 다이어그램 ──
      drawVehicleDiagram(ctx!, W * 0.5, H * 0.335, 30);

      // ── 도로명 + 내비 화살표 ──
      if (nearEdge) {
        const rx = W*0.705, ry = H*0.36;
        ctx!.fillStyle = 'rgba(0,0,8,0.42)';
        hudRRect(ctx!, rx-74, ry-15, 148, 30, 5); ctx!.fill();
        ctx!.fillStyle = '#ffcc00'; ctx!.font = '13px monospace';
        ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
        ctx!.fillText(nearEdge.name, rx, ry);

        const ax = rx, ayB = ry + 28;
        ctx!.strokeStyle = '#ff9500'; ctx!.lineWidth = 3.5;
        ctx!.shadowColor = '#ff9500'; ctx!.shadowBlur = 10;
        ctx!.beginPath(); ctx!.moveTo(ax, ayB+22); ctx!.lineTo(ax, ayB+5); ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(ax-10, ayB+15); ctx!.lineTo(ax, ayB); ctx!.lineTo(ax+10, ayB+15); ctx!.stroke();
        ctx!.shadowBlur = 0;

        const dist = (Math.hypot((vehicle?.x ?? 0) - 400, (vehicle?.y ?? 0) - 280) * 0.01).toFixed(1);
        ctx!.fillStyle = 'rgba(255,255,255,0.62)'; ctx!.font = '11px monospace';
        ctx!.textBaseline = 'alphabetic';
        ctx!.fillText(dist + ' km', ax, ayB+42);
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 5,
      }}
    />
  );
}
