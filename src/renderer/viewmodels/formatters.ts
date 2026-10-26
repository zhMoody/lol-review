/**
 * 视图模型层：domain → 视图形状的纯映射。
 *
 * 硬规则（docs/10 §0.1）：
 *  - 不发请求、不读 store、不碰 DOM、不 import React
 *  - 改名只允许发生在这一层
 */

/** 数字格式化：千分位，小数位可控 */
export function formatNumber(value: number, fractionDigits = 0): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** 紧凑数字：1234 → 1.2k，1234567 → 1.2M */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return formatNumber(value)
}

/** 带符号的紧凑数字：经济差 +2.4k / −4.2k */
export function formatSignedCompact(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatCompact(Math.abs(value))}`
}

/** 秒 → mm:ss */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 毫秒 → mm:ss（时间线用） */
export function formatMs(ms: number): string {
  return formatDuration(ms / 1000)
}

/** 百分比：0.34 → 34% */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`
}

/** KDA 三段 */
export function formatKda(k: number, d: number, a: number): string {
  return `${k} / ${d} / ${a}`
}

/** KDA 比值：(k+a)/max(d,1) */
export function kdaRatio(k: number, d: number, a: number): number {
  return (k + a) / Math.max(d, 1)
}

/** 装备价值差的文案 */
export function itemValueLabel(diff: number): string {
  return formatSignedCompact(diff)
}

/**
 * 符文槽解锁数由等级推算（3/7/11/15 级）。
 * 见 docs/03 §3：对局中拿不到实时符文选择，只知道解锁了几个。
 */
export function augmentSlotsForLevel(level: number): { unlocked: number; total: number } {
  const unlocked = level >= 15 ? 4 : level >= 11 ? 3 : level >= 7 ? 2 : level >= 3 ? 1 : 0
  return { unlocked, total: 4 }
}

/** 人设 key → 中文文案表（docs/06 §5：代码里只出现 key） */
export const PERSONA_LABELS: Record<string, string> = {
  'persona.carry': '大腿',
  'persona.try': '尽力局长',
  'persona.solid': '中规中矩',
  'persona.solid+': '稳中带飞',
  'persona.tool': '工具人',
  'persona.tank': '肉盾',
  'persona.passive': '混子',
  'persona.invisible': '隐形人',
  'persona.crime': '蛆',
  'persona.crime-soft': '犯罪嫌疑人',
  'persona.pending': '待定',
  'sub.lonewolf': '独狼',
}

export function personaLabel(key: string): string {
  return PERSONA_LABELS[key] ?? key
}

/** 人设 → 语义色 token 名（renderer 只用 token，不写 hex） */
export function personaColorVar(key: string): string {
  if (key.startsWith('persona.crime')) return 'var(--danger)'
  if (key === 'persona.carry' || key === 'persona.solid+') return 'var(--aug-gold)'
  if (key === 'persona.try' || key === 'persona.tool' || key === 'persona.tank') {
    return 'var(--aug-prism)'
  }
  return 'var(--text-low)'
}
