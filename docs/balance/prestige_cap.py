"""Issue17 pre-implementation comparison: speed5, cap-only, separated mastery.
Strategies buy non-ATK caps first every second, then ATK; real SOUL ledger.
Deep Run means three NEW milestones per cycle; no instant applied mastery.
"""
import argparse
import copy
import simulate as m

SELECTED = (15, 16, 17, 20, 25, 30, 40, 50)


def run(variant, strategy, interval=50, cycles=51):
    m.CONFIG.update(prestige_cap=None if variant == "speed-5" else 800,
                    separate_mastery=variant == "separated", deep_interval=interval)
    meta = m.Meta()
    rows = []
    elapsed = 0.0
    for p in range(cycles):
        required = m.target_stage(p)
        stop = required
        if p >= 16 and strategy != "escape":
            count = 1 if strategy == "+1" else 3
            stop = max(required, 800 + interval * (meta.deep_mastery + count))
        before = meta.deep_mastery
        factor = m.mastery(meta)
        try:
            row = m.simulate_cycle(meta, normal_policy="immediate", target_override=stop, fast=True)
        except RuntimeError as error:
            print(f"HORIZON {variant}/{strategy}: P{p}, highest{stop}, >7200s; remaining rows not extrapolated. {error}")
            break
        earned = max(0, (stop - 800) // interval)
        if p >= 16:
            meta.deep_mastery = max(meta.deep_mastery, earned)
        rows.append(dict(p=p, required=required, highest=stop, seconds=row.seconds,
                         reach800=row.reach800, start=row.start_time, end=row.end_time,
                         soul=row.earned_soul, soul_min=row.earned_soul * 60 / row.seconds,
                         deep_start=before, deep_end=meta.deep_mastery, mastery=factor,
                         permanent=row.meta_start, burst=row.burst_at))
        elapsed += row.seconds
        rows[-1]["elapsed"] = elapsed
        meta.soul += row.earned_soul
        meta.prestige_count += 1
        m.spend_soul(meta)
        if p in SELECTED:
            future = m.simulate_cycle(meta, normal_policy="immediate", fast=True)
            rows[-1]["next_reset_seconds"] = future.seconds
    return rows


def report(check=False):
    config = copy.deepcopy(m.CONFIG)
    results = {}
    try:
        for variant in ("speed-5", "cap-only", "separated"):
            for strategy in ("escape", "+1", "deep-run"):
                # All variants use the same intended stop strategy. Legacy required
                # can itself exceed that next milestone and always takes priority.
                rows = run(variant, strategy)
                results[variant, strategy] = rows
                print(f"\n{variant} / {strategy} / interval50; P=completed Prestige")
                print("| P | Required | highest | Cycle s | Stage800 s | Start s | End s | SOUL | SOUL/min | Deep before->after | Mastery | P/W/T | BURST s | Cumulative s | Next reset required s |")
                print("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|---:|---:|")
                for r in rows:
                    if r['p'] in SELECTED:
                        print(f"| {r['p']} | {r['required']} | {r['highest']} | {r['seconds']:.4f} | {r['reach800']} | {r['start']:.8g} | {r['end']:.8g} | {r['soul']} | {r['soul_min']:.4f} | {r['deep_start']}->{r['deep_end']} | {r['mastery']:.8g} | {'/'.join(map(str,r['permanent']))} | {r['burst']} | {r['elapsed']:.4f} | {r['next_reset_seconds']:.4f} |")
        if check:
            escape = results['separated','escape']
            assert all(60 < r['seconds'] < 240 for r in escape[20:])
            assert escape[50]['deep_end'] == 0
            assert escape[16]['mastery'] == escape[50]['mastery']
            for strategy in ('+1', 'deep-run'):
                deep = results['separated',strategy]
                assert deep[50]['soul'] > escape[50]['soul']
                assert deep[50]['mastery'] < escape[50]['mastery']
                assert deep[50]['seconds'] > escape[50]['seconds']
            assert results['separated','+1'][20]['soul_min'] < escape[20]['soul_min']
            assert results['separated','+1'][50]['soul_min'] > escape[50]['soul_min']
            assert results['separated','deep-run'][50]['soul_min'] > escape[50]['soul_min']
            assert results['cap-only','escape'][50]['seconds'] < 5
            regular = m.simulate(17, normal_policy='immediate')
            assert all(abs(a.seconds - b['seconds']) < 1e-6 for a,b in zip(regular, results['separated','escape'][:17]))
            print('PASS: Escape 1-4min P20..50; cap-only collapses; Deep yields more SOUL/mastery at slower cycle; Escape faster reset; deep lower early and higher late SOUL/min.')
    finally:
        m.CONFIG.clear()
        m.CONFIG.update(config)
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    report(parser.parse_args().check)
