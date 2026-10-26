/**
 * S2 · 队友情报（design/teammates.html）
 * 设计要点：开黑用跨卡括号（关系不是属性），不用彩色标签（docs/03 §6）
 */
import styles from './TeammatesView.module.css'

interface Teammate {
  champion: string
  name: string
  rank: string
  mastery: number
  winRate: number
  kda: string
  spark: Array<'w' | 'l'>
  games: number
  tag: string
  tagKind: 'plain' | 'hot' | 'warn'
}

const TEAM: Teammate[] = [
  { champion: 'Lux', name: 'Konata', rank: '钻石 II', mastery: 7, winRate: 52, kda: '7.2 / 6.1 / 9.4', spark: ['w','l','w','w','l','l','w','l','w','w'], games: 47, tag: '助攻型', tagKind: 'plain' },
  { champion: 'Ezreal', name: '白月光', rank: '大师', mastery: 12, winRate: 61, kda: '9.1 / 5.4 / 11.2', spark: ['w','w','l','w','w','w','l','w','l','w'], games: 132, tag: '近 20 局最稳', tagKind: 'hot' },
  { champion: 'Garen', name: '小林', rank: '铂金 I', mastery: 3, winRate: 45, kda: '5.8 / 8.3 / 10.1', spark: ['l','l','w','l','w','l','l','w','l','w'], games: 89, tag: '正常发挥', tagKind: 'plain' },
  { champion: 'Teemo', name: '阿哲', rank: '钻石 IV', mastery: 15, winRate: 55, kda: '8.4 / 6.8 / 8.9', spark: ['w','w','w','l','w','l','w','l','l','w'], games: 210, tag: '老乱斗', tagKind: 'hot' },
  { champion: 'MissFortune', name: '路人甲', rank: '黄金 II', mastery: 1, winRate: 41, kda: '4.2 / 9.7 / 7.6', spark: ['l','l','l','w','l','l','l','w','l','l'], games: 12, tag: '场均阵亡 9.7', tagKind: 'warn' },
]

export function TeammatesView() {
  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>队友情报</h1>
          <p className={styles.sub}>5 位队友 · 其中 2 人是开黑 · 敌方英雄进游戏才揭晓</p>
        </div>
        <div className={styles.reroll}>
          <div className={`${styles.rv} num`}>
            2<span className={styles.rs}> / 2</span>
          </div>
          <div className={styles.rl}>剩余重随</div>
        </div>
      </header>

      <div className={styles.brackets} aria-hidden="true">
        <div className={styles.bracket}>
          <span>开黑 · 2 人</span>
        </div>
        <div />
        <div />
        <div />
      </div>

      <div className={styles.grid}>
        {TEAM.map((t) => (
          <article key={t.name} className={styles.card}>
            <div className={styles.ava} aria-hidden="true">
              {t.champion.slice(0, 1)}
            </div>
            <div className={styles.nm}>{t.name}</div>
            <div className={styles.rk}>
              {t.rank} · 熟练度 {t.mastery}
            </div>
            <div className={styles.sep} aria-hidden="true" />
            <div className={styles.wr}>
              <span className={`${styles.wrv} num`}>{t.winRate}</span>
              <span className={styles.wrl}>% 近 20 局</span>
            </div>
            <div className={`${styles.kd} num`}>{t.kda}</div>
            <div className={styles.spark} aria-hidden="true">
              {t.spark.map((s, i) => (
                <i key={i} className={s === 'w' ? styles.sparkW : styles.sparkL} />
              ))}
            </div>
            <div className={styles.meta}>
              海克斯大乱斗 <b className="num">{t.games}</b> 局
            </div>
            <div className={styles.tagline}>
              <span
                className={
                  t.tagKind === 'warn'
                    ? `${styles.tag} ${styles.tagWarn}`
                    : t.tagKind === 'hot'
                      ? `${styles.tag} ${styles.tagHot}`
                      : styles.tag
                }
              >
                {t.tag}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.oracle}>
        <div className={styles.ok}>开 场 预 言</div>
        <div className={styles.ox}>
          队友近 20 局平均胜率 <b className="num">50.8%</b>，本局预计打到 <b className="num">19</b> 分钟以上。
          <br />
          「路人甲」近 20 局场均阵亡 <b className="num">9.7</b>，本局他大概率会死 <b className="num">9</b> 次以上。
        </div>
        <div className={styles.ohit}>打完自动对答案</div>
      </div>
    </section>
  )
}
