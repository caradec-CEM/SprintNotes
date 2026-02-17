# Sprint Notes React App - Implementation Plan

## Overview

Convert the existing HTML-based sprint meeting notes tool to a React application for better JIRA integration, historical sprint navigation, and individual-focused trends for 1:1 meetings.

---

## User Requirements

| Requirement | Decision |
|-------------|----------|
| JIRA Integration | Direct API with token authentication |
| Sprint Navigation | Support viewing any historical sprint |
| Trends Focus | Individual team member metrics for 1:1s |
| Deployment | Internal server |

---

## Technology Stack

| Technology | Purpose | Bundle Size |
|------------|---------|-------------|
| Vite | Build tool, dev server | - |
| React 18 | UI framework | ~40KB |
| TypeScript | Type safety | - |
| Zustand | State management with localStorage persistence | <1KB |
| Recharts | Charting library | ~40KB |

**Total estimated bundle**: ~180KB gzipped

---

## Project Structure

```
sprint-notes/
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component, routing
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx          # App header with sprint selector
│   │   │   ├── TabBar.tsx          # Engineer tabs + overview
│   │   │   └── Section.tsx         # Collapsible section wrapper
│   │   ├── engineer/
│   │   │   ├── EngineerPanel.tsx   # Main panel for each engineer
│   │   │   ├── MetricsGrid.tsx     # Metric cards (dev pts, review pts, etc.)
│   │   │   ├── TicketTable.tsx     # Sortable ticket table
│   │   │   ├── DiscussionNotes.tsx # Textarea fields for notes
│   │   │   ├── ActionItems.tsx     # Checklist with add/delete
│   │   │   └── IndividualTrends.tsx # Per-engineer historical charts
│   │   ├── overview/
│   │   │   ├── TeamOverview.tsx    # Dashboard container
│   │   │   ├── LoadBalanceChart.tsx# Dev vs Review horizontal bars
│   │   │   └── SummaryTable.tsx    # Team summary table
│   │   └── common/
│   │       ├── Badge.tsx           # Type/Priority badges
│   │       ├── TicketLink.tsx      # JIRA link component
│   │       ├── SprintSelector.tsx  # Dropdown for sprint selection
│   │       └── LoadingSpinner.tsx
│   ├── stores/
│   │   ├── sprintStore.ts          # Current sprint data, tickets
│   │   ├── notesStore.ts           # Discussion notes, action items (persisted)
│   │   └── historyStore.ts         # Sprint history for trends
│   ├── services/
│   │   ├── jiraService.ts          # JIRA API client + data transformation
│   │   └── storageService.ts       # localStorage persistence helpers
│   ├── hooks/
│   │   ├── useEngineerData.ts      # Derived data for an engineer
│   │   ├── useIndividualTrends.ts  # Historical trends for one engineer
│   │   └── useJiraQuery.ts         # JIRA data fetching hook
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces
│   ├── config/
│   │   ├── team.ts                 # Team members, account IDs
│   │   └── jira.ts                 # JIRA cloud ID, custom field mappings
│   └── styles/
│       └── index.css               # Global styles (CSS variables)
├── public/
│   └── data/
│       └── sprint-history.json     # Cached historical data
├── .env.example                    # Environment variables template
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Data Models (TypeScript)

```typescript
// src/types/index.ts

export interface TeamMember {
  id: string;           // 'efron', 'erick', etc.
  name: string;         // Display name
  accountId: string;    // JIRA account ID
  avatarUrl?: string;
}

export interface Ticket {
  key: string;          // 'CP-3063'
  summary: string;
  type: 'Story' | 'Bug' | 'Task';
  priority: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  points: number;
  developer: string | null;   // Team member ID
  reviewer: string | null;    // Team member ID
  assignee: string | null;    // For IT tickets
  project: 'CP' | 'IT';
}

export interface SprintData {
  id: string;           // '1025'
  name: string;         // 'Engineering Sprint 54'
  date: string;         // '2026-01-18'
  tickets: Ticket[];
}

