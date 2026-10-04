"""Design-only event calculation, not browser/game implementation.

Run: python docs/balance/simulate.py --cycles 10
Standard library only. Each CLEAR is visited to provide a small reference model;
production must use the stage/price aggregate formula in TECHNICAL_DESIGN.md.
"""
import argparse
import math
from dataclasses import dataclass, field

CONFIG = {
    "damage_base": 60, "delay_base": 1, "route_density": 40,
    "delay_first_cap": 6, "burst_enter": .001,
    "unlock": {"speed": 20, "crit": 70, "overkill": 140, "delay": 250, "auto": 400},
    "base": {"atk": 100, "speed": 10, "crit": 10, "overkill": 10, "delay": 100},
    "growth": {"atk": 1.2, "speed": 2.2, "crit": 2.2, "overkill": 2.2, "delay": 1.8},
    "mastery": (1, .55, .36),
    "hp_growth": 1.002,
    "deep_hp_growth": 1.020,
    "stage_gold_step": .0005,
    "stage_gold_cap": 100,
    "soul_exponent": 1.5,
}


@dataclass
class Meta:
    prestige_count: int = 0
    soul: int = 0
    power: int = 0
    wealth: int = 0
    tempo: int = 0


@dataclass
class Result:
    cycle: int
    target_stage: int
    seconds: float
    earned_soul: int
    meta_start: tuple
    soul_start: int
    start_time: float
    end_time: float
    burst_at: float | None
    burst_stage: int | None
    levels: dict
    marks: list = field(default_factory=list)
    unlock_times: dict = field(default_factory=dict)
    milestones: dict = field(default_factory=dict)


def target_stage(prestige_count):
    return 100 + 50 * max(0, prestige_count - 2)


def boundary(stage):
    return math.ceil(CONFIG["route_density"] * (stage - 1))


