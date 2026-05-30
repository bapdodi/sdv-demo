/**
 * 디자인 토큰 — 데모 전역의 색·폰트·자주 쓰는 스타일 조각을 한곳에 모은다.
 * 컴포넌트는 하드코딩된 hex 대신 여기서 import 해 쓴다.
 * 색/간격을 바꾸려면 이 파일만 수정하면 전체에 반영된다.
 */
import type { CSSProperties } from 'react';

export const COLORS = {
  /** 가장 어두운 배경 (앱 셸 · 3D HUD). */
  bg: '#0a0a0c',
  /** 페이지 표면 (Fleet 페이지 · 2D 맵). */
  surface: '#111114',
  /** 카드 표면. */
  card: '#1c1c20',
  /** 카드 내부 중첩 표면. */
  cardAlt: '#242428',

  /** 텍스트 — 기본 / 흐림 / 아주 흐림. */
  text: '#f5f5f7',
  textDim: '#8e8e93',
  textFaint: '#48484a',

  /** 강조 (파랑). rgb(58,142,246) */
  accent: '#3a8ef6',
  /** 상태색. */
  success: '#30d158', // rgb(48,209,88)
  danger: '#ff453a', // rgb(255,69,58)
  warning: '#ff9500', // rgb(255,149,0)
  /** HUD 라인·속도 강조 (네온 그린). */
  hud: '#00ff88',

  /** 공통 보더. */
  border: 'rgba(255,255,255,0.07)',
} as const;

export const FONT = {
  ui: "'Inter', -apple-system, system-ui, sans-serif",
  mono: 'monospace',
} as const;

/** 3D HUD 오버레이용 글래스 효과. */
export const GLASS = {
  bg: 'rgba(12,12,20,0.85)',
  blur: 'blur(10px)',
} as const;

/** hex(#rgb · #rrggbb)를 알파가 적용된 rgba() 문자열로 변환한다. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Fleet 페이지의 불투명 카드 베이스. 필요하면 padding·radius를 덮어쓴다. */
export const cardStyle: CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 18,
};

/** 3D HUD 오버레이용 글래스 카드 베이스. */
export const glassCardStyle: CSSProperties = {
  background: GLASS.bg,
  backdropFilter: GLASS.blur,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
};
