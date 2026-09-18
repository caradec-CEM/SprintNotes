// Team member configuration
export interface TeamMember {
  id: string;           // 'efron', 'erick', etc.
  name: string;         // Display name
  accountId: string;    // JIRA account ID
  avatarUrl?: string;
  active: boolean;      // false = former member (hide from current-sprint UI, keep for historical data)
  role: 'engineer' | 'admin'; // 'admin' = on roster, work counted, but excluded from capacity denominator
}

// Ticket types
export type TicketType = 'Story' | 'Bug' | 'Task';
export type Priority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
export type Project = 'CP' | 'IT';

export interface CategorizedLabels {
  product: string[];    // Engineering, IBS, PABS
  platform: string[];   // Survey, Dashboard, Template Safari, etc.
  misc: string[];       // AI, Hotfix, Late, On-Time, Recurring
}

export interface Ticket {
  key: string;          // 'CP-3063'
  summary: string;
  type: TicketType;
  priority: Priority;
  points: number;
  developers: string[];        // Team member IDs (can be multiple)
  developerNames: string[];    // Display names
  developer: string | null;    // DEPRECATED: Use developers[0] for backwards compat
  developerName: string | null; // DEPRECATED: Use developerNames[0]
  reviewers: string[];         // Team member IDs (can be multiple, includes changelog)
  reviewerNames: string[];     // Display names
  fieldReviewers: string[];    // Reviewers from JIRA Reviewer field only (no changelog)
  reviewer: string | null;     // DEPRECATED: Use reviewers[0] for backwards compat
  reviewerName: string | null; // DEPRECATED: Use reviewerNames[0]
  assignee: string | null;    // For IT tickets
  project: Project;
  status?: string;
  labels: string[];
  categorizedLabels: CategorizedLabels;
  inProgressDuration?: StatusDuration;
  inReviewDuration?: StatusDuration;
  pointChange?: PointChange;
  changelog?: ChangelogEntry[];
  isCarryOver?: boolean;    // Came INTO this sprint from an earlier one
  carriedForward?: boolean; // Was in this sprint but moved OUT to a later sprint (unfinished here)
  // Participants from JIRA whose accountId isn't in the team roster — surfaced
  // by the Team Settings "Detect from current sprint" feature so new members
  // can be added without manual accountId lookup.
  unknownParticipants?: Array<{ accountId: string; displayName: string; role: 'developer' | 'reviewer' | 'assignee'; avatarUrl?: string }>;
}

// Sprint data
export interface Sprint {
  id: string;           // '1025'
  name: string;         // 'Engineering Sprint 54'
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
}

export interface SprintData {
  id: string;
  name: string;
  date: string;         // End date
  startDate?: string;
  tickets: Ticket[];
}

// Metrics calculated per engineer
export interface EngineerMetrics {
  totalItems: number;
  devCount: number;
  reviewCount: number;
  devPts: number;
  reviewPts: number;
  itCount: number;
  avgInProgressHours?: number;
  avgInReviewHours?: number;
}

// Historical duration baseline per point size
export interface DurationBaseline {
  count: number;       // how many tickets at this point size
  totalDays: number;   // sum of in-progress days
  median: number;      // median in-progress days
}

// Sprint summary for history/trends
export interface SprintSummary {
  id: string;
  name: string;
  date: string;
  engineers: Record<string, EngineerMetrics>;
  // Team-level totals (not derived from engineer metrics)
  totalPoints?: number;
  totalTickets?: number;
  durationBaselines?: Record<number, DurationBaseline>;  // keyed by point value
}

export interface SprintHistory {
  sprints: SprintSummary[];
}

// Sprint-level capacity settings (team holidays, sprint length variations)
export interface SprintCapacity {
  defaultWorkingDays: number;   // Standard sprint length (default: 10)
  teamHolidays: number;         // Days the whole team is off (holidays, company days)
  effectiveSprintDays: number;  // defaultWorkingDays - teamHolidays
}