def caps(prestige_count):
    p = prestige_count
    return {
        "speed": min(8, 1 + (p + 1) // 2),
        "crit": min(8, 1 + p // 2),
        "overkill": min(8, 1 + max(0, p - 1) // 2),
        "delay": min(30, CONFIG["delay_first_cap"] + 2 * p),
    }


def stage_gold(stage):
    return 1 + CONFIG["stage_gold_step"] * min(stage - 1, CONFIG["stage_gold_cap"])


def clear_time(stage, levels, meta):
    damage = CONFIG["damage_base"] * 1.16 ** levels["atk"] * (1 + .70 * meta.power)
    dps = damage * 1.25 ** levels["speed"] * (1 + .2 * levels["crit"])
    hp = (240 * CONFIG["hp_growth"] ** (stage - 1)
          * CONFIG["deep_hp_growth"] ** max(0, stage - 100))
    combat = hp / (dps * (1 + .15 * levels["overkill"]))
    delay = CONFIG["delay_base"] * .60 ** levels["delay"] * .85 ** meta.tempo
    mastery = CONFIG["mastery"][min(meta.prestige_count, 2)]
    return mastery * (combat + delay)


def soul_reward(stage, prestige_count):
    return math.floor(4 * (stage / 100) ** CONFIG["soul_exponent"]) + (4 if prestige_count == 1 else 0)


def spend_soul(meta, policy="balanced"):
    """Carry unspent SOUL and pay every purchase, with no imaginary levels.

    Balanced advances the lowest level first, ties POWER/WEALTH/TEMPO.
    If that next choice is unaffordable, reserve SOUL; do not skip to a
    cheaper higher-level choice. Alternate policies are sensitivity checks.
    """
    while True:
        names = ["power", "wealth", "tempo"]
        if policy == "balanced":
            name = min(names, key=lambda key: (getattr(meta, key), names.index(key)))
        else:
            name = policy
        cost = math.ceil((2 if name == "tempo" else 1) * 1.7 ** getattr(meta, name))
        if cost > meta.soul:
            break
        meta.soul -= cost
        setattr(meta, name, getattr(meta, name) + 1)


def simulate_cycle(meta, decision_interval=1, normal_policy="caps-first"):
    """Exact CLEAR/purchase/measurement boundaries; no fixed dt error."""
    if not math.isfinite(decision_interval) or decision_interval <= 0:
        raise ValueError("decision_interval must be finite and positive")
    t = gold = phase = 0.0
    clears = 0
    levels = dict.fromkeys(CONFIG["base"], 0)
    cap = caps(meta.prestige_count)
    target = target_stage(meta.prestige_count)
    required_clears = boundary(target) + 1
    start = clear_time(1, levels, meta)
    burst_at = 0.0 if start < CONFIG["burst_enter"] else None
    burst_stage = 1 if burst_at == 0 else None
    marks = []
    unlock_times = {}
    milestones = {}
    next_decision = decision_interval
    next_mark = 0.0
    while clears < required_clears:
        stage = min(target, 1 + math.floor(clears / CONFIG["route_density"]))
        current_time = clear_time(stage, levels, meta)
        for threshold in (1, .1, .01, .001):
            if current_time < threshold and threshold not in milestones:
                milestones[threshold] = (t, stage)
        if current_time < CONFIG["burst_enter"] and burst_at is None:
            burst_at, burst_stage = t, stage
        if next_mark <= t + 1e-9:
            marks.append((t, stage, clears, dict(levels), gold, current_time))
            next_mark += 300
        clear_at = t + (1 - phase) * current_time
        event_at = min(clear_at, next_decision, next_mark)
        if event_at > 7200:
            raise RuntimeError(f"Cycle {meta.prestige_count + 1} exceeded the 7200s calculation horizon; balance requires review")
        phase += (event_at - t) / current_time
        t = event_at
        # Resolve CLEAR before purchases at the same timestamp.
        if clear_at <= t + 1e-9:
            phase = 0.0
            clears += 1
            gold += 10 * (1 + .55 * meta.wealth) * stage_gold(stage)
            for key, threshold in CONFIG["unlock"].items():
                if clears >= threshold and key not in unlock_times:
                    unlock_times[key] = t
            if clears == required_clears:
                break
        if next_decision <= t + 1e-9:
            # Manual proxy; production only automates ATK after its unlock.
            for key in ["speed", "crit", "overkill", "delay"]:
                allowed = meta.prestige_count > 0 or clears >= CONFIG["unlock"][key]
                chosen_cap = cap[key] if normal_policy == "caps-first" else 1
                while allowed and levels[key] < chosen_cap:
                    cost = CONFIG["base"][key] * CONFIG["growth"][key] ** levels[key]
                    if cost > gold:
                        break
                    gold -= cost
                    levels[key] += 1
            while gold >= CONFIG["base"]["atk"] * CONFIG["growth"]["atk"] ** levels["atk"]:
                gold -= CONFIG["base"]["atk"] * CONFIG["growth"]["atk"] ** levels["atk"]
                levels["atk"] += 1
            next_decision += decision_interval
    return Result(meta.prestige_count + 1, target, t,
                  soul_reward(target, meta.prestige_count),
                  (meta.power, meta.wealth, meta.tempo), meta.soul, start,
                  clear_time(target, levels, meta), burst_at, burst_stage,
                  dict(levels), marks, unlock_times, milestones)


def simulate(cycles=10, decision_interval=1, normal_policy="caps-first", soul_policy="balanced"):
    meta = Meta()
    results = []
    for _ in range(cycles):
        row = simulate_cycle(meta, decision_interval, normal_policy)
        results.append(row)
        meta.soul += row.earned_soul
        meta.prestige_count += 1
        spend_soul(meta, soul_policy)
    return results


def print_results(rows):
    print("LOOP MASTERY milestones: Prestige #1 BREAK I (x0.55); #2 BREAK II (cumulative x0.36).")
    print("| Prestige # | Required Stage | Cycle seconds | SOUL earned | P/W/T at start | SOUL carry | Start sec/run | End sec/run | First BURST in cycle |")
    print("|---:|---:|---:|---:|---|---:|---:|---:|---|")
    total = 0.0
    for r in rows:
        burst = "no" if r.burst_at is None else f"{r.burst_at:.2f}s / Stage {r.burst_stage}"
        print(f"| {r.cycle} | {r.target_stage} | {r.seconds:.2f} | {r.earned_soul} | {'/'.join(map(str, r.meta_start))} | {r.soul_start} | {r.start_time:.4f} | {r.end_time:.4f} | {burst} |")
        if r.burst_at is not None and all(x.burst_at is None for x in rows[:r.cycle - 1]):
            print(f"First lifetime BURST: total active seconds {total + r.burst_at:.2f}")
        total += r.seconds
    print("First-cycle checkpoints:", rows[0].marks)
    print("First-cycle unlocks:", rows[0].unlock_times)
    total = 0
    seen = set()
    for row in rows:
        for threshold, (when, stage) in row.milestones.items():
            if threshold not in seen:
                print(f"First <{threshold}s: Cycle {row.cycle}, cycle {when:.2f}s, lifetime {total+when:.2f}s, Stage {stage}")
                seen.add(threshold)
        total += row.seconds
    print("Normal levels at each finish:", [r.levels for r in rows])


def check_design():
    rows = simulate(12)
    assert clear_time(1, dict.fromkeys(CONFIG["base"], 0), Meta()) == 5
    assert boundary(100) == 3960 and boundary(150) == 5960
    assert 1500 < rows[0].seconds < 1700
    assert 300 < rows[1].seconds < 340 and 110 < rows[2].seconds < 125
    assert .1 < rows[0].end_time < .2
    assert rows[0].milestones[1][0] < 600
    assert .1 in rows[1].milestones and .01 in rows[2].milestones
    assert next(r.cycle for r in rows if r.burst_at is not None) == 10
    assert rows[11].seconds > rows[9].seconds
    assert soul_reward(100, 0) == 4 and soul_reward(100, 1) == 8
    for before, after in zip(rows, rows[1:]):
        spent = sum(math.ceil((2 if axis == 2 else 1) * 1.7 ** level)
                    for axis in range(3)
                    for level in range(before.meta_start[axis], after.meta_start[axis]))
        assert before.soul_start + before.earned_soul == spent + after.soul_start
    print("Design checks passed: 5s start, pacing, milliseconds, BURST, SOUL ledger, late slowdown.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cycles", type=int, default=10)
    parser.add_argument("--decision-interval", type=float, default=1)
    parser.add_argument("--normal-policy", choices=["caps-first", "lv1-only"], default="caps-first")
    parser.add_argument("--soul-policy", choices=["balanced", "power", "wealth", "tempo"], default="balanced")
    parser.add_argument("--soul-exponent", type=float, default=CONFIG["soul_exponent"])
    parser.add_argument("--burst-enter", type=float, default=CONFIG["burst_enter"], help="compare .1 / .01 / .001 second boundaries")
    parser.add_argument("--check", action="store_true", help="verify the adopted design and SOUL ledger")
    args = parser.parse_args()
    if not 1 <= args.cycles <= 100:
        parser.error("cycles must be between 1 and 100")
    if any(not math.isfinite(v) or v <= 0 for v in [args.decision_interval, args.soul_exponent, args.burst_enter]):
        parser.error("decision interval and soul exponent must be finite and positive")
    CONFIG["soul_exponent"] = args.soul_exponent
    CONFIG["burst_enter"] = args.burst_enter
    if args.check:
        check_design()
    else:
        print_results(simulate(args.cycles, args.decision_interval, args.normal_policy, args.soul_policy))
