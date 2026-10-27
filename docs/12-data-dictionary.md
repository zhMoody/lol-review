# 12 · 数据字典（实测字段清单）

> 全部字段来自 `fixtures/capture/2026-10-26T19-26-49` 实抓，**逐个统计得出，不是查文档抄的**。
> 统计口径：10 名玩家的 10 份样本，标注"去重数"= 该字段在 10 人中的不同取值个数。
> 去重数 = 1 表示**全场同值**，在这个模式里没有区分度。

---

## 0. 数据源总览

| # | 数据源 | 端点 | 单份体积 | 抓取频率 | 时机 |
|---|---|---|---|---|---|
| A | **赛后对局** | `/lol-end-of-game/v1/eog-stats-block` | **67,954 B** | 每 2 秒 ×14 | 对局结束后 |
| B1 | 实时玩家 | `/liveclientdata/playerlist` | 29,686 B | 每 2 秒 ×581 | 对局中 |
| B2 | 实时事件 | `/liveclientdata/eventdata` | 35,911 B | 每 2 秒 ×1159 | 对局中 |
| B3 | 实时对局 | `/liveclientdata/gamestats` | 129 B | 每 5 秒 ×234 | 对局中 |
| C1 | 选人 | `/lol-champ-select/v1/session` | 9,072 B | 每 2 秒 ×59 | 选人阶段 |
| C2 | 流程 | `/lol-gameflow/v1/session` | 10,161 B | 1 次 | 对局开始 |
| C3 | 流程相位 | `/lol-gameflow/v1/gameflow-phase` | 17 B | 每 2 秒 ×703 | 全程 |
| D1 | 玩家档案 | `/lol-summoner/v1/current-summoner` | 474 B | 1 次 | 启动 |
| D2 | 段位 | `/lol-ranked/v1/ranked-stats/{puuid}` | 8.2 KB | 每人 1 次 | 选人 |
| E | 静态资产 | `/lol-game-data/assets/v1/*.json` | 1.4 KB ~ 676 KB | 按需 | 任意 |
| F | **历史战绩** | `/lol-match-history/v1/...` | 未抓包 | 按需 | 空闲/选人 |

**体积最大的是 `items.json`（676,531 B / 863 件装备）**，但那是静态图鉴，不含对局数据。
**含对局数据且最全的是 `eog-stats-block`（67,954 B）** —— 10 名玩家的 189 个字段全在里面。下面从它开始。

---

## A. 赛后对局 · `eog-stats-block`

结构：`{ 46 个顶层字段 } → teams[2] → players[5] → stats{189 字段}`

### A.1 顶层（46 字段）

| 字段 | 类型 | 实测值 | 说明 |
|---|---|---|---|
| `gameId` | int | 9050524432 | 对局 ID，**必须校验**，防止拿到上一局 |
| `gameLength` | int | 1144 | 对局时长（秒） |
| `gameMode` | str | `KIWI` | 海克斯大乱斗 |
| `queueType` | str | `KIWI` | 队列类型 |
| `gameType` | str | `MATCHED_GAME` | 匹配类型 |
| `endOfGameTimestamp` | int | 1793044064677 | 结束时间（毫秒） |
| `isWinningTeam` 所在 teams[] | — | — | 见 A.2 |
| `teams` | list[2] | — | 两队 |
| `localPlayer` | dict | — | 本地玩家，结构与 players[] **完全同构**（含完整 stats） |
| `rerollData` | dict | 7 字段 | 重随点数变动（见 A.5） |
| `gameMutators` | list | `[]` | 模式变体，大乱斗为空 |
| `newSpells` | list | `[]` | 新召唤师技能，空 |
| `teamBoost` | dict | 6 字段 | 皮肤加成（`price: -1`，未购买） |
| `mucJwtDto` | dict | 3 字段 | 赛后聊天 JWT，**不要落盘** |
| `multiUserChatPassword` | str | `eyJraWQ...` | 同上，**敏感** |
| `currentLevel` / `previousLevel` | int | 673 | 召唤师等级 |
| `experienceEarned` / `experienceTotal` | int | 186 / 841 | 本局经验 |
| `ipEarned` / `ipTotal` / `rpEarned` | int | 0 | 蓝色精粹 / 点券（**海外服才有值，国服恒 0**） |
| `firstWinBonus` / `timeUntilNextFirstWinBonus` | int | 0 | 首胜加成 |
| `leveledUp` | bool | false | 本局是否升级 |
| `ranked` | bool | false | 是否排位 |
| `invalid` / `causedEarlySurrender` / `gameEndedInEarlySurrender` | bool | false | 异常对局标记 |
| `myTeamStatus` / `difficulty` | str | `""` | 未使用 |
| `basePoints` / `battleBoostIpEarned` / `boostIpEarned` / `boostXpEarned` / `globalBoostXpEarned` / `loyaltyBoostXpEarned` / `missionsXpEarned` / `xbgpBoostXpEarned` / `teamEarlySurrendered` | int/bool | 0 / false | 各种加成，本局全 0 |

> 顶层的经验/精粹/加成字段**与战报无关**，是结算奖励面板的部分。真正有用的是 `gameId`、`gameLength`、`gameMode`、`teams`、`localPlayer`。

### A.2 `teams[]`（10 字段）

| 字段 | 类型 | 实测 | 说明 |
|---|---|---|---|
| `teamId` | int | 100 / 200 | **100 = ORDER（蓝色方）, 200 = CHAOS（红色方）** |
| `isPlayerTeam` | bool | — | 是否本地玩家所在队 → **判断"我方"唯一可靠字段** |
| `isWinningTeam` | bool | — | 是否获胜 |
| `isBottomTeam` | bool | — | 是否在 UI 下方 |
| `players` | list[5] | — | 5 名玩家 |
| `stats` | dict | 6 字段 | 队伍汇总，**含无意义的符文字段，见 A.6** |
| `fullId` / `name` / `tag` / `memberStatusString` | str | `""` | 大乱斗全为空 |

### A.3 `players[]`（29 字段）

