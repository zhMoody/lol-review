# 04 · 技术架构与官方接口

> 目标读者：实现方（我自己，下一阶段）。
> 原则：**只用官方本地接口**；任何拿不到的字段一律降级，绝不伪造。

---

## 1. 数据源全景

本产品有且只有两个官方数据源，以及一个可选的第三源。

| 源 | 地址 | 认证 | 生命周期 | 拿到什么 |
|---|---|---|---|---|
| **LCU（League Client API）** | `https://127.0.0.1:{port}` | HTTP Basic `riot:{password}`（来自 lockfile） | 客户端运行期间 | 召唤师信息、流程阶段、选人、结算全量 |
| **Live Client Data API** | `https://127.0.0.1:2999/liveclientdata/*` | 无 | 仅对局中 | 实时 10 人数据、事件流 |
| （可选 P4）Riot Web API | `https://{region}.api.riotgames.com` | API Key | 长期 | 跨设备历史、`match-v5` 精确复盘 |

> 为什么不用 Riot Web API 做主源：需要申请 Key、有速率限制、且**拿不到实时数据**。LCU + Live Client 才是"监测对局"的正确工具。

### 1.1 lockfile 与进程探测

- 进程名：Windows `LeagueClientUx.exe` / macOS `LeagueClientUx`
- lockfile 常见路径：
  - Win：`C:\Riot Games\League of Legends\lockfile`
  - Win（Wegame/腾讯）：`{安装目录}\LeagueClient\lockfile`（实际由 `LeagueClientUx.exe` 所在目录上溯）
  - macOS：`/Applications/League of Legends.app/Contents/LoL/lockfile`
- 内容格式（5 段冒号分隔）：`LeagueClient:{pid}:{port}:{password}:https`
- 更稳的做法：**用进程路径反推**安装目录，而不是硬编码路径。Windows 可用 `wmic process where name='LeagueClientUx.exe' get ExecutablePath`（或 PowerShell `Get-Process`）；macOS 用 `ps -axo command` 抓 `.app` 路径。
- 探测节奏：进程 2s / 锁文件 2s。**不要 500ms 轮询进程**，Windows 上 `tasklist` 开销明显。

### 1.2 连接鉴权

```
Authorization: Basic base64("riot:" + password)
```
- LCU 用自签证书 → 客户端必须关闭 TLS 校验（`rejectUnauthorized: false`）。
- 密码每次客户端重启都会变 → **每 5 分钟重读一次 lockfile 校验**，密码变了就重建连接（避免用户重启客户端后假死）。

---

## 2. 接口清单（按阶段）

### 2.1 S0 → S1：连接与身份

| 用途 | 方法 | 路径 | 备注 |
|---|---|---|---|
| 自身信息 | GET | `/lol-summoner/v1/current-summoner` | `puuid / summonerId / displayName / summonerLevel / profileIconId` |
| 自身段位 | GET | `/lol-ranked/v1/current-ranked-stats` | 含 `RANKED_SOLO_5x5` 的 tier/division/LP |
| 最近战绩 | GET | `/lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=4` | 只要 5 条，避免拉全量 |
| 流程阶段 | GET | `/lol-gameflow/v1/gameflow-phase` | 返回值见 §2.2 |
| 流程会话 | GET | `/lol-gameflow/v1/session` | 含 `gameData.gameId / queue.id / gameServerInfo` |

### 2.2 gameflow-phase 取值与映射

| 值 | 含义 | 映射状态 |
|---|---|---|
| `None` | 客户端打开但未进任何流程 | S1 |
| `Lobby` / `Matchmaking` / `ReadyCheck` | 组队 / 匹配 / 确认 | S1（顶栏显示"匹配中"） |
| `ChampSelect` | 选人 | **S2** |
| `InProgress` | 对局中 | **S3** |
| `WaitingForStats` / `PreEndOfGame` / `EndOfGame` | 结算 | **S4** |
| `TerminatedInError` | 异常终止 | S1 + 错误提示 |

### 2.3 S2：选人阶段

| 用途 | 方法 | 路径 |
|---|---|---|
| 选人会话 | GET | `/lol-champ-select/v1/session` |
| 某槽位召唤师 | GET | `/lol-champ-select/v1/summoners/{slotId}` |
| 召唤师详情（队友） | GET | `/lol-summoner/v1/summoners/{summonerId}` |
| 队友段位 | GET | `/lol-ranked/v1/ranked-stats/{puuid}` |

