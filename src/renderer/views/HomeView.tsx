/**
 * S1 · 已连接 · 空闲（design/home.html）
 * 设计要点：每行可点进报告（产品闭环），「当过蛆王」用 danger，虚线框不用大色块
 */
import styles from './HomeView.module.css'
import { formatDuration, formatKda, personaLabel } from '../viewmodels/formatters.js'

interface HistoryRow {
  champion: string
  at: string
  win: boolean
  k: number
  d: number
  a: number
  durationSec: number
  score: number
  personaKey: string
  crime: boolean
}

const HISTORY: HistoryRow[] = [
  { champion: 'Ahri', at: '昨天 22:41', win: false, k: 12, d: 4, a: 7, durationSec: 1721, score: 73, personaKey: 'persona.try', crime: false },
  { champion: 'Yasuo', at: '昨天 22:18', win: false, k: 2, d: 11, a: 4, durationSec: 1336, score: 28, personaKey: 'persona.crime', crime: true },
  { champion: 'Lux', at: '昨天 21:52', win: true, k: 8, d: 2, a: 15, durationSec: 1172, score: 66, personaKey: 'persona.tool', crime: false },
  { champion: 'Jinx', at: '昨天 21:24', win: true, k: 14, d: 3, a: 6, durationSec: 1064, score: 88, personaKey: 'persona.carry', crime: false },
  { champion: 'Garen', at: '昨天 20:58', win: false, k: 5, d: 7, a: 9, durationSec: 1503, score: 51, personaKey: 'persona.tank', crime: false },
  { champion: 'Ezreal', at: '昨天 20:31', win: true, k: 9, d: 4, a: 11, durationSec: 1307, score: 74, personaKey: 'persona.try', crime: false },
]

export function HomeView() {
  return (
    <section className={styles.root}>
      <div className={styles.identity}>
        <div className={styles.idl}>
          <div className={styles.portrait} aria-hidden="true">
            <span>K</span>
          </div>
          <div>
            <div className={styles.name}>Konata</div>
            <div className={styles.tags}>
              <span>等级 512</span>
              <span className={styles.dot} aria-hidden="true" />
              <span>钻石 II</span>
              <span className={styles.dot} aria-hidden="true" />
              <span>海克斯大乱斗 47 局</span>
            </div>
          </div>
        </div>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <div className={`${styles.kv} num`}>52%</div>
            <div className={styles.kl}>近 20 局胜率</div>
          </div>
          <div className={styles.kpi}>
            <div className={`${styles.kv} num`}>{formatKda(7.2, 6.1, 9.4)}</div>
            <div className={styles.kl}>场均 K / D / A</div>
          </div>
          <div className={styles.kpi}>
            <div className={`${styles.kv} num`}>63</div>
            <div className={styles.kl}>平均评分</div>
          </div>
        </div>
      </div>

      <div className={styles.hist}>
        <div className={styles.hhead}>
          <h3 className={styles.h3}>最 近 战 报</h3>
          <span className={styles.ln} aria-hidden="true" />
          <span className={styles.hint}>点任意一行看完整报告</span>
        </div>

        {HISTORY.map((r) => (
          <button
            key={r.at}
            type="button"
            className={r.crime ? `${styles.row} ${styles.crime}` : styles.row}
          >
            <span
              className={r.win ? `${styles.mark} ${styles.markWin}` : `${styles.mark} ${styles.markLoss}`}
              aria-label={r.win ? '胜利' : '失败'}
            />
            <span className={styles.thumb} aria-hidden="true">
              {r.champion.slice(0, 1)}
            </span>
            <span className={styles.rn}>
              {r.champion}
              <em>{r.at}</em>
            </span>
            <span className={`${styles.rkda} num`}>{formatKda(r.k, r.d, r.a)}</span>
            <span className={`${styles.rtime} num`}>{formatDuration(r.durationSec)}</span>
            <span className={`${styles.rscore} num`}>{r.score}</span>
            <span
              className={r.crime ? `${styles.rtag} ${styles.rtagBad}` : styles.rtag}
            >
              {personaLabel(r.personaKey)}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.s}>
          <span className={`${styles.sv} num`}>3 / 3</span>
          <span className={styles.sl}>近 6 局胜负</span>
        </div>
        <div className={styles.s}>
          <span className={`${styles.sv} ${styles.svBad} num`}>1</span>
          <span className={styles.sl}>当过蛆王</span>
        </div>
        <div className={styles.s}>
          <span className={`${styles.sv} num`}>7.2</span>
          <span className={styles.sl}>平均阵亡</span>
        </div>
        <div className={styles.wait}>
          <i aria-hidden="true" />
          等你开一局
        </div>
      </div>
    </section>
  )
}
