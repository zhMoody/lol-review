"""把一局真实对局的结算数据 + 实时事件，整理成报告页可直读的数据包。

输入（只读，不改动 fixtures）：
  fixtures/capture/<ts>/lcu/*eog-stats-block*        结算：10 人 189 字段
  fixtures/capture/<ts>/live/*eventdata*             实时事件：击杀时刻/助攻
  fixtures/capture/<ts>/live/*playerlist*            实时快照：名字 ↔ 英雄 映射
  fixtures/capture/<ts>/live/*gamestats*             对局时钟：序号 → 秒
  fixtures/capture/<ts>/lcu-assets/*                 装备/技能/符文集

输出：stdout 一个 JSON（紧凑格式）
"""
import bisect
import collections
import glob
import json
import os
import pathlib
import sys

ROOT = '/Users/moody/Desktop/MyProject/lol'
CAPTURE_ROOT = ROOT + '/fixtures/capture'

# 崩盘判定的观察窗口（秒）。实测 12 秒是稳定区（见 docs/11 §5）
WINDOW = 12.0


def load(pattern):
    files = sorted(glob.glob(pattern))
    if not files:
        sys.exit(f'缺文件: {pattern}')
    return json.load(open(files[-1]))


def build_clock(cap):
    """返回 序号 → gameTime(秒) 的插值函数。"""
    marks = []
    for f in sorted(glob.glob(cap + '/live/*gamestats*')):
        idx = int(os.path.basename(f).split('-')[0])
        try:
            d = json.load(open(f))
        except json.JSONDecodeError:
            continue
        if 'gameTime' in d:
            marks.append((idx, d['gameTime']))
    marks.sort()

    def at(idx):
        k = bisect.bisect_left(marks, (idx, -1))
        if k <= 0:
            return marks[0][1]
        if k >= len(marks):
            return marks[-1][1]
        (i0, t0), (i1, t1) = marks[k - 1], marks[k]
        return t0 + (t1 - t0) * (idx - i0) / max(1, i1 - i0)

    return at