| 字段 | 类型 | 实测范围 | 说明 |
|---|---|---|---|
| `puuid` | str | 10 个不同 | 主键，跨局关联用 |
| `summonerId` | int | 15795855465~17997110786 | 旧 ID，**新版接口可能弃用** |
| `riotIdGameName` | str | 10 个不同 | 游戏名（不含 #） |
| `riotIdTagLine` | str | 10 个不同 | 后缀数字 |
| `summonerName` | str | 10 个不同 | 无 tag，等于 gameName |
| `championId` | int | 23~897 | 英雄 ID → 查 `champion-summary.json` |
| `championName` | str | 10 个不同 | **中文名，直接可用**（如"时光守护者"） |
| `championSquarePortraitPath` | str | 10 个不同 | 头像本地路径 `/lol-game-data/assets/v1/champion-icons/26.png` |
| `skinSplashPath` / `skinTilePath` | str | 10 个不同 | 原画/皮肤图本地路径 |
| `skinEmblemPaths` | list | `[]` | 空 |
| `profileIconId` | int | 2074~7332 | 头像 ID |
| `level` | int | 237~1030 | **召唤师等级，不是英雄等级** |
| `wins` / `losses` | int | 1310 / 1264 | **只有本地玩家有值，其余 9 人恒为 0** |
| `items` | list[int] | 7 项 | **纯整数数组**（如 `[6665,3143,...]`），不是对象 |
| `spell1Id` / `spell2Id` | int | 4~32 | 召唤师技能 ID → 查 `summoner-spells.json` |
| `botPlayer` | bool | false | 是否机器人 |
| `isLocalPlayer` | bool | 1 人 true | 本地玩家标记 |
| `leaver` / `leaves` / `wasAfk` / `severeTransgressor` | bool/int | false / 0 | 挂机/秒退/恶劣行为 |
| `detectedTeamPosition` | str | `Invalid` | **大乱斗恒为 Invalid** |
| `selectedPosition` | str | `""` | **大乱斗恒为空** |
| `teamId` | int | 100 / 200 | 所属队伍 |
| `gameId` | int | 9050524432 | 冗余 |

### A.4 `players[].stats`（189 字段 · 按用途分类）

下面只列**有区分度**的 100 个。全 89 个废字段见 A.7。

#### ① 战绩（8）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `kills` / `CHAMPIONS_KILLED` | 8 | 2~21 | 击杀（大小写两份，值相同） |
| `deaths` / `NUM_DEATHS` | 8 | 7~18 | 阵亡 |
| `assists` / `ASSISTS` | 8 | 15~41 | 助攻 |
| `WIN` | 2 | 0/1 | 是否获胜 |
| `killingSprees` | 6 | 0~6 | 大杀特杀次数（3 连杀以上） |
| `largestKillingSpree` | 4 | 0~4 | 最高连杀 |

#### ② 伤害（12）—— 报告的核心

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `totalDamageDealtToChampions` | 10 | 15,113~51,940 | **对英雄总伤害**（评分主指标） |
| `physicalDamageDealtToChampions` | 10 | 547~45,502 | 物理伤害 |
| `magicDamageDealtToChampions` | 10 | 1,262~39,318 | 魔法伤害 |
| `trueDamageDealtToChampions` | 10 | 75~2,061 | 真实伤害 |
| `totalDamageDealt` | 10 | 59,311~137,285 | 总输出（含小兵/建筑） |
| `physicalDamageDealt` / `magicDamageDealt` / `trueDamageDealt` | 10 | — | 分类型总输出 |
| `largestCriticalStrike` | 8 | 0~1,412 | 最大暴击 |
| `damageDealtToTurrets` / `damageDealtToBuildings` / `damageDealtToObjectives` | 10 | 120~8,139 | 拆塔/建筑/目标伤害（**三者实测恒等**） |

#### ③ 承伤与生存（6）—— 大乱斗的价值所在

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `totalDamageTaken` | 10 | 18,345~59,516 | **总承伤** |
| `physicalDamageTaken` / `magicDamageTaken` / `trueDamageTaken` | 10 | 15,712~35,387 / 1,733~23,097 / 483~4,023 | 分类型承伤 |
| `damageSelfMitigated` | 10 | 7,527~143,195 | **自我减伤**（护盾/减伤吸收量）→ 坦克的核心指标 |
| `longestTimeSpentLiving` | 10 | 75~298 | 最长存活（秒） |
| `totalTimeSpentDead` | 10 | 204~456 | **累计阵亡时长（秒）** → 比阵亡次数更能反映"躺了多久" |

#### ④ 治疗与护盾（5）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `totalHeal` | 10 | 1,893~16,230 | 总治疗（含自我） |
| `totalHealsOnTeammates` | 3 | 0~2,050 | **对队友治疗**（辅助核心） |
| `totalUnitsHealed` | 3 | 1~5 | 治疗单位数 |
| `totalDamageShieldedOnTeammates` | 2 | 0~1,743 | **给队友的护盾量** |
| `TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES` | 2 | 同上 | 同上，大写冗余 |

#### ⑤ 控制（2）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `timeCCingOthers` | 9 | 0~69 | **控制敌方英雄的秒数**（评分用这个） |
| `totalTimeCCDealt` | 10 | 0~432 | 总控制时长，**明显大于上者**，疑含小兵/野怪，语义待验证 |

#### ⑥ 经济与装备（6）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `goldEarned` | 10 | 16,633~21,295 | **总金币（eog 直接给，不用估算）** |
| `goldSpent` | 9 | 15,350~22,600 | 已花费 |
| `itemsPurchased` | 9 | 15~34 | 购买次数（含消耗品） |
| `consumablesPurchased` | 4 | 0~3 | 消耗品件数 |
| `totalMinionsKilled` / `MINIONS_KILLED` | 9 | 21~67 | 补刀（**大乱斗有值，不是 0**） |
| `champExperience` | 10 | 20,330~25,596 | 英雄经验 |