从 `session` 里取的关键字段：
```
myTeam[]:    cellId, summonerId, assignedPosition, championId, championPickIntent, spell1Id, spell2Id
theirTeam[]: cellId, championId（选人阶段通常为空 → 不展示）
actions[][]: type(pick|ban), championId, completed, actorCellId
timer:       phase, adjustedTimeLeftInPhase
localPlayerCellId
```

降级规则：
- `/lol-ranked/v1/ranked-stats/{puuid}` 在部分版本对陌生玩家返回 **404** → 段位显示「未知」，不重试超过 1 次。
- `assignedPosition` 可能为空（补位）→ 位置显示「补」，并按"已选英雄"推断。
- 队友最近战绩接口对陌生人常不可用 → **选人阶段不做"最近战绩"，只做段位**，避免无谓请求与假数据。（此处与 03 文档的线框有出入：线框里的"62% 12局"仅在自己身上有，队友位留空。**待确认**，见 README 决策 D-06。）

### 2.4 S3：对局中（Live Client Data API）

| 用途 | 路径 | 建议频率 |
|---|---|---|
| 全量快照（首帧） | `/liveclientdata/allgamedata` | 仅进入时 1 次 |
| 10 人列表 | `/liveclientdata/playerlist` | 2s |
| 事件流 | `/liveclientdata/eventdata` | 1s |
| 我自己（技能/符文） | `/liveclientdata/activeplayer` | 进局 1 次 |
| 局内总览 | `/liveclientdata/gamestats` | 5s（游戏时间、地图名、模式） |

`playerlist` 单项关键字段：
```
championName, summonerName, riotId, rawChampionName, level, isDead, respawnTimer,
scores: { kills, deaths, assists, creepScore, wardScore }
items[]: { itemID, count, slot, displayName }
summonerSpells: { summonerSpellOne, summonerSpellTwo }
team: "ORDER" | "CHAOS"
position, skinID
```

`eventdata` 事件类型（做"犯罪分析"的关键）：
```
GameStart, MinionsSpawning,
ChampionKill   { KillerName, VictimName, Assisters[], EventTime }
Multikill      { KillStreak, KillerName }
DragonKill     { KillerName, DragonType, Stolen }
HeraldKill     { KillerName }
BaronKill      { KillerName, Stolen }
TurretKilled   { KillerName, TurretKilled }
InhibKilled    { KillerName, InhibKilled }
FirstBlood
```

> **注意**：`playerlist` 的 KDA/CS 只对**自己队伍**保证准确；敌方可能缺 `items` 或延迟。这是 Riot 的设计，不是 bug。命中缺失 → S3b。
> 必须自己算的：经济（接口不直接给对手金币）、伤害（接口不给实时伤害） → **对局中不出伤害维度的评分，只出"节奏维（KDA/CS/等级/参团）"，结算后补全**。这是 05 文档评分模型分两段的原因。

### 2.5 S4 → S5：结算数据

| 用途 | 方法 | 路径 |
|---|---|---|
| 结算面板 | GET | `/lol-end-of-game/v1/eog-stats-block` |
| 关闭结算界面（可选） | POST | `/lol-end-of-game/v1/state/dismiss-stats` |

这是**全产品最重要的一次请求**，`eog-stats-block` 提供 10 人的完整 `stats`：

```
gameId, gameLength, gameMode, gameType, queueId, isRanked
teams[]: { teamId, isWinningTeam, towers, dragons[], barons, inhibitors, ... }
players[]: {
  summonerId, puuid, championId, championName, teamId, position, playerRole,
  stats: {
    kills, deaths, assists,
    totalDamageDealtToChampions, totalDamageTaken, damageSelfMitigated,
    goldEarned, goldSpent, minionsKilled, neutralMinionsKilled, totalMinionsKilled,
    visionScore, wardsPlaced, wardsKilled, sightWardsBoughtInGame, visionWardsBoughtInGame,
    totalHeal, totalUnitsHealed, timeCCingOthers, totalTimeCrowdControlDealt,
    turretKills, inhibitorKills, dragonKills, baronKills, objectivesStolen,
    firstBloodKill, doubleKills, tripleKills, quadraKills, pentaKills, largestMultiKill,
    killingSprees, longestTimeSpentLiving, timePlayed, champLevel
  }
}
```

