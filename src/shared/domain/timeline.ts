/**
 * 时间线领域模型。
 * 出处：fixtures/tencent-hn10/timeline-q_2400.json
 * 用途：白给阵亡归因（docs/07 §5）、罪状清单、死亡位置图
 */
import { z } from 'zod'

export const PositionSchema = z.object({ x: z.number(), y: z.number() })
export type Position = z.infer<typeof PositionSchema>

export const TimelineEventSchema = z.object({
  type: z.string(),
  timestamp: z.number().int(),
  killerId: z.number().int(),
  victimId: z.number().int(),
  assistingParticipantIds: z.array(z.number().int()),
  position: PositionSchema,
  teamId: z.number().int(),
  /** BUILDING_KILL 专用 */
  buildingType: z.string().optional(),
  laneType: z.string().optional(),
  monsterType: z.string().optional(),
  skillSlot: z.number().int().optional(),
})
export type TimelineEvent = z.infer<typeof TimelineEventSchema>

export const ParticipantFrameSchema = z.object({
  participantId: z.number().int(),
  level: z.number().int(),
  currentGold: z.number(),
  totalGold: z.number(),
  xp: z.number(),
  minionsKilled: z.number().int(),
  jungleMinionsKilled: z.number().int(),
  position: PositionSchema.optional(),
})
export type ParticipantFrame = z.infer<typeof ParticipantFrameSchema>

export const TimelineFrameSchema = z.object({
  timestamp: z.number().int(),
  events: z.array(TimelineEventSchema),
  participantFrames: z.record(z.string(), ParticipantFrameSchema),
})
export type TimelineFrame = z.infer<typeof TimelineFrameSchema>

export const GameTimelineSchema = z.object({
  frames: z.array(TimelineFrameSchema),
})
export type GameTimeline = z.infer<typeof GameTimelineSchema>

/** 事件类型常量（接口原值） */
export const EVENT_TYPE = {
  championKill: 'CHAMPION_KILL',
  buildingKill: 'BUILDING_KILL',
} as const

export type EventTypeName = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE]

/** 展平所有事件，按时间升序 */
export function flattenEvents(timeline: GameTimeline): TimelineEvent[] {
  return timeline.frames
    .flatMap((f) => f.events)
    .sort((a, b) => a.timestamp - b.timestamp)
}

/** 取所有击杀事件 */
export function killEvents(timeline: GameTimeline): TimelineEvent[] {
  return flattenEvents(timeline).filter((e) => e.type === EVENT_TYPE.championKill)
}

/** 取某个玩家的死亡时刻（ms） */
export function deathTimestamps(timeline: GameTimeline, participantId: number): number[] {
  return killEvents(timeline)
    .filter((e) => e.victimId === participantId)
    .map((e) => e.timestamp)
}
