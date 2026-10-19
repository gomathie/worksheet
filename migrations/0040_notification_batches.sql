-- Migration 0040: Batched (consolidated) notifications
--
-- Some notification kinds are informational only — nobody's approval, pay,
-- or discipline is gated on seeing them the instant they happen (see
-- BATCHABLE_KINDS in server/notify.ts). Collecting them for a short window
-- and sending one consolidated message avoids e.g. an admin getting 4
-- separate pings for 4 duplicate-card detections within the same few
-- minutes. Everything else (point deductions, approvals, payments, task
-- assignments, ...) is unaffected and still sends immediately.
--
-- One open batch per employee at a time, holding every queued item as a
-- JSON array — see server/notify.ts queueBatchedNotification and
-- flushDueNotificationBatches.

CREATE TABLE notification_batches (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  items       TEXT NOT NULL,                        -- JSON array of {kind, title, body}
  flush_at    TEXT NOT NULL,                         -- when this batch is due to be sent
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_notification_batches_employee ON notification_batches(employee_id);
CREATE INDEX idx_notification_batches_flush ON notification_batches(flush_at);
