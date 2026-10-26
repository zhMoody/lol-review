# 10 · App 端工程实现

> **这是写代码时对照的文档。** 接口与数据源看 04 / 07，视觉与交互看 02 / 03。
> **没有版本号。这是最终版。**
> 未经明确指令不得开始编码——本文档是"怎么写"的规格，不是开工许可。

---

## 0. 架构原则（强制，违反即不合规）

> 这一章是**红线**。代码评审先看这里，再看逻辑对不对。

### 0.1 数据与 UI 解耦：三层模型

**目标：换 UI 时不碰数据层。** 想换 React → Vue、换桌面 → Web、换主窗 → 悬浮条，只改 `renderer/` 里的渲染部分。

```
┌──────────────────────────────────────────────┐
│ ① domain   shared/domain/                    │  领域模型：Match / Player / Rating / Augment
│            与 UI 完全无关，不 import 任何 UI 库 │  由 fixtures 生成，zod 校验
├──────────────────────────────────────────────┤
│ ② viewmodel renderer/viewmodels/             │  domain → 视图形状的纯映射
│            只做格式化、排序、派生计算           │  不发请求、不读 store、不碰 DOM
├──────────────────────────────────────────────┤
│ ③ view     renderer/views + components/      │  纯展示：接收 viewmodel，输出 JSX
│            不发请求、不解析 domain、不写业务    │
└──────────────────────────────────────────────┘
```

**硬性检查（PR 必过）**：

| 检查项 | 违反示例 |
|---|---|
| `views/`、`components/` **不得 import** `shared/domain/` | 组件里直接读 `player.stats.totalDamageDealtToChampions` |
| `views/`、`components/` **不得** 调用 tRPC / fetch | 组件里写 `useQuery` |
| `viewmodels/` **不得 import** React / DOM | 映射函数里写 `document` 或 JSX |
| `shared/` **不得 import** renderer / main | 领域类型依赖了 React 类型 |
| domain 类型字段名跟接口一致，**不为了好看改名** | 把 `totalDamageDealtToChampions` 改成 `damage` |

> 改名只允许发生在 viewmodel 层。domain 保持与 Riot/腾讯接口同名，这样查文档、对字段、抓包都是一眼的事。

**换 UI 的成本** = 重写 `renderer/views/` + `viewmodels/` 里的渲染函数。`main/`、`shared/`、评分引擎、数据库 **一行不动**。

### 0.2 类型规范：`any` 一律禁止

```jsonc
// tsconfig.json —— 全开，不商量
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,   // arr[0] 是 T | undefined
    "exactOptionalPropertyTypes": true, // {a?: string} 不接受 a: undefined
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true
  }
}
```

```js
// .eslintrc —— 这些规则必须是 error
"@typescript-eslint/no-explicit-any": "error",
"@typescript-eslint/no-unsafe-assignment": "error",
"@typescript-eslint/no-unsafe-member-access": "error",
"@typescript-eslint/no-unsafe-call": "error",
"@typescript-eslint/no-unsafe-return": "error",
"@typescript-eslint/no-unsafe-argument": "error",
"@typescript-eslint/consistent-type-imports": "error",
"@typescript-eslint/no-non-null-assertion": "error"
```

**规则**：

| 禁止 | 替代 |
|---|---|
| `any` | `unknown` + 类型收窄 / zod `.parse()` |
| `as any` | 收窄，或改 schema |
| `as SomeType`（宽断言） | `as unknown as SomeType` 仅限已验证场景，且必须注释说明来源 |
| `@ts-ignore` | `@ts-expect-error` 且**必须写原因** |
| `!` 非空断言 | 可选链 `?.` + 显式判空 |
| `Function` / `Object` / `{}` | 具体签名 / `Record<string, unknown>` / 具体对象类型 |
| `enum` 数字枚举 | `as const` 对象 + 联合类型（避免反向映射的坑） |

**外部数据的唯一入口是 zod**：

```ts
// ✅ 对
const Match = z.object({ /* ... */ })
type Match = z.infer<typeof Match>
const m: Match = Match.parse(raw)   // 校验通过才进入 domain

// ❌ 错
const m = raw as Match              // 凭信任断言
```

**联合类型优于可空**：`status: 'idle' | 'loading' | 'ready' | 'error'` 而不是 `status: string | null`。

### 0.3 文件与目录规范

**一文件一职责，一组件一文件。**

| 对象 | 命名 | 示例 |
|---|---|---|
| 文件 / 目录 | `kebab-case` | `match-recorder.ts` |
| React 组件 | `PascalCase` | `ChampionSlot.tsx` |
| 类型 / 接口 | `PascalCase` | `interface FeedDeath` |
| 函数 / 变量 | `camelCase` | `computeFeedDeaths` |
| 常量 | `SCREAMING_SNAKE` | `MAX_RETRY_COUNT` |
| zod schema | 与类型同名 | `const Match = z.object(...)` |

