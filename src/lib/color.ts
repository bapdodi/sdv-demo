/** "#rrggbb" → 0xRRGGBB 정수 (THREE.js 머티리얼 색상용). 잘못된 입력이면 fallback. */
export function hexToInt(hex: string, fallback = 0x2255cc): number {
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(n) ? fallback : n;
}

/** "#rrggbb" 를 채널당 amount 만큼 밝힌 rgb() 문자열로 변환. */
export function lighten(hex: string, amount = 80): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r + amount)},${Math.min(255, g + amount)},${Math.min(255, b + amount)})`;
}
