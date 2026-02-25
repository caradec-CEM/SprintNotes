/**
 * Cleanup stale sprint data for cancelled/WNI tickets — sprint-by-sprint.
 *
 * Approach: fetch all tickets in a given sprint, find the ones in terminal
 * statuses that were cancelled BEFORE the sprint started, and remove
 * that sprint entry from those tickets.
 *
 * Usage:
 *   node scripts/cleanup-stale-sprint-data.cjs --sprint 55        # dry-run sprint 55
 *   node scripts/cleanup-stale-sprint-data.cjs --ticket CP-1462   # inspect one ticket
 *   node scripts/cleanup-stale-sprint-data.cjs --sprint 55 --probe    # test API on first match
 *   node scripts/cleanup-stale-sprint-data.cjs --sprint 55 --execute  # live mode
 *   node scripts/cleanup-stale-sprint-data.cjs --sprint 55 --execute --limit 3
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Boilerplate (from analyze-labels.cjs)
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};

  envContent.split('\n').forEach(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key && value) {
      env[key] = value;
    }
  });

  return env;
}

const ENV = loadEnv();

function getAuthHeaders() {
  const email = ENV.VITE_JIRA_EMAIL;
  const token = ENV.VITE_JIRA_API_TOKEN;

  if (!email || !token) {
    throw new Error('Missing JIRA credentials in .env file');
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'X-Atlassian-Token': 'no-check',
  };
}

const BASE_URL = 'https://cembenchmarking.atlassian.net';

async function jiraFetch(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, { headers: getAuthHeaders() });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`JIRA GET ${response.status} ${response.statusText} — ${url}\n${body}`);
  }

  return response.json();
}

async function jiraPut(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`JIRA PUT ${response.status} ${response.statusText} — ${url}\n${text}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function jiraPost(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`JIRA POST ${response.status} ${response.statusText} — ${url}\n${text}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ['Will Not Implement', 'IT - Canceled'];
const BOARD_ID = 9;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    execute: args.includes('--execute'),
    probe: args.includes('--probe'),
    sprint: null,
    ticket: null,
    limit: null,
  };

  const sprintIdx = args.indexOf('--sprint');
  if (sprintIdx !== -1 && args[sprintIdx + 1]) {
    flags.sprint = parseInt(args[sprintIdx + 1], 10);
  }

  const ticketIdx = args.indexOf('--ticket');
  if (ticketIdx !== -1 && args[ticketIdx + 1]) {
    flags.ticket = args[ticketIdx + 1];
  }

  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    flags.limit = parseInt(args[limitIdx + 1], 10);
  }

  return flags;
}

function sameCalendarDay(dateA, dateB) {
  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  );
}

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Find the sprint object by sprint number (e.g. 55 → "Engineering Sprint 55").
 * Searches closed, active, and future sprints on the board.
 */
async function findSprintByNumber(sprintNumber) {
  for (const state of ['closed', 'active', 'future']) {
    let startAt = 0;
    while (true) {
      const data = await jiraFetch(
        `/rest/agile/1.0/board/${BOARD_ID}/sprint?state=${state}&startAt=${startAt}&maxResults=50`
      );
      for (const sprint of data.values) {
        // Match "Engineering Sprint 55", "Engineer Sprint 55", etc.
        const match = sprint.name.match(/(\d+)$/);
        if (match && parseInt(match[1], 10) === sprintNumber) {
          return sprint;
        }
      }
      if (data.isLast || startAt + data.values.length >= (data.total || data.values.length)) break;
      startAt += data.values.length;
      await sleep(200);
    }
  }
  return null;
}

/**
 * Fetch all tickets in a sprint that are in terminal statuses, with changelogs.
 */
async function fetchTerminalTicketsInSprint(sprintId) {
  const allIssues = [];
  let startAt = 0;
  const pageSize = 50;

  const statusList = TERMINAL_STATUSES.map(s => `"${s}"`).join(', ');

  while (true) {
    const params = new URLSearchParams({
      jql: `sprint = ${sprintId} AND status in (${statusList}) ORDER BY key ASC`,
      fields: 'summary,status,customfield_10020',
      expand: 'changelog',
      maxResults: String(pageSize),
      startAt: String(startAt),
    });

    const data = await jiraFetch(`/rest/api/3/search/jql?${params.toString()}`);
    allIssues.push(...data.issues);

    if (startAt + data.issues.length >= data.total) break;
    startAt += pageSize;
    await sleep(200);
  }

  return allIssues;
}