def build(cap):
    """算一局，返回数据包 dict（不打印）。"""
    eog = load(cap + '/lcu/*eog-stats-block*')
    catalog = {x['augmentID']: x for x in json.load(open(ROOT + '/fixtures/gtimg/kiwi_augments.json'))}
    items = {i['id']: i for i in json.load(open(cap + '/lcu-assets/0012-lol-game-data_assets_v1_items.json.json'))}
    spells = {s['id']: s['name'] for s in json.load(open(cap + '/lcu-assets/0013-lol-game-data_assets_v1_summoner-spells.json.json'))}

    # ── 实时快照：只为建立「玩家名 → 英雄名」映射 ──
    at = build_clock(cap)
    snaps = []
    for f in sorted(glob.glob(cap + '/live/*playerlist*')):
        idx = int(os.path.basename(f).split('-')[0])
        try:
            d = json.load(open(f))
        except json.JSONDecodeError:
            continue
        if isinstance(d, list) and len(d) == 10:
            snaps.append((at(idx), {p['championName']: p for p in d}))
    name_to_champ = {}
    for _, row in snaps:
        for champ, p in row.items():
            name_to_champ[p['riotIdGameName'] or champ] = champ

    events = load(cap + '/live/*eventdata*')['Events']
    kills = sorted((e for e in events if e['EventName'] == 'ChampionKill'), key=lambda e: e['EventTime'])

    side_of = {}
    for t in eog['teams']:
        for p in t['players']:
            side_of[p['championName']] = 'mine' if t['isPlayerTeam'] else 'foe'

    def champ_of(raw_name):
        return name_to_champ.get(raw_name, raw_name)

    # ── 崩盘事件：窗口内本队再死 >=2 且敌方 <= 本队，重叠合并，归因最先死的人 ──
    windows = []
    for e in kills:
        victim = champ_of(e['VictimName'])
        side = side_of.get(victim)
        t = e['EventTime']
        if not side:
            continue
        after = [x for x in kills if t < x['EventTime'] <= t + WINDOW]
        ours = sum(1 for x in after if side_of.get(champ_of(x['VictimName'])) == side)
        theirs = sum(1 for x in after if side_of.get(champ_of(x['VictimName'])) not in (None, side))
        if ours >= 2 and theirs <= ours:
            windows.append({'t': t, 'by': victim, 'side': side, 'ours': ours, 'theirs': theirs, 'end': t + WINDOW})
    windows.sort(key=lambda x: x['t'])

    merged = []
    for w in windows:
        if merged and w['t'] <= merged[-1]['end']:
            merged[-1]['end'] = max(merged[-1]['end'], w['end'])
            merged[-1]['members'].append(w)
        else:
            merged.append({'start': w['t'], 'end': w['end'], 'members': [w]})

    triggers = collections.Counter()
    episodes = []
    for m in merged:
        first = min(m['members'], key=lambda x: x['t'])
        triggers[first['by']] += 1
        episodes.append({
            't': round(m['start'], 1),
            'by': first['by'],
            'side': first['side'],
            'ours': max(x['ours'] for x in m['members']),
            'theirs': first['theirs'],
            'deaths': [x['by'] for x in m['members']],
        })

    # ── 每人明细 ──
    players = {}
    for t in eog['teams']:
        side = 'mine' if t['isPlayerTeam'] else 'foe'
        for p in t['players']:
            s = p['stats']
            augments = []
            for i in range(1, 5):
                aid = s.get(f'PLAYER_AUGMENT_{i}')
                if not aid:
                    augments.append(None)
                    continue
                c = catalog.get(aid)
                icon = c.get('small_Icon') if c else None
                # 图鉴里 small_Icon 已经是完整 URL，只有缺协议头时才补前缀
                if icon and not icon.startswith('http'):
                    icon = 'https://game.gtimg.cn/images/lol/act/img/rune/' + icon.lstrip('/')
                augments.append({
                    'id': aid,
                    'name': c['name_cn'] if c else f'#{aid}',
                    'level': c['level'] if c else None,
                    'icon': icon,
                })
            players[p['championName']] = {
                'name': p['riotIdGameName'] or p['championName'],
                'champ': p['championName'],
                'cid': p['championId'],
                'puuid': p.get('puuid', ''),
                'side': side,
                'win': t['isWinningTeam'],
                'k': s['kills'], 'd': s['deaths'], 'a': s['assists'],
                'dmg': s['totalDamageDealtToChampions'],
                'taken': s['totalDamageTaken'],
                'mit': s['damageSelfMitigated'],
                'heal': s['totalHeal'],
                'healMate': s['totalHealsOnTeammates'],
                'shield': s['totalDamageShieldedOnTeammates'],
                'cc': s['timeCCingOthers'],
                'gold': s['goldEarned'], 'spent': s['goldSpent'],
                'cs': s['totalMinionsKilled'],
                'dead': s['totalTimeSpentDead'],
                'life': s['longestTimeSpentLiving'],
                'multi': {'dbl': s['doubleKills'], 'tri': s['tripleKills'],
                          'quad': s['quadraKills'], 'penta': s['pentaKills'],
                          'max': s['largestMultiKill']},
                'tower': s['turretTakedowns'],
                'objDmg': s['damageDealtToObjectives'],
                'spell1': spells.get(p.get('spell1Id'), ''),
                'spell2': spells.get(p.get('spell2Id'), ''),
                'aug': augments,
                'items': [{'id': i, 'name': items.get(i, {}).get('name', str(i)),
                           'price': items.get(i, {}).get('priceTotal') or 0}
                          for i in p['items'] if i],
                'trig': triggers.get(p['championName'], 0),
                'deathTimes': [round(e['EventTime'], 1) for e in kills
                               if champ_of(e['VictimName']) == p['championName']],
            }

    # ── 队伍聚合 ──
    teams = {'mine': {'n': 0}, 'foe': {'n': 0}}
    for v in players.values():
        agg = teams[v['side']]
        agg['n'] += 1
        for key in ('k', 'd', 'a', 'dmg', 'taken', 'mit', 'heal', 'healMate', 'shield', 'cc', 'gold'):
            agg[key] = agg.get(key, 0) + v[key]
    for t in eog['teams']:
        agg = teams['mine' if t['isPlayerTeam'] else 'foe']
        agg['win'] = t['isWinningTeam']
        agg['tower'] = t['stats'].get('TURRETS_KILLED')
        agg['inhib'] = t['stats'].get('BARRACKS_KILLED')

    # ── 派生指标（每条都能在页面上追溯到原始字段）──
    # 原始份额：队内占比，合计 100%
    for v in players.values():
        tm = teams[v['side']]
        v['dmgShare'] = v['dmg'] / max(1, tm['dmg']) * 100
        v['killShare'] = v['k'] / max(1, tm['k']) * 100
        v['takenShare'] = v['taken'] / max(1, tm['taken']) * 100
        v['healShare'] = (v['heal'] + v['shield']) / max(1, tm['heal'] + tm['shield']) * 100
        v['ccShare'] = v['cc'] / max(1, tm['cc']) * 100
        # 团队轴 = 承伤 50% + 控制 30% + 治疗护盾 20%，全部是「为队友做的事」
        v['teamRaw'] = v['takenShare'] * 0.5 + v['ccShare'] * 0.3 + v['healShare'] * 0.2
        # 风险轴原始值：崩盘发起是重伤，阵亡是轻伤
        v['riskRaw'] = v['trig'] * 22 + v['d'] * 2.2

    # 归一化：一律在队内做，避免跨队比较（两队总伤害不同，跨队归一没有意义）
    for side in ('mine', 'foe'):
        group = [v for v in players.values() if v['side'] == side]
        peak = {
            'dmg': max(v['dmgShare'] for v in group) or 1,
            'team': max(v['teamRaw'] for v in group) or 1,
            'risk': max(v['riskRaw'] for v in group) or 1,
        }
        for v in group:
            v['outAxis'] = round(v['dmgShare'] / peak['dmg'] * 100, 1)      # 输出轨 0-100
            v['teamAxis'] = round(v['teamRaw'] / peak['team'] * 100, 1)     # 团队轨 0-100
            v['riskAxis'] = round(v['riskRaw'] / peak['risk'] * 100, 1)     # 风险轨 0-100
            # 综合分只用于队内排序：输出 42% + 团队 33% − 风险 35%
            v['score'] = round(v['outAxis'] * 0.42 + v['teamAxis'] * 0.33 - v['riskAxis'] * 0.35, 1)
            # 页面显示用的圆整份额
            v['dmgShare'] = round(v['dmgShare'], 1)
            v['killShare'] = round(v['killShare'], 1)
            v['takenShare'] = round(v['takenShare'], 1)
            v['healShare'] = round(v['healShare'], 1)
            v['ccShare'] = round(v['ccShare'], 1)

    objectives = []
    for e in events:
        if e['EventName'] in ('TurretKilled', 'InhibKilled', 'Ace'):
            objectives.append([round(e['EventTime'], 1), e['EventName'],
                               e.get('AcingTeam') or e.get('TurretKilled') or e.get('InhibKilled') or ''])

    return {
        'meta': {'gameId': eog['gameId'], 'length': eog['gameLength'], 'mode': eog['gameMode'],
                 'totalKills': len(kills), 'win': teams['mine']['win']},
        'teams': teams,
        'players': players,
        'episodes': episodes,
        'objectives': objectives,
    }


