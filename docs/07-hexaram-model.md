# 07 · 海克斯大乱斗：实测数据目录与评分模型

> **本文取代 05 的维度体系。** 05 按召唤师峡谷写，在大乱斗里一半维度不存在。  
> 本版所有结论来自 **LeagueAkari 仓库内的国服真实快照**（`test-fixtures/api/snapshots/2026-05-16-tencent-hn10/`，采集自腾讯 HN10 登录态客户端），不是推测。  
> 05 中仍有效的部分：§9 AI 提示词结构与「数字回归校验」。

---

## 1. 两个必须更正的判断

| 我之前说的                          | 实际情况                                                                            | 证据                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 「LeagueAkari 不支持国服，SGP 在国服是断的」 | **国服 LCU 和 SGP 都通**。README 说 "Tencent servers not supported" 指的是未官方适配，不是路径不通    | 快照 `manifest.json` 明写 "These fixtures cover **Tencent-reachable LCU and SGP paths**"，且 `sgp/match-history-query/q_2400.json` 有真实数据 |
| 「队友战绩接口常 404，不做」               | **可以查**。LCU `GET /lol-match-history/v1/products/lol/{puuid}/matches` 支持任意 puuid | LeagueAkari 的对局中面板就是靠它拉队友近 N 局战绩                                                                                                   |

这两条直接解锁了原本被砍掉的两个能力：**队友情报面板**和**跨账号战绩查询**。

---

## 2. 模式识别（V-01 已解决）

从国服快照 `lcu/match-history/games/q_2400.json` 实测：

| 字段         | 值              |
| ---------- | -------------- |
| `queueId`  | **2400**       |
| `gameMode` | **`KIWI`**     |
| `mapId`    | 12（嚎哭深渊）       |
| `gameType` | `MATCHED_GAME` |
| 实测时长       | 1394s ≈ 23 分钟  |

同一份快照里的其他模式（都用 `gameMode` 字符串区分，**不要用 queueId 硬编码**）：

| queueId         | gameMode                   | 含义         |
| --------------- | -------------------------- | ---------- |
| 450             | `ARAM`                     | 极地大乱斗      |
| **2400**        | **`KIWI`**                 | **海克斯大乱斗** |
| 420 / 430 / 440 | `CLASSIC`                  | 召唤师峡谷      |
| 1700 / 1750     | `CHERRY`                   | 斗魂竞技场      |
| 480             | `SWIFTPLAY`                | 快速模式       |
| 900             | `URF`                      | 无限火力       |
| 2300            | `BRAWL`                    | —          |
| 4210–4260       | `RUBY` / `RUBY_TRIAL_1..3` | —          |

判定规则：

```
主判定：gameMode === 'KIWI'
兜底：mapId === 12 && gameMode !== 'ARAM' && duration < 25min
识别失败 → 跳过，不按峡谷逻辑误算
```

---

## 3. 数据源目录（实测可用）

### 3.1 赛后完整数据（主路径）

| 端点                                                                | 内容         | 关键字段                                      |
| ----------------------------------------------------------------- | ---------- | ----------------------------------------- |
| `GET /lol-match-history/v1/games/{gameId}`                        | 单局详情       | `participants[].stats`（89 个字段）+ `teams[]` |
| `GET /lol-match-history/v1/game-timelines/{gameId}`               | **时间线**    | 25 帧 + 事件流                                |
| `GET /lol-match-history/v1/products/lol/{puuid}/matches`          | **任意玩家战绩** | 近 N 局摘要                                   |
| `GET /lol-match-history/v1/products/lol/current-summoner/matches` | 自己的战绩      | 同上                                        |

### 3.2 符文数据（V-03 已解决：**能拿到**）

| 来源            | 端点                                                                    | 内容                                                                                      |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **对局记录**      | `games/{gameId}` → `stats.playerAugment1..6`                          | **每个人实际选了什么**                                                                           |
| **本地符文图鉴**    | `GET /lol-game-data/assets/v1/cherry-augments.json`                   | `{id, nameTRA, augmentSmallIconPath, rarity}`                                           |
| **国服图鉴（含中文）** | `https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json` | 237 条：`augmentID, name_en, name_cn, mode, level, desc, tooltip, large_Icon, small_Icon` |