/**
 * Fetch a single ticket with changelog.
 */
async function fetchSingleTicket(ticketKey) {
  const params = new URLSearchParams({
    jql: `key = ${ticketKey}`,
    fields: 'summary,status,customfield_10020',
    expand: 'changelog',
    maxResults: '1',
  });
  const data = await jiraFetch(`/rest/api/3/search/jql?${params.toString()}`);
  if (data.issues.length === 0) {
    throw new Error(`Ticket ${ticketKey} not found`);
  }
  return data.issues[0];
}

/**
 * If the inline changelog is incomplete, fetch the full changelog via pagination.
 */
async function getFullChangelog(issue) {
  const changelog = issue.changelog;
  if (!changelog) return [];

  if (changelog.histories.length >= changelog.total) {
    return changelog.histories;
  }

  console.log(`    ${issue.key}: fetching full changelog (${changelog.total} entries)...`);
  const allHistories = [];
  let startAt = 0;
  const pageSize = 100;

  while (startAt < changelog.total) {
    const data = await jiraFetch(
      `/rest/api/3/issue/${issue.key}/changelog?startAt=${startAt}&maxResults=${pageSize}`
    );
    allHistories.push(...data.values);
    startAt += data.values.length;
    if (data.values.length === 0) break;
    await sleep(200);
  }

  return allHistories;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Find the most recent transition into the ticket's current terminal status.
 */
function findCancellationDate(currentStatus, histories) {
  const sorted = [...histories].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  for (const history of sorted) {
    for (const item of history.items) {
      if (item.field === 'status' && item.toString === currentStatus) {
        return new Date(history.created);
      }
    }
  }

  return null;
}

/**
 * Given a ticket's sprints and its cancellation date, determine which sprints
 * are stale (started after cancellation).
 */
function classifySprints(sprints, cancellationDate) {
  const keep = [];
  const remove = [];
  const borderline = [];

  for (const sprint of sprints) {
    if (!sprint.startDate) {
      keep.push(sprint);
      continue;
    }

    const sprintStart = new Date(sprint.startDate);

    if (sameCalendarDay(sprintStart, cancellationDate)) {
      borderline.push(sprint);
      keep.push(sprint); // default: keep borderline
    } else if (sprintStart <= cancellationDate) {
      keep.push(sprint);
    } else {
      remove.push(sprint);
    }
  }

  return { keep, remove, borderline };
}

/**
 * Analyze a single issue.
 */
async function analyzeTicket(issue) {
  const key = issue.key;
  const fields = issue.fields;
  const currentStatus = fields.status?.name || '';
  const sprints = fields.customfield_10020 || [];

  const histories = await getFullChangelog(issue);
  const cancellationDate = findCancellationDate(currentStatus, histories);

  if (!cancellationDate) {
    return {
      key,
      summary: fields.summary,
      status: currentStatus,
      cancellationDate: null,
      sprints,
      keep: sprints,
      remove: [],
      borderline: [],
      needsManualReview: true,
      reason: 'no status transition found in changelog',
    };
  }

  const { keep, remove, borderline } = classifySprints(sprints, cancellationDate);

  return {
    key,
    summary: fields.summary,
    status: currentStatus,
    cancellationDate,
    sprints,
    keep,
    remove,
    borderline,
    needsManualReview: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Sprint name helpers for compact display
// ---------------------------------------------------------------------------

function compactSprintName(name) {
  const match = name.match(/(\d+)$/);
  return match ? match[1] : name;
}

function formatSprintList(sprints) {
  if (sprints.length === 0) return '(none)';
  return sprints.map(s => compactSprintName(s.name)).join(', ');
}

// ---------------------------------------------------------------------------
// Probe mode — test API removal approaches
// ---------------------------------------------------------------------------

async function probeRemoval(ticket) {
  const sep = '='.repeat(70);
  console.log(`\n${sep}`);
  console.log(`  PROBE MODE — testing API removal on ${ticket.key}`);
  console.log(sep);

  if (ticket.remove.length === 0) {
    console.log('\n  This ticket has no stale sprints to remove. Pick a different ticket.');
    return;
  }

  console.log(`\n  Status:      ${ticket.status}`);
  console.log(`  Cancelled:   ${ticket.cancellationDate.toISOString().slice(0, 10)}`);
  console.log(`  Keep:        ${formatSprintList(ticket.keep)}`);
  console.log(`  Remove:      ${formatSprintList(ticket.remove)}`);

  const keepIds = ticket.keep.map(s => s.id);

  // Approach 1: Array of sprint ID objects
  console.log('\n  --- Approach 1: PUT with array of {id} objects ---');
  try {
    const body1 = { fields: { customfield_10020: keepIds.map(id => ({ id })) } };
    console.log(`  Request body: ${JSON.stringify(body1)}`);
    await jiraPut(`/rest/api/3/issue/${ticket.key}`, body1);
    console.log('  Result: SUCCESS');
    return;
  } catch (err) {
    console.log(`  Result: FAILED — ${err.message.split('\n')[0]}`);
  }

  await sleep(500);

  // Approach 2: Array of numeric IDs
  console.log('\n  --- Approach 2: PUT with array of numeric IDs ---');
  try {
    const body2 = { fields: { customfield_10020: keepIds } };
    console.log(`  Request body: ${JSON.stringify(body2)}`);
    await jiraPut(`/rest/api/3/issue/${ticket.key}`, body2);
    console.log('  Result: SUCCESS');
    return;
  } catch (err) {
    console.log(`  Result: FAILED — ${err.message.split('\n')[0]}`);
  }

  await sleep(500);

  // Approach 3: Move to backlog
  console.log('\n  --- Approach 3: POST to backlog endpoint ---');
  try {
    await jiraPost(`/rest/agile/1.0/backlog/issue`, { issues: [ticket.key] });
    console.log('  Result: SUCCESS (but may only remove active sprint)');
  } catch (err) {
    console.log(`  Result: FAILED — ${err.message.split('\n')[0]}`);
  }

  console.log('\n  Review results above. Update the removeSprints() function with the working approach.');
  console.log(sep);
}

// ---------------------------------------------------------------------------
// Sprint removal (pluggable — update once probe finds the working approach)
// ---------------------------------------------------------------------------

async function removeSprints(ticketKey, keepSprints) {
  const keepIds = keepSprints.map(s => ({ id: s.id }));
  await jiraPut(`/rest/api/3/issue/${ticketKey}`, {
    fields: { customfield_10020: keepIds },
  });
}

// ---------------------------------------------------------------------------
// Console report
// ---------------------------------------------------------------------------

function printReport(targetSprint, results) {
  const sep = '='.repeat(70);
  const thinSep = '-'.repeat(70);

  const withStale = results.filter(r => r.remove.length > 0);
  const noStale = results.filter(r => r.remove.length === 0 && !r.needsManualReview);
  const manualReview = results.filter(r => r.needsManualReview);
  const totalRemovals = withStale.reduce((sum, r) => sum + r.remove.length, 0);

  console.log(`\n${sep}`);
  console.log(`  DRY RUN — ${targetSprint ? targetSprint.name : 'single ticket'}`);
  console.log(sep);

  console.log(`\n  Tickets in terminal status: ${results.length}`);
  console.log(`  With stale sprint entries:  ${withStale.length}`);
  console.log(`  Already clean:              ${noStale.length}`);
  console.log(`  Total entries to remove:    ${totalRemovals}`);

  if (withStale.length > 0) {
    console.log(`\n${thinSep}`);

    for (const t of withStale) {
      const cancelStr = t.cancellationDate
        ? t.cancellationDate.toISOString().slice(0, 10)
        : 'unknown';
      console.log(`\n  ${t.key} | ${t.status} | Cancelled: ${cancelStr}`);
      console.log(`    Keep:   ${formatSprintList(t.keep)}`);
      console.log(`    Remove: ${formatSprintList(t.remove)}`);
      if (t.borderline.length > 0) {
        console.log(`    Borderline (kept): ${formatSprintList(t.borderline)}`);
      }
    }
  }

  if (manualReview.length > 0) {
    console.log(`\n${thinSep}`);
    console.log(`\n  MANUAL REVIEW (${manualReview.length} tickets — no changelog transition found):`);
    for (const t of manualReview) {
      console.log(`    ${t.key} — ${t.status} — ${t.reason}`);
    }
  }

  console.log(`\n${sep}\n`);
}

// ---------------------------------------------------------------------------
// Execute mode
// ---------------------------------------------------------------------------

async function executeRemovals(results) {
  const withStale = results.filter(r => r.remove.length > 0);
  const totalRemovals = withStale.reduce((sum, r) => sum + r.remove.length, 0);

  if (withStale.length === 0) {
    console.log('\nNo stale sprint entries to remove.');
    return;
  }

  const confirmed = await askConfirmation(
    `\nAbout to modify ${withStale.length} tickets, removing ${totalRemovals} sprint entries. Proceed? [y/N] `
  );

  if (!confirmed) {
    console.log('Aborted.');
    return;
  }

  console.log('\nExecuting removals...\n');

  let successCount = 0;
  let failCount = 0;

  for (const ticket of withStale) {
    try {
      await removeSprints(ticket.key, ticket.keep);
      console.log(`  OK ${ticket.key} — removed ${ticket.remove.length} sprints (kept ${ticket.keep.length}) [${formatSprintList(ticket.remove)}]`);
      successCount++;
    } catch (err) {
      console.error(`  FAIL ${ticket.key} — ${err.message.split('\n')[0]}`);
      failCount++;
      console.error('\n  Halting on API failure. Fix the issue and re-run.');
      break;
    }

    await sleep(500);
  }

  console.log(`\nDone. Success: ${successCount}, Failed: ${failCount}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();
  const sep = '='.repeat(70);

  console.log(`\n${sep}`);
  console.log('  Cleanup Stale Sprint Data for Cancelled/WNI Tickets');
  console.log(sep);

  const mode = flags.execute ? 'EXECUTE (live)' : flags.probe ? 'PROBE' : 'DRY RUN';
  console.log(`  Mode: ${mode}`);
  if (flags.sprint) console.log(`  Sprint: ${flags.sprint}`);
  if (flags.ticket) console.log(`  Ticket: ${flags.ticket}`);
  if (flags.limit) console.log(`  Limit: ${flags.limit}`);

  // Single ticket mode
  if (flags.ticket) {
    console.log(`\nFetching ${flags.ticket}...`);
    const issue = await fetchSingleTicket(flags.ticket);
    console.log('Analyzing changelog...');
    const result = await analyzeTicket(issue);
    printReport(null, [result]);

    if (flags.probe && result.remove.length > 0) {
      await probeRemoval(result);
    }
    if (flags.execute) {
      await executeRemovals([result]);
    }
    return;
  }

  // Sprint mode (required for batch)
  if (!flags.sprint) {
    console.error('\nError: Provide --sprint <number> or --ticket <key>');
    console.error('  Example: node scripts/cleanup-stale-sprint-data.cjs --sprint 55');
    process.exit(1);
  }

  // Find the sprint
  console.log(`\nLooking up sprint ${flags.sprint}...`);
  const sprint = await findSprintByNumber(flags.sprint);
  if (!sprint) {
    throw new Error(`Sprint ${flags.sprint} not found on board ${BOARD_ID}`);
  }
  console.log(`  Found: ${sprint.name} (ID: ${sprint.id}, state: ${sprint.state})`);
  if (sprint.startDate) {
    console.log(`  Started: ${sprint.startDate.slice(0, 10)}`);
  }

  // Fetch terminal tickets in this sprint
  console.log(`\nFetching cancelled/WNI tickets in ${sprint.name}...`);
  const issues = await fetchTerminalTicketsInSprint(sprint.id);
  console.log(`  Found ${issues.length} ticket(s) in terminal status.\n`);

  if (issues.length === 0) {
    console.log('Nothing to clean up!');
    return;
  }

  // Analyze
  console.log('Analyzing changelogs...');
  const results = [];
  for (const issue of issues) {
    const result = await analyzeTicket(issue);
    results.push(result);
    await sleep(200);
  }

  // Apply limit
  const limited = flags.limit ? results.slice(0, flags.limit) : results;

  // Probe
  if (flags.probe) {
    const candidate = limited.find(r => r.remove.length > 0);
    if (!candidate) {
      console.log('No tickets with stale sprints found to probe.');
      return;
    }
    await probeRemoval(candidate);
    return;
  }

  // Report
  printReport(sprint, limited);

  // Execute
  if (flags.execute) {
    await executeRemovals(limited);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
