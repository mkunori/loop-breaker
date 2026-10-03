"""Design-only reference calculation; no browser/game implementation.
Run: python docs/balance/simulate.py
Uses small fixed steps for calibration, NOT the production BURST algorithm.
"""
import math

DT = 0.05
UNLOCK = {"speed": 6, "crit": 20, "overkill": 35, "delay": 65, "auto": 120}
BASE = {"atk": 25, "speed": 10, "crit": 10, "overkill": 10, "delay": 10}


def simulate(prestige=0, shortcut=1.0, verbose=True, decision_interval=1):
    t = gold = phase = 0.0
    clears = 0
    levels = dict.fromkeys(BASE, 0)
    marks = []
    unlock_times = {}
    next_mark = 0
    target = 239
    while (clears < target or (prestige >= 2 and t < 300)) and t < 7200:
        stage = min(100, 1 + math.floor(clears / 2.4))
        l = levels
        damage = 10 * 1.16 ** l["atk"] * (1 + .70 * prestige)
        dps = damage * 1.25 ** l["speed"] * (1 + .2 * l["crit"])
        hp = 240 * 1.002 ** (stage - 1)
        delay = 6 * .60 ** l["delay"] * .85 ** prestige
        clear_time = (hp / (dps * (1 + .15 * l["overkill"])) + delay) * shortcut
        if t >= next_mark:
            marks.append((round(t, 2), stage, clears, dict(l), round(gold, 3), round(damage, 3), round(clear_time, 4)))
            next_mark += 300
        t += DT
        phase += DT / clear_time
        n = math.floor(phase + 1e-12)
        phase -= n
        clears += n
        gold += n * 10 * (1 + .55 * prestige)
        for key, threshold in UNLOCK.items():
            if clears >= threshold and key not in unlock_times:
                unlock_times[key] = round(t, 2)
        # Before AUTO this is a manual-policy proxy, never production automation.
        # Sensitivity runs can postpone all purchase decisions to longer intervals.
        if round(t / DT) % round(decision_interval / DT) == 0:
            for key in ["speed", "crit", "overkill", "delay"]:
                if (prestige > 0 or clears >= UNLOCK[key]) and l[key] == 0 and gold >= BASE[key]:
                    gold -= BASE[key]
                    l[key] = 1
            while gold >= BASE["atk"] * 1.15 ** l["atk"]:
                gold -= BASE["atk"] * 1.15 ** l["atk"]
                l["atk"] += 1
    if verbose:
        print("prestige", prestige, "shortcut", shortcut, "finish", round(t, 2), "levels", levels)
        print("clear threshold crossings (unlocks persist on repeat)", unlock_times)
        for row in marks:
            print(row)
    return t


if __name__ == "__main__":
    simulate()
    simulate(1, .55)
    simulate(2, .36)
