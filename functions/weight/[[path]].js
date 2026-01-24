// Weight Tracker - Pages Function
// Binding required: D1 database named "DB"

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/weight/, '') || '/';
  const userId = 1;
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (path === "/status" || path === "/" || path === "") {
    const data = await getStatus(env.WEIGHT_DB, userId);
    const trends = await getTrends(env.WEIGHT_DB, userId, 14);
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html")) {
      return new Response(renderHTML(data, trends), {
        headers: { ...corsHeaders, "Content-Type": "text/html" }
      });
    }
    return Response.json(data, { headers: corsHeaders });
  }
  
  if (path === "/log" && request.method === "POST") {
    const body = await request.json();
    const result = await logEntry(env.WEIGHT_DB, userId, body);
    return Response.json(result, { headers: corsHeaders });
  }
  
  if (path === "/burn" && request.method === "POST") {
    const body = await request.json();
    const result = await logBurn(env.WEIGHT_DB, userId, body.calories);
    return Response.json(result, { headers: corsHeaders });
  }
  
  if (path === "/history") {
    const days = parseInt(url.searchParams.get("days") || "7");
    const history = await getHistory(env.WEIGHT_DB, userId, days);
    return Response.json(history, { headers: corsHeaders });
  }
  
  if (path === "/trends") {
    const days = parseInt(url.searchParams.get("days") || "30");
    const trends = await getTrends(env.WEIGHT_DB, userId, days);
    return Response.json(trends, { headers: corsHeaders });
  }
  
  if (path.startsWith("/log/") && request.method === "DELETE") {
    const logId = parseInt(path.split("/")[2]);
    const result = await deleteLog(env.WEIGHT_DB, userId, logId);
    return Response.json(result, { headers: corsHeaders });
  }
  
  if (path.startsWith("/log/") && request.method === "PUT") {
    const logId = parseInt(path.split("/")[2]);
    const body = await request.json();
    const result = await editLog(env.WEIGHT_DB, userId, logId, body);
    return Response.json(result, { headers: corsHeaders });
  }
  
  if (path === "/tdee") {
    const tdee = await getAdaptiveTDEE(env.WEIGHT_DB, userId);
    return Response.json(tdee, { headers: corsHeaders });
  }
  
  if (path === "/user" && request.method === "POST") {
    const body = await request.json();
    const result = await updateUser(env.WEIGHT_DB, userId, body);
    return Response.json(result, { headers: corsHeaders });
  }
  
  if (path === "/export") {
    const data = await exportData(env.WEIGHT_DB, userId);
    return Response.json(data, { headers: corsHeaders });
  }
  
  return new Response("Not found", { status: 404, headers: corsHeaders });
}

