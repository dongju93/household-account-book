// Semantic tones shared by Progress, StatusPill, charts, etc. Tailwind utilities
// come from the @theme tokens in index.css (bg-danger, text-warn, …).
export type Tone = 'danger' | 'warn' | 'ok' | 'info' | 'ink' | 'neutral'

export const toneText: Record<Tone, string> = {
  danger: 'text-danger',
  warn: 'text-warn',
  ok: 'text-ok',
  info: 'text-info',
  ink: 'text-ink',
  neutral: 'text-ink2',
}

export const toneBg: Record<Tone, string> = {
  danger: 'bg-danger',
  warn: 'bg-warn',
  ok: 'bg-ok',
  info: 'bg-info',
  ink: 'bg-ink',
  neutral: 'bg-fill3',
}

// Tinted background for pills (≈13% alpha over the hue), matching the wireframe.
export const toneTint: Record<Tone, string> = {
  danger: 'bg-danger/15 text-danger',
  warn: 'bg-warn/15 text-warn',
  ok: 'bg-ok/15 text-ok',
  info: 'bg-info/15 text-info',
  ink: 'bg-ink/10 text-ink2',
  neutral: 'bg-ink3/15 text-ink2',
}

// Hex values for Recharts (SVG fills can't use Tailwind classes).
export const toneHex: Record<Tone, string> = {
  danger: '#b07360',
  warn: '#b09863',
  ok: '#7d9377',
  info: '#7c87a2',
  ink: '#39352f',
  neutral: '#d6d0c7',
}
