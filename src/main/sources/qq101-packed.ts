/**
 * qq101 打包串解析器（本项目唯一自写的解析逻辑）。
 *
 * 为什么必须自己写：腾讯 `mlol.qt.qq.com` 返回的是私有打包串，不是 JSON 字段。
 * 没有现成库能解析。见 docs/10 §1.0 / docs/07 §3.4
 *
 * 三个格式（分隔符固定，但记录可能畸形）：
 *   augmentlist    '#' 分记录，'_' 分段，[8] 用 ',' 分英雄 ID
 *   listcollect    '#' 分记录，'_' 分 11 段，[5] 用 '&' 分搭档、搭档内用 ',' 分字段
 *   championid_data '#' 分记录，'|' 分 5 段，[0]/[1] 内用 ';' 分
 *
 * 硬规则（docs/07 §3.4 风险 2）：
 *   单条解析失败必须跳过，不得整批失败。
 */
import { z } from 'zod'
import { AppError, ERROR_CODE } from '@shared/errors'
import {
  AugmentRankTableSchema,
  type AugmentRankEntry,
  type AugmentRankTable,
} from '@shared/domain/augment'

// ── 工具 ──────────────────────────────────────────────────

/** 严格数字解析：空串、非数字、NaN 一律返回 null，绝不抛错 */
function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toInt(value: string | undefined): number | null {
  const n = toNumber(value)
  return n === null ? null : Math.trunc(n)
}

function toIdList(value: string | undefined): number[] {
  if (value === undefined) return []
  return value
    .split(',')
    .map((s) => toInt(s.trim()))
    .filter((n): n is number => n !== null)
}

/**
 * 排名变化字段：接口返回数字或中文"未变化"。
 * UNVERIFIED: 是否还有"新上榜"之类的取值，抓包见到再补。
 */
function toRankChange(value: string | undefined): number {
  if (value === undefined) return 0
  const n = toNumber(value)
  return n === null ? 0 : n
}

// ── 1. 海克斯榜（augmentlist）────────────────────────────

const AugmentRankRecord = z.object({
  augmentId: z.number().int(),
  level: z.string(),
  pickRate: z.number(),
  pickRank: z.number().int(),
  pickRankChange: z.number().int(),
  winRate: z.number(),
  winRank: z.number().int(),
  winRankChange: z.number().int(),
  bestChampionIds: z.array(z.number().int()),
})

export interface ParseResult<T> {
  parsed: T[]
  skipped: number
  total: number
}

/**
 * 解析 `augmentlist` 字段。
 * 每条：augmentId_level_pickRate_pickRank_pickRankChange_winRate_winRank_winRankChange_bestChampionIds
 */
export function parseAugmentRanks(
  raw: string | undefined,
): ParseResult<AugmentRankEntry> {
  if (raw === undefined || raw.trim() === '') {
    return { parsed: [], skipped: 0, total: 0 }
  }

  const records = raw.split('#').filter((r) => r.trim() !== '')
  const parsed: AugmentRankEntry[] = []
  let skipped = 0

  for (const record of records) {
    const f = record.split('_')
    const augmentId = toInt(f[0])
    const pickRate = toNumber(f[2])
    const pickRank = toInt(f[3])
    const winRate = toNumber(f[5])
    const winRank = toInt(f[6])

    // 关键字段任一缺失 → 整条跳过
    if (
      augmentId === null ||
      pickRate === null ||
      pickRank === null ||
      winRate === null ||
      winRank === null
    ) {
      skipped += 1
      continue
    }

    const candidate = {
      augmentId,
      level: f[1] ?? '255',
      pickRate,
      pickRank,
      pickRankChange: toRankChange(f[4]),
      winRate,
      winRank,
      winRankChange: toRankChange(f[7]),
      bestChampionIds: toIdList(f[8]),
    }

    const result = AugmentRankRecord.safeParse(candidate)
    if (!result.success) {
      skipped += 1
      continue
    }
    parsed.push(result.data)
  }

  return { parsed, skipped, total: records.length }
}

/** 组装成完整的排名表（含日期），供 B1 评分使用 */
export function buildAugmentRankTable(
  raw: string | undefined,
  date: string,
): AugmentRankTable {
  const { parsed } = parseAugmentRanks(raw)
  return AugmentRankTableSchema.parse({ date, entries: parsed })
}

// ── 2. 英雄榜（listcollect）──────────────────────────────

export interface HeroPartner {
  championId: number
  pickRate: number
  winRate: number
  rank: number
}

export interface HeroRankEntry {
  championId: number
  rank: number
  rankChange: number
  winRate: number
  pickRate: number
  bestPartners: HeroPartner[]
  averageDeathTimeSeconds: number | null
  killParticipationRate: number | null
  damageShare: number | null
  damageTakenShare: number | null
  lowestRankAugmentIds: number[]
}

const HeroPartnerSchema = z.object({
  championId: z.number().int(),
  pickRate: z.number(),
  winRate: z.number(),
  rank: z.number().int(),
})

const HeroRankEntrySchema = z.object({
  championId: z.number().int(),
  rank: z.number().int(),
  rankChange: z.number().int(),
  winRate: z.number(),
  pickRate: z.number(),
  bestPartners: z.array(HeroPartnerSchema),
  averageDeathTimeSeconds: z.number().nullable(),
  killParticipationRate: z.number().nullable(),
  damageShare: z.number().nullable(),
  damageTakenShare: z.number().nullable(),
  lowestRankAugmentIds: z.array(z.number().int()),
})

/**
 * 解析 `listcollect` 字段。每条 11 段：
 * [0]championId [1]rank [2]rankChange [3]winRate [4]pickRate
 * [5]partners(';' 分) [6]avgDeath [7]kp [8]dmgShare [9]takenShare
 * [10]lowestRankAugmentIds
 */
