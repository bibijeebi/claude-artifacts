import json
from datetime import datetime
from zoneinfo import ZoneInfo
W={w['_links']['self'][0]['id']:w for w in json.load(open('all_workouts.json'))}
R=json.load(open('mmr_runs.json'))
for r in R:
    w=W[r['id']]
    if r['start_ll'] and r['start_ll'][1] < -114 and w.get('start_locale_timezone') != 'America/Los_Angeles':
        st=datetime.fromisoformat(w['start_datetime']).astimezone(ZoneInfo('America/Los_Angeles'))
        r['date']=st.strftime('%Y-%m-%d'); r['start_local']=st.strftime('%Y-%m-%d %H:%M %Z'); r['tz_note']='MapMyRun stored Eastern; GPS is California'
    full=[s for s in r['splits'] if '.' not in s['mile']]
    bad=[s for s in full if r['pace_s'] and s['pace_s']<390 and s['pace_s']<0.75*r['pace_s']]
    if bad:
        r['gps_suspect']=[s['mile'] for s in bad]
        ok=[s['pace_s'] for s in full if s not in bad]
        r['fastest_mile_s']=min(ok) if ok else None
    for s in r['splits']:
        if s['pace_s']<180: s['gps_artifact']=True
R.sort(key=lambda r:r['start_local'])
json.dump(R,open('mmr_runs.json','w'),indent=1)
for r in R:
    if r.get('tz_note') or r.get('gps_suspect'): print(r['date'],r['start_local'],r.get('gps_suspect'),r['fastest_mile_s'])

# Runs where the GPS kept going after the run (e.g. drove off with tracking on) and the
# distance was corrected in the app: trust the edited distance, drop track data past it.
R=json.load(open('mmr_runs.json'))
for r in R:
    if not r['splits']: continue
    last=r['splits'][-1]['mile']; tcx=float(last) if '.' in last else float(len(r['splits']))
    if tcx - r['dist_mi'] > 0.05:
        keep=[s for s in r['splits'] if float(s['mile']) <= r['dist_mi'] + 0.01]
        r['splits']=keep
        full=[s['pace_s'] for s in keep if '.' not in s['mile']]
        r['fastest_mile_s']=min(full) if full else None
        for k in ('t_4mi','t_5k'):
            if r[k] and r['dist_mi'] < (4 if k=='t_4mi' else 3.107): r[k]=None
        r['elev_gain_ft']=r['elev_min_ft']=r['elev_max_ft']=None
        r['end_ll']=None
        r['track_note']=f"GPS kept recording after the run (drove off); distance edited to {r['dist_mi']:.2f} mi in the app, track data past that dropped"
        print('trimmed',r['date'],r['dist_mi'],[(s['mile'],round(s['pace_s'])) for s in keep],r['fastest_mile_s'])
json.dump(R,open('mmr_runs.json','w'),indent=1)