#### ⑦ 强化符文（4 有效 + 2 恒零）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `PLAYER_AUGMENT_1` | 9 | 1,004~2,087 | **第 1 枚（棱彩）** |
| `PLAYER_AUGMENT_2` | 10 | 1,020~3,078 | 第 2 枚（黄金） |
| `PLAYER_AUGMENT_3` | 9 | 1,063~3,116 | 第 3 枚（黄金） |
| `PLAYER_AUGMENT_4` | 9 | 1,022~3,055 | 第 4 枚（白银） |
| `playerAugment1..4` | — | 同上 | **与上面四个完全相等的冗余字段** |
| `PLAYER_AUGMENT_5` / `_6` | 1 | 0 | **恒为 0**（大乱斗只给 4 枚） |

> 符文 ID → 中文名：查 `fixtures/gtimg/kiwi_augments.json`（237 条，含 `name_cn` / `level` / `icon`）。

#### ⑧ 多杀（5）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `largestMultiKill` | 3 | 1~3 | 最高连杀（1=无） |
| `doubleKills` | 4 | 0~4 | 双杀次数 |
| `tripleKills` | 3 | 0~2 | 三杀次数 |
| `quadraKills` / `pentaKills` | 1 | 0 | 本局无人拿到 |

#### ⑨ 目标（9）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `turretKills` / `TURRETS_KILLED` | 3 | 0~3 | 个人推塔数 |
| `turretTakedowns` | 5 | 0~4 | 参与推塔数 |
| `turretsLost` | 2 | 1~4 | 失去塔数 |
| `inhibitorKills` / `inhibitorTakedowns` | 2 | 0~1 | 水晶 |
| `inhibitorsLost` | 2 | 0~1 | 失去水晶 |
| `nexusKills` / `nexusTakedowns` / `nexusLost` | 2 | 0~1 | 主堡 |
| `BARRACKS_KILLED` | 2 | 0~1 | 兵营 |

#### ⑩ 技能使用（6）

| 字段 | 去重 | 范围 | 说明 |
|---|---|---|---|
| `spell1Casts` | 10 | 20~646 | Q 施放次数 |
| `spell2Casts` | 9 | 23~711 | W |
| `spell3Casts` | 10 | 0~106 | E |
| `spell4Casts` | 8 | 0~21 | R |
| `summoner1Casts` / `summoner2Casts` | 6 / 7 | 2~23 / 2~31 | 召唤师技能使用次数 |

#### ⑪ 首杀首塔（4）

`firstBloodKill` / `firstBloodAssist` / `firstTowerKill` / `firstTowerAssist` — 去重 2（0/1）

#### ⑫ 信号 Ping（5 个有值）

| 字段 | 去重 | 范围 |
|---|---|---|
| `commandPings` | 3 | 0~7 |
| `enemyMissingPings` | 2 | 0~1 |
| `getBackPings` | 2 | 0~2 |
| `pushPings` | 2 | 0~2 |
| `basicPings` / `dangerPings` / `allInPings` / `assistMePings` / `holdPings` / `needVisionPings` / `onMyWayPings` / `retreatPings` / `enemyVisionPings` / `visionClearedPings` | 1 | 0（全废） |

### A.5 `rerollData`（7 字段）

| 字段 | 实测 | 说明 |
|---|---|---|
| `rerollCount` | 0 | 本局重随次数 |
| `pointsUsed` | 0 | 消耗点数 |
| `pointsUntilNextReroll` | 250 | 距下次重随所需点数 |
| `totalPoints` / `previousPoints` | 0 | 累计点数 |
| `pointChangeFromGameplay` / `pointChangeFromChampionsOwned` | 0 | 本局获得/英雄加成 |

> 用户等级 673，重随点数是**跨局累计**的。本局 0 消耗。

### A.6 队伍级 `teams[].stats`

6 个字段：`PLAYER_AUGMENT_1..6` + `playerAugment1..6`。

**全部是"五个玩家的 ID 相加"，没有任何意义**：

```
teams[0].stats.PLAYER_AUGMENT_1 = 6873
1421 + 1388 + 1006 + 1048 + 2010 = 6873   ← 完全一致
```

**不要用。** 需要队伍级符文就自己从 `players[]` 聚合。

### A.7 废字段清单（89 个，全场同值）

这些字段在大乱斗这一局里**没有任何区分度**，可以直接忽略：

**大乱斗不存在的机制（27 个）**
```
视野：visionScore, VISION_SCORE, wardsPlaced, WARD_PLACED, wardsKilled, WARD_KILLED,
      sightWardsBoughtInGame, VISION_WARDS_BOUGHT_IN_GAME, visionWardsBoughtInGame,
      detectorWardsPlaced, visionClearedPings, needVisionPings, enemyVisionPings      = 0
野怪：neutralMinionsKilled, NEUTRAL_MINIONS_KILLED,
      totalAllyJungleMinionsKilled, totalEnemyJungleMinionsKilled,
      NEUTRAL_MINIONS_KILLED_ENEMY_JUNGLE, NEUTRAL_MINIONS_KILLED_YOUR_JUNGLE         = 0
大小龙：baronKills, dragonKills, damageDealtToEpicMonsters, objectivesStolen,
        objectivesStolenAssists                                                       = 0
```

**大乱斗不用普通符文（29 个）**
```
PERK0..PERK5, PERK0_VAR1..3 … PERK5_VAR1..3, PERK_PRIMARY_STYLE, PERK_SUB_STYLE      = 0
```

**竞技场（Arena）专用（4 个）**
```
PLAYER_SUBTEAM, PLAYER_SUBTEAM_PLACEMENT, playerSubteamId, subteamPlacement,
placement                                                                             = 0
```

**投降/异常（7 个）** `CAUSED_GAME_END_FROM_IGNB_SURRENDER`, `GAME_ENDED_IN_IGNB_SURRENDER`, `TEAM_IGNB_SURRENDERED`, `causedGameEndFromIGNBSurrender`, `gameEndedInIGNBSurrender`, `gameEndedInSurrender`, `teamIGNBSurrendered` = 0

**行为标记（6 个）** `WAS_PREMADE_WITH_IGNB_GAME_END_CAUSER`, `WAS_PREMADE_WITH_SEVERE_TRANSGRESSOR`, `WAS_SEVERE_TRANSGRESSOR`, `wasPremadeWithIGNBGameEndCauser`, `wasPremadeWithSevereTransgressor`, `wasSevereTransgressor` = 0

