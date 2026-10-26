/**
 * S5 · 本局战报（design/report.html）
 *
 * 信息顺序 = 一次审判的顺序（docs/03 §4）：
 *   结果 → 对阵阵容 → 结论三栏 → 罪状+死亡位置 → 详情
 *
 * 硬规则：裸标签不给，「蛆」必须跟可查证理由（docs/05 §11）
 */
import styles from './ReportView.module.css'
import {
  formatKda,
  formatCompact,
  personaLabel,
  personaColorVar,
} from '../viewmodels/formatters.js'

export interface ReportViewProps {
  /** KDA 美颜：纯文案替换的整蛊开关 */
  beauty: boolean
}

interface Slot {
  id: number
  champion: string
  k: number
  d: number
  a: number
  score: number
  personaKey: string
  crime: boolean
}

const ENEMY: Slot[] = [
  { id: 5, champion: 'Zed', k: 14, d: 3, a: 9, score: 76, personaKey: 'persona.carry', crime: false },
  { id: 6, champion: 'Vi', k: 9, d: 4, a: 15, score: 69, personaKey: 'persona.tool', crime: false },
  { id: 7, champion: "Kai'Sa", k: 13, d: 5, a: 6, score: 65, personaKey: 'persona.carry', crime: false },
  { id: 8, champion: 'Darius', k: 10, d: 5, a: 8, score: 61, personaKey: 'persona.solid+', crime: false },
  { id: 9, champion: 'Nautilus', k: 2, d: 8, a: 21, score: 54, personaKey: 'persona.tool', crime: false },
]

const ALLY: Slot[] = [
  { id: 1, champion: 'Yasuo', k: 2, d: 11, a: 4, score: 28, personaKey: 'persona.crime', crime: true },
  { id: 2, champion: 'Lee Sin', k: 5, d: 9, a: 13, score: 59, personaKey: 'persona.tool', crime: false },
  { id: 3, champion: 'Jinx', k: 6, d: 7, a: 5, score: 52, personaKey: 'sub.lonewolf', crime: false },
  { id: 4, champion: 'Lulu', k: 1, d: 6, a: 16, score: 34, personaKey: 'persona.passive', crime: false },
  { id: 0, champion: 'Ahri', k: 12, d: 4, a: 7, score: 73, personaKey: 'persona.try', crime: false },
]

const CHARGES = [
  { at: '14:22', place: '中路', text: '团战开打前', bold: '8 秒', tail: '阵亡 → 45 秒后丢二塔' },
  { at: '22:15', place: '敌方塔下', text: '吸收伤害仅为全队均值的', bold: '31%', tail: '，秒躺' },
  { at: '24:40', place: '中路', text: '死时携带', bold: '2,340', tail: ' 金币未花，浪费唯一购物窗口' },
  { at: '26:02', place: '我方高地', text: '我方 4 人存活时无意义阵亡，直接掉高地', bold: '', tail: '' },
]

const STATS = [
  { label: '伤害占比', value: '11%', w: 11 },
  { label: '承受伤害', value: '31.5k', w: 88 },
  { label: '治疗量', value: '0.9k', w: 8 },
  { label: '控制时长', value: '12s', w: 18 },
  { label: '金币', value: '12.4k', w: 62 },
  { label: '阵亡', value: '11', w: 100, hot: true },
]

