/**
 * qq101 打包串解析器的边界测试。
 * 关键回归点：单条畸形记录必须跳过，不得整批失败（docs/07 §3.4 风险 2）
 */
import { describe, expect, it } from 'vitest'
import {
  parseAugmentRanks,
  parseHeroRanks,
  parsePairSynergies,
} from '../src/main/sources/qq101-packed.js'

describe('parseAugmentRanks', () => {
  it('解析合法记录', () => {
    const r = parseAugmentRanks('1007_255_0.4463_7_0_0.5854_11_-1_202,104,51')
    expect(r.total).toBe(1)
    expect(r.skipped).toBe(0)
    const entry = r.parsed[0]
    expect(entry).toBeDefined()
    expect(entry?.augmentId).toBe(1007)
    expect(entry?.winRank).toBe(11)
    expect(entry?.bestChampionIds).toEqual([202, 104, 51])
  })

  it('跳过关键字段缺失的记录，不影响其他记录', () => {
    const r = parseAugmentRanks(
      'bad_record#1001_255_0.1_1_0_0.5_1_0_1,2#_#1002_255_0.2_2_0_0.6_2_0_3',
    )
    expect(r.total).toBe(4)
    expect(r.parsed).toHaveLength(2)
    expect(r.skipped).toBe(2)
    expect(r.parsed.map((e) => e.augmentId)).toEqual([1001, 1002])
  })

  it('空输入返回空结果，不抛错', () => {
    expect(parseAugmentRanks(undefined).parsed).toEqual([])
    expect(parseAugmentRanks('').parsed).toEqual([])
    expect(parseAugmentRanks('   ').parsed).toEqual([])
  })

  it('排名变化字段支持中文"未变化"', () => {
    const r = parseAugmentRanks('1001_255_0.1_1_未变化_0.5_1_未变化_1')
    expect(r.parsed[0]?.pickRankChange).toBe(0)
    expect(r.parsed[0]?.winRankChange).toBe(0)
  })
})

describe('parseHeroRanks', () => {
  it('解析 11 段结构，含搭档与最弱符文', () => {
    const raw =
      '17_1_未变化_0.5443_0.1368_157,0.0506,0.6327,1&11,0.0446,0.6221,2_251.9416_0.6223_0.1843_0.1368_1373,3086,1068'
    const r = parseHeroRanks(raw)
    expect(r.parsed).toHaveLength(1)
    const h = r.parsed[0]
    expect(h?.championId).toBe(17)
    expect(h?.bestPartners).toHaveLength(2)
    expect(h?.bestPartners[0]?.championId).toBe(157)
    expect(h?.lowestRankAugmentIds).toEqual([1373, 3086, 1068])
    expect(h?.averageDeathTimeSeconds).toBeCloseTo(251.9416)
    expect(h?.killParticipationRate).toBeCloseTo(0.6223)
  })

  it('搭档段畸形时跳过该搭档，保留整条记录', () => {
    // 注意：字段分隔符是 '_'，所以畸形内容不能含 '_'，否则整条记录会被切乱（那是格式固有特性）
    const raw = '17_1_未变化_0.5_0.1_abc,0.05,0.63,1&157,0.05,0.63,1_10_0.5_0.2_0.1_1,2'
    const r = parseHeroRanks(raw)
    expect(r.parsed).toHaveLength(1)
    expect(r.parsed[0]?.bestPartners).toHaveLength(1)
    expect(r.parsed[0]?.bestPartners[0]?.championId).toBe(157)
  })
})

describe('parsePairSynergies', () => {
  it('解析双人组合', () => {
    const raw = '157;17|assassin,fighter;mage,marksman|0.6419|0.0189|1#bad'
    const r = parsePairSynergies(raw)
    expect(r.parsed).toHaveLength(1)
    const p = r.parsed[0]
    expect(p?.championIdA).toBe(157)
    expect(p?.championIdB).toBe(17)
    expect(p?.rolesA).toEqual(['assassin', 'fighter'])
    expect(p?.rolesB).toEqual(['mage', 'marksman'])
    expect(p?.winRate).toBeCloseTo(0.6419)
    expect(r.skipped).toBe(1)
  })
})
