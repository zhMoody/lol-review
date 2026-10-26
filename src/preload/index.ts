/**
 * preload：唯一的 contextBridge 出入口。
 * 规范（docs/10 §2）：renderer 拿不到 Node 能力，只拿到白名单 API。
 */
// Electron 是 CJS，ESM 下用 createRequire 取值（见 main/index.ts 说明）
import { createRequire } from 'node:module'
import type { IpcRendererEvent } from 'electron'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
const electron = require('electron') as typeof import('electron')
const { contextBridge, ipcRenderer } = electron

/** 主 → 渲染 的事件载荷类型，与 shared/contracts 对齐 */
export type RendererEventName =
  | 'state:changed'
  | 'league:tick'
  | 'building:progress'
  | 'report:ready'
  | 'teammates:ready'
  | 'error'

const ALLOWED_EVENTS: readonly RendererEventName[] = [
  'state:changed',
  'league:tick',
  'building:progress',
  'report:ready',
  'teammates:ready',
  'error',
]

const api = {
  /** 订阅主进程事件，返回取消函数 */
  on(event: RendererEventName, listener: (payload: unknown) => void): () => void {
    if (!ALLOWED_EVENTS.includes(event)) {
      throw new Error(`不允许订阅该事件: ${event}`)
    }
    const handler = (_e: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },

  /** 发送请求到主进程（tRPC 链路） */
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return ipcRenderer.invoke(channel, ...args)
  },

  /**
   * 自定义标题栏的窗口控制。
   * 只有最小化与关闭，**不提供放大**（docs/06）。
   */
  window: {
    minimize(): Promise<void> {
      return ipcRenderer.invoke('window:minimize') as Promise<void>
    },
    close(): Promise<void> {
      return ipcRenderer.invoke('window:close') as Promise<void>
    },
  },
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: PreloadApi
  }
}
