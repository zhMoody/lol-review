/**
 * 顶栏：唯一贯穿全状态的不变量（docs/03 §0.1）。
 *
 * 同时是**自定义标题栏**（docs/06）：
 *  - 整条可拖动窗口（`-webkit-app-region: drag`）
 *  - 只有「缩小」与「关闭」，**没有放大**
 *  - 按钮区域 no-drag，避免点不到
 *
 * 展示组件：只收 props，不发请求、不读 store。
 */
import type { ReactNode } from 'react'
import styles from './TopBar.module.css'

export interface TopBarProps {
  /** 局次摘要，如 "28:41 · 失败" */
  matchLabel: string
  /** 状态灯文案 */
  statusLabel: string
  /** 状态灯颜色 token 名 */
  statusColorVar: string
  /** 是否呼吸 */
  breathing?: boolean | undefined
  /** 右侧附加控件（如美颜开关） */
  extra?: ReactNode | undefined
  /** 窗口控制。缺失时（浏览器预览）不渲染按钮 */
  windowControls?:
    | {
        minimize: () => void
        close: () => void
      }
    | undefined
}

export function TopBar({
  matchLabel,
  statusLabel,
  statusColorVar,
  breathing = false,
  extra,
  windowControls,
}: TopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <b className={styles.name}>战报</b>
      </div>
      <div className={styles.mid}>{matchLabel}</div>
      <div className={styles.right}>
        {extra}
        <div className={styles.status}>
          <i
            className={breathing ? styles.dotBreathing : styles.dot}
            style={{ background: statusColorVar }}
            aria-hidden="true"
          />
          <span>{statusLabel}</span>
        </div>

        {windowControls ? (
          <div className={styles.winControls}>
            <button
              type="button"
              className={styles.winBtn}
              onClick={windowControls.minimize}
              aria-label="最小化窗口"
              title="最小化"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.winBtn} ${styles.winClose}`}
              onClick={windowControls.close}
              aria-label="关闭窗口"
              title="关闭"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M2 2 L8 8 M8 2 L2 8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
