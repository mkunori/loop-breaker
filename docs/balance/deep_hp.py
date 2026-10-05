"""Issue #15 candidate comparison; reference only, never production code.
Run: python docs/balance/deep_hp.py [--check]
"""
import argparse
import simulate as model

CURVES = {
    "legacy": [(100, None, 1.020)],
    "A": [(100, 700, 1.020), (700, 1000, 1.006), (1000, None, 1.002)],
    "B": [(100, 700, 1.020), (700, 1000, 1.005), (1000, None, 1.001)],
    "C": [(100, 750, 1.020), (750, 1100, 1.005), (1100, None, 1.001)],
}


def regression(auto_atk=True):
    # Missing actual Save fields are explicitly fixed: Gold6538, phase0,
    # first CLEAR of Stage807 pending, reserve0; no manual/non-ATK purchases.
    meta = model.Meta(prestige_count=17, power=10, wealth=9, tempo=9)
    levels = dict(atk=55, speed=8, crit=8, overkill=8, delay=6)
    t, gold, phase, clears = 0.0, 6538.0, 0.0, model.boundary(807)
    next_decision = 1.0
    while clears < model.boundary(850) + 1:
        stage = 1 + clears // model.CONFIG["route_density"]
        duration = model.clear_time(stage, levels, meta)
        clear_at = t + (1 - phase) * duration
        event_at = min(clear_at, next_decision)
        phase += (event_at - t) / duration
        t = event_at
        if clear_at <= t + 1e-9:
            phase = 0.0
            clears += 1
            gold += 10 * (1 + .55 * meta.wealth) * model.stage_gold(stage)
        if next_decision <= t + 1e-9:
            while auto_atk and gold >= model.CONFIG["base"]["atk"] * model.CONFIG["growth"]["atk"] ** levels["atk"]:
                gold -= model.CONFIG["base"]["atk"] * model.CONFIG["growth"]["atk"] ** levels["atk"]
                levels["atk"] += 1
            next_decision += 1
    return t, levels["atk"]


def first_burst(rows):
    elapsed = 0
    for row in rows:
        if row.burst_at is not None:
            return elapsed + row.burst_at
        elapsed += row.seconds
    return None


def report(check=False):
    reports = {}
    print("Fixture: P17, Stage807 -> first Stage850 CLEAR, Gold6538, phase0, AUTO ATK ON, AUTO ADVANCE ON, reserve0.")
    print("| Curve | AUTO fixture seconds | ATK finish | No purchases seconds | HP701 | HP850 | HP1000 | HP1500 |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    legacy_early = {}
    for name, curve in CURVES.items():
        model.CONFIG["deep_segments"] = curve
        fixture, atk = regression()
        print(f"| {name} | {fixture:.4f} | {atk} | {regression(False)[0]:.4f} | " + " | ".join(f"{model.hp(stage):.8g}" for stage in (701, 850, 1000, 1500)) + " |")
        if name == "legacy":
            for policy in ("caps-first", "casual", "auto-only", "immediate"):
                legacy_early[policy] = model.simulate(3 if policy != "immediate" else 20, normal_policy=policy)
            continue
        rows = model.simulate(31, normal_policy="immediate")
        reports[name] = rows
        print(f"\n{name}: Immediate Prestige through P30 (Cycle = P+1); AUTO ADVANCE OFF / Prestige immediately on required CLEAR.")
        print("| P | Required | Start s | Reach seconds | End s | SOUL earned | P/W/T | BURST within cycle seconds |")
        print("|---:|---:|---:|---:|---:|---:|---|---|")
        for row in rows:
            print(f"| {row.cycle-1} | {row.target_stage} | {row.start_time:.8g} | {row.seconds:.4f} | {row.end_time:.8g} | {row.earned_soul} | {'/'.join(map(str,row.meta_start))} | {row.burst_at if row.burst_at is not None else 'none'} |")
        if check and name == "B":
            assert fixture < 120
            assert max(r.seconds for r in rows[16:]) < 480
    model.CONFIG["deep_segments"] = CURVES["B"]
    print("\nAdopted B early regression (reference event timing, not rounded production second decisions):")
    for policy, baseline in legacy_early.items():
        rows = model.simulate(len(baseline), normal_policy=policy)
        print(policy, "first Prestige", rows[0].seconds, "first BURST", first_burst(rows), "legacy BURST", first_burst(baseline))
        elapsed = 0
        seen = set()
        for row in rows:
            for threshold, (when, _) in row.milestones.items():
                if threshold not in seen:
                    print(" first below", threshold, "seconds at", elapsed + when)
                    seen.add(threshold)
            elapsed += row.seconds
        if check:
            assert [r.seconds for r in rows[:15]] == [r.seconds for r in baseline[:15]]
            if policy != "immediate":
                assert first_burst(rows) == first_burst(baseline)
            else:
                assert 1200 < first_burst(rows) < 1500
    if check:
        for stage in (1, 100, 250, 500, 700):
            assert model.hp(stage) == 240 * 1.002 ** (stage - 1) * 1.020 ** max(0, stage - 100)
        assert reports["B"][30].seconds / reports["B"][20].seconds < 1.3
        print("PASS: unchanged Stage<=700 and early policies; fixture<=120s; B P16..30<480s; B P20->30 growth<1.3x.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    report(parser.parse_args().check)