**按领域分组，不按类型分组**：

```
❌ renderer/components/Button.tsx
                 Card.tsx
                 PlayerRow.tsx          ← 100 个文件堆一起，找不到

✅ renderer/components/
     button/Button.tsx
     card/Card.tsx
     player/PlayerRow.tsx
     player/PlayerStats.tsx
```

**类型分三处放，不许乱塞**：

| 位置 | 放什么 | 不放什么 |
|---|---|---|
| `shared/domain/*.ts` | 领域模型（与接口字段同名） | UI 用的展示字段 |
| `shared/contracts/*.ts` | tRPC 输入输出 | 领域内部结构 |
| `组件文件内` | `interface XxxProps` | 领域模型 |

**barrel export**：每个目录一个 `index.ts`，只 `export type` 与组件/函数，**不得有副作用**（不许在 barrel 里 import CSS、不许注册副作用）。

**单文件上限**：组件 200 行、逻辑模块 300 行。超过就拆，不写"先这样，以后再拆"。

### 0.4 组件规范

| 角色 | 职责 | 允许 | 禁止 |
|---|---|---|---|
| **容器**（`views/`） | 编排数据、接 store | 调 hooks、组合子组件 | 写样式、写业务计算 |
| **展示**（`components/`） | 渲染 props | 内部 UI 状态（hover/展开） | 发请求、读全局 store、算业务 |
| **映射**（`viewmodels/`） | domain → 视图形状 | 纯函数 | React、DOM、IO |

- **props 显式声明**，不用 `{...rest}` 透传到子组件。
- **一个组件一件事**。`PlayerRow` 不要顺手算评分。
- **样式就近**（CSS Modules 同名文件），但颜色/字阶/时长**只准用 `tokens.css` 的变量**。

### 0.5 查证规范：不懂就查，不许猜

**这是写法规范里最容易被违反的一条。**

| 场景 | 正确做法 | 错误做法 |
|---|---|---|
| 不确定某个库的 API | 查 npm README / 官方文档 / 源码 | 凭印象猜参数名 |
| 不确定某个字段的含义 | 抓一次真实响应，或查 fixtures | 看名字猜语义 |
| 不确定某个 TS 行为 | 查手册 / 写最小复现 | "应该可以吧" |
| 引入新依赖 | 核对版本、维护状态、license、类型支持 | 直接 `npm i` |

**必须留痕**：
- 关键假设写进注释，并附出处链接
- 猜出来的阈值必须标注「待校准」，并写清校准方法
- 接口字段含义不确定的，在 `shared/domain` 里加 `// UNVERIFIED: ...`

> 我们踩过的坑：`playerAugment5/6` 恒为 0、`level` 字段是 `255` 占位、`lowestRankAugmentIds` 是符文不是装备——**全是靠抓真实数据才发现的**。猜就会错。

---

## 1. 技术栈（决策）

### 1.0 铁律：坚决不造轮子

**能用库就用库。** 判断标准：这个东西是"业务逻辑"还是"通用能力"？通用能力一律找库，找不到才写，写了要写清为什么没有现成的。

已知"必须自己写"的只有一处：**qq101 打包串解析**（`_` 分段、`#` 分记录的私有格式），约 50 行。其余全部用库。

### 1.1 库清单（已核实 npm 现状）

| 用途 | 库 | 版本 | 说明 |
|---|---|---|---|
| **LCU 连接** | `league-connect` | 6.0.0-rc13 | **进程发现 / 鉴权 / WS 订阅 / HTTP 全包**，自带 TS 类型，MIT |
| **动画** | `gsap` | 3.15 | 用户指定。全局仅 4 个动效，用 timeline 编排 |
| **图标形变** | `morphicons` | — | 零依赖 10KB，`import { MorphIcon } from "morphicons/react"` |
| **图标源** | `lucide-react` | 1.61 | morphicons 消费 `IconNode` 数据 |
| **数据校验** | `zod` | 4.6 | 所有 API 响应必须过 schema，尤其 qq101 打包串 |
| **交互原语** | `@radix-ui/react-*` | 1.x | **无样式**，只取无障碍/键盘/焦点。见 §1.1.1 |
| **图表** | `@visx/xychart` | 4.0 | 无样式，D3 底层。用于 B6 经济曲线 |
| **IPC** | `electron-trpc` + `@trpc/server` | 0.7 | 替代手写 typed IPC，端到端类型安全 |
| **数据获取/缓存** | `@tanstack/react-query` | 5.10 | 替代手写 cache.ts，自带 TTL / 失效 / 重试 |
| **本地库** | `better-sqlite3` | 13.0 | 同步 API，性能足够 |
| **并发限流** | `p-limit` | 7.3 | S2 拉 5 人战绩必须限流 |
| **状态** | `zustand` | — | 状态机 reducer + 全局 store |
| **UI** | React 18 + Vite | — | — |
| **日期** | `dayjs` | 1.11 | 2KB |
| **日志** | `electron-log` | 5.4 | 文件轮转、分级 |
| **窗口状态** | `electron-window-state` | 5.0 | 记住尺寸/位置（悬浮条尤其需要） |
| **ID** | `nanoid` | 6.0 | — |
| **测试** | `vitest` | — | fixtures 回放 |
| **打包** | `electron-builder` | — | Win 交付 |

