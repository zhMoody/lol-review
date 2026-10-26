/**
 * S4 · 结算生成中（design/building.html）
 * 设计要点：不确定进度条（不假装知道进度），不用骨架屏（docs/03 §7）
 */
import styles from './BuildingView.module.css'

export interface BuildingViewProps {
  retry: number
}

export function BuildingView({ retry }: BuildingViewProps) {
  return (
    <section className={styles.root}>
      <div className={styles.card}>
        <h2 className={styles.title}>正在获取官方结算</h2>
        <p className={styles.retry}>
          第 <b>{Math.max(retry, 1)}</b> 次重试 · 预计 <b>8</b> 秒
        </p>
      </div>

      <footer className={styles.hist}>
        <div className={styles.item}>
          <span className={styles.label}>本局时长</span>
          <span className={styles.value}>28:41</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>已抓取事件</span>
          <span className={styles.value}>179 条</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>对局 ID</span>
          <span className={styles.value}>9021</span>
        </div>
      </footer>
    </section>
  )
}
