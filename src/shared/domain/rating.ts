/**
 * 评分结果领域模型。
 * 规范：reasons 里的每个数字必须能追溯到输入（docs/10 §8）
 */
import { z } from 'zod'
import { PERSONA, type PersonaKey } from '../enums.js'

export const AxesSchema = z.object({
  /** 0-100 */
  carry: z.number(),
  team: z.number(),
  risk: z.number(),
})
export type Axes = z.infer<typeof AxesSchema>

/** 白给阵亡：必须能追溯到具体时刻与坐标（docs/07 §5.1） */
export const FeedDeathSchema = z.object({
  /** 毫秒 */
  atMs: z.number().int(),
  position: z.object({ x: z.number(), y: z.number() }),
  /** 命中的判定条件，用于生成文案 */
  reasons: z.array(z.string()),
  /** 0-1，多条命中则更高 */
  weight: z.number(),
})
export type FeedDeath = z.infer<typeof FeedDeathSchema>

export const PersonaTagSchema = z.object({
  key: z.string(),
  /** 主标签 */
  primary: z.enum([
    PERSONA.crime,
    PERSONA.crimeSoft,
    PERSONA.carry,
    PERSONA.try,
    PERSONA.solid,
    PERSONA.solidPlus,
    PERSONA.invisible,
    PERSONA.passive,
    PERSONA.tool,
    PERSONA.tank,
    PERSONA.lonewolf,
    PERSONA.pending,
  ] as [PersonaKey, ...PersonaKey[]]),
  /** 副标签，最多 1 个 */
  sub: z.string().nullable(),
})
export type PersonaTag = z.infer<typeof PersonaTagSchema>

/** 可查证理由：每个 reason 都必须带数字来源 */
export const ReasonSchema = z.object({
  /** 机器可读的模板 key，如 'reason.feed-deaths' */
  key: z.string(),
  /** 模板里的插值，renderer 用它渲染 */
  vars: z.record(z.string(), z.union([z.string(), z.number()])),
})
export type Reason = z.infer<typeof ReasonSchema>

export const PlayerReportSchema = z.object({
  participantId: z.number().int(),
  puuid: z.string(),
  championId: z.number().int(),
  isSelf: z.boolean(),
  axes: AxesSchema,
  feedDeaths: z.array(FeedDeathSchema),
  buildScore: z.number().nullable(),
  persona: PersonaTagSchema,
  reasons: z.array(ReasonSchema),
  /** 0-1，低于 0.6 时人设降级为 pending */
  confidence: z.number(),
})
export type PlayerReport = z.infer<typeof PlayerReportSchema>

export const TimelineEntrySchema = z.object({
  atMs: z.number().int(),
  kind: z.enum(['kill', 'death', 'objective', 'throw']),
  text: z.string(),
  /** 是否为负面转折（对应 03 文档的 ▌ 标记） */
  negative: z.boolean(),
})
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>

export const ReportSchema = z.object({
  gameId: z.number().int(),
  queueId: z.number().int(),
  gameMode: z.string(),
  durationSec: z.number().int(),
  /** 胜负：本方视角 */
  win: z.boolean(),
  /** 全队合计 */
  teamKills: z.number().int(),
  teamDeaths: z.number().int(),
  teamAssists: z.number().int(),
  players: z.array(PlayerReportSchema),
  timeline: z.array(TimelineEntrySchema),
  verdict: z.object({
    best: z.string().nullable(),
    worst: z.string().nullable(),
    passive: z.string().nullable(),
  }),
  /** 数据不全时为 false（对应 S5 的 degraded 标记） */
  complete: z.boolean(),
})
export type Report = z.infer<typeof ReportSchema>

/** 报告列表项（S1 历史用） */
export const ReportSummarySchema = z.object({
  gameId: z.number().int(),
  win: z.boolean(),
  durationSec: z.number().int(),
  playedAt: z.number().int(),
  championId: z.number().int(),
  kda: z.object({ k: z.number().int(), d: z.number().int(), a: z.number().int() }),
  score: z.number(),
  personaKey: z.string(),
})
export type ReportSummary = z.infer<typeof ReportSummarySchema>
