# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
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
