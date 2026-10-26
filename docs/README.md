# LoL 战报 · 文档集

> 一个只服务**国服海克斯大乱斗**的本地单机战报工具。
> 本目录只有文档，无业务代码。**未经明确指令不得开始编码。**
> **没有版本号。做到的就是最终版，之前的都被删掉了。**

---

## 文档索引

| 文件 | 内容 |
|---|---|
| [`01-product-spec.md`](./01-product-spec.md) | 产品定义、状态机、功能需求、验收、合规 |
| [`02-design-system.md`](./02-design-system.md) | 设计系统：中性极简，单色 + 一处红 |
| [`03-screens.md`](./03-screens.md) | 界面地图：每屏为什么这么排、数据从哪来 |
| [`04-architecture.md`](./04-architecture.md) | 接口清单、架构、平台抽象、Mock |
| [`06-window-modes.md`](./06-window-modes.md) | 三形态（主窗 / 悬浮条 / 叠加层）与设置页 |
| [`07-hexaram-model.md`](./07-hexaram-model.md) | **实测数据目录** + 大乱斗评分模型 |
| [`08-fun-features.md`](./08-fun-features.md) | 彩蛋与整蛊（只列能实现的） |
| [`09-feature-gaps.md`](./09-feature-gaps.md) | 竞品对比与小功能清单 |
| [`10-app-tech.md`](./10-app-tech.md) | **App 端工程实现**：技术栈 / 目录 / IPC / 存储 / 评分引擎接口 / 测试 / 开工顺序 |

**设计稿**：`design/offline.html` · `home.html` · `teammates.html` · `ingame.html` · `limited.html` · `building.html` · `report.html`

---

## 产品定位

不是通用战绩查询器，不是峡谷助手，不是多游戏工具。

范围收窄换来的是：评分维度能真正贴合模式——**承伤算贡献、白给阵亡算犯罪、肉盾不算混子**。

---

## 三条地基

1. **状态机驱动，不做自由导航。** 界面是状态的函数，顶栏是唯一不变量。
2. **一套状态机，三种投影。** 主窗 / 悬浮条 / 游戏内叠加，切换不重置状态、不重连接口。
3. **数据缺失绝不补零。** 拿不到的显示「—」或斜线纹理，并降级人设标签。

---

## 关键决策

| # | 问题 | 结论 |
|---|---|---|
| D-01 | 界面形态 | 三种都做（主窗 / 悬浮条 / 叠加层），设置页自选 |
| D-02 | 运行平台 | macOS 开发，只在 Windows 运行 → PlatformAdapter + ReplayTransport |
| D-03 | 数据源 | 纯本地 LCU + Live Client。国服 SGP 亦可用 |
| D-04 | 后端与账号 | 无后端、无登录、纯本地 |
| D-05 | 目标模式 | **只做海克斯大乱斗**（queueId 2400 / `KIWI`） |
| D-06 | 人设用词 | 直白：蛆 / 混子 / 大腿 / 尽力局长 / 肉盾 / 工具人 |
| D-07 | 配色 | 中性极简：界面无彩色，颜色由英雄头像提供，全局一处红 |
| D-08 | 布局 | 对阵阵容图：英雄头像为主角，敌方上、我方下、中间时间轴。不用卡片、不用列表 |
| D-09 | 强化符文 | 能拿到（`playerAugment1..4` + 图鉴），设计稿已用真图标真名 |
| D-10 | 整蛊尺度 | 正经 : 整蛊 ≈ 7:3。**整蛊只出现在事后报告，不出现在打游戏的时候** |
| D-11 | 技术栈 | **Electron + React + TS + Zustand + better-sqlite3**。LCU 连接用 `league-connect`，动画用 GSAP，图标用 morphicons + lucide |
| D-12 | 造轮子 | **坚决不造**。能用库就用库；唯一自写的是 qq101 打包串解析（私有格式，~50 行） |
| D-13 | 数据/UI 解耦 | **三层**：`shared/domain`（领域）→ `renderer/viewmodels`（纯映射）→ `renderer/views`（展示）。**换 UI 不碰 `shared/` 和 `main/`** |
| D-14 | 编码规范 | **`any` 一律禁止**；`strict` + `noUncheckedIndexedAccess` 全开；外部数据必须过 zod；按领域分组分文件；不懂就查资料不许猜。详见 10 §0 |

---

## 三条硬事实（实测）

1. **国服 LCU 与 SGP 都通**，队友战绩可查（`/lol-match-history/v1/products/lol/{puuid}/matches`）。
2. **海克斯大乱斗 = queueId 2400 / gameMode `KIWI` / mapId 12**。
3. **`game-timelines` 给到每次击杀的 victimId / timestamp / position**，白给阵亡可精确到秒，不用猜。

详见 07 文档。

---

## 下一步

**设计阶段已完成**（七屏全覆盖）。**工程实现文档已就绪**（10）。

### 工程现状（P1-1 首批）

```
package.json / tsconfig.json / eslint.config.js   严格模式 + 禁 any + 跨层禁令
src/shared/enums.ts                               State / PersonaKey / GameMode / LIMITS
src/shared/errors.ts                              ErrorCode + AppError + 序列化
src/shared/domain/augment.ts                      符文领域模型（zod，schema 与类型分离）
src/main/sources/qq101-packed.ts                  ★ 唯一自写解析（打包串，容错）
src/main/core/rating/augment.ts                   B1 评分引擎（纯函数）
src/tools/verify-data.ts                          Mac 可跑的数据层验证
src/tools/verify-lcu.ts                           P1-1 国服实测（Windows）
tests/qq101-packed.test.ts                        7 个边界用例
fixtures/                                         真实快照（国服对局 + 时间线 + 三榜 + 图鉴）
```

**已验证**（`npm run verify:data` 全绿）：226/226 海克斯榜、173/173 英雄榜、2000/2000 搭档榜解析；畸形记录跳过不崩；`playerAugment5/6` 确认恒为 0；B1 构筑分 86.1 / 52.0 / 36.3（极差 49.8）；未知 ID 优雅降级。

**待验**：`npm run verify:lcu` 需 Windows + 腾讯客户端，这是唯一的技术不确定点。

剩余设计缺口（不阻塞开发）：悬浮条 420×168、游戏内叠加层、设置页——06 文档已有规格，可边做边出稿。