### 1.1.1 交互原语：Radix（不选成品组件库）

我们的界面 90% 是定制的（头像阵容、三轨、罪状清单、死亡位置图），**成品组件库会天天打架**。真正需要外取的是交互原语——无障碍、键盘导航、焦点管理自己写必错。

| 需求 | 包 | 出现在 |
|---|---|---|
| 开关 | `@radix-ui/react-switch` | 美颜开关、设置页 toggle |
| 下拉 | `@radix-ui/react-select` | 排序方式、透明度、位置 |
| 模态 | `@radix-ui/react-dialog` | 导出确认、手动指定路径 |
| Tabs | `@radix-ui/react-tabs` | 设置页六分区 |
| Toast | `@radix-ui/react-toast` | 导出成功、连接失败 |
| 滚动条 | `@radix-ui/react-scroll-area` | 历史列表、报告长页 |
| Tooltip | `@radix-ui/react-tooltip` | 符文名、指标说明 |
| 悬浮层 | `@radix-ui/react-popover` | 头像详情 |

选它的理由：完全无样式（token 直接套）、无障碍做完、TS 原生、按需引入、MIT、1.x 稳定。

**明确不选**：

| 库 | 原因 |
|---|---|
| MUI / AntD / Mantine / Chakra / NextUI | 成品视觉系统，与"单色 + 一处红、通栏细线不用卡片"冲突 |
| shadcn/ui | Tailwind 强绑 + 代码复制进项目 = 自己维护那堆代码，正是造轮子 |
| Headless UI | 偏 Tailwind 生态，覆盖原语少于 Radix |
| Base UI | `1.0.0-rc.0`，太新 |
| React Aria Components | 无障碍最强但 API 重，Radix 够用 |

**必须自己写的**（设计系统骨架，换个项目用不上）：`ChampionSlot`、`PlayerRow`、`VerdictCol`、`IndictList`、`DeathMap`、`MatchAxis`、`AugmentBuild`。

判断标准：**换个项目还用得上就找库；只在这个产品有意义就自己写。**

### 1.2 各层选型理由

| 层 | 选择 | 理由 |
|---|---|---|
| 壳 | **Electron**（已定） | 五件事的生态成熟度：自签证书、WSS、透明置顶窗、托盘、原生 SQLite |
| 样式 | **CSS Modules + CSS 变量** | 不是造轮子，是标准方案。理由见下 |
| 动画 | **GSAP**（用户指定） | 4 个动效用 timeline 编排，`prefers-reduced-motion` 统一降级 |

**样式为什么不用 Tailwind**：不是不用，是这里摩擦更大。02 文档要求"任何 PR 里出现 `#` 颜色字面量即不合规"、精确字阶（9.5/10/11.5/12.5/13/21/32/52）、精确时长（90/180/280/600ms）。Tailwind 的任意值反而**鼓励**写死这些数字，token 强制力下降。CSS Modules + 一个 lint 规则更严。
→ 如果团队更熟 Tailwind，token 映射到 theme 即可，不影响架构。这是口味问题，不是对错。

### 1.3 `league-connect` 的能力边界（重要）

```ts
import {
  authenticate,              // 自动发现 LeagueClientUx → { port, password }
  createHttp1Request,        // HTTP/1.1 请求
  createHttp2Request,        // HTTP/2（需 session）
  createWebSocketConnection, // WSS + ws.subscribe(path, cb)
  LeagueClient,              // EventEmitter: 'connect' / 'disconnect'
} from 'league-connect'
```

关键选项：

| 选项 | 默认 | 说明 |
|---|---|---|
| `awaitConnection` | `false` | 设 `true` 则阻塞等待客户端启动 |
| `pollInterval` | 2500ms | 进程探测频率 |
| `certificate` | Riot 自签证书 | **默认就用 Riot 的证书，不用 `unsafe:true`** |
| `unsafe` | `false` | 忽略证书校验（我们不需要） |
| `useDeprecatedWmic` | `false` | Win 上退回 wmic（新版 Win 已移除，别开） |
| `windowsShell` | `powershell` | Win 进程探测用的 shell |

**这意味着原计划的 `platform.ts` / `lockfile.ts` / `lcu-client.ts` / `wamp.ts` 四个模块整体作废**，替换为对 `league-connect` 的薄封装。

