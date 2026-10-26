/**
 * 状态机：唯一真相。
 *
 * 硬规则（docs/10 §6）：
 *  - 纯函数：不碰 IO、不碰时间、不碰随机数，同输入必同输出
 *  - 七态转移表是规格，写进测试
 *  - renderer 只能渲染当前 state，不能自己跳（禁止"自由导航"）
 *
 * 转移表出处：docs/10 §6 / docs/01 §3.2
 */
import { STATE, type State } from '@shared/enums'

// ── gameflow-phase 取值（docs/07 §2.2）────────────────────
export const GAMEFLOW_PHASE = {
  none: 'None',
  lobby: 'Lobby',
  matchmaking: 'Matchmaking',
  readyCheck: 'ReadyCheck',
  champSelect: 'ChampSelect',
  inProgress: 'InProgress',
  waitingForStats: 'WaitingForStats',
  preEndOfGame: 'PreEndOfGame',
  endOfGame: 'EndOfGame',
  terminatedInError: 'TerminatedInError',
} as const

export type GameflowPhase = (typeof GAMEFLOW_PHASE)[keyof typeof GAMEFLOW_PHASE]

/** 事件来源：LCU gameflow 推送、Live Client 探测、内部流程 */
export type StateEvent =
  | { readonly type: 'client/connected' }
  | { readonly type: 'client/disconnected' }
  | { readonly type: 'gameflow/phase'; readonly phase: GameflowPhase }
  | { readonly type: 'gameflow/session'; readonly gameId: number }
  | { readonly type: 'live/fields-missing' }
  | { readonly type: 'live/fields-ok' }
  | { readonly type: 'eog/ready'; readonly gameId: number }
  | { readonly type: 'eog/exhausted' }
  | { readonly type: 'report/next-game' }
  | { readonly type: 'report/abandon' }

export interface MachineState {
  readonly state: State
  /** EOG 重试次数，进 S4 时清零 */
  readonly retryCount: number
  /** 当前对局 ID，用于 gameId 校验 */
  readonly currentGameId: number | null
  /** 报告是否数据不全 */
  readonly degraded: boolean
}

export const initialMachineState: MachineState = {
  state: STATE.offline,
  retryCount: 0,
  currentGameId: null,
  degraded: false,
}

/** gameflow-phase → 状态映射（docs/07 §2.2） */
function stateFromPhase(phase: GameflowPhase): State {
  switch (phase) {
    case GAMEFLOW_PHASE.none:
    case GAMEFLOW_PHASE.lobby:
    case GAMEFLOW_PHASE.matchmaking:
    case GAMEFLOW_PHASE.readyCheck:
      return STATE.clientIdle
    case GAMEFLOW_PHASE.champSelect:
      return STATE.champSelect
    case GAMEFLOW_PHASE.inProgress:
      return STATE.inGame
    case GAMEFLOW_PHASE.waitingForStats:
    case GAMEFLOW_PHASE.preEndOfGame:
    case GAMEFLOW_PHASE.endOfGame:
      return STATE.building
    case GAMEFLOW_PHASE.terminatedInError:
      return STATE.clientIdle
  }
}

function withState(prev: MachineState, state: State): MachineState {
  return { ...prev, state }
}

/**
 * 纯 reducer。非法转移**不抛错**，保持原状态并记 degraded=false 不变。
 * 理由：真实世界里 LCU 会推送乱序事件，抛错会导致整个流程崩掉。
 */
export function reduce(prev: MachineState, ev: StateEvent): MachineState {
  // 鲁棒性：真实世界里 LCU 会推送乱序/畸形事件，绝不能抛错或返回 undefined
  if (prev === undefined || prev === null || typeof ev !== 'object' || ev === null) {
    return prev ?? initialMachineState
  }

  const s = prev.state

  // ── 进程消失：任意状态 → OFFLINE（docs/10 §6）─────────
  if (ev.type === 'client/disconnected') {
    return {
      state: STATE.offline,
      retryCount: 0,
      currentGameId: null,
      degraded: false,
    }
  }

  switch (ev.type) {
    case 'client/connected':
      // OFFLINE → CLIENT_IDLE。已连接时重复事件无副作用
      return s === STATE.offline ? withState(prev, STATE.clientIdle) : prev

    case 'gameflow/phase': {
      // 进程未连接时忽略一切 gameflow 事件
      if (s === STATE.offline) return prev

      const next = stateFromPhase(ev.phase)

      // 从对局中进入结算：清零重试、记录 gameId 来源
      if (next === STATE.building && (s === STATE.inGame || s === STATE.inGameDegraded)) {
        return { ...prev, state: STATE.building, retryCount: 0, degraded: false }
      }

      // 秒退 / 异常终止：CHAMP_SELECT → CLIENT_IDLE，不产生记录
      if (s === STATE.champSelect && next === STATE.clientIdle) {
        return { ...prev, state: STATE.clientIdle, currentGameId: null, degraded: false }
      }

      // REPORT 期间收到新对局的 gameflow → 回到对应状态
      if (s === STATE.report && next !== STATE.building) {
        return {
          state: next,
          retryCount: 0,
          currentGameId: null,
          degraded: false,
        }
      }

      // 同状态重复推送：无副作用
      if (next === s) return prev

      // 其他合法推进
      return { ...prev, state: next }
    }

    case 'gameflow/session':
      return { ...prev, currentGameId: ev.gameId }

    case 'live/fields-missing':
      // S3 → S3b。**不是异常**（docs/01 §3.1）
      return s === STATE.inGame ? withState(prev, STATE.inGameDegraded) : prev

    case 'live/fields-ok':
      return s === STATE.inGameDegraded ? withState(prev, STATE.inGame) : prev

    case 'eog/ready':
      // BUILDING → REPORT，且 gameId 必须匹配（docs/01 §3.2 规则 3）
      if (s !== STATE.building) return prev
      if (prev.currentGameId !== null && ev.gameId !== prev.currentGameId) {
        // gameId 不匹配 = 还是上一局的数据，保持 BUILDING
        return { ...prev, retryCount: prev.retryCount + 1 }
      }
      return {
        ...prev,
        state: STATE.report,
        currentGameId: ev.gameId,
        degraded: false,
      }

    case 'eog/exhausted':
      // 重试耗尽 → 仍进 REPORT，但标记数据不全
      return s === STATE.building
        ? { ...prev, state: STATE.report, degraded: true }
        : prev

    case 'report/next-game':
    case 'report/abandon':
      return s === STATE.report
        ? {
            state: STATE.clientIdle,
            retryCount: 0,
            currentGameId: null,
            degraded: false,
          }
        : prev

    default:
      // 未知事件类型：保持原状态。禁止抛错（见上方鲁棒性说明）
      return prev
  }
}

/** 由 gameflow session 事件携带 gameId，见 reduce 的 'gameflow/session' 分支 */
export function gameIdEvent(gameId: number): StateEvent {
  return { type: 'gameflow/session', gameId }
}

/** S4 延迟显示判定（docs/01 F-18：1200ms 内完成的局跳过 S4） */
export const BUILDING_DISPLAY_DELAY_MS = 1200

/** EOG 最大重试次数（docs/01 §3.2 规则 3） */
export const EOG_MAX_RETRY = 12

/** 是否允许渲染该状态 */
export function canRender(state: State): boolean {
  return state !== STATE.offline || true // 所有状态都可渲染，OFFLINE 也有自己的屏
}