// Engineer time off tracking
export interface EngineerTimeOff {
  ptoDays: number;      // Days of PTO/vacation
  workingDays: number;  // effectiveSprintDays - ptoDays
}

// Notes and action items
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

export interface EngineerNotes {
  discussion: DiscussionNotes;
  actionItems: ActionItem[];
}

// Per-sprint notes storage keyed by engineer ID
export interface SprintNotes {
  sprintId: string;
  lastModified: number;
  engineers: Record<string, EngineerNotes>;
  timeOff?: Record<string, EngineerTimeOff>;  // engineerId -> timeOff
  capacity?: SprintCapacity;                   // sprint-level capacity settings
}

// JIRA Changelog types
export interface JiraChangelogItem {
  field: string;
  fieldtype: string;
  fromString: string | null;
  toString: string | null;
}

export interface JiraChangelogHistory {
  id: string;
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraChangelog {
  startAt: number;
  maxResults: number;
  total: number;
  histories: JiraChangelogHistory[];
}

export interface StatusSpan {
  entered: string;    // ISO date of entering the status
  exited: string | null; // ISO date of exiting (null if still active)
  days: number;       // Business days for this span
}

export interface StatusDuration {
  days: number;       // Business days (weekdays only)
  isActive: boolean;  // Currently in this status
  spans: StatusSpan[];  // Individual time spans in this status
}

export interface PointChange {
  from: number;
  to: number;
}

export interface ChangelogEntry {
  timestamp: string;          // ISO date
  field: string;              // "status", "Story Points", "priority", etc.
  from: string | null;        // Human-readable previous value
  to: string | null;          // Human-readable new value
}

// Raw JIRA API response types
// JIRA user objects carry an avatarUrls map keyed by pixel size.
export interface JiraUserRaw {
  accountId: string;
  displayName: string;
  avatarUrls?: Record<string, string>;  // e.g. { "48x48": "...", "32x32": "..." }
}

export interface JiraIssueRaw {
  key: string;
  fields: {
    summary: string;
    status?: { name: string; statusCategory?: { name: string } };
    issuetype: { name: string };
    priority: { name: string };
    assignee: JiraUserRaw | null;
    labels: string[] | null;
    customfield_10031: number | null;  // Story Points
    customfield_10124: JiraUserRaw[] | null;  // Developer (multiple)
    customfield_10058: JiraUserRaw | JiraUserRaw[] | null;  // Reviewer (can be single or multiple)
    customfield_10020: Array<{ id: number; name: string }> | null;  // Sprint
    resolutiondate: string | null;
  };
  changelog?: JiraChangelog;
}

export interface JiraSprintRaw {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

// A mid-sprint change to the committed scope, attributed to a day
export interface ScopeChange {
  key: string;                                  // ticket key
  kind: 'added' | 'removed' | 'repointed';
  delta: number;                                // signed points change to scope
  from?: number;                                // repoint: old points
  to?: number;                                  // repoint: new points
}

// Burn-up chart: one point per calendar day of the sprint
export interface BurnUpPoint {
  date: string;      // YYYY-MM-DD
  label: string;     // e.g. "Jun 3"
  scope: number;     // total committed points in the sprint as of this day (dynamic)
  completed: number; // cumulative points completed by this day
  isToday?: boolean; // marks the current day (active sprints)
  scopeChanges?: ScopeChange[]; // tickets added/removed/re-pointed on this day
}

// Trend data for charts
export interface VelocityDataPoint {
  sprintId: string;
  sprintName: string;
  total: number;
  devPts: number;
  reviewPts: number;
  capacityPercent: number;
  normalizedTotal: number | null;
}

export interface TrendData {
  velocityData: VelocityDataPoint[];
  currentVsPrevious: {
    current: EngineerMetrics | undefined;
    previous: EngineerMetrics | undefined;
  };
}
