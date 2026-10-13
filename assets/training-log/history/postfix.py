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