**其他（16 个）** `LEVEL`(=18 恒定), `champLevel`(=18 恒定), `timePlayed`(=1144 恒定), `championTransform`, `roleBoundItem`/`ROLE_BOUND_ITEM`, `eligibleForProgression`(=1), `unrealKills`, `pentaKills`, `quadraKills`, `PLAYER_AUGMENT_5/6`, `playerAugment5/6`, 以及上面列过的部分 Ping

> 注意 `LEVEL` 和 `champLevel` **恒为 18 是因为所有人都满级**，不是字段坏了。大乱斗 15 分钟基本全 18。

---

## B. 实时数据（对局中）

### B.1 `/liveclientdata/playerlist` —— 10 人实时状态

每人 20 个字段：

| 字段 | 类型 | 实测 | 说明 |
|---|---|---|---|
| `riotIdGameName` | str | — | 游戏名（**事件流用这个名字配对**） |
| `riotIdTagLine` | str | — | 后缀 |
| `riotId` / `summonerName` | str | `名字#后缀` | 完整名 |
| `championName` | str | — | 中文英雄名 |
| `rawChampionName` | str | `game_character_displayname_Ezreal` | 英文内部名 |
| `skinName` / `rawSkinName` / `skinID` | str/int | — | 皮肤 |
| `team` | str | `ORDER` / `CHAOS` | **队伍（注意：不是 100/200）** |
| `level` | int | 11~18 | 英雄等级 |
| `isDead` | bool | — | **是否阵亡** |
| `respawnTimer` | float | 0.0~28.0 | **复活倒计时（秒）** |
| `position` | str | `NONE` | **大乱斗恒为 NONE** |
| `scores` | dict | 5 字段 | 见下 |
| `items` | list[obj] | 0~7 件 | 见下 |
| `summonerSpells` | dict | 2 字段 | `{displayName, rawDescription, rawDisplayName}` |
| `runes` | null | **恒为 null** | **实时永远拿不到符文** |
| `isBot` | bool | false | — |

**`scores`（5 字段）**

| 字段 | 实测 | 说明 |
|---|---|---|
| `kills` / `deaths` / `assists` | 0~21 / 0~18 / 0~41 | **实时 KDA** |
| `creepScore` | 0~67 | 补刀 |
| `wardScore` | **0.0** | 大乱斗恒 0 |

**`items[]`（每个装备对象 9 字段）**

```json
{"canUse": false, "consumable": false, "count": 1, "displayName": "蜕生",
 "itemID": 3137, "price": 200, "rawDescription": "GeneratedTip_Item_3137_Description",
 "rawDisplayName": "Item_3137_Name", "slot": 0}
```

> ⚠️ **`price` 是合成价，不是总价**。蜕生实际 3,000，这里给 200。要总价必须用 `itemID` 查 `items.json` 的 `priceTotal`。

### B.2 `/liveclientdata/eventdata` —— 实时事件流

结构：`{"Events": [...]}`，**整个数组是累积的**（第一份 0 条 → 最后 156 条）。按 `EventID` 去重。

本局共 156 个事件、9 种类型：

| 事件 | 次数 | 字段 | 说明 |
|---|---|---|---|
| `ChampionKill` | **120** | `EventID`, `EventTime`, `KillerName`, `VictimName`, `Assisters[]` | **每次击杀，精确到毫秒。死亡归因靠它** |
| `Multikill` | 22 | + `KillStreak`, `KillerName` | 连杀（2/3/4/5） |
| `TurretKilled` | 5 | + `TurretKilled`(塔全名), `KillerName`, `Assisters[]` | 推塔 |
| `Ace` | 4 | `Acer`, `AcingTeam`, `EventTime` | **团灭。`AcingTeam` 是赢的一方** |
| `GameStart` | 1 | `EventTime` | 开局 |
| `FirstBlood` | 1 | + `Recipient` | 一血 |
| `MinionsSpawning` | 1 | `EventTime` | 小兵出兵 |
| `FirstBrick` | 1 | + `KillerName` | 首塔（可能是小兵，如 `Minion_T100L1S16N0099`） |
| `InhibKilled` | 1 | + `InhibKilled`(水晶全名), `KillerName`, `Assisters[]` | 破水晶 |

**没有的**：`position{x,y}`、伤害、金币、血量。位置只能从赛后时间线拿。

**塔/水晶全名的解析**：
```
Turret_TOrder_L1_P5_1477396591_0   → TOrder = ORDER 的塔（即 CHAOS 推掉的）
Inhib_TOrder_L1_P1_196971597_0     → ORDER 的水晶被破
```

### B.3 `/liveclientdata/gamestats` —— 5 个字段

```json
{"gameMode": "KIWI", "gameTime": 1142.74, "mapName": "Map12",
 "mapNumber": 12, "mapTerrain": "Default"}
```

> `gameTime` 是**唯一可信的对局时钟**。用它把 581 份快照对齐到时间轴。

---

## C. 选人与流程

### C.1 `/lol-champ-select/v1/session`（35 个顶层字段）

| 字段 | 实测 | 说明 |
|---|---|---|
| `gameId` | 9050524432 | 对局 ID |
| `queueId` | 2400 | 海克斯大乱斗 |
| `localPlayerCellId` | 9 | 自己所在格子 |
| `myTeam` | list[5] | 我方（见下） |
| `theirTeam` | list[5] | 敌方，**名字和英雄全部隐藏** |
| `benchChampions` | list[8] | **备用英雄池**（`[{championId, isPriority}]`） |
| `rerollsRemaining` | 0 | 剩余重随次数 |
| `bans` | dict | `{myTeamBans, numBans, theirTeamBans}` — 大乱斗全空 |
| `actions` / `trades` / `pickOrderSwaps` / `positionSwaps` | list | 大乱斗基本为空 |
| `timer` | dict | `{phase, adjustedTimeLeftInPhase, totalTimeInPhase, internalNowInEpochMs, isInfinite}` |
| `allowRerolling` / `benchEnabled` / `allowSkinSelection` | bool | 模式能力 |
| `chatDetails` | dict | 聊天 JWT，**敏感** |