**校验与重试（对应 01 文档规则 3）**
```
retry = 0
loop:
  block = GET eog-stats-block
  if block.gameId == session.gameData.gameId and block.players.length == 10 → 成功
  retry++ ; if retry > 12 → 降级
  sleep 1000
```

**已知坑**
- `WaitingForStats` 刚发生时，`eog-stats-block` 常常**还是上一局**的数据 → 必须比 gameId，不能只比"有没有数据"。
- 部分版本 `eog-stats-block` 在 `EndOfGame` 后 1-2s 才可访问，过早请求返回 404 → 404 也算一次重试。
- 重开局 `gameLength < 300` → 直接跳过评分。

---

## 3. 事件驱动 vs 轮询

```
LCU WAMP (wss://127.0.0.1:{port}, subprotocol: "wamp")
  subscribe: OnJsonApiEvent_lol-gameflow_v1_gameflow-phase   ← 主驱动
  subscribe: OnJsonApiEvent_lol-champ-select_v1_session      ← 选人实时
  subscribe: OnJsonApiEvent_lol-end-of-game_v1_eog-stats-block ← 结算就绪
  （WAMP 需要先发 [5, "OnJsonApiEvent"] 订阅主题）
```

- WAMP 断了（客户端重启）→ 重连 3 次，仍失败则降级为 1s 轮询 gameflow。
- **Live Client 只能轮询**（无推送）。1s/2s 是实测可接受的平衡点；`allgamedata` 单次响应 200–500KB，**绝不能 1s 一次**。
- 所有轮询在一个 `Ticker` 里统一调度，避免多路 setTimeout 堆积。

---

## 4. 技术栈建议

| 层 | 选择 | 理由 |
|---|---|---|
| 壳 | **Electron**（P1）；Tauri 作 P4 备选 | 需要：忽略自签证书、本地 HTTPS + WSS、系统托盘、透明置顶窗（未来 overlay）、better-sqlite3 原生模块。Electron 生态最成熟，`league-connect` 类库可直接用 |
| UI | React 18 + TypeScript + Vite | 状态机驱动，组件复用率高 |
| 样式 | **CSS 变量 + 原生 CSS Modules** | 设计系统是 token 驱动（02 文档），不需要 Tailwind 的原子类；深色主题靠 `[data-theme]` |
| 动画 | **Motion（原 Framer Motion）** | M-01~M-12 需要 stagger / 编排 / `prefers-reduced-motion` 统一降级；CSS 手写编排会失控 |
| 状态 | Zustand（1 个 store + 状态机 reducer） | 状态少（7 个），不需要 Redux |
| 本地库 | better-sqlite3 | 存对局、评分、AI 文案 |
| 打包 | electron-builder | Win + macOS |

**不建议**：
- 纯 Web（浏览器）→ 无法忽略自签证书、无法读本地文件、无法常驻。❌
- 纯 Tauri P1 上手 → 证书与 WSS 处理成本高，拖慢 P1 里程碑。先 Electron 跑通，P4 再评估迁移。

---

## 5. 进程与目录结构（建议）

所有"活"都在主进程，渲染进程只渲染。理由：LCU 凭证与网络不能暴露到渲染层。

```
src/
├─ main/                        Electron 主进程
│  ├─ league/
│  │  ├─ lockfile.ts            路径探测 + 解析 + 变更监听
│  │  ├─ lcu-client.ts          HTTPS 封装（Basic Auth / rejectUnauthorized:false）
│  │  ├─ wamp.ts                WAMP 订阅与重连
│  │  ├─ endpoints/             summoner / gameflow / champselect / eog
│  │  └─ live-client.ts         2999 轮询（playerlist / eventdata）
│  ├─ core/
│  │  ├─ state-machine.ts       S0…S5 唯一状态源（纯函数 reducer）
│  │  ├─ poller.ts              统一调度
│  │  ├─ match-recorder.ts      对局中事件落盘（用于赛后归因）
│  │  └─ rating/                评分模型（05 文档）
│  ├─ db/                       sqlite schema + repository
│  ├─ ai/                       P3：prompt 构造 + 调用
│  └─ ipc.ts                    typed IPC 契约（唯一出入口）
├─ renderer/
│  ├─ screens/                  Offline / Idle / ChampSelect / InGame / Building / Report
│  ├─ components/               C-01…C-12
│  ├─ motion/                   统一变体与降级
│  └─ tokens.css
└─ shared/types.ts              接口响应类型（由真实样本生成，不手写猜）
```

