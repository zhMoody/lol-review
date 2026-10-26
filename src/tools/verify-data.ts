/**
 * 数据层验证（macOS 可跑，不需要客户端）。
 *
 * 用真实快照验证三件事：
 *   1. qq101 打包串解析器能不能吃下真实数据
 *   2. 对局记录能否解出 10 人的 playerAugment1..4
 *   3. B1 评分能否在真实数据上给出合理区分度
 *
 * 用法：npm run verify:data
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseAugmentRanks,
  parseHeroRanks,
  parsePairSynergies,
} from '../main/sources/qq101-packed.js'
import { scoreAugmentBuild } from '../main/core/rating/augment.js'
import type { AugmentRarity } from '../shared/domain/augment.js'

const FIXTURES = resolve(import.meta.dirname, '../../fixtures')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

interface Qq101Response {
  code?: number
  data?: { _fieldValues?: Record<string, string> }
}

function getInner(response: unknown, field: string): Record<string, string> | undefined {
  const raw = (response as Qq101Response).data?._fieldValues?.[`R${field}`]
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return undefined
  }
}

let failures = 0
function check(name: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(34)} ${detail}`)
  if (!ok) failures += 1
}

console.log('\n=== 数据层验证（fixtures）===\n')

// ── 1. qq101 打包串解析 ─────────────────────────────────
console.log('[1/3] qq101 打包串解析')

const runeResp = readJson(resolve(FIXTURES, 'qq101/rune-rank-20261025.json'))
const runeInner = getInner(runeResp, '15381')
const runeResult = parseAugmentRanks(runeInner?.['augmentlist'])
check(
  '海克斯榜（augmentlist）',
  runeResult.parsed.length > 200,
  `解析 ${runeResult.parsed.length}/${runeResult.total} 条，跳过 ${runeResult.skipped}`,
)

const heroResp = readJson(resolve(FIXTURES, 'qq101/hero-rank-20261025.json'))
const heroInner = getInner(heroResp, '15380')
const heroResult = parseHeroRanks(heroInner?.['listcollect'])
check(
  '英雄榜（listcollect）',
  heroResult.parsed.length > 150,
  `解析 ${heroResult.parsed.length}/${heroResult.total} 条，跳过 ${heroResult.skipped}`,
)

const pairResp = readJson(resolve(FIXTURES, 'qq101/pair-synergy-20261025.json'))
const pairInner = getInner(pairResp, '15323')
const pairResult = parsePairSynergies(pairInner?.['championid_data'])
check(
  '最佳搭档榜（championid_data）',
  pairResult.parsed.length > 10,
  `解析 ${pairResult.parsed.length}/${pairResult.total} 条，跳过 ${pairResult.skipped}`,
)
const firstPair = pairResult.parsed[0]
if (firstPair !== undefined) {
  check(
    '搭档榜字段完整',
    firstPair.rolesA.length > 0 && firstPair.winRate > 0,
    `${firstPair.championIdA}+${firstPair.championIdB} 胜率 ${(firstPair.winRate * 100).toFixed(2)}%`,
  )
}

const firstHero = heroResult.parsed[0]
if (firstHero !== undefined) {
  check(
    '英雄榜字段完整',
    firstHero.bestPartners.length > 0 && firstHero.lowestRankAugmentIds.length > 0,
    `champ=${firstHero.championId} 搭档 ${firstHero.bestPartners.length} 个，最弱符文 ${firstHero.lowestRankAugmentIds.length} 枚`,
  )
}

// 畸形记录必须被跳过，不能整批失败
const malformed = parseAugmentRanks('bad_record#1001_255_0.1_1_0_0.5_1_0_1,2#_#')
check(
  '畸形记录跳过不崩溃',
  malformed.skipped >= 2 && malformed.parsed.length === 1,
  `输入 4 条畸形/合法混合 → 解析 ${malformed.parsed.length}，跳过 ${malformed.skipped}`,
)

// ── 2. 对局记录里的符文 ─────────────────────────────────
console.log('\n[2/3] 对局记录 · playerAugment')

const match = readJson(resolve(FIXTURES, 'tencent-hn10/q_2400.json')) as {
  queueId?: number
  gameMode?: string
  mapId?: number
  participants?: Array<{ stats?: Record<string, unknown> }>
}

check(
  '模式识别',
  match.queueId === 2400 && match.gameMode === 'KIWI',
  `queueId=${match.queueId} gameMode=${match.gameMode} mapId=${match.mapId}`,
)

const participants = match.participants ?? []
const withAugments = participants.filter((p) => {
  const a1 = p.stats?.['playerAugment1']
  return typeof a1 === 'number' && a1 > 0
})
check(
  '符文字段存在',
  withAugments.length === 10,
  `${withAugments.length}/10 人有 playerAugment1`,
)

const aug56 = participants.filter((p) => {
  const a5 = p.stats?.['playerAugment5']
  return typeof a5 === 'number' && a5 > 0
})
check(
  'playerAugment5/6 恒为 0',
  aug56.length === 0,
  `非零的有 ${aug56.length} 人（应为 0）`,
)

// ── 3. B1 评分 ─────────────────────────────────────────
console.log('\n[3/3] B1 符文构筑评分')

const entries = runeResult.parsed
const rankTable = { date: '20261025', entries }

// gtimg 图鉴：提取品质与名字
const catalogRaw = readFileSync(resolve(FIXTURES, 'gtimg/kiwi_augments.json'), 'utf8')
const catalog = JSON.parse(catalogRaw) as Array<{
  augmentID: number
  name_cn: string
  level: string
}>
const nameById = new Map(catalog.map((c) => [c.augmentID, c.name_cn]))
const rarityById = new Map<number, AugmentRarity>(
  catalog.map((c) => [c.augmentID, c.level as AugmentRarity]),
)

// 用真实英雄榜的 lowestRankAugmentIds 做匹配度
const yasuo = heroResult.parsed.find((h) => h.championId === 157)
const lowest = yasuo?.lowestRankAugmentIds ?? []

const builds: Array<{ label: string; ids: number[] }> = [
  { label: '全是高胜率', ids: [1007, 1004, 1022, 1013] },
  { label: '混合', ids: [1002, 1007, 1022, 1001] },
  { label: '含弱符文', ids: [1001, 1002, 1005, 1025] },
]

const scores: number[] = []
for (const build of builds) {
  const result = scoreAugmentBuild({
    augmentIds: build.ids,
    championId: 157,
    ranks: rankTable,
    rarityById,
    nameById,
    lowestRankAugmentIds: lowest,
  })
  scores.push(result.score)
  const names = result.slots.map((s) => s.name || `#${s.augmentId}`).join(' / ')
  console.log(`      ${build.label.padEnd(12)} ${result.score.toFixed(1).padStart(5)}  ${result.verdict}  [${names}]`)
}

const spread = Math.max(...scores) - Math.min(...scores)
check('构筑分有区分度', spread > 20, `极差 ${spread.toFixed(1)}（应 > 20）`)
check('分数值域合法', scores.every((s) => s >= 0 && s <= 100), scores.map((s) => s.toFixed(1)).join(' / '))

// 榜单查不到的 ID 不得报错
const unknownBuild = scoreAugmentBuild({
  augmentIds: [999999, 1007, 1004, 1022],
  championId: 157,
  ranks: rankTable,
  rarityById,
  nameById,
  lowestRankAugmentIds: lowest,
})
check(
  '未知 ID 优雅降级',
  unknownBuild.slots.length === 4 && unknownBuild.slots[0]?.slotScore === 50,
  '未知符文给 50 分占位，不抛错',
)

console.log('\n' + '─'.repeat(56))
if (failures === 0) {
  console.log('✅ 数据层全部通过\n')
} else {
  console.log(`❌ ${failures} 项失败\n`)
  process.exit(1)
}