实测对局里每人 **4 个槽有值**（`playerAugment1..4`），`5/6` 恒为 0：

```
participant 1: [1356, 1391, 1320, 1322, 0, 0]
```

> **注意 ID 会漂移**：快照（2026-05）里的 1356/1391 在当前图鉴（2026-10）已不存在。所以图鉴必须本地缓存 + 定期刷新，且**查不到的 ID 要优雅降级**（显示占位框，不显示"未知符文"字样）。

gtimg 图鉴的 `mode` 字段标了归属：

```
KIWI (82) | KIWI, KIWI_JADE (134) | CHERRY, KIWI (7) | CHERRY, KIWI, KIWI_JADE (14)
```

`CHERRY` = 斗魂竞技场，`KIWI` = 海克斯大乱斗，`KIWI_JADE` = 变体。筛 `mode` 含 `KIWI` 即为本模式可用符文。

品质：gtimg 3 档 `kSilver`(68) · `kGold`(97) · `kPrismatic`(72)；LCU 另有 `kBronze` / `kEventChoice` 共 5 档。

### 3.3 其他本地静态资源（同一 LCU 路径下）

`/lol-game-data/assets/v1/`：

```
champions/{id}.json        ← 英雄详情（头像/皮肤/技能图标），替代外部 CDN
champion-summary.json      ← 英雄列表
items.json                 ← 装备（含售价 → 算装备价值差）
summoner-spells.json       ← 召唤师技能
perks.json / perkstyles.json
queues.json                ← 队列名（中文），用于展示"海克斯大乱斗"
maps.json / map-assets/map-assets.json
game-mode-mutators.json
loots.json / challenges.json
```

> **设计影响**：英雄头像、符文图标、装备图标**全部可以从本地客户端拿**，不需要外部 CDN。设计稿里用的 communitydragon / gtimg 只是方便，工程版应走本地。

### 3.4 腾讯 101 数据源（三个 tab，实测全通）

前端 `101.qq.com` 的海克斯大乱斗三个榜，后端都在 `mlol.qt.qq.com`，请求需带 `Referer: https://101.qq.com/`。

| 前端 tab | 端点 | 实测 |
|---|---|---|
| **海克斯榜** | `GET /go/battle_info/odp_proxy/fuwen_aram_rune_rank_v2?augmentid_level=255` | 200 · 25KB · 226 条 |
| **英雄榜** | `GET /go/battle_info/odp_proxy/fuwen_aram_hero_rank_v2?dtstatdate=YYYYMMDD` | 200 · 459KB · 173 条 |
| **最佳搭档榜** | `GET /go/battle_info/odp_proxy/fuwen_aram_hero_parttner?role1=255&role2=255&championid=<id>` | 200 · 204KB |

响应结构：外层 `{code, data:{_fieldValues:{R15380|15381|15323:"<打包字符串>"}}}`，
内层是**打包串**（`_` 分段、`#` 分记录、`&` 分搭档、`,` 分子字段），**不是 JSON 字段**。解析器必须健壮。

#### 海克斯榜（`R15381.augmentlist`）

每条：`augmentId_level_pickRate_pickRank_pickRankChange_winRate_winRank_winRankChange_bestChampionIds`

```
1007 大力       选取率 44.63%  选取排   7   胜率 58.54%  胜率排  11   最适 202,104,51,238,875,236
1004 回归基本功  选取率 29.35%  选取排  31   胜率 58.30%  胜率排  13   最适 13,4,145,41,223,901
1001 泰坦的坚决  选取率 16.78%  选取排  89   胜率 48.17%  胜率排 205   最适 223,36,50,14,89,111
```

#### 英雄榜（`R15380.listcollect`，173 条 × 11 段）