export function parseHeroRanks(raw: string | undefined): ParseResult<HeroRankEntry> {
  if (raw === undefined || raw.trim() === '') {
    return { parsed: [], skipped: 0, total: 0 }
  }

  const records = raw.split('#').filter((r) => r.trim() !== '')
  const parsed: HeroRankEntry[] = []
  let skipped = 0

  for (const record of records) {
    const f = record.split('_')
    const championId = toInt(f[0])
    const rank = toInt(f[1])
    const winRate = toNumber(f[3])
    const pickRate = toNumber(f[4])

    if (championId === null || rank === null || winRate === null || pickRate === null) {
      skipped += 1
      continue
    }

    const bestPartners: HeroPartner[] = (f[5] ?? '')
      .split('&')
      .filter((p) => p.trim() !== '')
      .flatMap((partner) => {
        const v = partner.split(',')
        const pid = toInt(v[0])
        const pp = toNumber(v[1])
        const pw = toNumber(v[2])
        const pr = toInt(v[3])
        if (pid === null || pp === null || pw === null || pr === null) return []
        return [{ championId: pid, pickRate: pp, winRate: pw, rank: pr }]
      })

    const candidate = {
      championId,
      rank,
      rankChange: toRankChange(f[2]),
      winRate,
      pickRate,
      bestPartners,
      averageDeathTimeSeconds: toNumber(f[6]),
      killParticipationRate: toNumber(f[7]),
      damageShare: toNumber(f[8]),
      damageTakenShare: toNumber(f[9]),
      lowestRankAugmentIds: toIdList(f[10]),
    }

    const result = HeroRankEntrySchema.safeParse(candidate)
    if (!result.success) {
      skipped += 1
      continue
    }
    parsed.push(result.data)
  }

  return { parsed, skipped, total: records.length }
}

// ── 3. 最佳搭档榜（championid_data）──────────────────────

export interface PairSynergy {
  championIdA: number
  championIdB: number
  rolesA: string[]
  rolesB: string[]
  winRate: number
  pickRate: number
  rank: number
}

const PairSynergySchema = z.object({
  championIdA: z.number().int(),
  championIdB: z.number().int(),
  rolesA: z.array(z.string()),
  rolesB: z.array(z.string()),
  winRate: z.number(),
  pickRate: z.number(),
  rank: z.number().int(),
})

/**
 * 解析 `championid_data` 字段。每条 5 段（'|' 分）：
 * [0]'a;b' [1]'rolesA;rolesB' [2]winRate [3]pickRate [4]rank
 */
export function parsePairSynergies(raw: string | undefined): ParseResult<PairSynergy> {
  if (raw === undefined || raw.trim() === '') {
    return { parsed: [], skipped: 0, total: 0 }
  }

  const records = raw.split('#').filter((r) => r.trim() !== '')
  const parsed: PairSynergy[] = []
  let skipped = 0

  for (const record of records) {
    const seg = record.split('|')
    const ids = (seg[0] ?? '').split(';')
    const roles = (seg[1] ?? '').split(';')
    const championIdA = toInt(ids[0])
    const championIdB = toInt(ids[1])
    const winRate = toNumber(seg[2])
    const pickRate = toNumber(seg[3])
    const rank = toInt(seg[4])

    if (
      championIdA === null ||
      championIdB === null ||
      winRate === null ||
      pickRate === null ||
      rank === null
    ) {
      skipped += 1
      continue
    }

    const candidate = {
      championIdA,
      championIdB,
      rolesA: (roles[0] ?? '').split(',').filter((s) => s !== ''),
      rolesB: (roles[1] ?? '').split(',').filter((s) => s !== ''),
      winRate,
      pickRate,
      rank,
    }

    const result = PairSynergySchema.safeParse(candidate)
    if (!result.success) {
      skipped += 1
      continue
    }
    parsed.push(result.data)
  }

  return { parsed, skipped, total: records.length }
}

// ── 外层响应解析 ─────────────────────────────────────────

/**
 * qq101 外层结构：{ code, data: { _fieldValues: { R15380: "<json string>" } } }
 * 内层才是真正的 JSON，字段名是 R 开头的数字。
 */
export function extractPackedField(response: unknown, fieldId: string): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined
  const data = (response as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const fieldValues = (data as { _fieldValues?: unknown })._fieldValues
  if (typeof fieldValues !== 'object' || fieldValues === null) return undefined

  const key = `R${fieldId}`
  const raw = (fieldValues as Record<string, unknown>)[key]
  if (typeof raw !== 'string') return undefined

  // 内层是 JSON 字符串，形如 { "augmentlist": "...", ... }
  try {
    const inner: unknown = JSON.parse(raw)
    if (typeof inner !== 'object' || inner === null) return undefined
    const value = (inner as Record<string, unknown>)[fieldKeyFor(fieldId)]
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

/** 字段 ID → 内层键名 */
function fieldKeyFor(fieldId: string): string {
  switch (fieldId) {
    case '15381':
      return 'augmentlist'
    case '15380':
      return 'listcollect'
    case '15323':
      return 'championid_data'
    default:
      return 'result'
  }
}

/** 便捷封装：从响应直接拿到排名表 */
export function parseRuneRankResponse(
  response: unknown,
  date: string,
): AugmentRankTable {
  const raw = extractPackedField(response, '15381')
  if (raw === undefined) {
    throw new AppError({
      code: ERROR_CODE.qq101ParseFailed,
      message: '海克斯榜响应缺少 R15381.augmentlist 字段',
      recoverable: true,
      source: 'fuwen_aram_rune_rank_v2',
    })
  }
  return buildAugmentRankTable(raw, date)
}
