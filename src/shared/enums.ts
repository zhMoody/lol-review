/**
 * 共享枚举与常量。
 * 规范：不用 TypeScript `enum`（避免数字枚举的反向映射），用 `as const` + 联合类型。
 * 出处：docs/10-app-tech.md §0.2
 */

/** 状态机七态。转移规则见 docs/10 §6 */
export const STATE = {
  offline: 'OFFLINE',
  clientIdle: 'CLIENT_IDLE',
  champSelect: 'CHAMP_SELECT',
  inGame: 'IN_GAME',
  inGameDegraded: 'IN_GAME_DEGRADED',
  building: 'BUILDING',
  report: 'REPORT',
} as const

export type State = (typeof STATE)[keyof typeof STATE]

/** 人设标签。顺序即判定优先级，见 docs/07 §7 */
export const PERSONA = {
  crime: 'persona.crime',
  crimeSoft: 'persona.crime-soft',
  carry: 'persona.carry',
  try: 'persona.try',
  solid: 'persona.solid',
  solidPlus: 'persona.solid+',
  invisible: 'persona.invisible',
  passive: 'persona.passive',
  tool: 'persona.tool',
  tank: 'persona.tank',
  lonewolf: 'persona.lonewolf',
  pending: 'persona.pending',
} as const

export type PersonaKey = (typeof PERSONA)[keyof typeof PERSONA]

/** 副标签（可与主标签并存，最多 1 个） */
export const SUB_TAG = {
  lonewolf: 'sub.lonewolf',
} as const

export type SubTagKey = (typeof SUB_TAG)[keyof typeof SUB_TAG]

/**
 * 游戏模式。国服实测值，见 docs/07 §2
 * queueId 2400 / gameMode 'KIWI' / mapId 12 = 海克斯大乱斗
 */
export const GAME_MODE = {
  kiwi: 'KIWI',
  kiwiJade: 'KIWI_JADE',
  aram: 'ARAM',
  classic: 'CLASSIC',
  cherry: 'CHERRY',
  brawl: 'BRAWL',
  urf: 'URF',
  swiftplay: 'SWIFTPLAY',
  ruby: 'RUBY',
} as const

export type GameMode = (typeof GAME_MODE)[keyof typeof GAME_MODE]

/** 本产品唯一处理的模式 */
export const TARGET_MODE: GameMode = GAME_MODE.kiwi
/** 海克斯大乱斗 queueId。⚠️ 不要硬编码做主判定，见 docs/07 §2 */
export const TARGET_QUEUE_ID = 2400
/** 兜底判定用的地图 ID（嚎哭深渊） */
export const HOWLING_ABYSS_MAP_ID = 12

/** 评分与展示用到的数值常量 */
export const LIMITS = {
  /** 一局最多生成报告的重试次数 */
  eogMaxRetry: 12,
  /** 每次重试间隔 ms */
  eogRetryIntervalMs: 1000,
  /** S4 延迟显示 ms（避免 3 秒内完成的局闪屏） */
  buildingDelayMs: 1200,
  /** 本地保留对局数 */
  historyRetention: 20,
  /** 低选取率降权阈值 */
  lowPickRateThreshold: 0.05,
  /** 低选取率时的可信度下限 */
  lowPickRateConfidenceFloor: 0.4,
  /** 匹配加成 / 最弱扣分（docs/07 §6.4） */
  augmentMatchBonus: 8,
  augmentWorstPenalty: -12,
} as const
