/**
 * 对局中实时数据（S3）。
 * 来源：Live Client Data API（2999）。
 * 硬约束（docs/03 §3）：**接口不给其他玩家当前血量**，所以不建模血量字段。
 */
import { z } from 'zod'

export const LivePlayerSchema = z.object({
  participantId: z.number().int(),
  summonerName: z.string(),
  championName: z.string(),
  championId: z.number().int().nullable(),
  team: z.enum(['ORDER', 'CHAOS']),
  level: z.number().int(),
  isDead: z.boolean(),
  /** 秒。存活时为 0 */
  respawnTimer: z.number(),
  kills: z.number().int(),
  deaths: z.number().int(),
  assists: z.number().int(),
  creepScore: z.number().int(),
  wardScore: z.number(),
  /** 6+1 件装备，未购为 0 */
  items: z.array(z.number().int()),
  /**
   * 对局中拿不到实时符文选择（docs/03 §3）。
   * 只知道"解锁了几个槽"，由 level 推算。
   */
  unlockedAugmentSlots: z.number().int(),
  /** 已解锁但未揭晓的槽位内容，赛后补全 */
  knownAugmentIds: z.array(z.number().int()),
})
export type LivePlayer = z.infer<typeof LivePlayerSchema>

export const LiveEventSchema = z.object({
  atMs: z.number().int(),
  kind: z.enum(['kill', 'death', 'objective', 'firstblood']),
  killerName: z.string().nullable(),
  victimName: z.string().nullable(),
  text: z.string(),
})
export type LiveEvent = z.infer<typeof LiveEventSchema>

/**
 * 对局中 tick。注意 **金币差是装备价值差代理**：
 * 接口不给实时金币，只能用 items.json 售价求和（docs/03 §3）
 */
export const LiveTickSchema = z.object({
  atMs: z.number().int(),
  gameClockSec: z.number(),
  players: z.array(LivePlayerSchema),
  events: z.array(LiveEventSchema),
  teamKills: z.object({ order: z.number().int(), chaos: z.number().int() }),
  towers: z.object({ order: z.number().int(), chaos: z.number().int() }),
  /** 装备价值差（我方 - 敌方），单位金币 */
  itemValueDiff: z.number(),
  /** 敌方数据是否可用 */
  enemyDataAvailable: z.boolean(),
  /** 当前是否在团战中（由 3 秒内击杀数推断） */
  inTeamfight: z.boolean(),
})
export type LiveTick = z.infer<typeof LiveTickSchema>

/** 由 level 推算符文槽解锁数：3/7/11/15 级各解锁一个 */
export function unlockedSlots(level: number): number {
  if (level >= 15) return 4
  if (level >= 11) return 3
  if (level >= 7) return 2
  if (level >= 3) return 1
  return 0
}