| 段 | 含义 | 样例 |
|---|---|---|
| `[0]` | championId | `17` |
| `[1]` | rank | `1` |
| `[2]` | rankChange | `未变化` |
| `[3]` | winRate | `0.5443` |
| `[4]` | pickRate | `0.1368` |
| `[5]` | **bestPartners**（Top 50，`&` 分隔，`id,选取率,胜率,排名`） | `157,0.0506,0.6327,1&11,...` |
| `[6]` | **averageDeathTimeSeconds** | `251.94` |
| `[7]` | killParticipationRate | `0.6223` |
| `[8]` | damageShare | `0.1843` |
| `[9]` | damageTakenShare | `0.1368` |
| `[10]` | **lowestRankAugmentIds**（该英雄最不该拿的符文） | `1373,3086,1068` |

`[10]` 实测解出真名：

```
英雄 17  最弱符文 → 缩小引擎 / 小蜜蜂！！！ / 循环往复
英雄 157 最弱符文 → 灵魂虹吸 / 升级：无尽之刃 / 秘术冲拳
英雄 4   最弱符文 → 小蜜蜂！！！ / 回响施放 / 回归基本功
```

> **这直接就是「符文匹配度」的证据**，不需要自己造规则。

#### 最佳搭档榜（`R15323.championid_data`）

每条：`champA;champB|rolesA;rolesB|winRate|pickRate|rank`

```
157 + 17   胜率 64.19%  选取率 1.89%  排名 1
157 +  4   胜率 65.89%  选取率 1.67%  排名 6
```

#### ⚠️ 风险

1. **`mlol.qt.qq.com` 是腾讯官方后端，但属未公开 Web 接口**（要伪造 Referer）。与 gtimg 静态 CDN 不是一个性质，**随时可能改版或封禁**。必须本地缓存 + 优雅降级：接口挂了产品照常用，只是没有推荐功能。
2. 打包串解析必须容错，单条解析失败跳过，不得整批失败。
3. `dtstatdate` 是聚合日期，数据随版本漂移。缓存要按天失效。

### 3.5 实时数据（对局中）

| 端点                                        | 能拿到                                       |
| ----------------------------------------- | ----------------------------------------- |
| `GET /lol-gameflow/v1/gameflow-phase`     | 阶段                                        |
| `GET /lol-gameflow/v1/session`            | `gameData.gameId / queue.id / gameMode`   |
| `GET /lol-end-of-game/v1/eog-stats-block` | 结算面板                                      |
| `GET /liveclientdata/allgamedata`（2999）   | 实时 10 人 KDA/等级/装备/`isDead`/`respawnTimer` |

**实时拿不到**：其他人当前血量、实时金币、实时伤害、**实时符文选择**。  
（`playerAugment1..6` 只出现在比赛记录里，对局中面板没有任何地方引用它——LeagueAkari 的对局中面板也不显示符文。）

> 这一条直接决定了 S3 对局中界面的形态：**不能画血条**，信息重点只能是「谁活着 / 还有几秒复活 / 现在几打几」。

---

## 4. 大乱斗真实数据体检（一局 23 分钟样本）

| 字段                                               | 实测值              | 结论                     |
| ------------------------------------------------ | ---------------- | ---------------------- |
| `visionScore` / `wardsPlaced` / `wardsKilled`    | **全部 0**         | ✅ 视野维度作废               |
| `neutralMinionsKilled`                           | **全部 0**         | ✅ 野怪作废                 |
| `dragonKills` / `baronKills` / `riftHeraldKills` | **全部 0**         | ✅ 中立大资源作废              |
| `totalMinionsKilled`                             | 26–89            | ⚠️ **有值**，补刀可作低权重辅助指标  |
| `champLevel`                                     | 全部 18            | ❌ 长局无区分度，删除            |
| `turretKills`                                    | 0–3              | ✅ 推塔参与有效               |
| `inhibitorKills`                                 | 队伍层面 3           | ✅ 有效                   |
| `totalDamageDealtToChampions`                    | 25,705 – 94,280  | ✅ 区分度极强                |
| `totalDamageTaken`                               | 41,140 – 96,902  | ✅ 有效                   |
| `totalHeal`                                      | 146 – 52,763     | ✅ 有效（146 = 无治疗能力）      |
| `timeCCingOthers`                                | 0 – 58           | ✅ 有效                   |
| `longestTimeSpentLiving`                         | 67 – 215         | ✅ **存活时长可用**，比阵亡次数更准   |
| `goldEarned`                                     | 20,966 – 28,013  | ✅ 有效                   |
| `kills/assists`                                  | 助攻 20–58，击杀 7–27 | ⚠️ 参团率接近饱和，**确认删除 KP** |

