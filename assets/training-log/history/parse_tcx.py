# /// script
# requires-python = ">=3.12"
# dependencies = ["pydantic"]
# ///
import json, math, glob, re
from datetime import datetime, timezone
from xml.etree import ElementTree as ET
from pydantic import BaseModel

NS = {"t": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
MI = 1609.344
ACT = {"16": "run", "197": "run", "208": "treadmill"}

class Split(BaseModel):
    mile: str
    pace_s: float
    elapsed_s: float
    hr: float | None = None
    elev_gain_ft: float | None = None

class Run(BaseModel):
    id: str
    date: str
    start_local: str
    type: str
    name: str
    source: str
    dist_mi: float
    active_s: int
    elapsed_s: int
    pace_s: float | None
    hr_avg: float | None = None
    hr_max: float | None = None
    cadence_avg: float | None = None
    steps: int | None = None
    kcal: float | None = None
    elev_gain_ft: float | None = None
    elev_min_ft: float | None = None
    elev_max_ft: float | None = None
    start_ll: list[float] | None = None
    end_ll: list[float] | None = None
    t_1mi: float | None = None
    t_5k: float | None = None
    t_4mi: float | None = None
    fastest_mile_s: float | None = None
    splits: list[Split] = []
    has_gps: bool = False
    points: int = 0

def ft(m): return m * 3.28084

def parse_tcx(path):
    pts = []
    root = ET.parse(path).getroot()
    for tp in root.iter(f"{{{NS['t']}}}Trackpoint"):
        t = tp.find("t:Time", NS)
        if t is None: continue
        ts = datetime.fromisoformat(t.text).timestamp()
        d = tp.find("t:DistanceMeters", NS); a = tp.find("t:AltitudeMeters", NS)
        la = tp.find("t:Position/t:LatitudeDegrees", NS); lo = tp.find("t:Position/t:LongitudeDegrees", NS)
        hr = tp.find("t:HeartRateBpm/t:Value", NS)
        pts.append(dict(t=ts, d=float(d.text) if d is not None else None, a=float(a.text) if a is not None else None,
                        la=float(la.text) if la is not None else None, lo=float(lo.text) if lo is not None else None,
                        hr=float(hr.text) if hr is not None else None))
    return pts

def at_dist(dp, target):
    for i in range(1, len(dp)):
        if dp[i][1] >= target:
            (t0, d0), (t1, d1) = dp[i-1], dp[i]
            return t0 + (t1 - t0) * ((target - d0) / (d1 - d0) if d1 > d0 else 0)
    return None

def gain(alts):
    g, base = 0.0, None
    for a in alts:
        if base is None: base = a; continue
        if a - base > 5.0: g += a - base; base = a
        elif a < base: base = a
    return g

out = []
for w in json.load(open("all_workouts.json")):
    wid = w["_links"]["self"][0]["id"]; ag = w.get("aggregates") or {}
    act = ACT.get(w["_links"]["activity_type"][0]["id"], w["_links"]["activity_type"][0]["id"])
    f = glob.glob(f"tcx/*_{wid}.tcx")
    pts = parse_tcx(f[0]) if f and __import__("os").path.getsize(f[0]) > 1000 else []
    dist = ag.get("distance_total", 0) or 0
    r = Run(id=wid, date=w["start_datetime"][:10], start_local="", type=act, name=w.get("name", ""), source=w.get("source", ""),
            dist_mi=round(dist / MI, 3), active_s=int(ag.get("active_time_total") or 0), elapsed_s=int(ag.get("elapsed_time_total") or 0),
            pace_s=(ag["active_time_total"] / (dist / MI)) if dist > 0 and ag.get("active_time_total") else None,
            hr_avg=ag.get("heartrate_avg"), hr_max=ag.get("heartrate_max"), cadence_avg=ag.get("cadence_avg"),
            steps=ag.get("steps_total") or ag.get("estimated_steps_total"),
            kcal=round(ag["metabolic_energy_total"] / 4184, 1) if ag.get("metabolic_energy_total") else None, points=len(pts))
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(w.get("start_locale_timezone") or "America/New_York")
    st = datetime.fromisoformat(w["start_datetime"]).astimezone(tz)
    r.date = st.strftime("%Y-%m-%d"); r.start_local = st.strftime("%Y-%m-%d %H:%M %Z")
    if pts:
        t0 = pts[0]["t"]
        gps = [p for p in pts if p["la"] is not None]
        r.has_gps = bool(gps)
        if gps: r.start_ll = [round(gps[0]["la"], 5), round(gps[0]["lo"], 5)]; r.end_ll = [round(gps[-1]["la"], 5), round(gps[-1]["lo"], 5)]
        alts = [p["a"] for p in pts if p["a"] is not None]
        if alts: r.elev_gain_ft = round(ft(gain(alts))); r.elev_min_ft = round(ft(min(alts))); r.elev_max_ft = round(ft(max(alts)))
        hrs = [p["hr"] for p in pts if p["hr"]]
        if hrs and r.hr_avg is None: r.hr_avg = round(sum(hrs) / len(hrs)); r.hr_max = max(hrs)
        dp = [(p["t"] - t0, p["d"]) for p in pts if p["d"] is not None]
        if dp:
            for k, m in (("t_1mi", MI), ("t_5k", 5000), ("t_4mi", 4 * MI)):
                v = at_dist(dp, m)
                if v is None and dp[-1][1] >= m - 16: v = dp[-1][0]
                setattr(r, k, round(v, 1) if v else None)
            prev_t, prev_d, n = 0.0, 0.0, 1
            total = dp[-1][1]
            while prev_d < total - 1:
                tgt = min(n * MI, total); tt = at_dist(dp, tgt) if tgt < total else dp[-1][0]
                if tt is None: break
                seg = [p for p in pts if p["d"] is not None and prev_d <= p["d"] <= tgt]
                sh = [p["hr"] for p in seg if p["hr"]]; sa = [p["a"] for p in seg if p["a"] is not None]
                frac = (tgt - prev_d) / MI
                r.splits.append(Split(mile=str(n) if tgt == n * MI else f"{tgt/MI:.2f}", pace_s=round((tt - prev_t) / frac, 1) if frac > 0 else 0,
                                      elapsed_s=round(tt, 1), hr=round(sum(sh) / len(sh)) if sh else None, elev_gain_ft=round(ft(gain(sa))) if sa else None))
                prev_t, prev_d, n = tt, tgt, n + 1
            full = [s.pace_s for s in r.splits if "." not in s.mile]
            r.fastest_mile_s = min(full) if full else None
    out.append(r)

out.sort(key=lambda r: r.start_local)
json.dump([r.model_dump() for r in out], open("mmr_runs.json", "w"), indent=1)
print(len(out), "runs;", sum(r.has_gps for r in out), "with gps;", sum(r.t_4mi is not None for r in out), "reached 4 mi")
