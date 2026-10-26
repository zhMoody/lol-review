/**
 * 符文领域模型。
 * 字段名与接口保持一致（docs/10 §0.1：domain 不为了好看改名）。
 *
 * 数据来源（见 docs/07 §3.2 / §3.4）：
 *  - 对局记录   stats.playerAugment1..6   → 实际只用 1..4，5/6 恒为 0
 *  - 图鉴 LCU   /lol-game-data/assets/v1/cherry-augments.json
 *  - 图鉴 gtimg https://game.gtimg.cn/.../kiwi/kiwi_augments.json
 *  - 排名榜     mlol.qt.qq.com fuwen_aram_rune_rank_v2
 */
import { z } from 'zod'

// ── 品质 ──────────────────────────────────────────────────
/**
 * LCU 图鉴给出 5 档，gtimg 只给 3 档（kSilver/kGold/kPrismatic）。
 * UNVERIFIED: kBronze / kEventChoice 在海克斯大乱斗里是否会出现，待真机核对。
 */
export const AugmentRaritySchema = z.enum([
  'kSilver',
  'kGold',
  'kPrismatic',
  'kBronze',
  'kEventChoice',
])
export type AugmentRarity = z.infer<typeof AugmentRaritySchema>

// ── 图鉴条目（gtimg kiwi_augments.json）────────────────────
export const AugmentCatalogEntrySchema = z.object({
  augmentID: z.number().int(),
  name_en: z.string(),
  name_cn: z.string(),
  /** 形如 "KIWI, KIWI_JADE" / "CHERRY, KIWI" */
  mode: z.string(),
  level: z.string(),
  isPBE: z.number().int(),
  isNew: z.number().int(),
  desc: z.string(),
  tooltip: z.string(),
  large_Icon: z.string(),
  small_Icon: z.string(),
})
export type AugmentCatalogEntry = z.infer<typeof AugmentCatalogEntrySchema>

export const AugmentCatalogSchema = z.array(AugmentCatalogEntrySchema)
export type AugmentCatalog = z.infer<typeof AugmentCatalogSchema>

// ── 排名榜条目（fuwen_aram_rune_rank_v2 解析后）────────────
export const AugmentRankEntrySchema = z.object({
  augmentId: z.number().int(),
  /** 接口固定返回 '255' 占位，不含真实品质。见 docs/07 §6.4 */
  level: z.string(),
  pickRate: z.number(),
  pickRank: z.number().int(),
  pickRankChange: z.number().int(),
  winRate: z.number(),
  /** 1 = 最好。共 N 条 */
  winRank: z.number().int(),
  winRankChange: z.number().int(),
  bestChampionIds: z.array(z.number().int()),
})
export type AugmentRankEntry = z.infer<typeof AugmentRankEntrySchema>

export const AugmentRankTableSchema = z.object({
  /** 统计日期，形如 '20261025' */
  date: z.string(),
  entries: z.array(AugmentRankEntrySchema),
})
export type AugmentRankTable = z.infer<typeof AugmentRankTableSchema>

// ── 单枚符文的评分 ────────────────────────────────────────
export const AugmentFlagSchema = z.enum(['match', 'worst', 'none'])
export type AugmentFlag = z.infer<typeof AugmentFlagSchema>

export const AugmentSlotScoreSchema = z.object({
  augmentId: z.number().int(),
  name: z.string(),
  rarity: AugmentRaritySchema,
  winRank: z.number().int(),
  winRate: z.number(),
  pickRate: z.number(),
  /** 0-100 */
  slotScore: z.number(),
  flag: AugmentFlagSchema,
})
export type AugmentSlotScore = z.infer<typeof AugmentSlotScoreSchema>

export const BuildVerdictSchema = z.enum([
  'build.great',
  'build.solid',
  'build.weak',
  'build.broken',
])
export type BuildVerdict = z.infer<typeof BuildVerdictSchema>

export const AugmentBuildSchema = z.object({
  /** 0-100 */
  score: z.number(),
  slots: z.array(AugmentSlotScoreSchema),
  verdict: BuildVerdictSchema,
})
export type AugmentBuild = z.infer<typeof AugmentBuildSchema>