async function getStatus(db, userId) {
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  const latestWeight = await db.prepare(
    `SELECT weight, logged_at FROM logs WHERE user_id = ? AND type = 'weight' ORDER BY logged_at DESC LIMIT 1`
  ).bind(userId).first();
  const todayFood = await db.prepare(
    `SELECT COALESCE(SUM(calories), 0) as total FROM logs WHERE user_id = ? AND type = 'food' AND date(logged_at) = date('now')`
  ).bind(userId).first();
  const todayBurn = await db.prepare(
    `SELECT COALESCE(SUM(calories), 0) as total FROM logs WHERE user_id = ? AND type = 'burn' AND date(logged_at) = date('now')`
  ).bind(userId).first();
  const weekWeights = await db.prepare(
    `SELECT weight FROM logs WHERE user_id = ? AND type = 'weight' AND logged_at > datetime('now', '-7 days') ORDER BY logged_at DESC`
  ).bind(userId).all();
  
  const currentWeight = latestWeight?.weight || 200;
  const caloriesIn = todayFood?.total || 0;
  const loggedBurn = todayBurn?.total || 0;
  const now = new Date();
  const hoursSinceMidnight = now.getUTCHours() + now.getUTCMinutes() / 60 - 5; // EST offset
  const adjustedHours = hoursSinceMidnight < 0 ? hoursSinceMidnight + 24 : hoursSinceMidnight;
  const bmr = 10 * currentWeight / 2.205 + 6.25 * user.height_in * 2.54 - 5 * user.age + 5;
  const dailyTdee = bmr * user.tdee_multiplier;
  const estimatedBurn = Math.round(adjustedHours / 24 * dailyTdee);
  const caloriesOut = loggedBurn > 0 ? loggedBurn : estimatedBurn;
  const burnSource = loggedBurn > 0 ? "apple_watch" : "estimated";
  const netCalories = caloriesIn - caloriesOut;
  const weightChange = netCalories / 3500;
  const interpolatedWeight = currentWeight + weightChange;
  const weights = weekWeights.results.map((r) => r.weight);
  const trendWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : currentWeight;
  const toGoal = interpolatedWeight - user.goal_weight;
  const daysAt750 = Math.round(toGoal * 3500 / 750);
  const daysAt1000 = Math.round(toGoal * 3500 / 1000);
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAt750);
  const burnRatePerHour = caloriesOut / Math.max(adjustedHours, 0.1);
  const hoursRemaining = 24 - adjustedHours;
  const projectedTotalBurn = caloriesOut + burnRatePerHour * hoursRemaining;
  const projectedEODDeficit = caloriesIn - projectedTotalBurn;
  const projectedEODWeight = currentWeight + projectedEODDeficit / 3500;
  const currentNetRate = -burnRatePerHour / 3500;
  const runway = projectedTotalBurn - caloriesIn;
  const hoursToBreakeven = netCalories < 0 ? Math.abs(netCalories) / burnRatePerHour : 0;
  
  return {
    current_weight: round(currentWeight, 1),
    interpolated_weight: round(interpolatedWeight, 2),
    trend_weight: round(trendWeight, 1),
    goal_weight: user.goal_weight,
    to_goal: round(toGoal, 1),
    calories_in: caloriesIn,
    calories_out: caloriesOut,
    burn_source: burnSource,
    net_calories: netCalories,
    daily_tdee: Math.round(dailyTdee),
    deficit_today: -netCalories,
    burn_rate_per_hour: Math.round(burnRatePerHour),
    weight_rate_per_hour: round(currentNetRate, 4),
    projected_eod_weight: round(projectedEODWeight, 2),
    projected_eod_deficit: Math.round(projectedEODDeficit),
    runway_calories: Math.round(runway),
    hours_to_breakeven: round(hoursToBreakeven, 1),
    hours_elapsed: round(adjustedHours, 1),
    hours_remaining: round(hoursRemaining, 1),
    days_to_goal_750: daysAt750,
    days_to_goal_1000: daysAt1000,
    target_date: targetDate.toISOString().split("T")[0],
    last_weigh_in: latestWeight?.logged_at,
    updated_at: new Date().toISOString()
  };
}

async function logEntry(db, userId, { type, description, calories, weight }) {
  if (type === "food") {
    await db.prepare(
      "INSERT INTO logs (user_id, type, description, calories) VALUES (?, ?, ?, ?)"
    ).bind(userId, "food", description, calories).run();
    return { success: true, logged: { type: "food", description, calories } };
  } else if (type === "weight") {
    await db.prepare(
      "INSERT INTO logs (user_id, type, weight) VALUES (?, ?, ?)"
    ).bind(userId, "weight", weight).run();
    return { success: true, logged: { type: "weight", weight } };
  }
  return { success: false, error: "Invalid type" };
}

async function logBurn(db, userId, calories) {
  await db.prepare(
    `DELETE FROM logs WHERE user_id = ? AND type = 'burn' AND date(logged_at) = date('now')`
  ).bind(userId).run();
  await db.prepare(
    "INSERT INTO logs (user_id, type, calories, description) VALUES (?, ?, ?, ?)"
  ).bind(userId, "burn", calories, "Apple Watch sync").run();
  return { success: true, logged: { type: "burn", calories } };
}

