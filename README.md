# CPMIS

Frontend-only Construction Project Management Information System for Vertexa Group.

There is no database and no authentication. One Node process serves every portal and they share one in-memory store. Changes last until you stop that process. Restarting the server restores the sample records.

The preview clock is 6 Nov 2026. Money is RWF. Each portal opens already signed in as one person:

| Portal | Who | Scope |
| --- | --- | --- |
| Administrator | Amina Uwase | Whole company |
| Project manager | Sarah Mukamana | Projects she manages |
| Site engineer | Lydia Mukeshimana | KGL-CGT-25 only |
| Quantity surveyor | David Nshimiyimana | KGL-CGT-25 only |

## Run

```bash
npm install
npm run dev
```

- Administrator: http://localhost:3000/admin
- Project manager: http://localhost:3001/pm
- Site engineer: http://localhost:3002/se
- Quantity surveyor: http://localhost:3003/qs

If a port is taken, that portal steps up by 10 (3000, then 3010, then 3020) until it binds. The URL it actually bound is printed at startup. Links between portals follow those ports.

## Administrator

Portfolio dashboard, projects, document register, users, employees, reports, tasks, activity logs, notifications, and organization settings. Creating a project, user, employee, or document posts into the shared store, so the other portals see it on their next load.

## Project manager

Dashboard for Sarah’s projects. Today, Daily, Weekly, and Monthly filter the task board. Saved progress from the Progress page is drawn on the dashboard chart. Add event asks for a calendar date, then a name and whether it is a meeting or another event. Save marks that day.

Schedule opens the programme for the project picked in the dropdown. Month, Week, Daily, and Hourly change the scale. Daily and Hourly scroll to 6 Nov 2026.

Tasks can be assigned. Engineer reports can be opened, approved, or rejected. Cost reports can be edited, saved, submitted to the administrator, or saved as a PDF of the figures on the form. The quantity surveyor does not submit that cost report.

## Site engineer

Today’s site for Lydia on KGL-CGT-25. File today’s report opens the shift for 6 Nov 2026: progress, what happened, issues, and up to four photos. Filing it puts the report in history and notifies the project manager. Rejected reports can be resubmitted from history. Assigned tasks take a progress update.

## Quantity surveyor

Bill of quantities, measured expenditure, and the financial statement for KGL-CGT-25. Notices on that project show here. The project manager is the one who submits the cost report.
