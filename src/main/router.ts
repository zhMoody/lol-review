/**
 * tRPC 路由：唯一的 IPC 出入口。
 * 规范（docs/10 §5）：
 *  - 所有 query/mutation 必须有超时
 *  - 凭证不进任何响应
 *  - error.code 是稳定枚举，renderer 靠它决定文案
 *
 * P1-2 阶段用 fixtures 造数据，接口形状即最终契约。
 */
import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ERROR_CODE, AppError } from '@shared/errors'
import { MatchSchema } from '@shared/domain/match'
import { GameTimelineSchema, killEvents, flattenEvents } from '@shared/domain/timeline'
import { reduce, initialMachineState, gameIdEvent, type MachineState, type StateEvent } from './core/state-machine.js'
import type { Report, ReportSummary, PlayerReport, TimelineEntry } from '@shared/domain/rating'
import type { LiveTick, LivePlayer } from '@shared/domain/live'

const t = initTRPC.create()

// ── fixtures 加载 ─────────────────────────────────────────
const FIXTURES = resolve(import.meta.dirname, '../../fixtures')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

const matchRaw = readJson<unknown>(resolve(FIXTURES, 'tencent-hn10/q_2400.json'))
const timelineRaw = readJson<unknown>(resolve(FIXTURES, 'tencent-hn10/timeline-q_2400.json'))

const match = MatchSchema.parse(matchRaw)
const timeline = GameTimelineSchema.parse(timelineRaw)

// ── 状态机实例（P1-2 阶段放内存）────────────────────────
let machine: MachineState = initialMachineState

function dispatch(ev: StateEvent): MachineState {
  machine = reduce(machine, ev)
  return machine
}

// ── 报告生成（简化版，完整版在 P1-4）──────────────────────
function buildReport(): Report {
  const participants = match.participants
  const self = participants[0]
  if (self === undefined) {
    throw new AppError({
      code: ERROR_CODE.fieldMissing,
      message: 'fixtures 里没有参与者',
      recoverable: false,
    })
  }

  const totalDamage = participants.reduce(
    (sum, p) => sum + p.stats.totalDamageDealtToChampions,
    0,
  )
  const teamKills = participants
    .filter((p) => p.teamId === self.teamId)
    .reduce((sum, p) => sum + p.stats.kills, 0)

  const players: PlayerReport[] = participants.map((p) => {
    const dmgShare =
      totalDamage > 0 ? p.stats.totalDamageDealtToChampions / totalDamage : 0
    const carry = Math.round(Math.min(100, dmgShare * 300))
    const team = Math.round(Math.min(100, (p.stats.timeCCingOthers / 60) * 100))
    const risk = Math.round(Math.min(100, (p.stats.deaths / 15) * 100))

    return {
      participantId: p.participantId,
      puuid: `fixture-${p.participantId}`,
      championId: p.championId,
      isSelf: p.participantId === self.participantId,
      axes: { carry, team, risk },
      feedDeaths: [],
      buildScore: null,
      persona: {
        key: risk >= 70 ? 'persona.crime' : carry >= 70 ? 'persona.carry' : 'persona.solid',
        primary:
          risk >= 70 ? 'persona.crime' : carry >= 70 ? 'persona.carry' : 'persona.solid',
        sub: null,
      },
      reasons: [],
      confidence: 1,
    }
  })

  const events = flattenEvents(timeline)
  const entries: TimelineEntry[] = events.slice(0, 12).map((e) => ({
    atMs: e.timestamp,
    kind: e.victimId > 0 ? 'death' : 'objective',
    text: e.victimId > 0 ? `参与者 ${e.victimId} 阵亡` : `建筑事件`,
    negative: e.victimId === self.participantId,
  }))

  return {
    gameId: match.gameId,
    queueId: match.queueId,
    gameMode: match.gameMode,
    durationSec: match.gameDuration,
    win: self.stats.win,
    teamKills,
    teamDeaths: participants
      .filter((p) => p.teamId === self.teamId)
      .reduce((s, p) => s + p.stats.deaths, 0),
    teamAssists: participants
      .filter((p) => p.teamId === self.teamId)
      .reduce((s, p) => s + p.stats.assists, 0),
    players,
    timeline: entries,
    verdict: {
      best: players[0]?.puuid ?? null,
      worst: players[players.length - 1]?.puuid ?? null,
      passive: null,
    },
    complete: true,
  }
}