async function getHistory(db, userId, days) {
  const logs = await db.prepare(
    `SELECT * FROM logs WHERE user_id = ? AND logged_at > datetime('now', '-' || ? || ' days') ORDER BY logged_at DESC`
  ).bind(userId, days).all();
  return { logs: logs.results };
}

async function getTrends(db, userId, days) {
  const weights = await db.prepare(
    `SELECT date(logged_at) as date, AVG(weight) as weight 
     FROM logs WHERE user_id = ? AND type = 'weight' AND logged_at > datetime('now', '-' || ? || ' days')
     GROUP BY date(logged_at) ORDER BY date`
  ).bind(userId, days).all();
  const calories = await db.prepare(
    `SELECT date(logged_at) as date, 
            SUM(CASE WHEN type = 'food' THEN calories ELSE 0 END) as calories_in,
            SUM(CASE WHEN type = 'burn' THEN calories ELSE 0 END) as calories_out
     FROM logs WHERE user_id = ? AND logged_at > datetime('now', '-' || ? || ' days')
     GROUP BY date(logged_at) ORDER BY date`
  ).bind(userId, days).all();
  return {
    weights: weights.results,
    calories: calories.results
  };
}

async function deleteLog(db, userId, logId) {
  const result = await db.prepare(
    "DELETE FROM logs WHERE id = ? AND user_id = ?"
  ).bind(logId, userId).run();
  return { success: result.changes > 0, deleted: logId };
}

