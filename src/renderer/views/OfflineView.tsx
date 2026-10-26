/**
 * S0 · 客户端未启动（design/offline.html）
 * 设计要点：中央圆 **不呼吸**（死状态不呼吸，docs/03 §7）
 */
import styles from './OfflineView.module.css'

export interface OfflineViewProps {
  onRescan: () => void
}

export function OfflineView({ onRescan }: OfflineViewProps) {
  return (
    <section className={styles.root}>
      <div className={styles.center}>
        <div className={styles.ring} aria-hidden="true">
          <i />
        </div>
        <h1 className={styles.h1}>请启动英雄联盟客户端</h1>
        <p className={styles.h2}>启动后会自动连接，不需要任何操作</p>
        <button type="button" className={styles.rescan} onClick={onRescan}>
          重新扫描
        </button>
      </div>

      <footer className={styles.hist}>
        <div className={styles.item}>
          <span className={styles.label}>上次连接</span>
          <span className={`${styles.value} ${styles.strong}`}>今天 14:02</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>上次对局</span>
          <span className={styles.value}>失败 · 28:41 · Ahri 12/4/7</span>
        </div>
        <div className={styles.item}>
          <span className={styles.label}>累计记录</span>
          <span className={styles.value}>14 局</span>
        </div>
      </footer>

      <div className={styles.foot}>数据来源：本地客户端接口 · 断网可用</div>
    </section>
  )
}