⚠️ **风险**：`6.0.0-rc13` 且两年未更新。对策：
1. **pin 死版本**，不跟 `^`
2. 所有调用包在 `src/main/lcu/` 里，**不直接 import 到业务代码**——库挂了或要换，只改一层
3. P1-1 先做一次"国服实测"：能不能发现腾讯客户端、能不能连上。**这条不过，退回手写**

### 1.4 备选 Tauri 2

体积小、内存低（对"游戏旁挂"友好）。但 `league-connect` 是 Node 库，Tauri 要在 Rust 侧重做连接层。
→ **P1 不做**。P4 若内存成问题再评估。

---

## 2. 进程模型

```
┌─────────────────────────────────────────────┐
│ main（Node）                                  │
│  ├─ lcu/         league-connect 薄封装        │
│  ├─ sources/     gtimg / qq101（react-query 管缓存）│
│  ├─ core/        状态机、评分引擎、对局记录      │
│  ├─ db/          better-sqlite3               │
│  ├─ ai/          P3                           │
│  └─ router.ts    tRPC router                  │
└──────────────────┬──────────────────────────┘
                   │ electron-trpc（contextBridge）
┌──────────────────▼──────────────────────────┐
│ preload                                       │
└──────────────────┬──────────────────────────┘
                   │ trpc.xxx.query / .mutate
┌──────────────────▼──────────────────────────┐
│ renderer（React + React Query + Zustand）      │
│  ├─ views/    offline / home / teammates /    │
│  │            ingame / limited / building /   │
│  │            report / settings               │
│  ├─ components/  （含 MorphIcon）              │
│  └─ motion/    GSAP timeline 封装              │
└─────────────────────────────────────────────┘
```

**硬规则**：
1. **LCU 凭证（port/password）只在 main**，绝不进 renderer，绝不打日志。
2. renderer **不直接发 HTTP**。所有数据走 tRPC。
3. 业务代码 **不直接 import `league-connect`**，只 import `src/main/lcu/` 的封装。
4. 所有外部响应过 **zod schema**，校验失败走降级，不抛崩。

---

## 3. 目录结构

> **按领域分组，不按类型分组。** 类型分三处：`shared/domain`（领域）/ `shared/contracts`（IPC）/ 组件内 `Props`。

