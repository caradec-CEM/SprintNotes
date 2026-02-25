/**
 * Analyze review bottlenecks in the active sprint
 * Identifies engineers who are both developing AND reviewing, blocking review throughput.
 *
 * Run with: node scripts/analyze-review-bottlenecks.cjs
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Boilerplate (from analyze-labels.cjs)
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};

  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  });

  return env;
}

const ENV = loadEnv();

async function jiraFetch(endpoint) {
  const baseUrl = 'https://cembenchmarking.atlassian.net';
  const email = ENV.VITE_JIRA_EMAIL;
  const token = ENV.VITE_JIRA_API_TOKEN;

  if (!email || !token) {
    throw new Error('Missing JIRA credentials in .env file');
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-Atlassian-Token': 'no-check',
    },
  });

  if (!response.ok) {
    throw new Error(`JIRA API error: ${response.status} ${response.statusText} — ${url}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Constants (embedded from TS config files)
// ---------------------------------------------------------------------------

const IN_PROGRESS_STATUSES = ['In Progress', 'IT - In Progress'];
const IN_REVIEW_STATUSES = ['Reviewing', 'IT - Review', 'IT - Reviewing'];

const TEAM_MEMBERS = [
  { id: 'efron',    name: 'Efron Berlian',    accountId: '5f049c6ad6803200213ba5a3' },
  { id: 'erick',    name: 'Erick Cardiel',    accountId: '712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c' },
  { id: 'briano',   name: 'Briano Wong',      accountId: '712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94' },
  { id: 'mitchell', name: 'Mitchell Coakley',  accountId: '712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4' },
  { id: 'wlad',     name: 'Wladimir',          accountId: '712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b' },
];

function findMemberByAccountId(accountId) {
  if (!accountId) return undefined;
  return TEAM_MEMBERS.find(m => m.accountId === accountId);
}

// ---------------------------------------------------------------------------
// Business day calculation (ported from dateUtils.ts)
// ---------------------------------------------------------------------------

function calculateBusinessDays(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  const effectiveStartDay = new Date(startDay);
  if (startDate.getHours() >= 17) {
    effectiveStartDay.setDate(effectiveStartDay.getDate() + 1);
  }

  const effectiveEndDay = new Date(endDay);
  if (endDate.getHours() < 9) {
    effectiveEndDay.setDate(effectiveEndDay.getDate() - 1);
  }

  let businessDays = 0;
  const current = new Date(effectiveStartDay);

  while (current <= effectiveEndDay) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return businessDays;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchActiveSprint() {
  const data = await jiraFetch('/rest/agile/1.0/board/9/sprint?state=active');
  if (!data.values || data.values.length === 0) {
    throw new Error('No active sprint found');
  }
  return data.values[0];
}

async function fetchSprintById(sprintId) {
  return jiraFetch(`/rest/agile/1.0/sprint/${sprintId}`);
}

async function fetchSprintTickets(sprintId, isActiveSprint) {
  // Active sprint: exclude tickets already moved to a future sprint
  // Any other sprint: exclude tickets that carried over to open or future sprints
  const sprintFilter = isActiveSprint
    ? `sprint NOT IN futureSprints()`
    : `sprint NOT IN openSprints() AND sprint NOT IN futureSprints()`;
  const jql = `sprint = ${sprintId} AND ${sprintFilter} AND statusCategory != Done ORDER BY key ASC`;
  const fields = [
    'summary',
    'status',
    'assignee',
    'customfield_10124', // Developer
    'customfield_10058', // Reviewer
    'customfield_10031', // Points
    'customfield_10020', // Sprint
  ].join(',');

  const params = new URLSearchParams({
    jql,
    fields,
    expand: 'changelog',
    maxResults: '200',
  });

  const data = await jiraFetch(`/rest/api/3/search/jql?${params.toString()}`);
  return data.issues;
}

// ---------------------------------------------------------------------------
// Ticket parsing
// ---------------------------------------------------------------------------

function resolveDevelopers(fields) {
  const devField = fields.customfield_10124;
  if (!devField) return [];

  const devArray = Array.isArray(devField) ? devField : [devField];
  const result = [];

  for (const dev of devArray) {
    if (!dev?.accountId) continue;
    const member = findMemberByAccountId(dev.accountId);
    result.push({
      accountId: dev.accountId,
      name: member ? member.name : (dev.displayName || 'Unknown'),
      id: member ? member.id : dev.accountId,
    });
  }

  return result;
}

function resolveReviewers(fields, changelog) {
  const seen = new Set();
  const result = [];

  function addReviewer(accountId, displayName) {
    if (!accountId || seen.has(accountId)) return;
    seen.add(accountId);
    const member = findMemberByAccountId(accountId);
    result.push({
      accountId,
      name: member ? member.name : (displayName || 'Unknown'),
      id: member ? member.id : accountId,
    });
  }

  // From reviewer field
  const revField = fields.customfield_10058;
  if (revField) {
    const revArray = Array.isArray(revField) ? revField : [revField];
    for (const rev of revArray) {
      addReviewer(rev?.accountId, rev?.displayName);
    }
  }

  // From changelog — who transitioned ticket into a review status
  if (changelog?.histories) {
    for (const history of changelog.histories) {
      for (const item of history.items) {
        if (item.field === 'status' && IN_REVIEW_STATUSES.includes(item.toString)) {
          const author = history.author;
          addReviewer(author?.accountId, author?.displayName);
        }
      }
    }
  }

  return result;
}

/**
 * Walk changelog backwards to find when the ticket last entered its current status.
 * Returns business days from that point to now.
 */
