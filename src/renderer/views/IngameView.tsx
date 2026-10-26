/**
 * S3 · 对局中 / S3b · 敌方数据受限（design/ingame.html, limited.html）
 *
 * 设计要点（docs/03 §3）：
 *  - 接口不给其他玩家血量 → 不画血条，重心压在"谁活着、几秒复活"
 *  - 金币差用装备价值差代理
 *  - 符文槽随 3/7/11/15 级解锁，空槽虚线
 *  - S3b 是降级态不是异常：敌方显示「数据不可用」，绝不补零
 */
import styles from './IngameView.module.css'

export interface IngameViewProps {
  degraded: boolean
}

interface LiveSlot {
  champion: string
  level: number
  kda: string
  dead: boolean
  respawnSec: number
  augmentSlots: number
}

const ENEMY: LiveSlot[] = [
  { champion: 'Zed', level: 12, kda: '7 / 3 / 4', dead: true, respawnSec: 11, augmentSlots: 3 },
  { champion: 'Vi', level: 10, kda: '2 / 5 / 7', dead: false, respawnSec: 0, augmentSlots: 3 },
  { champion: "Kai'Sa", level: 11, kda: '4 / 4 / 3', dead: true, respawnSec: 6, augmentSlots: 3 },
  { champion: 'Darius', level: 11, kda: '3 / 3 / 1', dead: false, respawnSec: 0, augmentSlots: 3 },
  { champion: 'Nautilus', level: 9, kda: '0 / 6 / 9', dead: true, respawnSec: 12, augmentSlots: 2 },
]

const ALLY: LiveSlot[] = [
  { champion: 'Ahri', level: 11, kda: '6 / 1 / 8', dead: false, respawnSec: 0, augmentSlots: 3 },
  { champion: 'Lee Sin', level: 10, kda: '3 / 4 / 9', dead: true, respawnSec: 4, augmentSlots: 3 },
  { champion: 'Jinx', level: 11, kda: '5 / 2 / 5', dead: false, respawnSec: 0, augmentSlots: 3 },
  { champion: 'Lulu', level: 9, kda: '0 / 3 / 14', dead: false, respawnSec: 0, augmentSlots: 2 },
  { champion: 'Yasuo', level: 10, kda: '4 / 5 / 2', dead: false, respawnSec: 0, augmentSlots: 3 },
]

export function IngameView({ degraded }: IngameViewProps) {
  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <div>
          <div className={`${styles.clock} num`}>12:43</div>
          <div className={styles.sub}>
            {degraded ? 'KIWI · 记录中 · 我方数据正常' : 'KIWI · 记录中 · 符文槽 3 / 4 已解锁'}
          </div>
        </div>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <div className={`${styles.kv} num`}>
              18<span className={styles.ks}>:</span>
              {degraded ? <span className={styles.na}>—</span> : '12'}
            </div>
            <div className={styles.kl}>击杀</div>
          </div>
          <div className={styles.kpi}>
            <div className={`${styles.kv} ${degraded ? styles.na : ''} num`}>
              {degraded ? '—' : '+2.4k'}
            </div>
            <div className={styles.kl}>装备价值差</div>
          </div>
          <div className={styles.kpi}>
            <div className={`${styles.kv} num`}>
              1<span className={styles.ks}>:</span>
              {degraded ? <span className={styles.na}>—</span> : '0'}
            </div>
            <div className={styles.kl}>防御塔</div>
          </div>
        </div>
      </header>

      {degraded ? (
        <div className={styles.notice}>
          <i aria-hidden="true" />
          <span>敌方数据当前不可用 · 官方接口限制 · 我方数据不受影响</span>
        </div>
      ) : null}

      <div className={styles.board}>
        <div className={styles.teamLabel}>
          <span>敌方 · 蓝方</span>
          <span className={styles.ln} aria-hidden="true" />
        </div>
        <div className={styles.slots}>
          {ENEMY.map((s) => (
            <SlotCard key={s.champion} slot={s} degraded={degraded} />
          ))}
        </div>

        <div className={styles.band}>
          <div className={styles.bl}>
            <span className={`${styles.big} ${degraded ? styles.na : ''} num`}>
              {degraded ? '—' : '3'}
            </span>
            <span className={styles.bk}>敌方阵亡</span>
          </div>
          <div className={styles.bc}>
            {degraded ? '我方数据正常记录中' : '团战刚结束 · 我方 3 换 1'}
            <em>{degraded ? '敌方信息等待结算补全' : '最先复活 6s'}</em>
          </div>
          <div className={styles.br}>
            <span className={`${styles.big} ${styles.na} num`}>—</span>
            <span className={styles.bk}>装备价值</span>
          </div>
        </div>

        <div className={styles.slots}>
          {ALLY.map((s) => (
            <SlotCard key={s.champion} slot={s} degraded={false} />
          ))}
        </div>
        <div className={styles.teamLabel}>
          <span className={styles.ln} aria-hidden="true" />
          <span>我方 · 红方</span>
        </div>
      </div>

      <footer className={styles.foot}>
        <span>本地客户端接口 · 每 2 秒刷新</span>
        <span className={styles.btn}>收起</span>
      </footer>
    </section>
  )
}

function SlotCard({ slot, degraded }: { slot: LiveSlot; degraded: boolean }) {
  const total = 4
  const filled = Array.from({ length: slot.augmentSlots }, (_, i) => i)
  const empty = Array.from({ length: total - slot.augmentSlots }, (_, i) => i)

  return (
    <div
      className={
        degraded
          ? `${styles.slot} ${styles.slotNa}`
          : slot.dead
            ? `${styles.slot} ${styles.slotDead}`
            : styles.slot
      }
    >
      <div className={styles.ava}>
        {slot.champion.slice(0, 1)}
        {!degraded && <span className={styles.lv}>{slot.level}</span>}
        {slot.dead && !degraded ? (
          <span className={`${styles.cd} num`}>
            {slot.respawnSec}
            <span>s</span>
          </span>
        ) : null}
      </div>
      <div className={styles.nm}>{slot.champion}</div>
      <div className={`${styles.kd} num`}>{degraded ? '数据不可用' : slot.kda}</div>
      <div className={styles.augs} aria-hidden="true">
        {filled.map((i) => (
          <span key={`f${i}`} className={styles.aug} />
        ))}
        {empty.map((i) => (
          <span key={`e${i}`} className={`${styles.aug} ${styles.augEmpty}`} />
        ))}
      </div>
    </div>
  )
}
