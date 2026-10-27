"""把一局真实对局的结算数据，整理成 S1 空闲页（首页）可直读的数据包。

输入（只读）：
  fixtures/capture/<ts>/lcu/*current-summoner*      自己的身份（等级/头像/重随点）
  fixtures/capture/<ts>/lcu/*current-ranked-stats*  段位（乱斗号通常为空）
  fixtures/capture/<ts>/lcu/*eog-stats-block*       该局结算，用来出「最近战报」行

评分逻辑**直接 import report 生成脚本**，保证 S1 和 S5 用同一套算法，
不会出现首页显示 43 分、点进去显示 39 分这种事。

输出：stdout 一个 JSON（紧凑格式）
"""
import importlib.util
import json
import pathlib
import sys
from datetime import datetime

ROOT = '/Users/moody/Desktop/MyProject/lol'
CAPTURE_ROOT = ROOT + '/fixtures/capture'


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BRF = load_module(ROOT + '/tools/build-report-fixture.py', 'build_report_fixture')


def read_first(cap, pattern):
    hits = sorted(pathlib.Path(cap).glob(pattern))
    if not hits:
        sys.exit(f'缺文件: {cap}/{pattern}')
    return json.loads(hits[-1].read_text(encoding='utf-8'))


def rank_of(queue_map):
    """挑一个可展示的段位：优先单双排，其次灵活，再其次任何有 tier 的队列。"""
    order = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR', 'JADE_RANKED_SOLO_5x5', 'RANKED_PREMADE_5x5']
    pool = list(order) + [q for q in queue_map if q not in order]
    for q in pool:
        v = queue_map.get(q) or {}
        if v.get('tier'):
            return {
                'queue': q,
                'tier': v['tier'],
                'division': v.get('division') or '',
                'lp': v.get('leaguePoints') or 0,
                'wins': v.get('wins') or 0,
                'losses': v.get('losses') or 0,
            }
    return None


def tag_for(me, players):
    """这局「我」是什么角色——口径与报告页三栏一致。"""
    team = [v for v in players.values() if v['side'] == me['side']]
    worm = BRF.pick_worm(players, me['side'])
    if worm and worm['champ'] == me['champ']:
        return '蛆', 'bad'
    best = sorted(team, key=lambda v: -v['score'])[0]
    if best['champ'] == me['champ']:
        return '尽力 C', 'good'
    tank = sorted(team, key=lambda v: -v['teamAxis'])[0]
    if tank['champ'] == me['champ']:
        return '最扛', ''
    if me['outAxis'] >= 80:
        return '大腿', 'good'
    return '工具人', ''


def main():
    caps = sorted(d for d in pathlib.Path(CAPTURE_ROOT).iterdir() if d.is_dir())
    if not caps:
        sys.exit('没有抓包目录')

    # 身份与段位取最新抓包（这两项与具体对局无关）
    cap = caps[-1]
    summoner = read_first(cap, 'lcu/*current-summoner*')
    ranked = read_first(cap, 'lcu/*current-ranked-stats*')

    me_puuid = summoner['puuid']

    history = []
    for c in caps:
        try:
            data = BRF.build(str(c))
        except (SystemExit, KeyError, IndexError) as exc:
            print(f'跳过 {c.name}: {exc}', file=sys.stderr)
            continue
        me = next((v for v in data['players'].values() if v['puuid'] == me_puuid), None)
        if not me:
            continue
        tag, tone = tag_for(me, data['players'])
        try:
            at = datetime.strptime(c.name, '%Y-%m-%dT%H-%M-%S')
            when = at.strftime('%m-%d %H:%M')
        except ValueError:
            when = c.name
        history.append({
            'champ': me['champ'],
            'cid': me['cid'],
            'k': me['k'], 'd': me['d'], 'a': me['a'],
            'length': data['meta']['length'],
            'score': round(me['score']),
            'tag': tag,
            'tone': tone,
            'win': 1 if me['win'] else 0,
            'when': when,
            'gameId': data['meta']['gameId'],
        })

    # 最新一局排最前
    history.sort(key=lambda h: h['when'], reverse=True)

    n = len(history)
    wins = sum(h['win'] for h in history)
    rr = summoner.get('rerollPoints') or {}

    out = {
        'me': {
            'name': summoner.get('gameName') or summoner.get('displayName') or '—',
            'tag': summoner.get('tagLine') or '',
            'level': summoner.get('summonerLevel'),
            'icon': summoner.get('profileIconId'),
            'xp': summoner.get('xpSinceLastLevel'),
            'xpNeed': summoner.get('xpUntilNextLevel'),
            'percent': summoner.get('percentCompleteForNextLevel'),
            'puuid': me_puuid,
            'rank': rank_of(ranked.get('queueMap') or {}),
            'reroll': {
                'points': rr.get('currentPoints'),
                'cost': rr.get('pointsToReroll') or rr.get('pointsCostToRoll'),
                'max': rr.get('maxRolls'),
                'used': rr.get('numberOfRolls'),
            },
        },
        'stats': {
            'games': n,
            'wins': wins,
            'winRate': round(wins / n * 100) if n else 0,
            'kda': [round(sum(h[k] for h in history) / n, 1) if n else 0 for k in ('k', 'd', 'a')],
            'score': round(sum(h['score'] for h in history) / n) if n else 0,
            'deaths': round(sum(h['d'] for h in history) / n, 1) if n else 0,
            'worm': sum(1 for h in history if h['tag'] == '蛆'),
        },
        'history': history,
    }
    print(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f'[{n} 局历史，身份取自 {cap.name}]', file=sys.stderr)


if __name__ == '__main__':
    main()