**`myTeam[]`（21 字段，关键 9 个）**

| 字段 | 实测 | 说明 |
|---|---|---|
| `cellId` | 0~9 | 格子号 |
| `championId` | 23~897 | **当前英雄（重随/换人会变）** |
| `championPickIntent` | 0 | 预选 |
| `puuid` | — | 主键 |
| `summonerId` / `gameName` / `tagLine` | — | 身份 |
| `assignedPosition` | `""` | **大乱斗恒为空（无分路）** |
| `isAutofilled` | false | 补位标记 |
| `nameVisibilityType` | `VISIBLE` / `HIDDEN` | 可见性 |
| `spell1Id` / `spell2Id` | 4~32 | 召唤师技能 |
| `selectedSkinId` / `wardSkinId` | — | 皮肤 |

> **没有开黑关系字段。** 整个 session 里没有任何 premade / party 信息。

### C.2 `/lol-gameflow/v1/session`

| 字段 | 说明 |
|---|---|
| `phase` | `InProgress` / `ChampSelect` / `WaitingForStats` 等 |
| `gameData.gameId` | 对局 ID |
| `gameData.playerChampionSelections` | **list[10]，`{puuid, championId, spell1Id, spell2Id, selectedSkinIndex}`** ← 10 人全有，可做 puuid→英雄 映射 |
| `gameData.teamOne` / `teamTwo` | list[4] / list[5] ← **合计只有 9 人，不可靠** |
| `gameData.queue` | 队列详情（`description`, `allowablePremadeSizes` 等） |
| `gameClient.serverIp` / `serverPort` | `gpp-hn10-2.lol.qq.com` / 13063 |
| `gameDodge` | 秒退记录 |

> 要拿 10 人的 puuid→英雄 映射，**用 `playerChampionSelections`，不要用 `teamOne`/`teamTwo`**。

### C.3 `/lol-gameflow/v1/gameflow-phase`

单值字符串：`"None"` / `"Lobby"` / `"Matchmaking"` / `"ChampSelect"` / `"InProgress"` / `"WaitingForStats"` / `"EndOfGame"`。

**这是状态机的唯一驱动源。** 每 2 秒轮询。

---

## D. 玩家档案

### D.1 `/lol-summoner/v1/current-summoner`（15 字段）

| 字段 | 实测 | 说明 |
|---|---|---|
| `summonerLevel` | 673 | **召唤师等级** |
| `xpSinceLastLevel` / `xpUntilNextLevel` | 655 / 3648 | 距下一级 |
| `percentCompleteForNextLevel` | 17 | 百分比 |
| `profileIconId` | 7038 | 头像 |
| `puuid` / `summonerId` / `accountId` | — | 三个 ID |
| `gameName` / `tagLine` | 我来加油你去送 / 68961 | 名字 |
| `rerollPoints` | dict | `{currentPoints, maxRolls, numberOfRolls, pointsCostToRoll, pointsToReroll}` |
| `displayName` / `internalName` | `""` | 弃用 |
| `privacy` / `unnamed` / `nameChangeFlag` | PUBLIC / false / false | — |

### D.2 `/lol-ranked/v1/ranked-stats/{puuid}`

顶层：`queueMap`（6 个队列）+ `highestRankedEntry` + `seasons` + `splitsProgress` 等。

`queueMap` 的队列键：
```
JADE_RANKED_SOLO_5x5, RANKED_SOLO_5x5, RANKED_FLEX_SR,
RANKED_PREMADE_5x5, RANKED_TFT, RANKED_TFT_DOUBLE_UP
```

每个队列 22 个字段，有用的：

| 字段 | 实测 | 说明 |
|---|---|---|
| `tier` | GOLD / PLATINUM / EMERALD | 段位 |
| `division` | IV / III / I | 小段 |
| `leaguePoints` | 0~93 | LP |
| `isProvisional` | false | 定级中 |
| `provisionalGamesRemaining` | — | 剩余定级场次 |
| `wins` / `losses` | **losses 全是 0** | ⚠️ **字段不可信，别用** |
| `previousSeasonEndTier/Division` | — | 上赛季 |
| `miniSeriesProgress` | `""` | 晋级赛 |
| `ratedTier` / `ratedRating` | — | 双排评分（新） |

> **本抓包 5 个队友的 `losses` 全部为 0**（`34W/0L`、`63W/0L`），显然是接口没填。**只用 tier / division / leaguePoints。**

**本号实测：6 个队列全部 `tier: ""` / `division: "NA"` / `isProvisional: true`**，
连 `highestPreviousSeasonEndTier` 也是空 —— 纯大乱斗号，从来没打过排位。

设计含义：**S1 的段位位置必须能显示「未定级」**。乱斗玩家大概率没有段位，
把那里硬写成一个段位名，等于对多数用户显示空白。

---

## E. 静态资产（ID → 名称）

所有路径都是 `/lol-game-data/assets/v1/*`，**本地 LCU 直接给，断网可用**。

| 文件 | 体积 | 条数 | 关键字段 | 用途 |
|---|---|---|---|---|
| `items.json` | 676 KB | 863 | `id`, `name`, `price`(合成价), `priceTotal`(**总价**), `iconPath`, `description`, `from`/`to`(合成树), `inStore`, `maxStacks`, `requiredChampion` | **装备名 + 真实总价** |
| `queues.json` | 362 KB | 422 | `id`, `name`, `shortName`, `description`, `gameSelectCategory`, `pickMode`, `viableChampionRoster` | 队列识别（2400 → 海克斯大乱斗） |
| `perks.json` | 102 KB | 103 | `id`, `name`, `shortDesc`, `longDesc`, `iconPath`, `endOfGameStatDescs` | 普通符文（大乱斗不用） |
| `champion-summary.json` | 57 KB | **255** | `id`, `name`, `alias`, `roles[]`, `squarePortraitPath`, `description` | **英雄名 + 头像 + 角色** |
| `summoner-spells.json` | 13 KB | 39 | `id`, `name`, `description`, `cooldown`, `gameModes[]`, `iconPath` | 召唤师技能名 |
| `maps.json` | 1.4 KB | 6 | `id`, `name`, `mapStringId` | 地图（12 = 嚎哭深渊） |

