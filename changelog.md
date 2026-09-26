# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Feature: Data Analytics Module Grouping
  - Employees assigned to any task within the "Data Analytics" module (like QAP or Classification) automatically gain visibility and access to all other tasks in that same module.
  - This applies seamlessly across the Time Entry page, Dashboard, and Reports, grouping these related tasks together.
- Feature: Time Entry Work-Type Scoping
  - The entries history table and CSV export now filter out work type columns that the standard user is not assigned to, matching the dashboard behavior.
  - Ensures users not assigned to specific tasks like QAP or Classifications don't see those columns on the time entry page.
- Feature: Task Age Alerts
  - Added a popup warning for tasks pending for more than 2 days, warning users that it will affect their payment.
  - Added a critical popup for tasks pending for more than 3 days, warning that the task is scheduled for deletion/reassignment and will affect finances/payment.
  - The alert shows once per day (dismissable) and lists the old tasks.
  - Added a "Working on it" button to tasks in progress, allowing users to bump the task's `updated_at` timestamp and reset the age warnings without changing the status.
- Feature: Additional Assignee / Observer for Tasks
  - Tasks can now have an optional secondary person assigned.
  - The secondary person can either be an "Additional Assignee" (responsible for progress) or an "Observer" (can view/follow but not responsible).
  - Backend validation ensures the primary and secondary persons cannot be the same employee.
  - Dashboards, task lists, and notifications correctly incorporate the secondary person.
- Feature: Custom Author for Announcements/Pop-ups
  - Added a "From whom" input to the announcement creation form, allowing senders to specify an entity like "Management" or "System".
  - Created a database migration to store `author_name`, which defaults to "System" if left blank.
  - Updated News feed and Pop-ups to display the author's name prominently.
- Feature: QAP and Classification Entry Limit Popup
  - Displays a popup warning when a user attempts to add a 11th QAP or Classification card in a single session, prompting them to pause for 10 minutes. The warning interchangeably mentions "Spvsr. BinitaVh" or "Spvsr William Lee".

- Feature: Work-Type Scoped Dashboard and Reports (Branch: `feature/work-type-scoped-dashboard`)
  - Server-side filtering to strip out work-type data a user is not assigned to (for non-admin users).
  - Client-side filtering in Dashboard and Report views as a UI-level safety net to hide unassigned columns and metrics.