function buildSummaries(): ReportSummary[] {
  const self = match.participants[0]
  if (self === undefined) return []
  return [
    {
      gameId: match.gameId,
      win: self.stats.win,
      durationSec: match.gameDuration,
      playedAt: match.gameCreation,
      championId: self.championId,
      kda: { k: self.stats.kills, d: self.stats.deaths, a: self.stats.assists },
      score: 73,
      personaKey: 'persona.try',
    },
  ]
}

function buildLiveTick(): LiveTick {
  const players: LivePlayer[] = match.participants.map((p) => ({
    participantId: p.participantId,
    summonerName: `玩家${p.participantId}`,
    championName: `Champion${p.championId}`,
    championId: p.championId,
    team: p.teamId === 100 ? 'ORDER' : 'CHAOS',
    level: p.stats.champLevel,
    isDead: p.stats.deaths > 0 && p.participantId % 3 === 0,
    respawnTimer: p.participantId % 3 === 0 ? 8 : 0,
    kills: p.stats.kills,
    deaths: p.stats.deaths,
    assists: p.stats.assists,
    creepScore: p.stats.totalMinionsKilled,
    wardScore: p.stats.visionScore,
    items: [p.stats.item0, p.stats.item1, p.stats.item2, p.stats.item3, p.stats.item4, p.stats.item5],
    unlockedAugmentSlots: 3,
    knownAugmentIds: [p.stats.playerAugment1, p.stats.playerAugment2, p.stats.playerAugment3].filter(
      (n) => n > 0,
    ),
  }))

  return {
    atMs: 0,
    gameClockSec: 763,
    players,
    events: killEvents(timeline)
      .slice(-3)
      .map((e) => ({
        atMs: e.timestamp,
        kind: 'death' as const,
        killerName: `玩家${e.killerId}`,
        victimName: `玩家${e.victimId}`,
        text: `玩家${e.victimId} 阵亡`,
      })),
    teamKills: { order: 18, chaos: 12 },
    towers: { order: 1, chaos: 0 },
    itemValueDiff: 2400,
    enemyDataAvailable: true,
    inTeamfight: false,
  }
}

// ── 路由 ─────────────────────────────────────────────────
export const appRouter = t.router({
  league: t.router({
    getState: t.procedure.query(() => machine),
    rescan: t.procedure.mutation(() => {
      return dispatch({ type: 'client/connected' })
    }),
    /** 供开发调试：手动推事件 */
    dispatch: t.procedure
      .input(z.object({ type: z.string(), phase: z.string().optional(), gameId: z.number().optional() }))
      .mutation(({ input }) => {
        const ev = { ...input } as unknown as StateEvent
        return dispatch(ev)
      }),
    /** 建立当前对局上下文（gameId 校验用） */
    bindGame: t.procedure.input(z.object({ gameId: z.number().int() })).mutation(({ input }) => {
      return dispatch(gameIdEvent(input.gameId))
    }),
  }),

  report: t.router({
    current: t.procedure.query((): Report => buildReport()),
    list: t.procedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
      .query(({ input }): ReportSummary[] => {
        const all = buildSummaries()
        return all.slice(0, input?.limit ?? 20)
      }),
  }),

  live: t.router({
    tick: t.procedure.query((): LiveTick => buildLiveTick()),
  }),

  settings: t.router({
    get: t.procedure.query(() => ({
      viewMode: 'main' as 'main' | 'bar' | 'overlay',
      overlayEnabled: false,
      sortMode: 'risk' as 'risk' | 'total',
      historyRetention: 20,
      beautyMode: false,
    })),
    update: t.procedure
      .input(
        z.object({
          viewMode: z.enum(['main', 'bar', 'overlay']).optional(),
          overlayEnabled: z.boolean().optional(),
          sortMode: z.enum(['risk', 'total']).optional(),
          beautyMode: z.boolean().optional(),
        }),
      )
      .mutation(({ input }) => input),
  }),
})

export type AppRouter = typeof appRouter

/** 供 renderer 在无 Electron 环境下直接调用（P1-2 开发态） */
export function createCaller() {
  return appRouter.createCaller({})
}