**额外一份（不在 LCU，在腾讯 CDN）**

| 文件 | 条数 | 关键字段 | 用途 |
|---|---|---|---|
| `fixtures/gtimg/kiwi_augments.json` | 237 | `augmentID`, `name_cn`, `name_en`, `level`(kSilver/kGold/kPrismatic), `small_Icon`, `big_Icon`, `mode` | **强化符文中文名 + 图标** |

> `champion-summary` 有 255 条，比 gtimg 英雄表的 173 条多——LCU 包含未上线英雄。**用 LCU 这份，别用 gtimg 那份。**

### 图标来源（实测可用的地址）

| 用途 | 地址 | 备注 |
|---|---|---|
| 英雄头像 | `cdn.communitydragon.org/latest/champion/{championId}/square` | 数字 ID 可用 |
| **装备图标** | `ddragon.leagueoflegends.com/cdn/{version}/img/item/{itemId}.png` | **必须跟版本**，本局是 `16.21` |
| 装备图标（错误示范） | `cdn.communitydragon.org/latest/item/{id}/icon` | **404，不可用** |

`version` 取 `/lol-patch/v1/game-version` 的前两段（`16.21.8299102+…` → `16.21.1`）。
实测 `15.21.1` 缺新装备（如 2523 海克斯镜片 C44 返回 403）。

### 图标来源（实测可用的地址）

| 用途 | 地址 | 备注 |
|---|---|---|
| 英雄头像 | `cdn.communitydragon.org/latest/champion/{championId}/square` | 数字 ID 可用 |
| **装备图标** | `ddragon.leagueoflegends.com/cdn/{version}/img/item/{itemId}.png` | **必须跟版本**，本局是 `16.21` |
| 装备图标（错误示范） | `cdn.communitydragon.org/latest/item/{id}/icon` | **404，不可用** |

`version` 取 `/lol-patch/v1/game-version` 的前两段（`16.21.8299102+…` → `16.21.1`）。
实测 `15.21.1` 缺新装备（如 2523 海克斯镜片 C44 返回 403）。

---

## F. 字段陷阱清单（写代码前必看）

| # | 陷阱 | 后果 | 正确处理 |
|---|---|---|---|
| 1 | Live `items[].price` 是**合成价** | 装备价值低估 3~15 倍 | 用 `itemID` 查 `items.json.priceTotal` |
| 2 | `PLAYER_AUGMENT_n` 与 `playerAugmentN` 重复 | 误以为是两种数据 | 二选一，但 zod 两个都要声明 |
| 3 | 队伍级 `PLAYER_AUGMENT_n` = ID 求和 | 得到无意义的 6873 | 自己从 players[] 聚合 |
| 4 | `players[].level` 是**召唤师等级** | 当成英雄等级 → 严重错误 | 英雄等级用 `champLevel` |
| 5 | `players[].wins/losses` 只有本地玩家有值 | 别人显示 0-0 | 判 `isLocalPlayer` |
| 6 | eog `players[].items` 是 **int 数组**，live 是**对象数组** | 解析崩 | 两套类型分开定义 |
| 7 | `teamOne` + `teamTwo` 合计只有 9 人 | 少一个人 | 用 `playerChampionSelections`（10 人） |
| 8 | 同一字段有 `大写` 和 `驼峰` 两份 | 重复计算 | 只取一套，另一套忽略 |
| 9 | `teams[].isPlayerTeam` 才是"我方" | 用 teamId 猜会错 | 只认 `isPlayerTeam` |
| 10 | live team 是 `ORDER`/`CHAOS`，eog 是 `100`/`200` | 对不上 | 建映射：ORDER=100，CHAOS=200 |
| 11 | `runes` 恒为 null，`position` 恒为 NONE | 拿不到符文/分路 | 局内不设计这两块 |
| 12 | `AcingTeam` 是**赢的一方**，不是被灭方 | 团灭方向读反 | 我上一轮就犯过这个错 |
| 13 | `ranked-stats` 的 `losses` 全为 0 | 胜率算成 100% | 只用 tier/division/LP |
| 14 | `timeCCingOthers`(0~69) 与 `totalTimeCCDealt`(0~432) 差 6 倍 | 控制指标选错 | 用 `timeCCingOthers`：控制敌方英雄 |
| 15 | `eventdata` 的 `Events` 数组是**累积**的 | 重复计数 | 按 `EventID` 去重 |
| 16 | `FirstBrick` 的 `KillerName` 可能是小兵 | 解析成玩家名会崩 | 判前缀 `Minion_` |
| 17 | `damageDealtToTurrets` / `ToBuildings` / `ToObjectives` 实测恒等 | 以为是三个指标 | 只取一个 |
| 18 | `multiUserChatPassword` / `mucJwtDto.jwt` 是令牌 | 泄露风险 | **绝不落盘/打日志** |
| 19 | 历史战绩的 `playerAugment1..6` **数据里有、社区 TS 类型里没有** | 照抄类型会导致字段被静默丢弃 | 类型要按真实响应生成，别照抄别人的 `.d.ts` |

---

## G. 按用途挑字段（做报告时照这个取）

| 报告要展示 | 用哪些字段 | 来源 |
|---|---|---|
| 胜负 | `teams[].isWinningTeam` + `teams[].isPlayerTeam` | eog |
| 10 人头像/名字/英雄 | `championId` + `championName` + `championSquarePortraitPath` + `riotIdGameName` | eog |
| KDA | `kills` / `deaths` / `assists` | eog 或 live `scores` |
| 伤害占比 | `totalDamageDealtToChampions` | eog |
| 承伤占比 | `totalDamageTaken` + `damageSelfMitigated` | eog |
| 治疗/护盾 | `totalHeal` + `totalHealsOnTeammates` + `totalDamageShieldedOnTeammates` | eog |
| 控制 | `timeCCingOthers` | eog |
| 经济 | `goldEarned` / `goldSpent` | eog |
| 符文 | `PLAYER_AUGMENT_1..4` → `kiwi_augments.json` | eog + 图鉴 |
| 装备 | `players[].items`（int[]）→ `items.json` | eog + 资产 |
| 阵亡归因 | `eventdata` 的 `ChampionKill`（EventTime/Assisters） | live |
| 团灭 | `eventdata` 的 `Ace` | live |
| 死亡位置图 | `position{x,y}` | **match-history 时间线**（本抓包没有） |
| 经济曲线 | live `items` → priceTotal 累计 | live + 资产 |
| 队友段位 | `queueMap.*.tier/division/leaguePoints` | ranked-stats |
| 召唤师等级 | `summonerLevel` | summoner |

