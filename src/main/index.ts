/**
 * Electron 主进程入口。
 *
 * 规范（docs/10 §2）：
 *  - LCU 凭证只在 main，绝不进 renderer、绝不打日志
 *  - renderer 不直接发 HTTP，所有数据走 tRPC
 *  - 业务代码不直接 import league-connect，只 import src/main/lcu/
 *
 * 窗口形态（docs/06）：无边框 + 自定义标题栏（仅缩小/关闭，无放大）+ 可拖动 + 圆角
 */
// Electron 主进程是 CJS 模块。ESM 下命名导入会报 "does not provide an export"，
// 默认导入解构又会拿到 undefined。用 createRequire 是唯一稳定写法。
import { createRequire } from 'node:module'
import { join } from 'node:path'
import log from 'electron-log'
import type { BrowserWindow as BrowserWindowType, HandlerDetails } from 'electron'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
const electron = require('electron') as typeof import('electron')
const { app, BrowserWindow, ipcMain, shell } = electron

/** 开发态：Vite dev server；生产态：打包后的 dist/renderer */
const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173'

log.transports.file.level = 'info'
log.info('main 启动', { isDev, platform: process.platform })

let mainWindow: BrowserWindowType | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    // ── 无边框 + 圆角（docs/06 §2）──────────────────
    // transparent + roundedCorners：macOS 原生圆角，Windows 由 .app 的 border-radius 兜底
    frame: false,
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
    title: 'LoL 战报',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  // 外链一律交给系统浏览器，不在应用内打开
  mainWindow.webContents.setWindowOpenHandler(({ url }: HandlerDetails) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── 自定义标题栏的窗口控制 ──────────────────────────────
// 只暴露最小化与关闭；**不做放大**（docs/06：主窗固定尺寸语义）
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (err) => {
  log.error('未捕获异常', { message: err.message, stack: err.stack })
})
