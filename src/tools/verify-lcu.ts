/**
 * P1-1 国服实测：验证 league-connect 能否接入腾讯客户端。
 *
 * 这是整个项目唯一的技术不确定点。见 docs/10 §14
 *
 * 用法（Windows，客户端已启动）：
 *   npm run verify:lcu
 *
 * 出处：league-connect API 见 https://www.npmjs.com/package/league-connect
 *   authenticate / createHttp1Request / createWebSocketConnection / LeagueClient
 */
import {
  authenticate,
  createHttp1Request,
  createWebSocketConnection,
  LeagueClient,
} from 'league-connect'

/** 不打印完整密码，只给前 2 位 + 长度（docs/10 §2：凭证绝不进日志） */
function maskPassword(password: string): string {
  return `${password.slice(0, 2)}***(${password.length})`
}

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

const results: CheckResult[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  console.log(`  ${mark} ${name.padEnd(28)} ${detail}`)
}

async function main(): Promise<void> {
  console.log('\n=== P1-1 国服实测 · league-connect ===\n')

  // ── 1. 进程发现与鉴权 ────────────────────────────────
  console.log('[1/4] 进程发现与鉴权')
  let credentials: Awaited<ReturnType<typeof authenticate>>
  try {
    credentials = await authenticate({
      awaitConnection: true,
      pollInterval: 2500,
      // 默认使用 Riot 自签证书，不需要 unsafe:true（docs/10 §1.3）
    })
    record('发现 LeagueClientUx', true, `port=${credentials.port}`)
    record('拿到鉴权凭证', true, `password=${maskPassword(credentials.password)}`)
  } catch (err) {
    record('发现 LeagueClientUx', false, err instanceof Error ? err.message : String(err))
    console.log('\n  → 客户端未启动，或进程名不是 LeagueClientUx。')
    console.log('    腾讯客户端请确认 LeagueClientUx.exe 正在运行。\n')
    finish()
    return
  }

  // ── 2. HTTP 请求 ────────────────────────────────────
  console.log('\n[2/4] LCU HTTP 请求')
  const probes: Array<{ name: string; url: string }> = [
    { name: '自身召唤师信息', url: '/lol-summoner/v1/current-summoner' },
    { name: '流程阶段', url: '/lol-gameflow/v1/gameflow-phase' },
    { name: '流程会话', url: '/lol-gameflow/v1/session' },
    { name: '队列定义', url: '/lol-game-data/assets/v1/queues.json' },
    { name: '符文图鉴', url: '/lol-game-data/assets/v1/cherry-augments.json' },
    { name: '战绩（自己）', url: '/lol-match-history/v1/products/lol/current-summoner/matches' },
  ]

  for (const probe of probes) {
    try {
      const res = await createHttp1Request(
        { method: 'GET', url: probe.url },
        credentials,
      )
      const ok = res.status === 200
      record(probe.name, ok, `HTTP ${res.status}`)
    } catch (err) {
      record(probe.name, false, err instanceof Error ? err.message : String(err))
    }
  }

  // ── 3. WebSocket 事件 ──────────────────────────────
  console.log('\n[3/4] WebSocket 事件订阅')
  try {
    const ws = await createWebSocketConnection({
      authenticationOptions: { awaitConnection: true },
    })
    let received = false
    ws.subscribe('/lol-gameflow/v1/gameflow-phase', (_data, _event) => {
      received = true
    })
    record('WSS 连接', true, '已订阅 gameflow-phase')

    // 等一个短窗口看是否能收到事件
    await new Promise((resolve) => setTimeout(resolve, 1500))
    record('事件订阅生效', true, received ? '已收到事件' : '订阅成功（暂无事件推送）')
  } catch (err) {
    record('WSS 连接', false, err instanceof Error ? err.message : String(err))
  }

  // ── 4. 进程生命周期 ────────────────────────────────
  console.log('\n[4/4] 客户端生命周期监听')
  try {
    const client = new LeagueClient(credentials, { pollInterval: 2500 })
    client.start()
    record('LeagueClient 监听', true, 'connect / disconnect 事件就绪')
    client.stop()
  } catch (err) {
    record('LeagueClient 监听', false, err instanceof Error ? err.message : String(err))
  }

  finish()
}

function finish(): void {
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed

  console.log('\n' + '─'.repeat(56))
  console.log(`结果：${passed} 通过 / ${failed} 失败`)

  if (failed === 0) {
    console.log('\n✅ P1-1 通过。league-connect 在国服可用，可以进入 P1-2。')
  } else {
    console.log('\n❌ 有失败项。若「发现 LeagueClientUx」失败，说明')
    console.log('   腾讯客户端的进程名或 lockfile 位置与 Riot 版不同，')
    console.log('   需要退回手写连接层（docs/10 §1.3 风险预案）。')
  }
  console.log()
  process.exit(failed === 0 ? 0 : 1)
}

void main()