---

## H. 报告页元素 → 字段对照

`design/report.html` 上每一个数字都能指回具体字段。数据包由 `tools/build-report-fixture.py` 生成，
输入是 `fixtures/capture/<ts>/` 下的真实抓包，页面里**没有任何写死的数值**。

| 页面元素 | 取值 | 来源 |
|---|---|---|
| 胜利 / 失败 | `teams[].isWinningTeam` + `isPlayerTeam` | eog |
| 时长 19:04 | `gameLength`（秒） | eog |
| 全队 K / D / A | 10 人 `kills/deaths/assists` 求和 | eog |
| 金币差 +2.1k | `teams[].stats.GOLD_EARNED` 两队相减 | eog |
| 防御塔 4:1 | `teams[].stats.TURRETS_KILLED` | eog |
| 头像与英雄名 | `championId` → CommunityDragon；`championName` | eog |
| 玩家名 | `riotIdGameName`，为空时退回 `championName` | eog |
| K / D / A（每人） | `stats.kills / deaths / assists` | eog |
| 综合分 | 输出轨 42% + 团队轨 33% − 风险轨 35%（**队内**归一） | 派生 |
| 输出轨 | `totalDamageDealtToChampions` 占队内比，除以队内峰值 | eog |
| 团队轨 | 承伤 50% + 控制 30% + 治疗护盾 20%（均取队内占比），除以队内峰值 | eog |
| 风险轨 | `崩盘发起次数 × 22 + deaths × 2.2`，除以队内峰值 | eog + live |
| 崩盘发起 | live `ChampionKill` 聚类，见下方定义 | live |
| 时间轴刻痕 | 同上，按 `EventTime / gameLength` 定位 | live + eog |
| 塔 / 水晶 / 团灭标记 | `TurretKilled` / `InhibKilled` / `Ace` | live |
| 详情 · 伤害 | `totalDamageDealtToChampions` | eog |
| 详情 · 承伤 | `totalDamageTaken` | eog |
| 详情 · 自我减伤 | `damageSelfMitigated` | eog |
| 详情 · 治疗+护盾 | `totalHeal + totalDamageShieldedOnTeammates` | eog |
| 详情 · 控制 | `timeCCingOthers` | eog |
| 详情 · 金币 | `goldEarned`，备注用 `goldSpent` | eog |
| 符文 | `PLAYER_AUGMENT_1..4` → `kiwi_augments.json` 查中文名与图标 | eog + 图鉴 |
| 出装 | `players[].items`（int 数组）→ `items.json` 查名与 `priceTotal` | eog + 资产 |
| 召唤师技能 | `players[].spell1Id / spell2Id` → `summoner-spells.json` | eog + 资产 |

### 崩盘事件的定义（唯一需要跨两个数据源的计算）

```
窗口 W = 12 秒（实测稳定区，见 11 §5）

1. 取出全部 ChampionKill，按 EventTime 排序
2. 对每次击杀：看它之后 12 秒内双方各死了几人
3. 若「本队再死 ≥2」且「敌方死亡 ≤ 本队」→ 记为一个崩盘窗口
4. 时间上重叠的窗口合并为同一个「崩盘事件」
5. 该事件归因给其中**最先阵亡**的那个人 → 他是「崩盘发起者」
```

不合并的话，一波团灭会把 5 个人各算一次崩盘。合并后本局 18 个窗口收敛成 11 次事件，
其中我方 7 次、敌方 4 次——和人工看录像的结论一致。

### 三栏判定（敌我各一套）

| 栏 | 判定式 | 数据来源 |
|---|---|---|
| 尽力 C | 队内 **综合分** 最大 | 派生 |
| 蛆 | 队内 **风险轨** 最大；并列依次比崩盘发起、阵亡数 | 派生 |
| 不团队 | 队内 `输出轨 ≥ 60` 中 **团队轨** 最小，且排除前两项已选的人 | 派生 |

三条判定**只在队内进行**。本局实测结果：

| | 尽力 C | 蛆 | 不团队 |
|---|---|---|---|
| 我方 | 纳祖芒荣耀（综合 43，自减伤 143,195） | 暴走萝莉（7 次崩盘发起 4 次） | 法外狂徒（输出轨 100、团队轨 37.7） |
| 敌方 | 残月之肃（综合 49） | 不破之誓（4 次崩盘发起 2 次） | 探险家（伤害 51,940 全场第一、控制 0 秒） |

「尽力 C」用综合分而非输出轨，是为了让三栏落在**三个不同的人**身上——
若两项都按输出排序，"伤害第一"和"只会输出"会指向同一人，三栏退化成两栏。

### 页面明确不做的事

| 元素 | 为什么没有 |
|---|---|
| 死亡位置图 | 实时数据**没有坐标**，`game-timelines` 才能给 `position{x,y}`，本抓包未采集 |
| 视野分 / 补刀效率 | 大乱斗 `visionScore = 0`，补刀无战术含义（见 §C 废字段） |
| 治疗量排名 | 只有 4 人有治疗量，比较无意义 |
| 输出占比排名 | 两队总伤害差 39%，跨队比较会误导，一律只在队内比 |

---

## I. 历史战绩：能查什么，查不到什么

> 本抓包**没有任何 match-history 请求**（26 个端点里没有）。以下端点与参数来自
> LeagueAkari 源码核实 + 其国服快照验证；字段清单来自 `fixtures/tencent-hn10/q_2400.json` 实数据。

