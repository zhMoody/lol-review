/**
 * 错误码与应用错误。
 * 规范：`error.code` 是稳定枚举，renderer 靠它决定文案，不解析 message。
 * 出处：docs/10-app-tech.md §5
 */

export const ERROR_CODE = {
  // 连接层
  lcuNotRunning: 'LCU_NOT_RUNNING',
  lcuAuthFailed: 'LCU_AUTH_FAILED',
  lcuTimeout: 'LCU_TIMEOUT',
  lcuProtocolChanged: 'LCU_PROTOCOL_CHANGED',

  // 外部数据源
  qq101Unavailable: 'QQ101_UNAVAILABLE',
  qq101ParseFailed: 'QQ101_PARSE_FAILED',
  gtimgUnavailable: 'GTIMG_UNAVAILABLE',

  // 对局数据
  gameIdMismatch: 'GAME_ID_MISMATCH',
  eogUnavailable: 'EOG_UNAVAILABLE',
  timelineUnavailable: 'TIMELINE_UNAVAILABLE',
  fieldMissing: 'FIELD_MISSING',

  // 通用
  schemaValidation: 'SCHEMA_VALIDATION',
  unknown: 'UNKNOWN',
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

export interface AppErrorInit {
  code: ErrorCode
  message: string
  /** 是否可恢复。false 时 renderer 应阻断流程 */
  recoverable: boolean
  /** 出处链接 / 接口路径，便于排查 */
  source?: string
  cause?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly recoverable: boolean
  readonly source: string | undefined
  override readonly cause: unknown

  constructor(init: AppErrorInit) {
    super(init.message)
    this.name = 'AppError'
    this.code = init.code
    this.recoverable = init.recoverable
    this.source = init.source
    this.cause = init.cause
  }

  static is(value: unknown): value is AppError {
    return value instanceof AppError
  }
}

/** 稳定的序列化形状，供 IPC 传输 */
export interface SerializedError {
  code: ErrorCode
  message: string
  recoverable: boolean
  source?: string
}

export function serializeError(err: unknown): SerializedError {
  if (AppError.is(err)) {
    return {
      code: err.code,
      message: err.message,
      recoverable: err.recoverable,
      ...(err.source === undefined ? {} : { source: err.source }),
    }
  }
  return {
    code: ERROR_CODE.unknown,
    message: err instanceof Error ? err.message : String(err),
    recoverable: true,
  }
}