def pick_worm(players, side):
    """本队「蛆」——与页面同一口径：风险轨最大，并列依次比崩盘发起、阵亡数。"""
    group = [v for v in players.values() if v['side'] == side]
    if not group:
        return None
    return sorted(group, key=lambda v: (-v['riskAxis'], -v['trig'], -v['d']))[0]


def main():
    dirs = sorted(d for d in pathlib.Path(CAPTURE_ROOT).iterdir() if d.is_dir())
    built = []
    for d in dirs:
        try:
            built.append((d.name, build(str(d))))
        except (SystemExit, KeyError, IndexError) as exc:
            print(f'跳过 {d.name}: {exc}', file=sys.stderr)
    if not built:
        sys.exit('没有可用的抓包目录')

    # 跨局只统计一件事：这个人在已记录的局里当了几次「本队蛆」
    worm = collections.Counter()
    for _, data in built:
        for side in ('mine', 'foe'):
            w = pick_worm(data['players'], side)
            if w and w.get('puuid'):
                worm[w['puuid']] += 1

    latest_name, latest = built[-1]
    latest['career'] = {
        'games': len(built),
        'worm': {k: v for k, v in worm.items() if v},
        'source': [name for name, _ in built],
    }
    print(json.dumps(latest, ensure_ascii=False, separators=(',', ':')))
    print(f'[{len(built)} 局：{latest_name} 出报告，全部参与当蛆次数统计]', file=sys.stderr)


if __name__ == '__main__':
    main()