```
src/
├─ main/                          ── 数据生产侧，与 UI 无关 ──
│  ├─ lcu/                        唯一接触 league-connect 的地方
│  │  ├─ connection.ts            authenticate / LeagueClient 生命周期
│  │  ├─ http.ts                  createHttp1Request + zod 校验 + 超时
│  │  ├─ events.ts                createWebSocketConnection + 订阅注册表
│  │  ├─ index.ts                 barrel（只导出封装，不导出库类型）
│  │  └─ endpoints/
│  │     ├─ summoner.ts
│  │     ├─ gameflow.ts
│  │     ├─ champ-select.ts
│  │     ├─ match-history.ts
│  │     └─ end-of-game.ts
│  ├─ sources/
│  │  ├─ gtimg.ts                 英雄表 + kiwi_augments
│  │  ├─ qq101.ts                 三榜请求
│  │  ├─ qq101-packed.ts          ★ 唯一自写解析（~50 行，私有格式）
│  │  └─ index.ts
│  ├─ core/
│  │  ├─ state-machine.ts         纯函数 reducer
│  │  ├─ poller.ts                统一轮询调度
│  │  ├─ match-recorder.ts        对局中事件累积
│  │  ├─ timeline.ts              团战聚类、白给归因
│  │  ├─ rating/
│  │  │  ├─ axes.ts               CARRY / TEAM / RISK
│  │  │  ├─ feed.ts               FeedDeaths 判定
│  │  │  ├─ persona.ts            人设规则表
│  │  │  ├─ augment.ts            B1 符文构筑分
│  │  │  └─ index.ts
│  │  └─ presets.ts               队友情报聚合、开场预言
│  ├─ db/
│  │  ├─ schema.sql
│  │  └─ repo.ts
│  ├─ ai/                         P3
│  └─ router.ts                   tRPC router（唯一 IPC 出入口）
│
├─ preload/
│  └─ index.ts                    electron-trpc link
│
├─ shared/                        ── 领域层，UI 无关 ──
│  ├─ domain/                     ★ 由 fixtures 生成，与接口字段同名
│  │  ├─ match.ts                 Match / Team / MatchParticipant
│  │  ├─ timeline.ts              GameTimeline / Frame / KillEvent
│  │  ├─ augment.ts               Augment / AugmentBuild / AugmentRank
│  │  ├─ player.ts                Summoner / RankedStats / TeammateInfo
│  │  ├─ rating.ts                Axes / FeedDeath / PersonaKey / Report
│  │  ├─ live.ts                  LivePlayer / LiveEvent（对局中）
│  │  └─ index.ts
│  ├─ contracts/                  tRPC 输入输出
│  │  ├─ league.ts  report.ts  teammates.ts  settings.ts  ai.ts
│  │  └─ events.ts                AppEvents 推送载荷
│  ├─ enums.ts                    State / PersonaKey / QueueMode（as const）
│  ├─ errors.ts                   ErrorCode 枚举 + AppError 类
│  └─ index.ts
│
├─ renderer/                      ── 消费侧 ──
│  ├─ data/                       取数层：只调 tRPC，不写展示逻辑
│  │  ├─ hooks/
│  │  │  ├─ use-league.ts         useConnection / useGameflowPhase
│  │  │  ├─ use-report.ts         useReport / useReportList
│  │  │  ├─ use-teammates.ts      useTeammates（p-limit 限流）
│  │  │  └─ use-events.ts         订阅 AppEvents
│  │  └─ index.ts
│  │
│  ├─ viewmodels/                 ★ domain → 视图形状，纯函数，不碰 React
│  │  ├─ report-viewmodel.ts      Report → ReportView（含 verdict 排序、罪状分组）
│  │  ├─ ingame-viewmodel.ts      LiveTick → IngameView（含生死/倒计时/槽位）
│  │  ├─ teammates-viewmodel.ts   TeammateInfo → TeammateCardView
│  │  ├─ home-viewmodel.ts        MatchSummary[] → HistoryRow[]
│  │  ├─ formatters.ts            数字/时间/百分比格式化
│  │  └─ index.ts
│  │
│  ├─ views/                      容器：编排数据，不写样式
│  │  ├─ offline/OfflineView.tsx
│  │  ├─ home/HomeView.tsx
│  │  ├─ teammates/TeammatesView.tsx
│  │  ├─ ingame/IngameView.tsx
│  │  ├─ ingame/LimitedView.tsx
│  │  ├─ building/BuildingView.tsx
│  │  ├─ report/ReportView.tsx
│  │  └─ settings/SettingsView.tsx
│  │
│  ├─ components/                 展示：只收 props，不发请求不读 store
│  │  ├─ button/    Button.tsx  Button.module.css
│  │  ├─ card/      Card.tsx
│  │  ├─ player/    ChampionSlot.tsx  PlayerRow.tsx  PlayerStats.tsx
│  │  ├─ augment/   AugmentChip.tsx  AugmentBuild.tsx
│  │  ├─ timeline/  MatchAxis.tsx  TimelineEvent.tsx
│  │  ├─ verdict/   VerdictCol.tsx  IndictList.tsx  DeathMap.tsx
│  │  ├─ status/    StatusDot.tsx  BeautyToggle.tsx
│  │  ├─ layout/    TopBar.tsx  SectionRule.tsx  EmptyState.tsx
│  │  └─ index.ts
│  │
│  ├─ motion/                     GSAP timeline 封装
│  │  ├─ engine.ts                注册 prefers-reduced-motion 降级
│  │  ├─ enter.ts                 区块入场（stagger）
│  │  ├─ data.ts                  数值/宽度变化
│  │  └─ index.ts
│  │
│  ├─ tokens.css                  ★ 唯一颜色/字阶/时长/圆角来源
│  └─ app.tsx
│
└─ fixtures/                      测试与开发用真实快照
   ├─ tencent-hn10/               复用 LeagueAkari 国服快照
   ├─ qq101/                      三榜固化（含日期）
   └─ gtimg/                      英雄表 + 符文图鉴
```

### 3.1 换 UI 时的改动范围

| 换什么 | 要改 | 不改 |
|---|---|---|
| React → Vue | `renderer/views/`、`components/`、`motion/` | `shared/`、`main/`、`viewmodels/`（纯函数可复用） |
| 主窗 → 悬浮条 | 新建 `views/bar/` | 其余全部 |
| 桌面 → Web | `main/` 换成 BFF，`renderer/` 大部分保留 | `shared/`、`viewmodels/` |

**判断标准：改 UI 时如果需要动 `shared/` 或 `main/`，说明解耦失败了。**

---

## 4. 一条对局的完整数据流

```
[进程探测]  PlatformAdapter.findClientProcess() → lockfile 解析 → port/password
     ↓
[连接]      lcu-client 建 HTTPS（rejectUnauthorized:false）
            wamp 订阅 OnJsonApiEvent_lol-gameflow_v1_gameflow-phase
     ↓
[S1]        GET /lol-summoner/v1/current-summoner
            GET /lol-ranked/v1/current-ranked-stats
     ↓
[S2]        gameflow-phase = ChampSelect
            并发拉 5 人：summoner / ranked-stats / match-history({puuid})
            并发拉 qq101 三榜（缓存命中则跳过）
     ↓
[S3]        gameflow-phase = InProgress
            live-client 每 2s playerlist，每 1s eventdata
            match-recorder 内存累积事件
     ↓
[S4]        gameflow ∈ {WaitingForStats, PreEndOfGame}
            或 2999 连续 3 次不可达
            延迟 1200ms 才显示 UI
     ↓
[S5]        GET /lol-match-history/v1/games/{gameId}
            GET /lol-match-history/v1/game-timelines/{gameId}
            校验 gameId === session.gameData.gameId，不符则重试（12 次 × 1s）
     ↓
[评分]      timeline → FeedDeaths / 团战聚类
            eog stats → CARRY / TEAM / RISK
            playerAugment1..4 → B1 构筑分
            → persona 规则表 → 报告对象
     ↓
[落库]      matches + ratings + (P3) ai_reviews
     ↓
[渲染]      ipc.sendEvent('report:ready', report)
```

