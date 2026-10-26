/**
 * 状态机转移表测试。
 * 这里的每条用例对应 docs/10 §6 的一行转移规则，改规格必须同步改测试。
 */
import { describe, expect, it } from 'vitest'
import {
  GAMEFLOW_PHASE,
  initialMachineState,
  reduce,
  gameIdEvent,
  type MachineState,
  type StateEvent,
} from '../src/main/core/state-machine.js'
import { STATE } from '../src/shared/enums.js'

function run(...events: StateEvent[]): MachineState {
  return events.reduce(reduce, initialMachineState)
}

describe('进程生命周期', () => {
  it('初始态是 OFFLINE', () => {
    expect(initialMachineState.state).toBe(STATE.offline)
  })

  it('OFFLINE → 连接 → CLIENT_IDLE', () => {
    expect(run({ type: 'client/connected' }).state).toBe(STATE.clientIdle)
  })

  it('任意状态 → 进程消失 → OFFLINE，且清空上下文', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
      gameIdEvent(123),
      { type: 'client/disconnected' },
    )
    expect(s.state).toBe(STATE.offline)
    expect(s.currentGameId).toBeNull()
    expect(s.retryCount).toBe(0)
    expect(s.degraded).toBe(false)
  })

  it('OFFLINE 时忽略 gameflow 事件', () => {
    const s = run({ type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress })
    expect(s.state).toBe(STATE.offline)
  })
})

describe('gameflow 推进', () => {
  it('None / Lobby / Matchmaking / ReadyCheck 都停在 CLIENT_IDLE', () => {
    for (const phase of [
      GAMEFLOW_PHASE.none,
      GAMEFLOW_PHASE.lobby,
      GAMEFLOW_PHASE.matchmaking,
      GAMEFLOW_PHASE.readyCheck,
    ]) {
      const s = run({ type: 'client/connected' }, { type: 'gameflow/phase', phase })
      expect(s.state).toBe(STATE.clientIdle)
    }
  })

  it('ChampSelect → CHAMP_SELECT', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.champSelect },
    )
    expect(s.state).toBe(STATE.champSelect)
  })

  it('InProgress → IN_GAME', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
    )
    expect(s.state).toBe(STATE.inGame)
  })

  it('秒退：CHAMP_SELECT → None → CLIENT_IDLE，不产生记录', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.champSelect },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.none },
    )
    expect(s.state).toBe(STATE.clientIdle)
    expect(s.currentGameId).toBeNull()
  })

  it('TerminatedInError → CLIENT_IDLE', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.terminatedInError },
    )
    expect(s.state).toBe(STATE.clientIdle)
  })

  it('同状态重复推送无副作用', () => {
    const a = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
    )
    const b = reduce(a, { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress })
    expect(b).toBe(a) // 同引用 = 未产生新对象
  })
})

describe('S3b 敌方数据受限（不是异常）', () => {
  it('IN_GAME → 字段缺失 → IN_GAME_DEGRADED', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
      { type: 'live/fields-missing' },
    )
    expect(s.state).toBe(STATE.inGameDegraded)
  })

  it('字段恢复 → 回 IN_GAME', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
      { type: 'live/fields-missing' },
      { type: 'live/fields-ok' },
    )
    expect(s.state).toBe(STATE.inGame)
  })

  it('DEGRADED 时再收 gameflow → BUILDING', () => {
    const s = run(
      { type: 'client/connected' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
      { type: 'live/fields-missing' },
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.waitingForStats },
    )
    expect(s.state).toBe(STATE.building)
    expect(s.retryCount).toBe(0)
  })

  it('非 IN_GAME 时的字段事件被忽略', () => {
    const s = run({ type: 'client/connected' }, { type: 'live/fields-missing' })
    expect(s.state).toBe(STATE.clientIdle)
  })
})

describe('S4 → S5 结算', () => {
  const inBuilding: StateEvent[] = [
    { type: 'client/connected' },
    { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
    { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.waitingForStats },
  ]

  it('gameId 匹配 → REPORT', () => {
    const base = run(...inBuilding, gameIdEvent(9021))
    const s = reduce(base, { type: 'eog/ready', gameId: 9021 })
    expect(s.state).toBe(STATE.report)
    expect(s.degraded).toBe(false)
  })

  it('gameId 不匹配 = 还是上一局 → 保持 BUILDING 并累加重试', () => {
    const base = run(...inBuilding, gameIdEvent(9021))
    const s = reduce(base, { type: 'eog/ready', gameId: 9020 })
    expect(s.state).toBe(STATE.building)
    expect(s.retryCount).toBe(1)
  })

  it('重试耗尽 → REPORT 且标记数据不全', () => {
    const s = run(...inBuilding, { type: 'eog/exhausted' })
    expect(s.state).toBe(STATE.report)
    expect(s.degraded).toBe(true)
  })

  it('非 BUILDING 时的 eog 事件被忽略', () => {
    const s = run({ type: 'client/connected' }, { type: 'eog/ready', gameId: 1 })
    expect(s.state).toBe(STATE.clientIdle)
  })
})

describe('REPORT 结束', () => {
  const inReport: StateEvent[] = [
    { type: 'client/connected' },
    { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress },
    { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.waitingForStats },
    { type: 'eog/ready', gameId: 1 },
  ]

  it('开下一局 → CLIENT_IDLE，上下文清空', () => {
    const s = run(...inReport, { type: 'report/next-game' })
    expect(s.state).toBe(STATE.clientIdle)
    expect(s.currentGameId).toBeNull()
  })

  it('放弃报告 → CLIENT_IDLE', () => {
    const s = run(...inReport, { type: 'report/abandon' })
    expect(s.state).toBe(STATE.clientIdle)
  })

  it('REPORT 期间新对局 → 进入对应状态', () => {
    const s = run(...inReport, {
      type: 'gameflow/phase',
      phase: GAMEFLOW_PHASE.inProgress,
    })
    expect(s.state).toBe(STATE.inGame)
  })
})

describe('鲁棒性', () => {
  it('非法转移不抛错，保持原状态', () => {
    const s = run({ type: 'client/connected' }, { type: 'eog/ready', gameId: 1 })
    expect(s.state).toBe(STATE.clientIdle)
    expect(() => reduce(s, { type: 'live/fields-ok' })).not.toThrow()
    expect(() => reduce(initialMachineState, { type: 'report/next-game' })).not.toThrow()
  })
})