export interface EngineerMetrics {
  totalItems: number;
  devCount: number;
  reviewCount: number;
  devPts: number;
  reviewPts: number;
  itCount: number;
}

export interface SprintSummary {
  id: string;
  name: string;
  date: string;
  engineers: Record<string, EngineerMetrics>;
}

export interface DiscussionNotes {
  sprintFeedback: string;
  longerThanExpected: string;
  blockers: string;
  other: string;
}

export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
}
```

---

## JIRA Configuration

```typescript
// src/config/jira.ts

export const JIRA_CONFIG = {
  cloudId: '0d22a5f5-682a-42f5-890e-ab43691f0307',
  baseUrl: 'https://cembenchmarking.atlassian.net',

  customFields: {
    storyPoints: 'customfield_10031',
    developer: 'customfield_10124',    // User picker (multiple)
    reviewer: 'customfield_10058',      // User picker (single)
    sprint: 'customfield_10020',
  },

  // JQL templates
  queries: {
    sprintIssues: (sprintId: string) =>
      `sprint = ${sprintId} AND statusCategory = Done ORDER BY key ASC`,
    itIssues: (sprintId: string) =>
      `project = IT AND sprint = ${sprintId} AND statusCategory = Done ORDER BY key ASC`,
  },
};
```

---

## Team Configuration

```typescript
// src/config/team.ts

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'efron',
    name: 'Efron Berlian',
    accountId: '5f049c6ad6803200213ba5a3',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/5f049c6ad6803200213ba5a3/a24e42d9-2afa-4470-97b4-f5ec3d12fdf0/48',
  },
  {
    id: 'erick',
    name: 'Erick Cardiel',
    accountId: '712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c/98243a1e-d9e0-410e-b3ee-92d853310484/48',
  },
  {
    id: 'briano',
    name: 'Briano Wong',
    accountId: '712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94/4c0b8bbf-8825-44fd-8a09-d409704575d3/48',
  },
  {
    id: 'mitchell',
    name: 'Mitchell Coakley',
    accountId: '712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4/1c91c8de-65a1-4021-9601-27328cf2ac9d/48',
  },
  {
    id: 'wlad',
    name: 'Wladimir',
    accountId: '712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b',
    avatarUrl: 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b/9fcff086-8ebd-4959-a2ef-05d8d819f06a/48',
  },
];
```

---

## JIRA API Integration

### Authentication

The app will use JIRA API token authentication:

```typescript
// .env (not committed)
VITE_JIRA_EMAIL=your-email@cembenchmarking.com
VITE_JIRA_API_TOKEN=your-api-token

// src/services/jiraService.ts
const headers = {
  'Authorization': `Basic ${btoa(`${email}:${apiToken}`)}`,
  'Content-Type': 'application/json',
};
```

### API Endpoints

```typescript
// Get sprint issues
GET https://cembenchmarking.atlassian.net/rest/api/3/search
?jql=sprint = {sprintId} AND statusCategory = Done
&fields=summary,issuetype,priority,customfield_10031,customfield_10124,customfield_10058,customfield_10020

