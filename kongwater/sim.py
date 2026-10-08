import json, math

IN = 0.0254
G = 9.81
GPM = 3.785e-3 / 60

R_FLOOR, R_TOP, H_PAN = 7.5, 8.375, 6.0
FILL = 2.75
DROP = 8.8
K_SUM = 0.6


def r_at(h):
    return R_FLOOR + (R_TOP - R_FLOOR) * h / H_PAN - 0.05


def area(h):
    return math.pi * (r_at(h) * IN) ** 2


def vol(h, n=200):
    return sum(area(h * (i + 0.5) / n) * h * IN / n for i in range(n))


def vol_in(h_in, n=200):
    return sum(area(h_in * (i + 0.5) / n) * h_in * IN / n for i in range(n))


def valve_frac(t, stroke):
    if t <= 0:
        return 0.0
    x = min(t / stroke, 1.0)
    return x * x * (3 - 2 * x)


def run(bore=0.75, stroke=4.0, q_in_gpm=0.0, inlet_closed=True, hold=75.0, dt=0.02, t_end=900.0):
    d = bore * IN
    a_full = math.pi * d * d / 4
    cd = 1 / math.sqrt(1 + K_SUM + 0.03 * (DROP / bore))
    h = FILL * IN
    t = 0.0
    out = []
    empty_t = None
    refill_t = None
    while t < t_end:
        draining = t < hold
        a = a_full * (valve_frac(t, stroke) if draining else max(0.0, 1 - valve_frac(t - hold, stroke)))
        q_out = cd * a * math.sqrt(2 * G * (h + DROP * IN)) if h > 0 else 0.0
        inlet_open = (not inlet_closed) or not draining
        if inlet_closed and not draining:
            inlet_open = (t - hold) > stroke
        float_open = h < FILL * IN - 0.004
        q_in = q_in_gpm * GPM if (inlet_open and float_open) else 0.0
        h = max(0.0, h + (q_in - (q_out if h > 0 else 0)) * dt / area(h / IN))
        if h <= 0.0005 and empty_t is None and draining:
            empty_t = t
        if not draining and refill_t is None and h >= FILL * IN - 0.005:
            refill_t = t
        if int(round(t / dt)) % int(round(0.5 / dt)) == 0:
            out.append([round(t, 1), round(h / IN, 3)])
        t += dt
        if refill_t and t > refill_t + 10:
            break
    return dict(trace=out, empty_s=empty_t, refill_s=refill_t, min_depth_in=min(p[1] for p in out if p[0] <= hold + 1))


res = {}
res["volume_gal"] = vol_in(FILL) / 3.785e-3
res["bore"] = {}
for b in (0.5, 0.75, 1.0):
    r = run(bore=b, q_in_gpm=0.5, hold=200, t_end=260)
    res["bore"][str(b)] = dict(empty_s=r["empty_s"], trace=[p for p in r["trace"] if p[0] <= 120])
res["cycle"] = {}
for q in (0.25, 0.5, 1.0):
    r = run(bore=0.75, q_in_gpm=q, hold=75.0, t_end=1200)
    res["cycle"][str(q)] = dict(empty_s=r["empty_s"], refill_s=r["refill_s"], trace=r["trace"])
res["no_inlet_valve"] = {}
for q in (0.25, 0.5, 1.0, 1.5):
    r = run(bore=0.75, q_in_gpm=q, inlet_closed=False, hold=75.0, t_end=300)
    res["no_inlet_valve"][str(q)] = dict(empty_s=r["empty_s"], min_depth_in=r["min_depth_in"], wasted_gal=round(q * 75 / 60, 2))
for k, v in res.items():
    if k == "volume_gal":
        print("volume gal", round(v, 2))
    else:
        for kk, vv in v.items():
            print(k, kk, {x: y for x, y in vv.items() if x != "trace"})
json.dump(res, open("sim.json", "w"))
