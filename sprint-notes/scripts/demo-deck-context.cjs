/**
 * Demo-deck context dumper — no LLM/API needed.
 *
 * Pulls a sprint's ticket data from JIRA (same filters the app uses) plus the
 * capacity/PTO you entered locally, and prints a structured context block.
 * Hand that output to Claude Code and ask for the Slide 2 narrative, Slide 3
 * features/fixes, and demo candidates — the AI sections the app can't generate
 * while the Anthropic API is out of credits.
 *
 * Usage:
 *   node scripts/demo-deck-context.cjs            # defaults to the ACTIVE sprint (Sunday demo pull)
 *   node scripts/demo-deck-context.cjs 1393       # a specific sprint id
 */

const fs = require('fs');
const path = require('path');

// ── env + JIRA fetch (same pattern as the other scripts) ────────────────
function loadEnv() {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const env = {};
  envContent.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return env;
}
const ENV = loadEnv();
const BASE = 'https://cembenchmarking.atlassian.net';
const BOARD_ID = 9;

async function jiraFetch(endpoint) {
  const auth = Buffer.from(`${ENV.VITE_JIRA_EMAIL}:${ENV.VITE_JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'X-Atlassian-Token': 'no-check' },
  });
  if (!res.ok) throw new Error(`JIRA ${res.status} on ${endpoint}`);
  return res.json();
}

const FIELDS = ['summary', 'status', 'issuetype', 'priority', 'labels',
  'customfield_10031', 'customfield_10124', 'customfield_10058', 'customfield_10020'].join(',');

async function search(jql) {
  const params = new URLSearchParams({ jql, fields: FIELDS, maxResults: '200' });
  const data = await jiraFetch(`/rest/api/3/search/jql?${params.toString()}`);
  return data.issues || [];
}

// ── label → platform (mirrors src/config/labels.ts + demo-deck overrides) ─
const PLATFORM = {
  Blizzard: 'Blizzard', CEMQ: 'CEM Query', CEMQuery: 'CEM Query', Dashboard: 'Dashboard',
  'Dashboard-V2': 'Dashboard', ITBacklog: 'IT Backlog', HubSpot: 'HubSpot', STR: 'STR',
  Survey: 'Survey', 'Survey-V2': 'Survey', TemplateSafari: 'Template Safari',
  TemplateUploadTool: 'Template Upload Tool', Portal: 'Portal',
};
const DEMO_DECK_RENAME = { 'Template Safari': 'CEM Collect' };
function primaryPlatform(labels) {
  for (const l of labels || []) if (PLATFORM[l]) return DEMO_DECK_RENAME[PLATFORM[l]] || PLATFORM[l];
  return 'Other';
}

function ticketFrom(raw) {
  const f = raw.fields;
  const devs = (Array.isArray(f.customfield_10124) ? f.customfield_10124 : [])
    .map((u) => u.displayName).filter(Boolean);
  const sprints = (f.customfield_10020 || []).map((s) => s.id);
  return {
    key: raw.key,
    summary: f.summary,
    type: f.issuetype?.name,
    points: f.customfield_10031 ?? 0,
    labels: f.labels || [],
    status: f.status?.name,
    platform: primaryPlatform(f.labels || []),
    devs,
    maxSprint: sprints.length ? Math.max(...sprints) : 0,
    isHotfix: (f.labels || []).includes('Hotfix'),
    isRecurring: (f.labels || []).includes('Recurring'),
  };
}

const EXCLUDE = 'status NOT IN ("Will Not Implement", "IT - Canceled")';

// Carry-over filter differs for the active sprint (it IS an open sprint, so we
// can't exclude open sprints or we'd get nothing) vs a closed one.
function carryFilter(isActive) {
  return isActive
    ? 'sprint NOT IN futureSprints()'
    : 'sprint NOT IN openSprints() AND sprint NOT IN futureSprints()';
}
async function completedCP(sprintId, isActive = false) {
  const jql = `project = CP AND sprint = ${sprintId} AND ${carryFilter(isActive)} AND statusCategory = Done AND ${EXCLUDE}`;
  return (await search(jql)).map(ticketFrom).filter((t) => t.maxSprint <= Number(sprintId));
}
async function itCount(sprintId, isActive = false) {
  const jql = `project = IT AND sprint = ${sprintId} AND ${carryFilter(isActive)} AND statusCategory = Done AND ${EXCLUDE}`;
  return (await search(jql)).length;
}
async function carriedOutCP(sprintId) {
  const jql = `project = CP AND sprint = ${sprintId} AND ${EXCLUDE}`;
  return (await search(jql)).map(ticketFrom).filter((t) => t.maxSprint > Number(sprintId));
}
// Active-sprint in-flight CP work (not yet done), bucketed by status.
async function inFlightCP(sprintId) {
  const jql = `project = CP AND sprint = ${sprintId} AND sprint NOT IN futureSprints() AND statusCategory != Done AND ${EXCLUDE}`;
  return (await search(jql)).map(ticketFrom);
}

// ── local capacity / PTO / roster ───────────────────────────────────────
function loadJson(rel) { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')); }
function engineers() {
  const members = (loadJson('data/team.json').members || []);
  return members.filter((m) => m.active && m.role !== 'admin');
}
function sprintNotes(sprintId) {
  const st = loadJson('data/notes.json').state || {};
  return (st.sprintNotes || {})[sprintId] || {};
}

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const round = (n) => Math.round(n);

function groupByPlatform(tickets) {
  const g = new Map();
  for (const t of tickets) { if (!g.has(t.platform)) g.set(t.platform, []); g.get(t.platform).push(t); }
  return [...g.entries()]
    .map(([platform, ts]) => ({ platform, points: sum(ts, (t) => t.points), tickets: ts.sort((a, b) => b.points - a.points) }))
    .sort((a, b) => b.points - a.points);
}

async function main() {
  // Fetch active + closed sprints (paginated).
  const sprints = [];
  for (const state of ['active', 'closed']) {
    for (let startAt = 0; ; startAt += 50) {
      const data = await jiraFetch(`/rest/agile/1.0/board/${BOARD_ID}/sprint?state=${state}&maxResults=50&startAt=${startAt}`);
      sprints.push(...data.values);
      if (data.isLast) break;
    }
  }
  const num = (n) => { const m = /Sprint\s+(\d+)/i.exec(n || ''); return m ? +m[1] : 0; };
  sprints.sort((a, b) => num(a.name) - num(b.name));

  // Default target = the ACTIVE sprint (the "current sprint" for the Sunday demo
  // pull), or the given id, or the latest closed as a fallback.
  const argId = process.argv[2];
  const active = sprints.find((s) => s.state === 'active');
  const target = argId
    ? sprints.find((s) => String(s.id) === argId)
    : (active || sprints[sprints.length - 1]);
  if (!target) { console.error(`Sprint ${argId || '(active)'} not found.`); process.exit(1); }
  const sprintId = String(target.id);
  const isActive = target.state === 'active';

  const [completed, it, carried, inFlight] = await Promise.all([
    completedCP(sprintId, isActive),
    itCount(sprintId, isActive),
    carriedOutCP(sprintId),
    isActive ? inFlightCP(sprintId) : Promise.resolve([]),
  ]);

  // recent 6 closed sprints BEFORE target — average completed CP points + IT count
  const prior = sprints.filter((s) => num(s.name) < num(target.name)).slice(-6);
  const priorStats = [];
  for (const s of prior) {
    const c = await completedCP(String(s.id));
    priorStats.push({ pts: sum(c, (t) => t.points), it: await itCount(String(s.id)) });
  }
  const avgPts = priorStats.length ? round(sum(priorStats, (p) => p.pts) / priorStats.length) : null;
  const avgIt = priorStats.length ? round(sum(priorStats, (p) => p.it) / priorStats.length) : null;

  // capacity
  const notes = sprintNotes(sprintId);
  const cap = notes.capacity || { defaultWorkingDays: 10, teamHolidays: 0, effectiveSprintDays: 10 };
  const timeOff = notes.timeOff || {};
  const engs = engineers();
  const fullCap = cap.defaultWorkingDays * engs.length;
  const actualDays = sum(engs, (m) => (timeOff[m.id]?.workingDays ?? cap.effectiveSprintDays));
  const capacityPct = fullCap > 0 ? round((actualDays / fullCap) * 100) : 100;
  const expectedPts = avgPts != null ? round(avgPts * (capacityPct / 100)) : null;
  const ptoList = engs.filter((m) => (timeOff[m.id]?.ptoDays ?? 0) > 0).map((m) => `${m.name}: ${timeOff[m.id].ptoDays}d`);
  const totalPto = sum(engs, (m) => (timeOff[m.id]?.ptoDays ?? 0));
  const daysLost = cap.defaultWorkingDays - cap.effectiveSprintDays;

  const totalPts = sum(completed, (t) => t.points);
  // Type breakdown (completed CP)
  const byType = (ts, type) => ts.filter((t) => t.type === type);
  const stories = byType(completed, 'Story');
  const tasks = byType(completed, 'Task');
  const bugTix = byType(completed, 'Bug');
  const storyTask = stories.length + tasks.length;
  const bugs = bugTix.length;

  const platforms = groupByPlatform(completed);
  const dominant = platforms.length && totalPts > 0 && (platforms[0].points / totalPts) > 0.4 ? platforms[0] : null;

  const featureTix = completed.filter((t) => t.type !== 'Bug' && !t.isHotfix && !t.isRecurring);
  const fixTix = completed.filter((t) => (t.type === 'Bug' || t.isHotfix) && !t.isRecurring);
  const demoTix = completed.filter((t) => !t.isRecurring && t.platform !== 'Other');

  // ── print ─────────────────────────────────────────────────────────────
  // In-flight buckets (active sprint only)
  const inProg = inFlight.filter((t) => (t.status || '').toLowerCase().includes('in progress') || (t.status || '').toLowerCase().includes('review'));
  const notStarted = inFlight.filter((t) => {
    const s = (t.status || '').toLowerCase();
    return s.includes('to do') || s.includes('open') || s.includes('backlog') || s === '';
  });
  const inProgPts = sum(inProg, (t) => t.points);
  const notStartedPts = sum(notStarted, (t) => t.points);

  const inFlightPts = inProgPts + notStartedPts;
  const scopeTotal = totalPts + inFlightPts;

  const L = [];
  L.push(`================  DEMO DECK CONTEXT — ${target.name} (id ${sprintId})  [${isActive ? 'ACTIVE — as of now' : 'closed'}]  ================`);
  L.push('');
  L.push('### FULL BREAKDOWN');
  L.push(`Completed CP: ${completed.length} tickets, ${totalPts} pts`);
  L.push(`  Stories: ${stories.length} (${sum(stories, (t) => t.points)} pts)`);
  L.push(`  Tasks:   ${tasks.length} (${sum(tasks, (t) => t.points)} pts)`);
  L.push(`  Bugs:    ${bugTix.length} (${sum(bugTix, (t) => t.points)} pts)`);
  L.push(`IT Helpdesk: ${it} tickets`);
  if (isActive) {
    L.push(`In progress / review: ${inProg.length} tickets (${inProgPts} pts)`);
    L.push(`Not started: ${notStarted.length} tickets (${notStartedPts} pts)`);
    L.push(`Total CP scope (done + in-flight): ${scopeTotal} pts`);
  }
  L.push(`Points by platform (completed): ${platforms.map((p) => `${p.platform} ${p.points}`).join(', ')}`);
  L.push('');
  L.push('### SLIDE 2 — Ticket counts');
  L.push(`CP: ${storyTask} story/task, ${bugs} bug${bugs !== 1 ? 's' : ''}${isActive ? ' completed so far' : ''}`);
  L.push(`IT Helpdesk: ${it}${avgIt != null ? ` (avg ${avgIt}, ${it - avgIt >= 0 ? '+' : ''}${it - avgIt} vs avg)` : ''}`);
  L.push('');
  L.push('### SLIDE 2 — Outcome / capacity (for narrative)');
  L.push(`Points completed${isActive ? ' so far' : ''}: ${totalPts}`);
  if (isActive) {
    L.push(`In progress / review: ${inProg.length} tasks (${inProgPts} pts)`);
    L.push(`Not started: ${notStarted.length} tasks (${notStartedPts} pts)`);
  }
  L.push(`Recent avg points (last ${priorStats.length}): ${avgPts ?? 'n/a'}`);
  L.push(`Team capacity this sprint: ${capacityPct}% (${engs.length} engineers, ${actualDays}/${fullCap} eng-days)`);
  L.push(`Capacity-adjusted expected points: ${expectedPts ?? 'n/a'}` + (expectedPts != null ? ` → actual ${totalPts} = ${totalPts - expectedPts === 0 ? 'on target' : `${Math.abs(totalPts - expectedPts)} ${totalPts - expectedPts > 0 ? 'over' : 'under'}`}` : ''));
  L.push(`Sprint length: ${cap.effectiveSprintDays}/${cap.defaultWorkingDays} days${daysLost > 0 ? ` (${daysLost} lost to holidays)` : ''}`);
  L.push(`PTO: ${totalPto > 0 ? `${totalPto} eng-days (${ptoList.join('; ')})` : 'none'}`);
  L.push(`Dominant platform: ${dominant ? `${dominant.platform} (${round((dominant.points / totalPts) * 100)}% of points)` : 'none — spread across platforms'}`);
  L.push(`IT volume: ${it}${avgIt != null ? ` vs avg ${avgIt}` : ''}`);
  L.push('');
  L.push('### SLIDE 3 — Features (non-bug, non-hotfix, non-recurring), by platform');
  for (const g of groupByPlatform(featureTix)) {
    L.push(`  ${g.platform} (${g.points} pts):`);
    for (const t of g.tickets) L.push(`    ${t.key} (${t.points}p): ${t.summary}`);
  }
  L.push('');
  L.push('### SLIDE 3 — Fixes (bugs + hotfixes), by platform');
  for (const g of groupByPlatform(fixTix)) {
    L.push(`  ${g.platform} (${g.points} pts):`);
    for (const t of g.tickets) L.push(`    ${t.key} (${t.points}p): ${t.summary}`);
  }
  L.push('');
  L.push('### DEMO CANDIDATES (exclude Recurring + Other), by platform');
  for (const g of groupByPlatform(demoTix)) {
    L.push(`  ${g.platform}:`);
    for (const t of g.tickets) L.push(`    ${t.key} (${t.points}p): ${t.summary}`);
  }
  L.push('');
  L.push(`### CARRIED OVER — worked here but moved to a later sprint (${carried.length})`);
  for (const t of carried.sort((a, b) => b.points - a.points)) {
    L.push(`  ${t.key} (${t.points}p) [${t.status}] ${t.devs.join(', ') || '—'}: ${t.summary}`);
  }
  console.log(L.join('\n'));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