async function editLog(db, userId, logId, updates) {
  const fields = [];
  const values = [];
  if (updates.calories !== undefined) {
    fields.push("calories = ?");
    values.push(updates.calories);
  }
  if (updates.weight !== undefined) {
    fields.push("weight = ?");
    values.push(updates.weight);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (fields.length === 0) {
    return { success: false, error: "No fields to update" };
  }
  values.push(logId, userId);
  const result = await db.prepare(
    `UPDATE logs SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
  ).bind(...values).run();
  return { success: result.changes > 0, updated: logId };
}

async function getAdaptiveTDEE(db, userId) {
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  const data = await db.prepare(`
    SELECT 
      date(logged_at) as date,
      SUM(CASE WHEN type = 'food' THEN calories ELSE 0 END) as calories_in,
      (SELECT weight FROM logs l2 WHERE l2.user_id = logs.user_id AND l2.type = 'weight' 
       AND date(l2.logged_at) = date(logs.logged_at) ORDER BY l2.logged_at DESC LIMIT 1) as weight
    FROM logs
    WHERE user_id = ? AND logged_at > datetime('now', '-30 days')
    GROUP BY date(logged_at)
    ORDER BY date
  `).bind(userId).all();
  
  const days = data.results.filter((d) => d.weight !== null);
  if (days.length < 7) {
    const bmr = 10 * user.goal_weight / 2.205 + 6.25 * user.height_in * 2.54 - 5 * user.age + 5;
    return {
      adaptive_tdee: null,
      formula_tdee: Math.round(bmr * user.tdee_multiplier),
      days_of_data: days.length,
      message: "Need at least 7 days with weight data for adaptive calculation"
    };
  }
  
  let totalCaloriesIn = 0;
  let totalWeightChange = 0;
  let validDays = 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i].weight && days[i - 1].weight && days[i].calories_in) {
      const weightChange = days[i].weight - days[i - 1].weight;
      totalWeightChange += weightChange;
      totalCaloriesIn += days[i].calories_in;
      validDays++;
    }
  }
  
  if (validDays < 3) {
    const bmr = 10 * user.goal_weight / 2.205 + 6.25 * user.height_in * 2.54 - 5 * user.age + 5;
    return {
      adaptive_tdee: null,
      formula_tdee: Math.round(bmr * user.tdee_multiplier),
      days_of_data: validDays,
      message: "Need more complete data (weight + calories on consecutive days)"
    };
  }
  
  const avgDailyCaloriesIn = totalCaloriesIn / validDays;
  const avgDailyWeightChange = totalWeightChange / validDays;
  const adaptiveTDEE = avgDailyCaloriesIn - avgDailyWeightChange * 3500;
  const bmr = 10 * days[days.length - 1].weight / 2.205 + 6.25 * user.height_in * 2.54 - 5 * user.age + 5;
  const formulaTDEE = bmr * user.tdee_multiplier;
  
  return {
    adaptive_tdee: Math.round(adaptiveTDEE),
    formula_tdee: Math.round(formulaTDEE),
    difference: Math.round(adaptiveTDEE - formulaTDEE),
    days_of_data: validDays,
    avg_daily_intake: Math.round(avgDailyCaloriesIn),
    avg_daily_weight_change: round(avgDailyWeightChange, 3),
    recommendation: adaptiveTDEE > formulaTDEE 
      ? `Your actual TDEE is ~${Math.round(adaptiveTDEE - formulaTDEE)} cal higher than formula. You can eat more!` 
      : `Your actual TDEE is ~${Math.round(formulaTDEE - adaptiveTDEE)} cal lower than formula. Adjust intake down.`
  };
}

async function updateUser(db, userId, updates) {
  const fields = [];
  const values = [];
  if (updates.age !== undefined) { fields.push("age = ?"); values.push(updates.age); }
  if (updates.height_in !== undefined) { fields.push("height_in = ?"); values.push(updates.height_in); }
  if (updates.goal_weight !== undefined) { fields.push("goal_weight = ?"); values.push(updates.goal_weight); }
  if (updates.tdee_multiplier !== undefined) { fields.push("tdee_multiplier = ?"); values.push(updates.tdee_multiplier); }
  if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
  if (fields.length === 0) return { success: false, error: "No fields" };
  values.push(userId);
  await db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return { success: true };
}

async function exportData(db, userId) {
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  const logs = await db.prepare("SELECT * FROM logs WHERE user_id = ? ORDER BY logged_at").bind(userId).all();
  return { user, logs: logs.results, exported_at: new Date().toISOString() };
}

function round(num, decimals) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function renderHTML(data, trends = { weights: [], calories: [] }) {
  const deficitClass = data.net_calories < 0 ? "positive" : "negative";
  const deficitSign = data.net_calories < 0 ? "" : "+";
  const rateClass = data.weight_rate_per_hour < 0 ? "positive" : "negative";
  const rateArrow = data.weight_rate_per_hour < 0 ? "↓" : "↑";
  const absRate = Math.abs(data.weight_rate_per_hour * 1000).toFixed(1);
  const weights = trends.weights || [];
  
  let sparkline = "";
  if (weights.length > 1) {
    const values = weights.map((w) => w.weight);
    const min = Math.min(...values) - 1;
    const max = Math.max(...values) + 1;
    const range = max - min || 1;
    const width = 300;
    const height = 60;
    const points = values.map((v, i) => {
      const x = i / (values.length - 1) * width;
      const y = height - (v - min) / range * height;
      return `${x},${y}`;
    }).join(" ");
    const lastY = height - (values[values.length - 1] - min) / range * height;
    const goalY = data.goal_weight >= min && data.goal_weight <= max 
      ? height - (data.goal_weight - min) / range * height 
      : null;
    sparkline = `
      <svg viewBox="0 0 ${width} ${height}" class="sparkline">
        ${goalY !== null ? `<line x1="0" y1="${goalY}" x2="${width}" y2="${goalY}" stroke="#22c55e" stroke-width="1" stroke-dasharray="4"/>` : ""}
        <polyline fill="none" stroke="#3b82f6" stroke-width="2" points="${points}"/>
        <circle cx="${width}" cy="${lastY}" r="4" fill="#3b82f6"/>
      </svg>
      <div class="chart-label">${weights.length} day trend · goal line at ${data.goal_weight}</div>
    `;
  }
  
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Weight</title>
<style>
:root{--bg:#0a0a0a;--card:#141414;--text:#e5e5e5;--dim:#666;--green:#22c55e;--red:#ef4444;--blue:#3b82f6}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px;padding-bottom:80px}
.main{font-size:5rem;font-weight:700;letter-spacing:-2px;margin-top:20px}
.unit{font-size:1.5rem;color:var(--dim);margin-left:4px}
.rate{font-size:1.25rem;margin-top:4px}
.subtitle{color:var(--dim);font-size:1rem;margin-top:8px}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px;width:100%;max-width:320px}
.stat{background:var(--card);padding:16px;border-radius:12px;text-align:center}
.stat-value{font-size:1.5rem;font-weight:600}
.stat-label{font-size:0.75rem;color:var(--dim);margin-top:4px;text-transform:uppercase}
.positive{color:var(--green)}.negative{color:var(--red)}.blue{color:var(--blue)}
.runway{margin-top:24px;text-align:center}
.runway-big{font-size:2.5rem;font-weight:700}
.runway-label{font-size:0.875rem;color:var(--dim);margin-top:4px}
.eod{margin-top:20px;text-align:center;padding:16px;background:var(--card);border-radius:12px;width:100%;max-width:320px}
.eod-label{font-size:0.75rem;color:var(--dim);text-transform:uppercase}
.eod-value{font-size:1.75rem;font-weight:600;margin-top:4px}
.chart-container{margin-top:24px;width:100%;max-width:320px;background:var(--card);border-radius:12px;padding:16px}
.sparkline{width:100%;height:60px}
.chart-label{font-size:0.7rem;color:var(--dim);text-align:center;margin-top:8px}
.goal{margin-top:20px;text-align:center}
.goal-big{font-size:1.5rem;font-weight:600;color:var(--green)}
.actions{margin-top:24px;display:flex;gap:12px}
.btn{background:var(--card);border:1px solid #333;color:var(--text);padding:12px 20px;border-radius:8px;font-size:0.875rem;cursor:pointer;text-decoration:none}
.btn:hover{background:#1a1a1a}
.updated{position:fixed;bottom:20px;color:var(--dim);font-size:0.75rem;text-align:center}
</style>
</head><body>
<div class="main">${data.interpolated_weight.toFixed(1)}<span class="unit">lbs</span></div>
<div class="rate ${rateClass}">${rateArrow} ${absRate} mlbs/hr (${data.burn_rate_per_hour} cal/hr)</div>
<div class="subtitle">trend: ${data.trend_weight.toFixed(1)} · weighed: ${data.current_weight}</div>

<div class="stats">
<div class="stat">
<div class="stat-value">${data.calories_in}</div>
<div class="stat-label">Calories In</div>
</div>
<div class="stat">
<div class="stat-value">${data.calories_out}</div>
<div class="stat-label">Burned${data.burn_source === "apple_watch" ? " ⌚" : ""}</div>
</div>
<div class="stat">
<div class="stat-value ${deficitClass}">${deficitSign}${data.net_calories}</div>
<div class="stat-label">Net</div>
</div>
<div class="stat">
<div class="stat-value">${data.to_goal.toFixed(1)}</div>
<div class="stat-label">To Goal</div>
</div>
</div>

<div class="runway">
<div class="runway-big blue">${data.runway_calories}</div>
<div class="runway-label">calories runway today</div>
</div>

<div class="chart-container">
${sparkline || '<div class="chart-label">Weight chart appears after multiple weigh-ins</div>'}
</div>

<div class="eod">
<div class="eod-label">End of Day Projected</div>
<div class="eod-value ${data.projected_eod_deficit < 0 ? "positive" : "negative"}">${data.projected_eod_weight.toFixed(2)} lbs</div>
</div>

<div class="goal">
<div class="goal-big">${data.days_to_goal_750} days to ${data.goal_weight} lbs</div>
<div class="subtitle">@ 750 cal/day deficit · target ${data.target_date}</div>
</div>

<div class="actions">
<a href="/weight/history?days=7" class="btn">History</a>
<a href="/weight/trends?days=30" class="btn">Trends</a>
<a href="/weight/export" class="btn">Export</a>
</div>

<div class="updated">
${data.hours_elapsed.toFixed(1)}h elapsed · ${data.hours_remaining.toFixed(1)}h left · auto-refresh 60s
</div>

<script>setTimeout(()=>location.reload(),60000)</script>
</body></html>`;
}