### 5.1 IPC 契约（先定死，避免后期返工）

```
主 → 渲染（推送）
  state:changed     { from, to, payload }
  ingame:tick       { players[], events[], economyDiff }
  building:progress { retry, eta }
  report:ready      { reportId }

渲染 → 主（请求）
  report:get(id) / report:list() / report:exportJson(id)
  league:rescan()
  ai:generate(reportId, opts)
```

### 5.2 数据落盘

两张表就够（P1-P3）：
- `matches(id, game_id, queue_id, started_at, duration, win, raw_json)`
- `ratings(match_id, puuid, carry, team, risk, persona, reasons_json, confidence)`
- （P3）`ai_reviews(match_id, text, model, created_at)`

对局中的实时事件单独存内存 + 局末整包写 `matches.raw_json`，**不做每秒落盘**（写放大）。

---

## 6. 性能预算

| 项 | 预算 | 说明 |
|---|---|---|
| 空闲 CPU | < 1% | S0/S1 只在 2s 心跳时醒 |
| 对局中 CPU | < 6% | 1s + 2s 两路轮询 + 图表重绘 |
| 内存 | < 260MB | Electron 基线 180 + 数据 30 + 余量 |
| 首屏（S0） | < 800ms | 冷启动不阻塞等 LCU |
| 状态切换 | < 320ms | 见 02 §6 |
| 安装包 | < 110MB | 不含 chromium 缓存 |

---

## 7. 风险清单

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R-01 | Riot 变更 LCU 内部接口 | 数据取不到 | 接口层全部包在 adapter 里，单点替换；启动时做一次"字段探活"，缺字段直接降级 |
| R-02 | 客户端反作弊拦截本地 HTTPS 请求 | 完全不可用 | 只读、不改客户端、不注入；如遇拦截，回退到"手动输入 API Key + Riot Web API"模式（P4） |
| R-03 | 敌方字段缺失频率高 | 报告质量下降 | 已设计 S3b + 数据完整度标记（01 规则 4） |
| R-04 | 用户担心封号 | 不敢用 | 关于页明确声明只读官方接口；不提供任何自动化功能 |
| R-05 | Live Client 200-500KB 响应 | 卡顿 | 首帧 allgamedata，之后只用 playerlist/eventdata |
| R-06 | AI 胡说数据 | 失去信任 | Prompt 强约束 + 输出后做**数字回归校验**：文案中出现的数字必须在输入 JSON 里存在，否则重写 |

---

## 8. 开发顺序（P1 起）

1. lockfile / 进程探测 → 能打印出 port+password
2. LCU client + `/lol-summoner/v1/current-summoner` → S1 能显示自己
3. WAMP 订阅 gameflow → 状态机跑通 S0↔S1
4. Live Client 轮询 → S3 能显示 10 人
5. eog 拉取 + gameId 校验 → S4/S5 骨架
6. 评分模型（05 文档）→ 报告有数字
7. 动效与 token 全面替换硬编码
8. AI（P3）

> **修正**：由于"先在 macOS 开发、最终只在 Windows 运行"（决策 D-02），第 1 步之前必须先做 §9 的平台抽象层与 Mock 层。否则在 Mac 上连第 1 步都跑不动。

---

## 9. 平台抽象与 Mock（因 D-02 而必须）

### 9.1 为什么需要

开发机是 macOS，目标机是 Windows。macOS 上没有国服客户端（外服客户端虽存在，但用户实际不用），所以**整个 P1 阶段在 Mac 上不存在真实数据源**。如果不做这层，P1 完全无法开工。

### 9.2 PlatformAdapter

把"平台相关"的三件事抽成接口，其余所有代码不感知平台：

