/**
 * 应用外壳：按状态机切换视图。
 *
 * 硬规则（docs/10 §6）：renderer 只能渲染当前 state，不能自己跳。
 * 这里用真实 reducer 驱动，不写 if/else 散落在组件里。
 */
import { useCallback, useMemo, useReducer, useState } from 'react'
import {
  initialMachineState,
  reduce,
  gameIdEvent,
  GAMEFLOW_PHASE,
  type StateEvent,
} from '../main/core/state-machine.js'
import { STATE, type State } from '../shared/enums.js'
import { TopBar } from './components/TopBar.js'
import { OfflineView } from './views/OfflineView.js'
import { HomeView } from './views/HomeView.js'
import { TeammatesView } from './views/TeammatesView.js'
import { IngameView } from './views/IngameView.js'
import { BuildingView } from './views/BuildingView.js'
import { ReportView } from './views/ReportView.js'
import { personaLabel } from './viewmodels/formatters.js'
import styles from './app.module.css'

const STATE_LABELS: Record<State, string> = {
  [STATE.offline]: '客户端未启动',
  [STATE.clientIdle]: '监听中',
  [STATE.champSelect]: '选人中',
  [STATE.inGame]: '对局中',
  [STATE.inGameDegraded]: '数据受限',
  [STATE.building]: '生成中',
  [STATE.report]: '空闲',
}

const STATE_COLORS: Record<State, string> = {
  [STATE.offline]: 'var(--text-ghost)',
  [STATE.clientIdle]: 'var(--aug-prism)',
  [STATE.champSelect]: 'var(--aug-prism)',
  [STATE.inGame]: 'var(--aug-gold)',
  [STATE.inGameDegraded]: 'var(--danger)',
  [STATE.building]: 'var(--aug-gold)',
  [STATE.report]: 'var(--aug-prism)',
}

const MATCH_LABELS: Record<State, string> = {
  [STATE.offline]: '未连接',
  [STATE.clientIdle]: '第 14 局 · 等待对局',
  [STATE.champSelect]: '第 15 局 · 海克斯大乱斗 · queue 2400',
  [STATE.inGame]: '12:43 · 海克斯大乱斗 · queue 2400',
  [STATE.inGameDegraded]: '12:43 · 海克斯大乱斗 · queue 2400',
  [STATE.building]: '28:41 · 海克斯大乱斗 · queue 2400',
  [STATE.report]: '28:41 · 失败',
}

/** 开发态：手动推事件，用于验收七屏切换 */
const DEV_ACTIONS: Array<{ label: string; events: StateEvent[] }> = [
  { label: '连接客户端', events: [{ type: 'client/connected' }] },
  { label: '进选人', events: [{ type: 'gameflow/phase', phase: GAMEFLOW_PHASE.champSelect }] },
  { label: '进对局', events: [{ type: 'gameflow/phase', phase: GAMEFLOW_PHASE.inProgress }] },
  { label: '敌方受限', events: [{ type: 'live/fields-missing' }] },
  { label: '恢复敌方', events: [{ type: 'live/fields-ok' }] },
  {
    label: '进结算',
    events: [
      gameIdEvent(9021),
      { type: 'gameflow/phase', phase: GAMEFLOW_PHASE.waitingForStats },
    ],
  },
  { label: '出报告', events: [{ type: 'eog/ready', gameId: 9021 }] },
  { label: '回空闲', events: [{ type: 'report/next-game' }] },
  { label: '断开', events: [{ type: 'client/disconnected' }] },
]

/** 开发态：?state=report 直接跳到指定状态，便于截图与验收 */
function seedState(): typeof initialMachineState {
  if (typeof window === 'undefined') return initialMachineState
  const wanted = new URLSearchParams(window.location.search).get('state')
  const map: Partial<Record<string, State>> = {
    offline: STATE.offline,
    idle: STATE.clientIdle,
    teammates: STATE.champSelect,
    ingame: STATE.inGame,
    limited: STATE.inGameDegraded,
    building: STATE.building,
    report: STATE.report,
  }
  const state = wanted === null ? undefined : map[wanted]
  if (state === undefined) return initialMachineState
  return { ...initialMachineState, state, currentGameId: 9021 }
}

export function App() {
  const [machine, dispatch] = useReducer(reduce, initialMachineState, seedState)
  const [beauty, setBeauty] = useState(false)
  const [showDev, setShowDev] = useState(true)

  const run = useCallback((events: StateEvent[]) => {
    for (const ev of events) dispatch(ev)
  }, [])

  const view = useMemo(() => {
    switch (machine.state) {
      case STATE.offline:
        return <OfflineView onRescan={() => run([{ type: 'client/connected' }])} />
      case STATE.clientIdle:
        return <HomeView />
      case STATE.champSelect:
        return <TeammatesView />
      case STATE.inGame:
        return <IngameView degraded={false} />
      case STATE.inGameDegraded:
        return <IngameView degraded={true} />
      case STATE.building:
        return <BuildingView retry={machine.retryCount} />
      case STATE.report:
        return <ReportView beauty={beauty} />
    }
  }, [machine.state, machine.retryCount, beauty, run])

  return (
    <div className={styles.stage}>
      <div className={styles.app}>
        <TopBar
          matchLabel={MATCH_LABELS[machine.state]}
          statusLabel={STATE_LABELS[machine.state]}
          statusColorVar={STATE_COLORS[machine.state]}
          breathing={machine.state !== STATE.offline}
          windowControls={
            typeof window !== 'undefined' && window.api !== undefined
              ? {
                  minimize: () => void window.api.window.minimize(),
                  close: () => void window.api.window.close(),
                }
              : undefined
          }
          extra={
            machine.state === STATE.report ? (
              <button
                type="button"
                className={beauty ? styles.beautyOn : styles.beauty}
                onClick={() => setBeauty((v) => !v)}
                aria-pressed={beauty}
              >
                <span className={styles.sw} aria-hidden="true">
                  <i />
                </span>
                美颜
              </button>
            ) : null
          }
        />

        <div className={styles.content}>{view}</div>

        {showDev ? (
          <div className={styles.devbar}>
            <span className={styles.devlabel}>状态机调试</span>
            {DEV_ACTIONS.map((a) => (
              <button key={a.label} type="button" className={styles.devbtn} onClick={() => run(a.events)}>
                {a.label}
              </button>
            ))}
            <button
              type="button"
              className={styles.devbtn}
              onClick={() => setShowDev(false)}
              aria-label="隐藏调试栏"
            >
              隐藏
            </button>
          </div>
        ) : (
          <button type="button" className={styles.devShow} onClick={() => setShowDev(true)}>
            调试
          </button>
        )}
      </div>
    </div>
  )
}

/** 供视图复用的人设文案 */
export { personaLabel }