**关键点**：
- S2 的 5 人战绩是**并发**请求，且必须限流（5 人 × 多接口），用 `p-limit(3)`。
- S5 的 `gameId` 校验是硬规则，**不校验就会拿到上一局的数据**。
- 评分引擎是**纯函数**：输入 eog + timeline + 图鉴，输出报告对象。不碰 IO，可单测。

---

## 5. IPC 契约（tRPC）

用 `electron-trpc`，**端到端类型安全，不手写 typed IPC**。

```ts
// src/main/router.ts
export const appRouter = router({
  league: router({
    rescan:     p.mutation<void, ConnectionState>(),
    setPath:    p.mutation<{ dir: string }, Settings>(),
  }),
  report: router({
    get:        p.query<{ id: string }, Report>(),
    list:       p.query<{ limit?: number; offset?: number }, ReportSummary[]>(),
    exportJson: p.mutation<{ id: string }, { path: string }>(),
  }),
  teammates: router({
    query:      p.query<{ puuids: string[] }, TeammateInfo[]>(),
  }),
  settings: router({
    get:        p.query<void, Settings>(),
    update:     p.mutation<Partial<Settings>, Settings>(),
  }),
  ai: router({                                      // P3
    generate:   p.mutation<{ reportId: string }, AiReview>(),
    regenerate: p.mutation<{ reportId: string }, AiReview>(),
  }),
})

// 事件推送用 electron 的 ipcRenderer.on，包一层 typed emitter
export type AppEvents = {
  'state:changed':     { from: State; to: State; payload?: unknown }
  'league:tick':       { at: number; players: LivePlayer[]; events: LiveEvent[] }
  'building:progress': { retry: number; gameId: number }
  'report:ready':      { reportId: string }
  'teammates:ready':   { puuids: string[] }
  'error':             { scope: string; code: string; message: string; recoverable: boolean }
}
```

**约定**：
1. 所有 query/mutation **必须有超时**（默认 8s，图鉴 15s）——tRPC 的 `abortOnUnmount` + 自建 timeout link。
2. 所有 event 都是**幂等快照**，不是增量——renderer 直接替换，不合并。
3. `error.code` 是稳定枚举，renderer 靠它决定文案，不解析 `message`。
4. **凭证不进任何 tRPC 响应。**

---

## 6. 状态机（唯一真相）

```ts
type State =
  | 'OFFLINE'           // S0
  | 'CLIENT_IDLE'       // S1
  | 'CHAMP_SELECT'      // S2
  | 'IN_GAME'           // S3
  | 'IN_GAME_DEGRADED'  // S3b
  | 'BUILDING'          // S4
  | 'REPORT'            // S5

function reduce(state: State, ev: GameflowEvent | InternalEvent): State
```

**转移规则（写进测试）**：

| 从 | 事件 | 到 | 附加条件 |
|---|---|---|---|
| OFFLINE | lockfile 可读 + 鉴权通过 | CLIENT_IDLE | — |
| CLIENT_IDLE | `ChampSelect` | CHAMP_SELECT | — |
| CHAMP_SELECT | `InProgress` | IN_GAME | — |
| CHAMP_SELECT | 秒退 | CLIENT_IDLE | 不产生记录 |
| IN_GAME | Live Client 字段缺失 | IN_GAME_DEGRADED | **不是异常** |
| IN_GAME / DEGRADED | `WaitingForStats` 或 2999×3 不可达 | BUILDING | 延迟 1200ms |
| BUILDING | gameId 校验通过 | REPORT | — |
| BUILDING | 重试 12 次失败 | REPORT | 报告标"数据不全" |
| REPORT | 开下一局 | CLIENT_IDLE | — |
| 任意 | 进程消失 | OFFLINE | 5s 内 |

**禁止**：任何"自由导航"。renderer 只能渲染当前 state，不能自己跳。

---

## 7. 存储 Schema