---

## 5. 时间线：精确到秒的死亡归因

`game-timelines/{gameId}` → `frames[]`（25 帧，每分钟 1 帧），每帧含 `events[]` + `participantFrames{1..10}`。

实测事件：**168 次 `CHAMPION_KILL` + 11 次 `BUILDING_KILL`**

```jsonc
CHAMPION_KILL {
  "killerId": 4,
  "victimId": 6,
  "assistingParticipantIds": [1, 2, 3, 5],
  "position": {"x": 6249, "y": 5915},
  "timestamp": 54352,          // ms
  "teamId": 0
}
BUILDING_KILL {
  "buildingType": "TOWER_BUILDING",
  "laneType": "MID_LANE",
  "killerId": 9, "teamId": 100,
  "position": {...}, "timestamp": ...
}
```

**这彻底改变了模型**：不需要再用「击杀事件聚类猜团战」，时间线直接给出：

- 每次死亡的**精确时刻**与**坐标**
- 谁参与了击杀（`assistingParticipantIds`）
- 什么时候掉了哪座塔

`participantFrames` 每分钟还给 `currentGold / totalGold / xp / level / position`——**可以重建经济曲线**，不用靠装备价值估算。

### 5.1 白给阵亡（FeedDeaths）的精确定义

对每次阵亡 `d`（来自 `CHAMPION_KILL` 的 `victimId`）：

| 条件                           | 含义                      | 权重   |
| ---------------------------- | ----------------------- | ---- |
| `0 < 团战起点 − d.t ≤ 8s`        | 团战开打前 8 秒先死 → 我方 4v5 开团 | 0.40 |
| `position` 在我方高地内，且我方存活 ≥3 人 | 残局无意义阵亡                 | 0.25 |
| 该次死亡吸收伤害 < 全队均值 40%          | 秒躺，没换到东西                | 0.20 |
| 死亡时 `currentGold ≥ 2000` 未花  | 浪费唯一购物窗口                | 0.15 |

团战起点判定：

```
CHAMPION_KILL 序列中，若相邻两次间隔 ≤ 4s 且涉及 ≥2 个不同的参与方 → 团战爆发点
```

---

## 6. 三轴（按实测数据修订）

### 6.1 CARRY

```
CARRY = 0.40 × norm(DMG%)
      + 0.22 × norm(DPM)
      + 0.18 × norm(DPG)
      + 0.12 × norm(KillShare)
      + 0.08 × norm(CSM)          ← 补刀实测有值，但共享兵线，只给 0.08
```

### 6.2 TEAM

```
TEAM  = 0.28 × norm(TAKEN% × 近远程修正)
      + 0.24 × norm(CCPM)
      + 0.24 × norm(Heal%)
      + 0.14 × norm(AstDensity)
      + 0.10 × norm(推塔参与)
```

### 6.3 RISK

```
RISK  = 0.45 × norm(FeedDeaths)        ← 精确到秒，不再靠推断
      + 0.20 × norm(StreakDeaths)      ← 20s 内连死（大乱斗复活快）
      + 0.15 × norm(LateDeaths)
      + 0.12 × norm(Deaths 相对全队)
      + 0.08 × norm(存活时长偏低)
```

`longestTimeSpentLiving`（67–215）能直接算"这个人一局里有几次是死着度过的"，比单看阵亡次数准确。

---

## 6.4 符文构筑分（B1）

用海克斯榜 226 条真实分布拟合，**阈值全部来自实测**。

### 真实分布