function calculateCurrentStatusDuration(statusName, changelog) {
  if (!changelog?.histories) return 0;

  const sorted = [...changelog.histories].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  for (const history of sorted) {
    for (const item of history.items) {
      if (item.field === 'status' && item.toString === statusName) {
        return calculateBusinessDays(history.created, new Date().toISOString());
      }
    }
  }

  return 0;
}

function parseTicket(issue) {
  const { fields, changelog, key } = issue;
  const statusName = fields.status?.name || '';
  const isInProgress = IN_PROGRESS_STATUSES.includes(statusName);
  const isInReview = IN_REVIEW_STATUSES.includes(statusName);
  const points = fields.customfield_10031 || 0;

  return {
    key,
    summary: fields.summary,
    status: statusName,
    statusCategory: fields.status?.statusCategory?.name || '',
    isInProgress,
    isInReview,
    points,
    developers: resolveDevelopers(fields),
    reviewers: resolveReviewers(fields, changelog),
    daysInStatus: calculateCurrentStatusDuration(statusName, changelog),
  };
}

// ---------------------------------------------------------------------------
// Workload map
// ---------------------------------------------------------------------------

function buildWorkloadMap(tickets) {
  const map = {}; // keyed by accountId

  function ensurePerson(accountId, name) {
    if (!map[accountId]) {
      map[accountId] = { name, developingTickets: [], reviewingTickets: [], isBottleneck: false };
    }
  }

  for (const t of tickets) {
    if (t.isInProgress) {
      for (const dev of t.developers) {
        ensurePerson(dev.accountId, dev.name);
        map[dev.accountId].developingTickets.push(t);
      }
    }
    if (t.isInReview) {
      for (const rev of t.reviewers) {
        ensurePerson(rev.accountId, rev.name);
        map[rev.accountId].reviewingTickets.push(t);
      }
    }
  }

  for (const person of Object.values(map)) {
    person.isBottleneck = person.developingTickets.length > 0 && person.reviewingTickets.length > 0;
  }

  return map;
}

// ---------------------------------------------------------------------------
// Console report
// ---------------------------------------------------------------------------

