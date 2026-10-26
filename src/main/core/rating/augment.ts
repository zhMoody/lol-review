/**
 * B1 符文构筑评分。
 * 公式与阈值来源：docs/07 §6.4（用 226 条真实分布拟合）
 *
 * 硬要求（docs/10 §8）：
 *  - 纯函数：不碰 IO、不碰时间、不碰随机数
 *  - 同输入必同输出
 *  - 每个 flag 的数字都能追溯到输入
 */
import { LIMITS } from '@shared/enums'
import {
  AugmentBuildSchema,
  type AugmentBuild,
  type AugmentFlag,
  type AugmentRankEntry,
  type AugmentRankTable,
  type AugmentRarity,
  type AugmentSlotScore,
  type BuildVerdict,
} from '@shared/domain/augment'

/** 图鉴里查不到时的占位名。不显示"未知符文"（docs/07 §3.2） */
const UNKNOWN_NAME = ''

export interface ScoreAugmentInput {
  /** 4 枚符文 ID（playerAugment1..4），顺序即选择顺序 */
  augmentIds: readonly number[]
  /** 当前英雄 ID，用于匹配度修正 */
  championId: number
  /** 海克斯榜（含 winRank / bestChampionIds） */
  ranks: AugmentRankTable
  /** 图鉴 ID → 品质。查不到不报错，走占位 */
  rarityById: ReadonlyMap<number, AugmentRarity>
  /** 图鉴 ID → 中文名 */
  nameById: ReadonlyMap<number, string>
  /** 该英雄「最不该拿」的符文 ID，来自英雄榜 [10] */
  lowestRankAugmentIds: readonly number[]
}

/**
 * ① 单枚基础分
 *    base  = 100 × (1 − (winRank − 1) / (N − 1))
 *    conf  = clamp(pickRate / 0.05, 0.40, 1.00)
 *    score = 50 + (base − 50) × conf
 */
export function scoreAugmentBase(entry: AugmentRankEntry, total: number): number {
  if (total <= 1) return 50
  const base = 100 * (1 - (entry.winRank - 1) / (total - 1))
  const conf = clamp(
    entry.pickRate / LIMITS.lowPickRateThreshold,
    LIMITS.lowPickRateConfidenceFloor,
    1,
  )
  return 50 + (base - 50) * conf
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** verdict 阈值（docs/07 §6.4） */
function verdictOf(score: number): BuildVerdict {
  if (score >= 75) return 'build.great'
  if (score >= 55) return 'build.solid'
  if (score >= 40) return 'build.weak'
  return 'build.broken'
}

/**
 * 计算一人的符文构筑分。
 *
 * 注意：品质（rarity）**只做展示，不进分数**。
 * 原因：海克斯大乱斗每轮所有人拿到同一品质，品质不是玩家的选择。
 * 见 docs/07 §6.4「品质不进分数」
 */
export function scoreAugmentBuild(input: ScoreAugmentInput): AugmentBuild {
  const total = input.ranks.entries.length
  const rankById = new Map<number, AugmentRankEntry>(
    input.ranks.entries.map((e) => [e.augmentId, e]),
  )
  const worstSet = new Set(input.lowestRankAugmentIds)

  // 只取前 4 枚（playerAugment5/6 恒为 0，docs/07 §3.2）
  const ids = input.augmentIds.slice(0, 4)

  const slots: AugmentSlotScore[] = ids.map((augmentId) => {
    const entry = rankById.get(augmentId)

    // 图鉴/榜单查不到 → 占位，不报错
    if (entry === undefined) {
      return {
        augmentId,
        name: input.nameById.get(augmentId) ?? UNKNOWN_NAME,
        rarity: input.rarityById.get(augmentId) ?? 'kSilver',
        winRank: 0,
        winRate: 0,
        pickRate: 0,
        slotScore: 50,
        flag: 'none',
      }
    }

    let slotScore = scoreAugmentBase(entry, total)
    let flag: AugmentFlag = 'none'

    if (entry.bestChampionIds.includes(input.championId)) {
      slotScore += LIMITS.augmentMatchBonus
      flag = 'match'
    }
    if (worstSet.has(augmentId)) {
      slotScore += LIMITS.augmentWorstPenalty
      flag = 'worst'
    }

    return {
      augmentId,
      name: input.nameById.get(augmentId) ?? UNKNOWN_NAME,
      rarity: input.rarityById.get(augmentId) ?? 'kSilver',
      winRank: entry.winRank,
      winRate: entry.winRate,
      pickRate: entry.pickRate,
      slotScore: clamp(slotScore, 0, 100),
      flag,
    }
  })

  // 等权（docs/07 §6.4：槽位权重假设站不住，改等权）
  const score =
    slots.length === 0
      ? 50
      : slots.reduce((sum, s) => sum + s.slotScore, 0) / slots.length

  return AugmentBuildSchema.parse({
    score: Math.round(score * 10) / 10,
    slots,
    verdict: verdictOf(score),
  })
}