```sql
CREATE TABLE matches (
  id            TEXT PRIMARY KEY,          -- gameId
  queue_id      INTEGER NOT NULL,          -- 2400
  game_mode     TEXT NOT NULL,             -- 'KIWI'
  started_at    INTEGER NOT NULL,
  duration_sec  INTEGER NOT NULL,
  win           INTEGER NOT NULL,
  raw_eog       TEXT NOT NULL,             -- JSON，原始快照
  raw_timeline  TEXT NOT NULL,
  captured_at   INTEGER NOT NULL
);

CREATE TABLE players (                     -- 一局 10 行
  match_id      TEXT NOT NULL,
  puuid         TEXT NOT NULL,
  participant_id INTEGER NOT NULL,
  champion_id   INTEGER NOT NULL,
  is_self       INTEGER NOT NULL,
  kda_k         INTEGER, kda_d INTEGER, kda_a INTEGER,
  dmg_to_champ  INTEGER, dmg_taken INTEGER, heal INTEGER,
  cc_time       INTEGER, gold_earned INTEGER, gold_spent INTEGER,
  longest_living INTEGER,
  augments      TEXT,                      -- '[1007,1004,1022,1013]'
  PRIMARY KEY (match_id, puuid)
);

CREATE TABLE ratings (
  match_id      TEXT NOT NULL,
  puuid         TEXT NOT NULL,
  carry         REAL, team REAL, risk REAL,
  feed_deaths   INTEGER,
  build_score   REAL,                      -- B1
  persona       TEXT NOT NULL,             -- persona.crime 等 key
  reasons       TEXT NOT NULL,             -- JSON，可查证理由
  confidence    REAL NOT NULL,
  PRIMARY KEY (match_id, puuid)
);

CREATE TABLE cache (                       -- 图鉴与榜单
  key           TEXT PRIMARY KEY,          -- 'gtimg:augments' / 'qq101:rune-rank'
  payload       TEXT NOT NULL,
  fetched_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);

CREATE INDEX idx_players_puuid ON players(puuid);
CREATE INDEX idx_matches_started ON matches(started_at);
```

**保留策略**：默认最近 20 局（设置可改）。超限按 `started_at` 删，**连带删 players / ratings**（外键）。

---

## 8. 评分引擎接口（纯函数）

```ts
interface RateInput {
  eog: EogStatsBlock            // /lol-match-history/v1/games/{id}
  timeline: GameTimeline        // /lol-match-history/v1/game-timelines/{id}
  augments: AugmentCatalog      // 图鉴
  ranks: AugmentRankTable       // qq101 海克斯榜（含 winRank）
  heroRanks: HeroRankTable      // qq101 英雄榜（含 lowestRankAugmentIds）
}

interface RateOutput {
  players: Array<{
    puuid: string
    axes: { carry: number; team: number; risk: number }
    feedDeaths: FeedDeath[]     // 每条带 timestamp / position / reason
    buildScore: number
    persona: PersonaKey
    reasons: string[]           // 可查证，带数字
    confidence: number
  }>
  timeline: TimelineEvent[]     // 罪状清单用
  verdict: { best: string; worst: string; passive: string }
}
```

**硬要求**：
1. **不碰 IO、不碰时间、不碰随机数**。同输入必同输出。
2. 每个 `reasons[i]` 里的数字必须能在输入里找到——AI 那套「数字回归校验」同样适用于模板文案。
3. 缺字段 → 降 `confidence`，不补零。

---

## 9. 缓存与降级

| 数据 | TTL | 失效行为 |
|---|---|---|
| gtimg 英雄表 | 7 天 | 用本地副本，启动时后台刷新 |
| gtimg kiwi_augments | 1 天 | 同上。**查不到的 ID 显示占位框，不显示"未知"** |
| qq101 三榜 | 1 天（按 `dtstatdate`） | **接口挂了产品照常用**，只是没有推荐/评分降级 |
| LCU 图鉴（items/champions） | 客户端版本变化时 | 从 `gameVersion` 判断 |

**降级链**（必须全部实现）：

```
qq101 不可达          → B1/B2 不可用，报告隐藏符文评分，其余正常
gtimg 不可达          → 符文显示 ID 数字，图标占位
LCU match-history 不可达 → 用 eog-stats-block 兜底（数据少，标"数据不全"）
时间线不可达          → RISK 轴去掉 FeedDeaths 权重（0.45），confidence 上限 0.6
```

---

## 10. 测试策略

**核心是 fixtures 回放，不是 mock。**

```
test-fixtures/
├─ tencent-hn10/          ← 直接复用 LeagueAkari 的国服快照
│  ├─ lcu/match-history/games/q_2400.json
│  ├─ lcu/match-history/timelines/q_2400.json
│  └─ sgp/match-history-query/q_2400.json
├─ qq101/                 ← 自己抓，固化日期
│  ├─ rune-rank-20261025.json
│  ├─ hero-rank-20261025.json
│  └─ pair-synergy-20261025.json
└─ gtimg/
   ├─ hero_list.json
   └─ kiwi_augments.json
```