// Get available sprints (for dropdown)
GET https://cembenchmarking.atlassian.net/rest/agile/1.0/board/9/sprint
?state=closed&maxResults=20
```

### Data Transformation

```typescript
// Transform raw JIRA issue to app format
export function transformJiraIssue(raw: JiraIssueRaw, teamMembers: TeamMember[]): Ticket {
  const findMemberId = (accountId: string | null) =>
    teamMembers.find(m => m.accountId === accountId)?.id ?? null;

  const developerField = raw.fields.customfield_10124;
  const reviewerField = raw.fields.customfield_10058;

  return {
    key: raw.key,
    summary: raw.fields.summary,
    type: raw.fields.issuetype.name as TicketType,
    priority: raw.fields.priority.name as Priority,
    points: raw.fields.customfield_10031 ?? 0,
    developer: developerField?.[0]?.accountId
      ? findMemberId(developerField[0].accountId)
      : null,
    reviewer: reviewerField?.accountId
      ? findMemberId(reviewerField.accountId)
      : null,
    assignee: raw.fields.assignee?.accountId
      ? findMemberId(raw.fields.assignee.accountId)
      : null,
    project: raw.key.split('-')[0] as 'CP' | 'IT',
  };
}
```

---

## Individual Trends (1:1 Focus)

For each engineer's panel, show:

### Velocity Trend
- Line chart: Total points (dev + review) over last 6 sprints
- Helps identify workload changes

### Dev/Review Balance
- Stacked bar: Dev points vs Review points per sprint
- Shows if someone is shifting toward more reviews

### Sprint Comparison Table
- Current sprint vs previous sprint
- Delta indicators (up/down arrows)

```typescript
// src/hooks/useIndividualTrends.ts
export function useIndividualTrends(engineerId: string) {
  const history = useHistoryStore((state) => state.sprints);

  return useMemo(() => {
    const last6 = history.slice(-6);

    return {
      velocityData: last6.map(sprint => ({
        sprintId: sprint.id,
        sprintName: sprint.name,
        total: (sprint.engineers[engineerId]?.devPts ?? 0) +
               (sprint.engineers[engineerId]?.reviewPts ?? 0),
        devPts: sprint.engineers[engineerId]?.devPts ?? 0,
        reviewPts: sprint.engineers[engineerId]?.reviewPts ?? 0,
      })),

      currentVsPrevious: {
        current: last6[last6.length - 1]?.engineers[engineerId],
        previous: last6[last6.length - 2]?.engineers[engineerId],
      },
    };
  }, [history, engineerId]);
}
```

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Initialize Vite + React + TypeScript
- [ ] Install dependencies (zustand, recharts)
- [ ] Set up folder structure
- [ ] Create TypeScript interfaces
- [ ] Create config files (team, jira)
- [ ] Port CSS variables and base styles

### Phase 2: State Management
- [ ] Create `sprintStore` (current sprint data)
- [ ] Create `notesStore` with localStorage persistence
- [ ] Create `historyStore` for trend data

### Phase 3: JIRA Service
- [ ] Create JIRA API client with auth
- [ ] Implement issue transformation
- [ ] Add sprint list fetching
- [ ] Error handling and loading states

### Phase 4: Layout Components
- [ ] Header with sprint selector dropdown
- [ ] TabBar for engineer navigation
- [ ] Collapsible Section wrapper

### Phase 5: Engineer Panel
- [ ] EngineerPanel container
- [ ] MetricsGrid (6 metric cards)
- [ ] TicketTable with sorting
- [ ] DiscussionNotes (4 textareas)
- [ ] ActionItems (add/delete/check)
- [ ] IndividualTrends (velocity + balance charts)

### Phase 6: Team Overview
- [ ] TeamOverview container
- [ ] LoadBalanceChart (horizontal bars)
- [ ] SummaryTable

### Phase 7: Polish
- [ ] Loading spinners
- [ ] Error states
- [ ] Print styles
- [ ] Keyboard navigation

---

## Environment Setup

```bash
# .env.example
VITE_JIRA_EMAIL=your-email@cembenchmarking.com
VITE_JIRA_API_TOKEN=your-jira-api-token
VITE_JIRA_CLOUD_ID=0d22a5f5-682a-42f5-890e-ab43691f0307
```

---

## Commands

```bash
# Create project
npm create vite@latest sprint-notes -- --template react-ts
cd sprint-notes

# Install dependencies
npm install zustand recharts

# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Migration from Current HTML

The current `notes/sprint-history.json` contains valid data that can be imported directly into the React app's `historyStore`. The format is already compatible:

```json
{
  "sprints": [
    {
      "id": "924",
      "name": "Engineering Sprint 50",
      "date": "2025-11-23",
      "engineers": {
        "efron": { "devPts": 29.5, "reviewPts": 0, "devCount": 17, "reviewCount": 2, "itCount": 7 },
        ...
      }
    }
  ]
}
```

---

## Notes

- **IT tickets use `assignee`** field, not Developer custom field
- **JQL must use `statusCategory = Done`** (not `status = Done`) to capture all completed statuses
- **Sprint history currently covers**: Sprints 50-54 (924, 925, 958, 991, 1025)