export function ReportView({ beauty }: ReportViewProps) {
  return (
    <section className={styles.root}>
      <div className={styles.main}>
        <header className={styles.banner}>
          <div className={styles.meta}>28:41 · 海克斯大乱斗</div>
          <div className={styles.result}>失败</div>
          <div className={`${styles.kda} num`}>
            <span className={styles.kk}>42</span>
            <span className={styles.sep}>/</span>
            <span>28</span>
            <span className={styles.sep}>/</span>
            <span className={styles.ka}>61</span>
            <span className={styles.unit}>全队合计</span>
          </div>
          <div className={styles.sweep} aria-hidden="true" />
        </header>

        <div className={styles.lineup}>
          <div className={styles.teamLabel}>
            <span>敌方 · 蓝方</span>
            <span className={styles.ln} aria-hidden="true" />
          </div>
          <div className={styles.slots}>
            {ENEMY.map((s) => (
              <SlotCard key={s.id} slot={s} beauty={beauty} />
            ))}
          </div>

          <div className={styles.teamLabel}>
            <span className={styles.ln} aria-hidden="true" />
            <span>我方 · 红方</span>
          </div>
          <div className={styles.slots}>
            {ALLY.map((s) => (
              <SlotCard key={s.id} slot={s} beauty={beauty} />
            ))}
          </div>
        </div>

        <div className={styles.verdict}>
          <div className={styles.vd}>
            <div className={styles.vk}>最 C</div>
            <div className={styles.vn}>Ahri</div>
            <div className={styles.vr}>
              伤害占比 34%，全场第一
              <br />
              4 次阵亡，全场最少
            </div>
          </div>
          <div className={`${styles.vd} ${styles.vdBad}`}>
            <div className={styles.vk}>{beauty ? '灵魂人物' : '在犯罪'}</div>
            <div className={`${styles.vn} ${styles.vnBad}`}>Yasuo</div>
            <div className={styles.vr}>
              11 次阵亡，其中 4 次发生在
              <br />
              团战开打前的 8 秒内
            </div>
          </div>
          <div className={styles.vd}>
            <div className={styles.vk}>在划水</div>
            <div className={styles.vn}>Lulu</div>
            <div className={styles.vr}>
              伤害占比 8%，全场最低
              <br />
              但治疗量 21.4k，全队第一
            </div>
          </div>
        </div>

        <div className={styles.indict}>
          <div>
            <div className={styles.ihd}>
              <h3 className={styles.ih}>{beauty ? '功劳簿' : '罪状'}</h3>
              <span className={styles.iwho}>
                Yasuo · 共 {beauty ? '4 次挺身而出' : '4 条可查证'}
              </span>
            </div>
            {CHARGES.map((c) => (
              <div key={c.at} className={styles.charge}>
                <span className={`${styles.ct} num`}>{c.at}</span>
                <span className={styles.cp}>{c.place}</span>
                <span className={styles.cx}>
                  {c.text}
                  {c.bold ? <b className="num">{c.bold}</b> : null}
                  {c.tail}
                </span>
              </div>
            ))}
          </div>
          <DeathMap />
        </div>
      </div>

      <aside className={styles.aside}>
        <div className={styles.ihd}>
          <h3 className={styles.ih}>详情</h3>
          <span className={styles.iwho}>Yasuo · 阵亡 11 · 评分 28</span>
        </div>
        <div className={styles.stats}>
          {STATS.map((s) => (
            <div key={s.label} className={styles.st}>
              <div className={`${styles.stv} num`}>{s.value}</div>
              <div className={styles.stl}>{s.label}</div>
              <div className={styles.stbar}>
                <i
                  className={s.hot ? styles.stHot : undefined}
                  style={{ width: `${s.w}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.augBlock}>
          <div className={styles.augLabel}>强化符文</div>
          <div className={styles.augs}>
            <span className={`${styles.aug} ${styles.augGold}`}>尖</span>
            <span className={`${styles.aug} ${styles.augSilver}`}>大</span>
            <span className={`${styles.aug} ${styles.augSilver}`}>灵</span>
            <span className={`${styles.aug} ${styles.augPrism}`}>泰</span>
          </div>
          <div className={styles.augNames}>尖端发明家 · 大力 · 灵巧 · 泰坦的坚决</div>
        </div>
      </aside>
    </section>
  )
}

function SlotCard({ slot, beauty }: { slot: Slot; beauty: boolean }) {
  const kdaText = beauty
    ? `参团 ${slot.k + slot.a} · 钢铁意志 ×${slot.d}`
    : formatKda(slot.k, slot.d, slot.a)

  return (
    <div className={slot.crime ? `${styles.slot} ${styles.slotCrime}` : styles.slot}>
      <div className={styles.idx}>{String(slot.id + 1).padStart(2, '0')}</div>
      <div className={styles.ava} aria-hidden="true">
        {slot.champion.slice(0, 1)}
        <span className={`${styles.pill} num`}>{slot.score}</span>
      </div>
      <div className={styles.nm}>{slot.champion}</div>
      <div className={`${styles.kd} num`}>{kdaText}</div>
    </div>
  )
}

/** 死亡位置图：嚎哭深渊单线投影（docs/03 §4） */
function DeathMap() {
  const dots = [
    { x: 46, feed: false },
    { x: 88, feed: false },
    { x: 122, feed: true },
    { x: 150, feed: true },
    { x: 178, feed: false },
    { x: 212, feed: true },
    { x: 236, feed: true },
  ]
  return (
    <div className={styles.dmap}>
      <svg viewBox="0 0 268 58" width="268" height="58" role="img" aria-label="阵亡位置分布">
        <title>阵亡位置分布</title>
        <line x1="8" y1="26" x2="260" y2="26" stroke="var(--line)" strokeWidth="1" />
        {dots.map((d) =>
          d.feed ? (
            <circle key={d.x} cx={d.x} cy={26} r="3.6" fill="var(--danger)" />
          ) : (
            <circle
              key={d.x}
              cx={d.x}
              cy={26}
              r="3"
              fill="none"
              stroke="var(--text-low)"
              strokeWidth="1.2"
            />
          ),
        )}
        <text x="8" y="48" fontSize="8.5" fill="var(--text-ghost)" letterSpacing="1">
          我方
        </text>
        <text x="134" y="48" fontSize="8.5" fill="var(--text-ghost)" textAnchor="middle" letterSpacing="1">
          中路
        </text>
        <text x="260" y="48" fontSize="8.5" fill="var(--text-ghost)" textAnchor="end" letterSpacing="1">
          敌方
        </text>
      </svg>
      <div className={styles.dcap}>
        <span>● 白给</span>
        <span>○ 正常</span>
      </div>
    </div>
  )
}

export { formatCompact, personaLabel, personaColorVar }