| 指标 | min | p10 | p25 | 中位 | 均值 | p75 | p90 | max | 标准差 |
|---|---|---|---|---|---|---|---|---|---|
| 胜率 | 36.61% | 48.25% | 49.53% | 51.65% | 52.10% | 54.01% | 57.34% | 68.18% | **3.66pp** |
| 选取率 | 0.13% | — | — | 13.76% | 16.23% | — | — | 65.84% | — |

> **胜率标准差只有 3.66pp**，绝大多数符文挤在 48–56%。所以**不能用胜率原值当分数**，必须用官方 `winRank` 做百分位——排名 11 vs 205 的差距，比 58.5% vs 48.2% 更可信。

### 公式

**① 单枚基础分**

```
N     = 226（当季符文总数，缓存时记录）
base  = 100 × (1 − (winRank − 1) / (N − 1))      // 胜率排名百分位
conf  = clamp(pickRate / 0.05, 0.40, 1.00)        // 选取率低则降可信度
score = 50 + (base − 50) × conf                    // 向 50 收缩
```

**② 匹配度修正**（来自英雄榜 `[5]` 与 `[10]`）

```
championId ∈ bestChampionIds      → +8   「匹配」
championId ∈ lowestRankAugmentIds → −12  「最弱」
score = clamp(score + 修正, 0, 100)
```

> 惩罚比奖励重：「最不该拿」是官方的明确结论，比「适合」更确定。

**③ 构筑总分**

```
BuildScore = mean(score₁ … score₄)
```

**等权，不按槽位加权。** 原本想假设「越后期越强」（3/7/11/15 级），但接口里没有槽位影响数据，这个假设站不住。
→ 待校准：攒够 20 局本机数据后，检验 `playerAugmentN` 槽位是否与胜负相关，再决定要不要加权。

### 试算（Yasuo 157，真实数据，`npm run verify:data` 实测）

| 构筑 | 构成 | 总分 | verdict |
|---|---|---|---|
| 全是高胜率 | 大力(排11) · 回归基本功(排13) · 灵巧(排48,+匹配) · 星界躯体(排75) | **86.1** | `build.great` |
| 混合 | 尖端发明家(排190) · 大力(排11) · 灵巧(排48,+匹配) · 泰坦的坚决(排205) | **52.0** | `build.weak` |
| 含弱符文 | 泰坦的坚决(排205) · 尖端发明家(排190) · 喂呜喂呜(排59) · 俯冲轰炸(排94) | **36.3** | `build.broken` |

极差 **49.8**，区分度符合直觉。

单枚分参考（不计匹配）：

```
大力       胜率 58.54%  排名  11  选取 44.63%  →  95.6
回归基本功  胜率 58.30%  排名  13  选取 29.35%  →  94.7
灵巧       胜率 54.56%  排名  48  选取 26.88%  →  79.1
星界躯体    胜率 53.22%  排名  75  选取 19.41%  →  67.1
俯冲轰炸    胜率 52.35%  排名  94  选取 23.50%  →  58.7
利刃华尔兹  胜率 51.39%  排名 116  选取 11.07%  →  48.9
尖端发明家  胜率 48.89%  排名 190  选取 10.16%  →  16.0
泰坦的坚决  胜率 48.17%  排名 205  选取 16.78%  →   9.3
```

低选取率降权实测：

```
id=3025  选取 0.13%  胜率 51.33%  排名 120  conf 0.40  →  48.8
id=1348  选取 0.42%  胜率 47.64%  排名 210  conf 0.40  →  32.8
```

（选取率 < 5% 的样本太少，胜率不可信，强制向均值收缩）

### 品质不进分数

接口的 `level` 字段全是 `255` 占位，品质要从 gtimg 图鉴查。

**而且品质本来就不该进分数**：海克斯大乱斗每一轮所有人拿到同一品质（"十位玩家每阶段获取时都是同一品质"），品质不是你的选择，选了什么才是。所以品质**只做展示**（图标描边色），不参与评分。

### 输出结构

```ts
interface AugmentBuild {
  score: number            // 0-100
  slots: Array<{
    augmentId: number
    name: string
    rarity: 'kSilver'|'kGold'|'kPrismatic'
    winRank: number        // 1..226
    winRate: number
    pickRate: number
    slotScore: number      // 0-100
    flag: 'match' | 'worst' | null
  }>
  verdict: string
}
```

