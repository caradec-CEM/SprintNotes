# 1:1 Meeting Notes Generator - Reference

This document captures everything needed to generate sprint summary meeting notes for team 1:1s.

---

## Output Format

**HTML** - Single file per sprint with tabbed interface for all engineers
- File pattern: `notes/YYYY-MM-DD-sprint-{sprintId}.html`
- Open in any browser
- Clickable JIRA links
- Collapsible sections
- Editable notes fields with localStorage persistence
- Print-friendly

---

## Atlassian Configuration

**Cloud ID:** `0d22a5f5-682a-42f5-890e-ab43691f0307`
**Site:** `cembenchmarking.atlassian.net`
**JIRA Browse URL:** `https://cembenchmarking.atlassian.net/browse/{key}`

---

## Team Members

| Name | Account ID | Tab Name |
|------|------------|----------|
| Efron Berlian | `5f049c6ad6803200213ba5a3` | efron |
| Erick Cardiel | `712020:c91669a4-f150-4813-8cc4-cc6fa9268e6c` | erick |
| Briano Wong | `712020:4face9ec-7263-4a4a-b17f-7aeb6e193b94` | briano |
| Mitchell Coakley | `712020:f80c8d0c-49d2-4d27-b466-8bb895423ff4` | mitchell |
| Wladimir | `712020:41dd83fb-84ca-4faa-bff5-eeede73d9a0b` | wlad |

---

## JIRA Custom Fields

| Field | ID | Purpose | Data Type |
|-------|-----|---------|-----------|
| Story Points | `customfield_10031` | Effort estimate | Numeric |
| Developer | `customfield_10124` | Person who did the work | User picker (array) |
| Reviewer | `customfield_10058` | Code reviewer | User picker (single) |
| Sprint | `customfield_10020` | Sprint info | Array with name, id, state |

---

## Role Determination Logic

For each issue, determine the engineer's role:

1. **As Developer**: Engineer's account ID appears in `customfield_10124` array
   - Story points count toward their total
2. **As Reviewer**: Engineer's account ID matches `customfield_10058.accountId`
   - No points counted, just issue count
3. **As Assignee** (fallback): If neither developer nor reviewer fields contain the engineer

---

## Project Classification

| Project Key | Category | Display | Role Field |
|-------------|----------|---------|------------|
| CP | Product Development | CP - Product Development | Developer (customfield_10124) |
| IT | IT Helpdesk/Support | IT - Helpdesk | Assignee |

**Note:** CP issues use the Developer custom field to track who did the work. IT issues use the standard Assignee field instead.

---

## Issue Types

| Type | Badge Class |
|------|------------|
| Story | `badge-story` (green) |
| Bug | `badge-bug` (red) |
| Task | `badge-task` (cyan) |

## Priority Levels

| Priority | Badge Class |
|----------|------------|
| Highest | `badge-highest` (red) |
| High | `badge-high` (orange) |
| Medium | `badge-medium` (yellow) |
| Low | `badge-low` (green) |

---

## JQL Query Template

To get all issues for a sprint:
```
Sprint = {sprintId} AND statusCategory = Done ORDER BY priority DESC, key ASC
```

**Important:** Use `statusCategory = Done` (not `status = Done`) to capture all completed statuses:
- Done
- Will Not Implement
- Deployed to Staging
- Live

Fields to request:
```json
["summary", "issuetype", "priority", "customfield_10031", "customfield_10124", "customfield_10058", "customfield_10020"]
```

---

## HTML Features

### Tabs
- One tab per engineer
- Shows story points in tab badge
- Click to switch between engineers

### Metrics Cards
- Total Items
- As Developer (count)
- As Reviewer (count)
- Story Points (developer work only)

### Ticket Sections
- CP - Product Development (expanded by default)
- IT - Helpdesk (collapsed by default)
- Each ticket links directly to JIRA
- Shows type, priority, role, and points badges

### Discussion Notes
- Sprint Feedback
- What took longer than expected?
- Blockers
- Anything else?

### Action Items
- Checkbox + text field
- Add more with button
- All data persists to localStorage

### localStorage
- Key: `meeting-notes-{sprintId}`
- Saves: textarea values, action items (text + checked state)
- Auto-loads on page open

---

## Workflow Steps

1. **Identify sprint** - Get sprint ID and name from JIRA
2. **Query issues** - Use JQL to get all Done issues in sprint with custom fields
3. **Process per engineer:**
   - Filter issues where they appear as developer or reviewer
   - Count by role
   - Sum story points for developer work
   - Count by type (Story/Bug/Task)
   - Group by project (CP vs IT)
4. **Generate HTML** - Create single HTML file with all engineers as tabs
5. **Save file** - Write to `notes/YYYY-MM-DD-sprint-{sprintId}.html`

---

## Sprint History

| Sprint ID | Sprint Name | Date | File |
|-----------|-------------|------|------|
| 1025 | Engineering Sprint 54 | 2026-02-03 | `2026-02-03-sprint-1025.html` |

---

## Notes

- IT project issues typically don't have story points
- Some issues may span multiple sprints (appear in customfield_10020 array)
- Issues with 0 or null points are counted but contribute 0 to totals
- localStorage persists notes between browser sessions
- Print view shows all engineers (removes tabs)