### I.1 四个端点

| 端点 | 用途 | 分页 |
|---|---|---|
| `GET /lol-match-history/v1/products/lol/current-summoner/matches` | 自己的战绩 | 无参，返回默认批次 |
| `GET /lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=19` | **任意玩家**的战绩（含队友、对手） | `begIndex` / `endIndex`，默认 0~19 |
| `GET /lol-match-history/v1/games/{gameId}` | 单局完整数据 | — |
| `GET /lol-match-history/v1/game-timelines/{gameId}` | 单局时间线（**唯一带死亡坐标的地方**） | — |

SGP 另有一条更宽的路：`/match-history-query/v1/products/lol/player/{puuid}/SUMMARY`，
参数是 `startIndex` / `count` / **`tag`** / `tagsQueryType`。`tag` 可按队列过滤，
意味着能直接只要 `KIWI` 的局，不用拉回来再筛。国服快照里这条路是通的。

### I.2 单局详情里有什么

`/lol-match-history/v1/games/{gameId}` 的 `participants[].stats` 实测 **118 个字段**：

| 有 | 说明 |
|---|---|
| `playerAugment1..6` | 符文，实测有值（快照 q_2400：1356 / 1391 / 1320 / 1322） |
| 伤害 / 承伤 / 自减伤 / 治疗 / 控制 / 金币 | 与 eog 同名同义 |
| `longestTimeSpentLiving` | 最长存活 |
| **`timeline.goldPerMinDeltas`** | **每分钟金币曲线**，不用自己采样 |
| `timeline.xpPerMinDeltas` / `creepsPerMinDeltas` / `damageTakenPerMinDeltas` | 每分钟经验 / 补刀 / 承伤 |
| `gameModeMutators` | 模式变体（本局 `mapskin_map12_bloom`） |

### I.3 拿不到的两样

| 缺 | 影响 | 对策 |
|---|---|---|
| **`totalTimeSpentDead`** | 报告页「阵亡累计 456s」这个字段 **eog 独有**，历史战绩里没有 | 本地每局抓 eog 存下来；靠历史补录的局只能显示 `—` |
| **死亡坐标** | 位置图必须单独请求 `game-timelines/{gameId}` | 按需拉取，拉一次算一次 |

换句话说：**历史战绩无法完整重建一份战报**。它能重建九成，
但「阵亡累计时长」和「死亡位置」只有现场抓或额外请求才有。

### I.4 这条能力现在的用途

§11 算过：单局崩盘率的 95% 置信区间大面积重叠，46% 的区间是 [23%, 71%]、
11% 的区间是 [3%, 33%]，单局统计上分不出人。

**但产品决定不做多局平滑**（见 11 §7 规则 1）：标签就是本局的，波动本身是真实信息。
所以历史战绩**不再承担「让人设标签可信」的职责**，它只剩三件事：

| 用途 | 说明 |
|---|---|
| **补录** | App 没开着时打的局，事后把对局捞回来（缺 `totalTimeSpentDead`，标 `—`） |
| **查别人** | 队友 / 对手近 N 局，S2 队友情报的基础 |
| **长期成就** | 跨局排行榜、连胜连败，「谁当蛆王次数最多」这类整蛊统计 |

好处是架构变轻：**不必为每局拉 `game-timelines`**，只有要看死亡位置时才按需请求一次。

### I.5 跨局统计：只做「当蛆次数」这一个指标

既然不做多局平滑，跨局就只保留**一个计数**：这个人在已记录的局里当了几次「本队蛆」。
不统计比率、不取平均、不看趋势。

| 项 | 口径 |
|---|---|
| 什么算一次 | 该局把他评为**本队蛆**（风险轨最大，并列比崩盘发起、阵亡数） |
| 每局贡献 | **2 次**（我方一个、敌方一个） |
| join key | **`puuid`**，不是英雄名（同一英雄会被不同人玩）、不是召唤师名（可改名） |
| 少于一局记录 | 显示「首次」 |
| 两局以上 | 显示「第 N 次」 |

**为什么只做计数**：计数不受样本量影响。崩盘**率**在 7 次死亡上算出来是噪音，
但「7 局里当了 4 次蛆」这句话，本身就是完整的信息，不需要置信区间。

页面对应位置：

- `report.html` 蛆栏标题 → `蛆 第 4 次`
- `report.html` 页脚 → `已记录 7 局`
- `home.html` 汇总条 → `当过蛆王 N 次`

生成方式：`tools/build-report-fixture.py` 会扫 `fixtures/capture/*` 下**所有**目录，
每局都算一遍、全部参与计数，但只用最新那个出报告。当前只有 1 个抓包，所以是「首次 / 已记录 1 局」。

### I.6 三个未验证项

| 项 | 为什么没验 | 怎么验 |
|---|---|---|
| 历史能翻多少页 | `begIndex/endIndex` 理论上可一直翻，实际深度由服务端决定 | 循环翻页直到 `games` 为空，记录边界 |
| 老局的时间线还在不在 | Riot 侧通常只保留有限窗口 | 拿 30 天前的 gameId 请求，看是否 404 |
| 国服 SGP 的 `tag` 取值 | 只知道参数存在，没枚举过 | 抓一次 `SUMMARY?tag=...` 看返回 |

---

## 附：生成方式

本文所有数字由脚本从原始 JSON 统计得出，可复算：

```bash
cd fixtures/capture/2026-10-26T19-26-49

# 字段清单（类型 / 空值 / 去重数 / 范围）
python3 - <<'EOF'
import json, glob
d = json.load(open(sorted(glob.glob('lcu/*eog-stats-block*'))[-1]))
stats = [p['stats'] for t in d['teams'] for p in t['players']]
for k in sorted(set().union(*[set(s) for s in stats])):
    vals = [s[k] for s in stats if s.get(k) is not None]
    print(f"{k:<42}{len(set(vals)):>3}  {min(vals)} ~ {max(vals)}")
EOF
```

统计样本：10 名玩家 × 189 字段。**去重数 1 即全场同值，视为该模式下的废字段。**