```ts
interface PlatformAdapter {
  // 1. 找客户端进程
  findClientProcess(): Promise<{ pid: number; execPath: string } | null>;
  // 2. 由进程路径推导 lockfile 路径
  resolveLockfilePath(execPath: string): string;
  // 3. 兜底：常见安装目录候选
  defaultInstallDirs(): string[];
}
```

两套实现：

| 项 | Windows | macOS |
|---|---|---|
| 进程探测 | PowerShell `Get-Process LeagueClientUx \| Select Path`（**不用 wmic**，新版 Win11 已移除） | `ps -axo pid,command \| grep LeagueClientUx` |
| 进程名 | `LeagueClientUx.exe` | `LeagueClientUx` |
| lockfile | `{install}\lockfile`（与 `LeagueClientUx.exe` 同级的上一级） | `/Applications/League of Legends.app/Contents/LoL/lockfile` |
| 自定义安装 | 注册表 `HKLM\...\Uninstall` 或 LeagueClient 客户端的 `ProductSettings.yaml` | `~/Library/Application Support/Riot Games/` |

设计要点：
- `resolveLockfilePath` 必须是**纯函数**（输入路径 → 输出路径），因为这是唯一需要针对不同安装器（腾讯 Wegame / Riot 官方 / 外服）做特判的地方，要能被单测覆盖。
- `defaultInstallDirs()` 返回候选列表，逐个 `stat` 而不是递归扫描（不能扫盘，用户会骂）。

### 9.3 Mock 层（P1 的核心交付物之一）

目标是**在 Mac 上完整走通 S0→S5 全流程**，不依赖任何真实客户端。

```
src/main/league/transport.ts
  interface LcuTransport {
    get<T>(path: string): Promise<T>;
    subscribe(event: string, cb: (data: unknown) => void): void;
    close(): void;
  }
```

三套实现：

| 实现 | 何时用 | 行为 |
|---|---|---|
| `RealLcuTransport` | Windows + 客户端在线 | 真实 HTTPS + WAMP |
| `ReplayTransport` | 开发 / 演示 / CI | 读 `fixtures/` 里的真实响应快照，按时间轴回放 |
| `SteppedTransport` | 单测 | 手动 `step() `推进，无定时器 |

`fixtures/` 目录结构（**必须用真实抓包，不能手编**）：

```
fixtures/
├─ session-0001/
│  ├─ meta.json                 { gameId, queue, duration, capturedAt, clientVersion }
│  ├─ 01-current-summoner.json
│  ├─ 02-champ-select-session.json
│  ├─ 03-live-playerlist-t000.json ... tNNN.json   每 2s 一帧
│  ├─ 04-live-eventdata.json    全量事件，回放时按 atSec 切片
│  └─ 05-eog-stats-block.json
└─ session-0002/  （至少准备 3 局：胜局 / 负局 / 数据不全局）
```

**必须准备的三局**，正好覆盖三条代码路径：
1. **胜局**：全字段完整 → 正常路径
2. **负局 + 有争议**：验证"尽力局长"和"犯罪嫌疑人"判定
3. **敌方字段缺失局**：验证 S3b 降级 + confidence 降级

回放时钟支持 `2×/8×/60×` 加速，否则走一局要 28 分钟。CI 里用 `60×`。

### 9.4 平台无关的验证清单

| # | 能验证 | 在 Mac 上怎么验 |
|---|---|---|
| P-01 | 状态机 S0→S5 全流程 | Replay，60× |
| P-02 | 评分模型出分 | fixtures 的 eog json 直接喂 |
| P-03 | 报告页渲染 | 同上 |
| P-04 | 三形态切换 | 无需数据源 |
| P-05 | 真实连接 | ⚠️ 只能在 Windows 上验 |
| P-06 | 进程探测 | ⚠️ 只能在 Windows 上验 |

也就是说：**P1 除 P-05/P-06 外，全部可以在 Mac 上完成并验收**。这两项留到 Windows 联调日一次性验，风险已隔离在 `PlatformAdapter` 一个文件里。

### 9.5 打包策略

- 开发期：`npm run dev`（macOS，Mock 模式）
- 交付：`electron-builder --win`（Windows，Real 模式）
- 构建产物只出 Windows 包；macOS 包不对外发布（但保留 `--mac --dir` 用于本地调试）
