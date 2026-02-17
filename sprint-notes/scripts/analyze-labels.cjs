/**
 * Analyze JIRA labels from recent sprints
 * Run with: node scripts/analyze-labels.js
 */

const fs = require('fs');
const path = require('path');

// Load .env file
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

// Simple fetch wrapper for JIRA API
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
    throw new Error(`JIRA API error: ${response.status}`);
  }

  return response.json();
}

// Fetch sprints
async function fetchSprints() {
  const boardId = 9; // Your board ID
  const data = await jiraFetch(`/rest/agile/1.0/board/${boardId}/sprint?state=closed&maxResults=5`);
  return data.values;
}

// Fetch issues for a sprint
async function fetchSprintIssues(sprintId) {
  const jql = `project = CP AND sprint = ${sprintId} AND statusCategory = Done`;
  const params = new URLSearchParams({
    jql,
    fields: 'labels',
    maxResults: '200',
  });

  const data = await jiraFetch(`/rest/api/3/search/jql?${params.toString()}`);
  return data.issues;
}

// Main analysis
async function analyzeLabels() {
  console.log('Fetching recent sprints...\n');

  const sprints = await fetchSprints();
  console.log(`Found ${sprints.length} recent closed sprints:\n`);

  sprints.forEach(sprint => {
    console.log(`  - ${sprint.name} (ID: ${sprint.id})`);
  });

  console.log('\nFetching tickets from these sprints...\n');

  const allLabels = new Set();
  let totalTickets = 0;

  for (const sprint of sprints) {
    const issues = await fetchSprintIssues(sprint.id);
    totalTickets += issues.length;

    issues.forEach(issue => {
      const labels = issue.fields.labels || [];
      labels.forEach(label => allLabels.add(label));
    });

    console.log(`  ${sprint.name}: ${issues.length} tickets`);
  }

  console.log(`\nTotal tickets analyzed: ${totalTickets}`);
  console.log(`\nUnique labels found (${allLabels.size}):\n`);

  const sortedLabels = Array.from(allLabels).sort();
  sortedLabels.forEach((label, index) => {
    console.log(`  ${index + 1}. ${label}`);
  });

  console.log('\n---\n');
  console.log('Copy this list and categorize each label as:');
  console.log('- PRODUCT: engineering, IBS, DC, PABS, etc.');
  console.log('- PLATFORM: survey, dashboard, template, Safari, etc.');
  console.log('- OTHER: (if it doesn\'t fit either category)');
}

// Run analysis
analyzeLabels().catch(console.error);
