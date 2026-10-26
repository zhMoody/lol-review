/**
 * 对局领域模型。字段名与 LCU `/lol-match-history/v1/games/{gameId}` 保持一致。
 * 出处：fixtures/tencent-hn10/q_2400.json（docs/10 §0.1：domain 不为了好看改名）
 */
import { z } from 'zod'

/** 一局玩家的关键统计（只留我们用得到的，其余不建模） */
export const MatchStatsSchema = z.object({
  participantId: z.number().int(),
  win: z.boolean(),
  champLevel: z.number().int(),
  kills: z.number().int(),
  deaths: z.number().int(),
  assists: z.number().int(),
  totalDamageDealtToChampions: z.number(),
  totalDamageTaken: z.number(),
  damageSelfMitigated: z.number(),
  totalHeal: z.number(),
  totalUnitsHealed: z.number(),
  timeCCingOthers: z.number(),
  totalTimeCrowdControlDealt: z.number(),
  goldEarned: z.number(),
  goldSpent: z.number(),
  totalMinionsKilled: z.number().int(),
  neutralMinionsKilled: z.number().int(),
  visionScore: z.number(),
  wardsPlaced: z.number().int(),
  wardsKilled: z.number().int(),
  turretKills: z.number().int(),
  inhibitorKills: z.number().int(),
  damageDealtToTurrets: z.number(),
  damageDealtToObjectives: z.number(),
  longestTimeSpentLiving: z.number().int(),
  largestKillingSpree: z.number().int(),
  largestMultiKill: z.number().int(),
  doubleKills: z.number().int(),
  tripleKills: z.number().int(),
  quadraKills: z.number().int(),
  pentaKills: z.number().int(),
  killingSprees: z.number().int(),
  item0: z.number().int(),
  item1: z.number().int(),
  item2: z.number().int(),
  item3: z.number().int(),
  item4: z.number().int(),
  item5: z.number().int(),
  item6: z.number().int(),
  /**
   * 实测：只用 1..4，5/6 恒为 0（docs/07 §3.2）
   */
  playerAugment1: z.number().int(),
  playerAugment2: z.number().int(),
  playerAugment3: z.number().int(),
  playerAugment4: z.number().int(),
  playerAugment5: z.number().int(),
  playerAugment6: z.number().int(),
})
export type MatchStats = z.infer<typeof MatchStatsSchema>

export const MatchParticipantSchema = z.object({
  participantId: z.number().int(),
  teamId: z.number().int(),
  championId: z.number().int(),
  spell1Id: z.number().int(),
  spell2Id: z.number().int(),
  stats: MatchStatsSchema,
})
export type MatchParticipant = z.infer<typeof MatchParticipantSchema>

export const MatchTeamSchema = z.object({
  teamId: z.number().int(),
  win: z.string(),
  towerKills: z.number().int(),
  inhibitorKills: z.number().int(),
  baronKills: z.number().int(),
  dragonKills: z.number().int(),
  riftHeraldKills: z.number().int(),
  firstBlood: z.boolean(),
})
export type MatchTeam = z.infer<typeof MatchTeamSchema>

export const MatchSchema = z.object({
  gameId: z.number().int(),
  gameMode: z.string(),
  gameType: z.string(),
  gameVersion: z.string(),
  mapId: z.number().int(),
  queueId: z.number().int(),
  gameDuration: z.number().int(),
  gameCreation: z.number().int(),
  platformId: z.string(),
  participants: z.array(MatchParticipantSchema),
  teams: z.array(MatchTeamSchema),
})
export type Match = z.infer<typeof MatchSchema>

/**
 * 从 LCU 响应裁出我们关心的字段。
 * 注意：LCU 的 participants 只有 8 个顶层字段，stats 才是全量。
 */
export function normalizeMatch(raw: unknown): Match {
  return MatchSchema.parse(raw)
}

/** 按 participantId 取玩家 */
export function findParticipant(match: Match, participantId: number): MatchParticipant | undefined {
  return match.participants.find((p) => p.participantId === participantId)
}

/** 该局是否是海克斯大乱斗（主判定：gameMode） */
export function isTargetMode(match: Pick<Match, 'gameMode' | 'mapId'>): boolean {
  return match.gameMode === 'KIWI'
}
