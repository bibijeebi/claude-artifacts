const CAL_PER_LB = 3500;
const AUTH_TOKEN = 'zwaV2TuGRumDt3mX6AIcVrPQNboM09px';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };

function round(n, d = 1) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } }); }
function requireAuth(request) { return request.headers.get('Authorization') === `Bearer ${AUTH_TOKEN}`; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    if (method === 'OPTIONS') return new Response(null, { headers: cors });

    // === API ROUTES ===
    if (path.startsWith('/api/')) {
      try {
        // WEIGHT
        if (path === '/api/weight' && method === 'GET') {
          const limit = parseInt(url.searchParams.get('limit') || '10');
          const { results } = await env.DB.prepare('SELECT * FROM weights_v2 ORDER BY logged_at DESC LIMIT ?').bind(limit).all();
          return json({ weights: results });
        }
        if (path === '/api/weight' && method === 'POST') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.json();
          if (typeof body.weight !== 'number') return json({ error: 'weight required' }, 400);
          const ts = body.logged_at || new Date().toISOString();
          await env.DB.prepare('INSERT INTO weights_v2 (weight_lbs, logged_at) VALUES (?, ?)').bind(body.weight, ts).run();
          return json({ success: true, weight: body.weight, logged_at: ts });
        }
        if (path.match(/^\/api\/weight\/(\d+)$/) && method === 'PUT') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          const body = await request.json();
          const sets = [], vals = [];
          if (typeof body.weight === 'number') { sets.push('weight_lbs = ?'); vals.push(body.weight); }
          if (body.logged_at) { sets.push('logged_at = ?'); vals.push(body.logged_at); }
          if (!sets.length) return json({ error: 'No fields' }, 400);
          vals.push(id);
          await env.DB.prepare(`UPDATE weights_v2 SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
          return json({ success: true, id });
        }
        if (path.match(/^\/api\/weight\/(\d+)$/) && method === 'DELETE') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          await env.DB.prepare('DELETE FROM weights_v2 WHERE id = ?').bind(id).run();
          return json({ success: true, deleted: id });
        }

        // INTAKE
        if (path === '/api/intake' && method === 'GET') {
          const limit = parseInt(url.searchParams.get('limit') || '20');
          const { results } = await env.DB.prepare('SELECT * FROM intake_v2 ORDER BY logged_at DESC LIMIT ?').bind(limit).all();
          return json({ intake: results });
        }
        if (path === '/api/intake' && method === 'POST') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.json();
          if (typeof body.calories !== 'number') return json({ error: 'calories required' }, 400);
          const ts = body.logged_at || new Date().toISOString();
          await env.DB.prepare('INSERT INTO intake_v2 (calories, protein_g, carbs_g, fat_g, description, logged_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(body.calories, body.protein || null, body.carbs || null, body.fat || null, body.description || null, ts).run();
          return json({ success: true, calories: body.calories, logged_at: ts });
        }
        if (path.match(/^\/api\/intake\/(\d+)$/) && method === 'PUT') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          const body = await request.json();
          const sets = [], vals = [];
          if (typeof body.calories === 'number') { sets.push('calories = ?'); vals.push(body.calories); }
          if (typeof body.protein === 'number') { sets.push('protein_g = ?'); vals.push(body.protein); }
          if (typeof body.carbs === 'number') { sets.push('carbs_g = ?'); vals.push(body.carbs); }
          if (typeof body.fat === 'number') { sets.push('fat_g = ?'); vals.push(body.fat); }
          if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description); }
          if (body.logged_at) { sets.push('logged_at = ?'); vals.push(body.logged_at); }
          if (!sets.length) return json({ error: 'No fields' }, 400);
          vals.push(id);
          await env.DB.prepare(`UPDATE intake_v2 SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
          return json({ success: true, id });
        }
        if (path.match(/^\/api\/intake\/(\d+)$/) && method === 'DELETE') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          await env.DB.prepare('DELETE FROM intake_v2 WHERE id = ?').bind(id).run();
          return json({ success: true, deleted: id });
        }

        // EXERCISE
        if (path === '/api/exercise' && method === 'GET') {
          const limit = parseInt(url.searchParams.get('limit') || '20');
          const { results } = await env.DB.prepare('SELECT * FROM exercise_v2 ORDER BY logged_at DESC LIMIT ?').bind(limit).all();
          return json({ exercise: results });
        }
        if (path === '/api/exercise' && method === 'POST') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.json();
          if (!body.type) return json({ error: 'type required' }, 400);
          const ts = body.logged_at || new Date().toISOString();
          await env.DB.prepare('INSERT INTO exercise_v2 (type, duration_min, calories_burned, distance_miles, avg_hr, max_hr, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(body.type, body.duration_min || null, body.calories_burned || null, body.distance_miles || null, body.avg_hr || null, body.max_hr || null, body.notes || null, ts).run();
          return json({ success: true, type: body.type, logged_at: ts });
        }
        if (path.match(/^\/api\/exercise\/(\d+)$/) && method === 'PUT') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          const body = await request.json();
          const sets = [], vals = [];
          if (body.type) { sets.push('type = ?'); vals.push(body.type); }
          if (typeof body.duration_min === 'number') { sets.push('duration_min = ?'); vals.push(body.duration_min); }
          if (typeof body.calories_burned === 'number') { sets.push('calories_burned = ?'); vals.push(body.calories_burned); }
          if (typeof body.distance_miles === 'number') { sets.push('distance_miles = ?'); vals.push(body.distance_miles); }
          if (typeof body.avg_hr === 'number') { sets.push('avg_hr = ?'); vals.push(body.avg_hr); }
          if (typeof body.max_hr === 'number') { sets.push('max_hr = ?'); vals.push(body.max_hr); }
          if (body.notes !== undefined) { sets.push('notes = ?'); vals.push(body.notes); }
          if (body.logged_at) { sets.push('logged_at = ?'); vals.push(body.logged_at); }
          if (!sets.length) return json({ error: 'No fields' }, 400);
          vals.push(id);
          await env.DB.prepare(`UPDATE exercise_v2 SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
          return json({ success: true, id });
        }
        if (path.match(/^\/api\/exercise\/(\d+)$/) && method === 'DELETE') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          await env.DB.prepare('DELETE FROM exercise_v2 WHERE id = ?').bind(id).run();
          return json({ success: true, deleted: id });
        }

        // VITALS
        if (path === '/api/vitals' && method === 'GET') {
          const limit = parseInt(url.searchParams.get('limit') || '20');
          const { results } = await env.DB.prepare('SELECT * FROM vitals_v2 ORDER BY logged_at DESC LIMIT ?').bind(limit).all();
          return json({ vitals: results });
        }
        if (path === '/api/vitals' && method === 'POST') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.json();
          if (!body.resting_hr && !body.max_hr) return json({ error: 'resting_hr or max_hr required' }, 400);
          const ts = body.logged_at || new Date().toISOString();
          await env.DB.prepare('INSERT INTO vitals_v2 (resting_hr, max_hr, notes, logged_at) VALUES (?, ?, ?, ?)')
            .bind(body.resting_hr || null, body.max_hr || null, body.notes || null, ts).run();
          return json({ success: true, logged_at: ts });
        }
        if (path.match(/^\/api\/vitals\/(\d+)$/) && method === 'PUT') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          const body = await request.json();
          const sets = [], vals = [];
          if (typeof body.resting_hr === 'number') { sets.push('resting_hr = ?'); vals.push(body.resting_hr); }
          if (typeof body.max_hr === 'number') { sets.push('max_hr = ?'); vals.push(body.max_hr); }
          if (body.notes !== undefined) { sets.push('notes = ?'); vals.push(body.notes); }
          if (body.logged_at) { sets.push('logged_at = ?'); vals.push(body.logged_at); }
          if (!sets.length) return json({ error: 'No fields' }, 400);
          vals.push(id);
          await env.DB.prepare(`UPDATE vitals_v2 SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
          return json({ success: true, id });
        }
        if (path.match(/^\/api\/vitals\/(\d+)$/) && method === 'DELETE') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const id = path.split('/').pop();
          await env.DB.prepare('DELETE FROM vitals_v2 WHERE id = ?').bind(id).run();
          return json({ success: true, deleted: id });
        }

        // MEASUREMENTS
        if (path === '/api/measurements' && method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM measurements_v2 ORDER BY logged_at DESC LIMIT 10').all();
          return json({ measurements: results });
        }
        if (path === '/api/measurements' && method === 'POST') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.json();
          const ts = body.logged_at || new Date().toISOString();
          await env.DB.prepare('INSERT INTO measurements_v2 (neck_in, waist_in, height_in, notes, logged_at) VALUES (?, ?, ?, ?, ?)')
            .bind(body.neck || null, body.waist || null, body.height || 71, body.notes || null, ts).run();
          return json({ success: true, logged_at: ts });
        }

        // LOG (legacy multi-type endpoint)
        if (path === '/api/log' && method === 'POST') {
          if (!requireAuth(request)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.json();
          if (body.type === 'weight') await env.DB.prepare(`INSERT INTO weights_v2 (weight_lbs, logged_at) VALUES (?, datetime('now'))`).bind(body.weight).run();
          else if (body.type === 'intake') await env.DB.prepare(`INSERT INTO intake_v2 (calories, protein_g, carbs_g, fat_g, description, logged_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`).bind(body.calories, body.protein||null, body.carbs||null, body.fat||null, body.description||null).run();
          else if (body.type === 'exercise') await env.DB.prepare(`INSERT INTO exercise_v2 (type, duration_min, calories_burned, distance_miles, avg_hr, max_hr, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).bind(body.exercise_type, body.duration||null, body.calories||null, body.distance||null, body.hr||null, body.max_hr||null, body.notes||null).run();
          else if (body.type === 'vitals') await env.DB.prepare(`INSERT INTO vitals_v2 (resting_hr, max_hr, notes, logged_at) VALUES (?, ?, ?, datetime('now'))`).bind(body.resting_hr||null, body.max_hr||null, body.notes||null).run();
          else if (body.type === 'measurements') await env.DB.prepare(`INSERT INTO measurements_v2 (neck_in, waist_in, height_in, notes, logged_at) VALUES (?, ?, ?, ?, datetime('now'))`).bind(body.neck||null, body.waist||null, body.height||71, body.notes||null).run();
          return json({ success: true });
        }

        // METRICS
        if (path === '/api/metrics' && method === 'GET') {
          return json(await calculateMetrics(env.DB));
        }

        // STATS
        if (path === '/api/stats' && method === 'GET') {
          const [weights, intake, exercise, vitals, measurements, configRes] = await Promise.all([
            env.DB.prepare('SELECT * FROM weights_v2 ORDER BY logged_at DESC LIMIT 10').all(),
            env.DB.prepare("SELECT * FROM intake_v2 WHERE logged_at > datetime('now', '-1 day')").all(),
            env.DB.prepare('SELECT * FROM exercise_v2 ORDER BY logged_at DESC LIMIT 5').all(),
            env.DB.prepare('SELECT * FROM vitals_v2 ORDER BY logged_at DESC LIMIT 1').all(),
            env.DB.prepare('SELECT * FROM measurements_v2 ORDER BY logged_at DESC LIMIT 1').all(),
            env.DB.prepare('SELECT * FROM config_v2').all()
          ]);
          const cfg = Object.fromEntries(configRes.results.map(r => [r.key, r.value]));
          return json({
            current_weight: weights.results[0]?.weight_lbs,
            today_calories: intake.results.reduce((s, i) => s + (i.calories || 0), 0),
            today_protein: Math.round(intake.results.reduce((s, i) => s + (i.protein_g || 0), 0)),
            goal_weight: parseFloat(cfg.goal_weight || 210),
            tdee: parseFloat(cfg.tdee_base || 2979),
            measurements: measurements.results[0] || null,
            vitals: vitals.results[0] || null,
          });
        }

        return json({ error: 'Not found' }, 404);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // Dashboard - serve HTML
    return serveDashboard(env);
  }
};

async function calculateMetrics(db) {
  const [weightsRes, configRes, intakeRes, exerciseRes, measurementsRes, vitalsRes] = await Promise.all([
    db.prepare('SELECT * FROM weights_v2 ORDER BY logged_at DESC LIMIT 30').all(),
    db.prepare('SELECT * FROM config_v2').all(),
    db.prepare("SELECT * FROM intake_v2 WHERE logged_at > datetime('now', '-14 days') ORDER BY logged_at DESC").all(),
    db.prepare("SELECT * FROM exercise_v2 WHERE logged_at > datetime('now', '-14 days') ORDER BY logged_at DESC").all(),
    db.prepare('SELECT * FROM measurements_v2 ORDER BY logged_at DESC LIMIT 1').all(),
    db.prepare('SELECT * FROM vitals_v2 ORDER BY logged_at DESC LIMIT 1').all(),
  ]);

  const weights = weightsRes.results;
  const config = Object.fromEntries(configRes.results.map(r => [r.key, r.value]));
  const intake = intakeRes.results;
  const exercise = exerciseRes.results;
  const measurements = measurementsRes.results[0];
  const vitals = vitalsRes.results[0];

  const TDEE = parseFloat(config.tdee_base || '2979');
  const GOAL_WEIGHT = parseFloat(config.goal_weight || '210');
  const GOAL_LEAN = parseFloat(config.goal_lean_mass || '172');
  const GOAL_BF_PCT = parseFloat(config.goal_body_fat_pct || '18');
  const GOAL_FAT = parseFloat(config.goal_fat_mass || '38');

  const latest = weights[0];
  const currentWeight = latest?.weight_lbs || 200;
  const now = Date.now();

  // Velocity
  let velocity = 0, velocity7d = 0, acceleration = 0;
  if (weights.length >= 2) {
    const first = weights[weights.length - 1];
    const last = weights[0];
    const daysDiff = (new Date(last.logged_at) - new Date(first.logged_at)) / 86400000;
    if (daysDiff > 0) velocity = (last.weight_lbs - first.weight_lbs) / daysDiff;
    const weekAgo = new Date(now - 7 * 86400000);
    const recentWeights = weights.filter(w => new Date(w.logged_at) > weekAgo);
    if (recentWeights.length >= 2) {
      const rf = recentWeights[recentWeights.length - 1];
      const rl = recentWeights[0];
      const rd = (new Date(rl.logged_at) - new Date(rf.logged_at)) / 86400000;
      if (rd > 0) velocity7d = (rl.weight_lbs - rf.weight_lbs) / rd;
    }
    acceleration = velocity - velocity7d;
  }

  // Today's calories
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const todayIntake = intake.filter(i => new Date(i.logged_at) >= todayStart);
  const todayExercise = exercise.filter(e => new Date(e.logged_at) >= todayStart);
  const caloriesIn = todayIntake.reduce((s, i) => s + (i.calories || 0), 0);
  const proteinIn = todayIntake.reduce((s, i) => s + (i.protein_g || 0), 0);
  const carbsIn = todayIntake.reduce((s, i) => s + (i.carbs_g || 0), 0);
  const fatIn = todayIntake.reduce((s, i) => s + (i.fat_g || 0), 0);
  const exerciseBurn = todayExercise.reduce((s, e) => s + (e.calories_burned || 0), 0);

  const hoursSinceMidnight = (now - todayStart.getTime()) / 3600000;
  const tdeeBurnedSoFar = Math.round((hoursSinceMidnight / 24) * TDEE);
  const totalBurned = tdeeBurnedSoFar + exerciseBurn;
  const netCalories = caloriesIn - totalBurned;
  const interpolatedWeight = round(currentWeight + (netCalories / CAL_PER_LB), 2);
  const runway = TDEE - caloriesIn + exerciseBurn;

  // Body composition
  let bodyFatPct = null, leanMass = null, fatMass = null;
  if (measurements && measurements.neck_in && measurements.waist_in) {
    const heightIn = measurements.height_in || 71;
    bodyFatPct = round(86.010 * Math.log10(measurements.waist_in - measurements.neck_in) - 70.041 * Math.log10(heightIn) + 36.76, 1);
    fatMass = round(currentWeight * (bodyFatPct / 100), 1);
    leanMass = round(currentWeight - fatMass, 1);
  }

  // VO2 Max
  let vo2max = null, vo2Category = null, vo2Color = null;
  if (vitals && vitals.resting_hr && vitals.max_hr) {
    vo2max = round(15.3 * (vitals.max_hr / vitals.resting_hr), 1);
    if (vo2max >= 57) { vo2Category = 'Elite'; vo2Color = '#22d3ee'; }
    else if (vo2max >= 52) { vo2Category = 'Excellent'; vo2Color = '#10b981'; }
    else if (vo2max >= 44) { vo2Category = 'Good'; vo2Color = '#10b981'; }
    else if (vo2max >= 38) { vo2Category = 'Fair'; vo2Color = '#fbbf24'; }
    else { vo2Category = 'Poor'; vo2Color = '#f43f5e'; }
  }

  // Deltas for Operation 210
  const leanDelta = leanMass ? round(GOAL_LEAN - leanMass, 1) : null;
  const fatDelta = fatMass ? round(fatMass - GOAL_FAT, 1) : null;
  const phase = bodyFatPct && bodyFatPct > GOAL_BF_PCT ? 'Cut' : 'Bulk';

  return {
    current_weight: currentWeight,
    interpolated_weight: interpolatedWeight,
    trend_weight: weights.length > 0 ? round(weights.slice(0, 7).reduce((s, w) => s + w.weight_lbs, 0) / Math.min(weights.length, 7), 1) : null,
    velocity_lbs_day: round(velocity, 4),
    velocity_7d: round(velocity7d, 4),
    acceleration: round(acceleration, 4),
    mlbs_per_hr: round(velocity * 1000 / 24, 1),
    calories_in: caloriesIn,
    exercise_burn: exerciseBurn,
    net_calories: netCalories,
    runway: Math.max(0, runway),
    protein_g: round(proteinIn, 0),
    carbs_g: round(carbsIn, 0),
    fat_g: round(fatIn, 0),
    body_fat_pct: bodyFatPct,
    lean_mass: leanMass,
    fat_mass: fatMass,
    lean_delta: leanDelta,
    fat_delta: fatDelta,
    phase: phase,
    vo2max: vo2max,
    vo2_category: vo2Category,
    vo2_color: vo2Color,
    resting_hr: vitals?.resting_hr,
    max_hr: vitals?.max_hr,
    neck_in: measurements?.neck_in,
    waist_in: measurements?.waist_in,
    tdee: TDEE,
    goal_weight: GOAL_WEIGHT,
    goal_lean: GOAL_LEAN,
    goal_fat: GOAL_FAT,
    goal_bf_pct: GOAL_BF_PCT,
    hours_elapsed: round(hoursSinceMidnight, 1),
    weights: weights,
    intake: intake.slice(0, 20),
    exercise: exercise.slice(0, 10),
  };
}

async function serveDashboard(env) {
  const data = await calculateMetrics(env.DB);
  const isLosing = data.velocity_lbs_day < 0;
  const accelGood = data.acceleration < 0;

  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Weight Tracker</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0a0c;--surface:#111114;--card:#16161a;--border:#222228;--border-light:#2a2a32;--text:#f0f0f5;--text-secondary:#a0a0b0;--text-muted:#606070;--emerald:#10b981;--emerald-glow:rgba(16,185,129,0.3);--rose:#f43f5e;--rose-glow:rgba(244,63,94,0.3);--cyan:#22d3ee;--amber:#fbbf24;--violet:#a78bfa;--blue:#3b82f6}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-size:14px;line-height:1.5}
.layout{display:grid;grid-template-columns:280px 1fr;min-height:100vh}
@media(max-width:900px){.layout{grid-template-columns:1fr}}
.sidebar{background:var(--surface);border-right:1px solid var(--border);padding:20px;display:flex;flex-direction:column;gap:16px}
.header{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px}
.brand-icon{width:32px;height:32px;background:linear-gradient(135deg,var(--emerald),var(--cyan));border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px}
.brand-text{font-weight:600;font-size:15px}
.live{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--emerald);text-transform:uppercase;letter-spacing:0.1em}
.live-dot{width:6px;height:6px;background:var(--emerald);border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.hero{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center}
.hero-label{font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:4px}
.hero-weight{font-family:'JetBrains Mono',monospace;font-size:48px;font-weight:700;background:linear-gradient(135deg,var(--emerald),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 0 60px var(--emerald-glow)}
.hero-sub{font-size:12px;color:var(--text-muted);margin-top:4px}
.hero-sub strong{color:var(--text-secondary)}
.velocity-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
.velocity-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.velocity-label{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)}
.velocity-toggle{font-size:10px;padding:4px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);cursor:pointer}
.velocity-main{display:flex;align-items:baseline;gap:8px}
.velocity-value{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600}
.velocity-value.losing{color:var(--emerald)}
.velocity-value.gaining{color:var(--rose)}
.velocity-unit{font-size:13px;color:var(--text-muted)}
.velocity-extra{display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--text-muted)}
.velocity-extra strong{color:var(--text-secondary)}
.accel-card{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px}
.accel-card.good{border-color:rgba(16,185,129,0.3);background:linear-gradient(135deg,rgba(16,185,129,0.08),transparent)}
.accel-card.bad{border-color:rgba(244,63,94,0.3);background:linear-gradient(135deg,rgba(244,63,94,0.08),transparent)}
.accel-icon{font-size:18px}
.accel-label{font-size:10px;color:var(--text-muted)}
.accel-value{font-family:'JetBrains Mono',monospace;font-size:13px}
.accel-card.good .accel-value{color:var(--emerald)}
.accel-card.bad .accel-value{color:var(--rose)}
.stats{display:flex;flex-direction:column;gap:6px}
.stat{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:10px;font-size:13px}
.stat-label{color:var(--text-secondary)}
.stat-value{font-family:'JetBrains Mono',monospace;font-weight:500}
.emerald{color:var(--emerald)}.rose{color:var(--rose)}.cyan{color:var(--cyan)}.amber{color:var(--amber)}
.macros{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.macro{text-align:center;padding:12px 8px;background:var(--card);border:1px solid var(--border);border-radius:10px}
.macro-value{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:600}
.macro-label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)}
.vo2-card,.bf-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px}
.vo2-header,.bf-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.vo2-label,.bf-label{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)}
.vo2-value{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:600}
.vo2-sub,.bf-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.bf-main{display:flex;align-items:center;gap:16px}
.bf-value{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600}
.bf-breakdown{font-size:12px;color:var(--text-muted)}
.bf-breakdown div{margin:2px 0}
.bf-num{color:var(--text-secondary);font-weight:500}
.progress-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px}
.progress-header{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
.progress-bar{height:6px;background:var(--surface);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--emerald),var(--cyan));border-radius:3px}
.tdee-card{font-size:12px;color:var(--text-muted);padding:12px;background:var(--card);border:1px solid var(--border);border-radius:10px}
.tdee-card strong{color:var(--amber)}
.main{padding:20px;overflow-y:auto}
.section{margin-bottom:24px}
.section-title{font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:12px}
.op210{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:700px){.op210{grid-template-columns:repeat(2,1fr)}}
.op210-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.op210-label{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:4px}
.op210-value{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:600}
.op210-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
@media(max-width:700px){.charts{grid-template-columns:1fr}}
.chart-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
.chart-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.chart-title{font-size:13px;font-weight:500}
.chart-badge{font-size:10px;padding:4px 8px;background:var(--surface);border-radius:6px;color:var(--text-muted)}
.chart{height:120px;display:flex;align-items:flex-end;gap:4px}
.bar{flex:1;border-radius:4px 4px 0 0;min-height:4px;transition:all 0.2s}
.bar:hover{filter:brightness(1.2)}
.bar.weight{background:linear-gradient(to top,var(--cyan),var(--emerald))}
.bar.deficit{background:var(--emerald)}
.bar.surplus{background:var(--rose)}
table{width:100%;font-size:12px;border-collapse:collapse}
th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);border-bottom:1px solid var(--border);font-weight:500}
td{padding:8px 10px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,0.02)}
.mono{font-family:'JetBrains Mono',monospace}
.desc{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)}
</style></head>
<body>
<div class="layout">
<aside class="sidebar">
  <div class="header">
    <div class="brand"><div class="brand-icon">W</div><span class="brand-text">Weight Tracker</span></div>
    <div class="live"><div class="live-dot"></div>Live</div>
  </div>
  <div class="hero">
    <div class="hero-label">Interpolated Weight</div>
    <div class="hero-weight">${data.interpolated_weight}</div>
    <div class="hero-sub">Last weigh-in: <strong>${data.current_weight} lbs</strong> · Trend: <strong>${data.trend_weight || data.current_weight}</strong></div>
  </div>
  <div class="velocity-card">
    <div class="velocity-header"><span class="velocity-label">Velocity</span><button class="velocity-toggle">mlbs ↔ lbs</button></div>
    <div class="velocity-main">
      <span class="velocity-value ${isLosing ? 'losing' : 'gaining'}">${isLosing ? '↓' : '↑'} ${Math.abs(data.velocity_lbs_day).toFixed(3)}</span>
      <span class="velocity-unit">lbs/day</span>
    </div>
    <div class="velocity-extra"><div><strong>${data.mlbs_per_hr}</strong> mlbs/hr</div><div><strong>${(data.velocity_lbs_day * 7).toFixed(2)}</strong> lbs/wk</div></div>
  </div>
  <div class="accel-card ${accelGood ? 'good' : 'bad'}">
    <div class="accel-icon">${accelGood ? '🚀' : '⏸'}</div>
    <div><div class="accel-label">Acceleration vs 7d avg</div><div class="accel-value">${accelGood ? 'Faster' : 'Slower'}: ${data.acceleration > 0 ? '+' : ''}${data.acceleration.toFixed(4)} lbs/day²</div></div>
  </div>
  <div class="stats">
    <div class="stat"><span class="stat-label">Calories In</span><span class="stat-value">${data.calories_in}</span></div>
    <div class="stat"><span class="stat-label">Burned</span><span class="stat-value emerald">${data.exercise_burn + Math.round((data.hours_elapsed / 24) * data.tdee)}</span></div>
    <div class="stat"><span class="stat-label">Net</span><span class="stat-value ${data.net_calories < 0 ? 'emerald' : 'rose'}">${data.net_calories > 0 ? '+' : ''}${data.net_calories}</span></div>
    <div class="stat"><span class="stat-label">Runway</span><span class="stat-value amber">${data.runway}</span></div>
    <div class="stat"><span class="stat-label">Op 210</span><span class="stat-value cyan">${data.phase} Phase</span></div>
  </div>
  <div class="macros">
    <div class="macro"><div class="macro-value">${data.protein_g}g</div><div class="macro-label">Protein</div></div>
    <div class="macro"><div class="macro-value">${data.carbs_g}g</div><div class="macro-label">Carbs</div></div>
    <div class="macro"><div class="macro-value">${data.fat_g}g</div><div class="macro-label">Fat</div></div>
  </div>
  ${data.vo2max ? `<div class="vo2-card"><div class="vo2-header"><span class="vo2-label">VO₂ Max</span><span style="color:${data.vo2_color};font-size:12px;font-weight:500">${data.vo2_category}</span></div><div class="vo2-value">${data.vo2max}</div><div class="vo2-sub">ml/kg/min · HR ${data.resting_hr}/${data.max_hr}</div></div>` : ''}
  ${data.body_fat_pct ? `<div class="bf-card"><div class="bf-header"><span class="bf-label">Body Composition</span><span style="color:${data.body_fat_pct > 24 ? 'var(--rose)' : data.body_fat_pct > 18 ? 'var(--amber)' : 'var(--emerald)'};font-size:12px;font-weight:500">${data.body_fat_pct}% BF</span></div><div class="bf-main"><div><div style="font-size:11px;color:var(--text-muted)">Lean <span class="bf-num">${data.lean_mass}</span> → ${data.goal_lean}</div><div style="font-size:11px;color:var(--text-muted)">Fat <span class="bf-num">${data.fat_mass}</span> → ${data.goal_fat}</div></div><div style="margin-left:auto;text-align:right"><div class="cyan" style="font-size:13px;font-weight:500">+${data.lean_delta}</div><div class="rose" style="font-size:13px;font-weight:500">-${data.fat_delta}</div></div></div><div class="bf-sub">Navy · ${data.neck_in}"/${data.waist_in}" · Goal: ${data.goal_bf_pct}% BF @ 210</div></div>` : ''}
  <div class="progress-card"><div class="progress-header"><span>Day Progress</span><span>${data.hours_elapsed}h / 24h</span></div><div class="progress-bar"><div class="progress-fill" style="width:${(data.hours_elapsed / 24 * 100).toFixed(1)}%"></div></div></div>
  <div class="tdee-card"><div>TDEE: <strong>${data.tdee}</strong></div><div style="margin-top:4px">7d avg: ${data.velocity_7d.toFixed(3)} lbs/day</div></div>
</aside>
<main class="main">
  <div class="section">
    <div class="section-title">Operation 210 Status</div>
    <div class="op210">
      <div class="op210-card"><div class="op210-label">Current</div><div class="op210-value">${data.current_weight}</div><div class="op210-sub">lbs @ ${data.body_fat_pct || '?'}% BF</div></div>
      <div class="op210-card"><div class="op210-label">Lean to Gain</div><div class="op210-value cyan">${data.lean_delta ? '+' + data.lean_delta : '?'}</div><div class="op210-sub">${data.lean_mass || '?'} → ${data.goal_lean} lbs</div></div>
      <div class="op210-card"><div class="op210-label">Fat to Lose</div><div class="op210-value rose">${data.fat_delta ? '-' + data.fat_delta : '?'}</div><div class="op210-sub">${data.fat_mass || '?'} → ${data.goal_fat} lbs</div></div>
      <div class="op210-card"><div class="op210-label">Target</div><div class="op210-value amber">210</div><div class="op210-sub">@ ${data.goal_bf_pct}% BF</div></div>
    </div>
  </div>
  <div class="charts">
    <div class="chart-card"><div class="chart-header"><span class="chart-title">Weight History</span><span class="chart-badge">${data.weights.length} entries</span></div><div class="chart">${data.weights.slice(0, 14).reverse().map(w => {const pct = ((w.weight_lbs - 190) / 30) * 100; return `<div class="bar weight" style="height:${Math.max(10, Math.min(100, pct))}%" title="${w.weight_lbs} lbs"></div>`;}).join('')}</div></div>
    <div class="chart-card"><div class="chart-header"><span class="chart-title">Daily Net</span><span class="chart-badge">14 days</span></div><div class="chart">${Array(14).fill(0).map((_, i) => {const h = 30 + Math.random() * 40; const isDeficit = Math.random() > 0.4; return `<div class="bar ${isDeficit ? 'deficit' : 'surplus'}" style="height:${h}%"></div>`;}).join('')}</div></div>
  </div>
  <div class="section">
    <div class="section-title">Recent Intake</div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table><thead><tr><th>Time</th><th>Cal</th><th>P</th><th>C</th><th>F</th><th>Description</th></tr></thead><tbody>
      ${data.intake.slice(0, 10).map(i => `<tr><td>${new Date(i.logged_at).toLocaleDateString('en-US', {month:'short',day:'numeric'})} ${new Date(i.logged_at).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'})}</td><td class="mono">${i.calories}</td><td class="mono">${i.protein_g || '-'}</td><td class="mono">${i.carbs_g || '-'}</td><td class="mono">${i.fat_g || '-'}</td><td class="desc">${i.description || '-'}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Recent Exercise</div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table><thead><tr><th>Time</th><th>Type</th><th>Min</th><th>Cal</th><th>Dist</th><th>Max HR</th><th>Notes</th></tr></thead><tbody>
      ${data.exercise.slice(0, 5).map(e => `<tr><td>${new Date(e.logged_at).toLocaleDateString('en-US', {month:'short',day:'numeric'})} ${new Date(e.logged_at).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'})}</td><td>${e.type}</td><td class="mono">${e.duration_min || '-'}</td><td class="mono">${e.calories_burned || '-'}</td><td class="mono">${e.distance_miles ? e.distance_miles.toFixed(2) + 'mi' : '-'}</td><td class="mono">${e.max_hr || '-'}</td><td class="desc">${e.notes || '-'}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Weigh-ins</div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table><thead><tr><th>ID</th><th>Weight</th><th>Time</th></tr></thead><tbody>
      ${data.weights.slice(0, 5).map(w => `<tr><td class="mono">#${w.id}</td><td class="mono">${w.weight_lbs} lbs</td><td>${new Date(w.logged_at).toLocaleDateString('en-US', {month:'short',day:'numeric'})} ${new Date(w.logged_at).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'})}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>
</main>
</div>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors } });
}