`verdict` 阈值（按试算分布）：`≥75 构筑豪华` · `55–75 中规中矩` · `40–55 有短板` · `<40 构筑崩盘`。

---

## 7. 人设判定（有序，命中即停）

| #   | 条件                             | 人设          | 备注            |
| --- | ------------------------------ | ----------- | ------------- |
| R1  | `RISK ≥ 72` 或 `FeedDeaths ≥ 3` | **蛆**       | 必须给出具体次数和秒数   |
| R2  | `RISK ≥ 58` 且 `CARRY < 45`     | **犯罪嫌疑人**   | —             |
| R3  | `CARRY ≥ 78` 且 `RISK ≤ 45`     | **大腿**      | —             |
| R4  | `CARRY ≥ 62` 且 败 且 `RISK ≤ 55` | **尽力局长**    | —             |
| R5  | `TEAM ≥ 72` 且 `TAKEN% ≥ 0.28`  | **肉盾 / 沙包** | **大乱斗特有正面标签** |
| R6  | `TEAM ≥ 68` 且 `CARRY < 55`     | **工具人**     | —             |
| R7  | `Heal% ≥ 0.30` 或 `CCPM` 全队第一   | **奶妈 / 控场** | —             |
| R8  | `DMG% < 0.10` 且 `TEAM < 50`    | **混子**      | —             |
| R9  | `Deaths` 全队最低 且 `DPG` 低        | **保 KDA 型** | 不送但也不打        |
| R10 | 其余                             | **中规中矩**    | —             |

**R5 是关键修正**：实测那局的 Nautilus 是 `0/8/9`、承伤 33.6k、控制 68s——他不是混子，是墙。旧模型会因为 KDA 差判他成蛆。

**符文人设（可选，P3）**：拿 `playerAugment1..4` + gtimg 图鉴，可以做「符文构筑」评价，例如"三枚棱彩"、"符文和英雄不搭"。这需要人工/LLM 标注匹配度，工作量大，放到 AI 评价里做。

---

## 8. 合规边界

1. 只读本地 LCU / Live Client，不注入、不读内存、不改包。
2. 不展示官方接口未暴露的隐藏信息（敌方技能 CD、视野、草丛）。
3. 不做自动化输入。
4. 不用 OCR 截图识别符文（数据已经有了，没理由走那条路）。
5. 不抓第三方战绩站。gtimg 是腾讯官方 CDN，且只用于**图鉴资源**（符文名/图标），不用于获取玩家数据。

---

## 9. 待办

| #    | 事项                 | 状态                                   |
| ---- | ------------------ | ------------------------------------ |
| V-01 | 海克斯大乱斗 queueId     | ✅ **2400 / KIWI / map 12**           |
| V-03 | 强化符文是否暴露           | ✅ **能拿到**，`playerAugment1..4` + 图鉴可查 |
| V-02 | 白给阵亡阈值（8s / 4s 团战） | ⏳ 需 5 局真实时间线校准                       |
| V-04 | 敌方实时字段缺失率          | ⏳ 对局中实测                              |
| V-05 | 近远程承伤修正系数          | ⏳ 用真实分布拟合                            |
| V-06 | 符文 ID 漂移的降级策略      | ⏳ 图鉴查不到时的占位样式                        |
| V-07 | 队友情报面板的请求频率控制      | ⏳ 5 人 × 战绩查询，需限流                     |

---

## 10. 工程建议（对 04 文档的补充）

1. **fixtures 可以直接复用 LeagueAkari 的国服快照**：`test-fixtures/api/snapshots/2026-05-16-tencent-hn10/` 里已有 q_2400 的 game + timeline + SGP 样本，省去自己抓包。**使用前必须确认 LICENSE 并署名。**
2. **优先走 LCU `match-history`，不是 2999**：LeagueAkari 全程不用 Live Client API，照样拿到完整数据。2999 只在"对局中实时"用。
3. **图鉴本地化缓存**：符文/英雄/装备图鉴启动时拉一次，存本地，断网可用。
