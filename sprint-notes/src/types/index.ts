// Team member configuration
export interface TeamMember {
  id: string;           // 'efron', 'erick', etc.
  name: string;         // Display name
  accountId: string;    // JIRA account ID
  avatarUrl?: string;
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
  reviewer: string | null;     // DEPRECATED: Use reviewers[0] for backwards compat
  reviewerName: string | null; // DEPRECATED: Use reviewerNames[0]
  assignee: string | null;    // For IT tickets
  project: Project;
  labels: string[];
  categorizedLabels: CategorizedLabels;
  inProgressDuration?: StatusDuration;
  inReviewDuration?: StatusDuration;
  pointChange?: PointChange;
  isCarryOver?: boolean;
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

// Sprint summary for history/trends
export interface SprintSummary {
  id: string;
  name: string;
  date: string;
  engineers: Record<string, EngineerMetrics>;
  // Team-level totals (not derived from engineer metrics)
  totalPoints?: number;
  totalTickets?: number;
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

export interface StatusDuration {
  days: number;       // Business days (weekdays only)
  isActive: boolean;  // Currently in this status
}

export interface PointChange {
  from: number;
  to: number;
}

// Raw JIRA API response types
export interface JiraIssueRaw {
  key: string;
  fields: {
    summary: string;
    issuetype: { name: string };
    priority: { name: string };
    assignee: { accountId: string; displayName: string } | null;
    labels: string[] | null;
    customfield_10031: number | null;  // Story Points
    customfield_10124: Array<{ accountId: string; displayName: string }> | null;  // Developer (multiple)
    customfield_10058: { accountId: string; displayName: string } | Array<{ accountId: string; displayName: string }> | null;  // Reviewer (can be single or multiple)
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