| 测什么 | 怎么测 |
|---|---|
| 状态机 7 态全链路 | `SteppedTransport` 手动推进，60× 速度 |
| 评分引擎 | fixtures 直接喂，断言 persona / feedDeaths / buildScore |
| 白给判定阈值 | 用 5 局真实时间线，人工对照 |
| qq101 解析器 | 打包串含畸形记录，断言跳过而非抛错 |
| 三形态切换 | 断言 store 不重置 |

**必须有的回归用例**：`gameId` 不匹配时重试、字段缺失时 confidence 下降、低选取率符文 conf 收缩。

**架构守卫（lint + 测试，PR 必过）**：

| 检查 | 实现 |
|---|---|
| 禁止 `any` / `as any` / `@ts-ignore` | ESLint error |
| `views/`、`components/` 不得 import `shared/domain/` | `eslint-plugin-boundaries` 或 `import/no-restricted-paths` |
| `viewmodels/` 不得 import React / DOM | 同上 |
| `shared/` 不得 import renderer / main | 同上 |
| 颜色字面量只准出现在 `tokens.css` | 自定义 lint 规则（禁止 `#` 开头字面量） |
| 外部响应必须过 zod | 代码评审 + `eslint-plugin-unicorn` 的 `no-typeof-undefined` 之类兜不住，靠评审 |

---

## 11. 构建与交付

```bash
npm run dev              # macOS，ReplayTransport（无客户端）
npm run dev:live         # macOS，RealTransport（需外服客户端）
npm run test             # Vitest，含 fixtures 回放
npm run build:win        # Windows 交付包
```

- **只出 Windows 包**。mac 包仅本地调试用（`--mac --dir`）。
- 环境变量 `LOL_REVIEW_TRANSPORT=replay|real|stepped` 切换数据源。
- 环境变量 `LOL_REVIEW_FIXTURE=tencent-hn10/q_2400` 选快照。

---

## 12. 性能预算

| 项 | 预算 | 测法 |
|---|---|---|
| 空闲 CPU（S0/S1） | < 1% | 2s 心跳，无轮询 |
| 对局中 CPU（S3） | < 6% | 1s+2s 两路轮询 |
| 内存 | < 260MB | Electron 基线 180 + 数据 30 |
| 状态切换 | < 320ms | 见 02 §4 |
| 一局报告生成 | < 2s（图鉴已缓存） | 从 eog 到 report:ready |
| 冷启动到 S0 | < 800ms | 不阻塞等 LCU |
| 安装包 | < 110MB | 不含 chromium 缓存 |

---

## 13. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R-01 | LCU 内部接口变更 | 接口全包 adapter；启动做"字段探活"，缺关键字段降级不崩 |
| R-02 | `mlol.qt.qq.com` 改版或封禁 | 必须缓存 + 降级。**产品核心功能（评分/报告）不依赖它**，只有推荐依赖 |
| R-03 | gtimg 图鉴 ID 漂移 | 查不到显示占位框，不显示"未知符文" |
| R-04 | 反作弊拦截本地 HTTPS | 只读、不注入、不改包；若被拦，回退"手动模式"（用户自己导出 JSON） |
| R-05 | 时间线过大 | 25 帧 + 179 事件，实际很小。但仍按帧流式解析，不整包 eval |
| R-06 | 打包串解析失败 | 单条跳过 + 记警告，不整批失败 |
| R-07 | 多局并发 | `gameId` 做幂等键，重试只对当前 gameId |
| R-08 | 用户担心封号 | 关于页明写只读官方接口 + 免责声明 |

---

## 14. 开工顺序

| 阶段 | 内容 | 产出 | Mac 上能验吗 |
|---|---|---|---|
| **P1-1** | `league-connect` 接入 + zod schema + fixtures 生成 types | **国服实测**：能否发现腾讯客户端、能否连上 | ⚠️ 唯一不能 |
| **P1-2** | tRPC router + 状态机 + tokens.css + GSAP 封装 | 七屏按状态切换（假数据） | ✅ |
| **P1-3** | match-history + timeline 解析 + qq101 打包串解析 | 能从 fixtures 读出 10 人数据与三榜 | ✅ |
| **P1-4** | 评分引擎（axes / feed / persona / augment） | 报告对象，单测全绿 | ✅ |
| **P2-1** | S2 队友情报 + qq101 三榜接入 | 选人屏真实数据 | ✅ |
| **P2-2** | S3 实时 + match-recorder | 对局中真实数据 | ✅ |
| **P2-3** | 设置页 + 三形态切换 | 形态切换不重置状态 | ✅ |
| **P3** | AI 评价 + 成就 + 分享 | 整蛊层 | ✅ |

**P1-1 是唯一在 Mac 上做不了的部分**，而且因为用了 `league-connect`，工作量从"手写四模块"缩到"接一个库 + 国服实测"。其余全部可在 Mac 上完成并验收。

**P1-1 的第一个任务是「国服实测」**：在 Windows + 腾讯客户端上跑一次 `authenticate()`。这条不过，才退回手写连接层。