function printReport(sprint, tickets, workloadMap) {
  const sep = '='.repeat(70);
  const thinSep = '-'.repeat(70);

  // ── Section 1: Sprint Overview ──
  console.log(`\n${sep}`);
  console.log(`  REVIEW BOTTLENECK ANALYSIS — ${sprint.name}`);
  console.log(sep);

  const byCategory = {};
  let totalPoints = 0;
  for (const t of tickets) {
    const cat = t.statusCategory || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, points: 0 };
    byCategory[cat].count++;
    byCategory[cat].points += t.points;
    totalPoints += t.points;
  }

  console.log(`\n  Sprint Overview (non-done tickets)`);
  console.log(thinSep);
  console.log(`  Total: ${tickets.length} tickets, ${totalPoints} points\n`);
  for (const [cat, data] of Object.entries(byCategory).sort()) {
    console.log(`    ${cat.padEnd(20)} ${String(data.count).padStart(3)} tickets   ${String(data.points).padStart(4)} pts`);
  }

  // ── Section 2: Tickets In Review ──
  const inReview = tickets.filter(t => t.isInReview).sort((a, b) => b.daysInStatus - a.daysInStatus);

  console.log(`\n\n  Tickets In Review (${inReview.length})`);
  console.log(thinSep);

  if (inReview.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of inReview) {
      const reviewerStr = t.reviewers.map(r => r.name).join(', ') || '(no reviewer)';
      const days = t.daysInStatus === 0 ? '<1d' : `${t.daysInStatus}d`;
      console.log(`  ${t.key.padEnd(10)} ${days.padStart(4)} waiting   reviewer: ${reviewerStr}`);
      console.log(`  ${''.padEnd(10)} ${t.summary}`);
    }
  }

  // ── Section 3: Tickets In Progress ──
  const inProgress = tickets.filter(t => t.isInProgress).sort((a, b) => b.daysInStatus - a.daysInStatus);

  console.log(`\n\n  Tickets In Progress (${inProgress.length})`);
  console.log(thinSep);

  if (inProgress.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of inProgress) {
      const devStr = t.developers.map(d => d.name).join(', ') || '(no developer)';
      const days = t.daysInStatus === 0 ? '<1d' : `${t.daysInStatus}d`;
      console.log(`  ${t.key.padEnd(10)} ${days.padStart(4)} in dev    developer: ${devStr}`);
      console.log(`  ${''.padEnd(10)} ${t.summary}`);
    }
  }

  // ── Section 4: Bottleneck Analysis ──
  const bottlenecks = Object.values(workloadMap).filter(p => p.isBottleneck);

  console.log(`\n\n  Bottleneck Analysis`);
  console.log(thinSep);

  if (bottlenecks.length === 0) {
    console.log('  No bottlenecks detected — no one is both developing and reviewing.');
  } else {
    for (const person of bottlenecks) {
      console.log(`\n  ** ${person.name} ** — developing ${person.developingTickets.length} ticket(s), reviewing ${person.reviewingTickets.length} ticket(s)`);

      console.log(`     Developing:`);
      for (const t of person.developingTickets) {
        const days = t.daysInStatus === 0 ? '<1d' : `${t.daysInStatus}d`;
        console.log(`       ${t.key} (${days}) — ${t.summary}`);
      }

      console.log(`     Reviewing (likely blocked while they develop):`);
      for (const t of person.reviewingTickets) {
        const days = t.daysInStatus === 0 ? '<1d' : `${t.daysInStatus}d`;
        console.log(`       ${t.key} (${days} waiting) — ${t.summary}`);
      }
    }
  }

  // ── Section 5: Summary ──
  const longestReview = inReview.length > 0 ? inReview[0] : null;

  console.log(`\n\n  Summary`);
  console.log(thinSep);
  console.log(`  Bottleneck people:      ${bottlenecks.length}`);
  console.log(`  Tickets in review:      ${inReview.length}`);
  console.log(`  Tickets in progress:    ${inProgress.length}`);
  if (longestReview) {
    const days = longestReview.daysInStatus === 0 ? '<1d' : `${longestReview.daysInStatus}d`;
    console.log(`  Longest-waiting review: ${longestReview.key} (${days})`);
  }
  console.log(`\n${sep}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const sprintIdx = args.indexOf('--sprint');
  if (sprintIdx !== -1 && args[sprintIdx + 1]) {
    return { sprintId: parseInt(args[sprintIdx + 1], 10) };
  }
  return { sprintId: null };
}

async function main() {
  const { sprintId: requestedId } = parseArgs();
  let sprint;
  let isActiveSprint;

  if (requestedId) {
    console.log(`Fetching sprint ${requestedId}...`);
    sprint = await fetchSprintById(requestedId);
    isActiveSprint = sprint.state === 'active';
    console.log(`Sprint: ${sprint.name} (ID: ${sprint.id}, state: ${sprint.state})\n`);
  } else {
    console.log('Fetching active sprint...');
    sprint = await fetchActiveSprint();
    isActiveSprint = true;
    console.log(`Active sprint: ${sprint.name} (ID: ${sprint.id})\n`);
  }

  console.log('Fetching non-done tickets with changelogs...');
  const issues = await fetchSprintTickets(sprint.id, isActiveSprint);
  console.log(`Found ${issues.length} non-done tickets.\n`);

  const tickets = issues.map(parseTicket);
  const workloadMap = buildWorkloadMap(tickets);

  printReport(sprint, tickets, workloadMap);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
