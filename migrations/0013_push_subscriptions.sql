-- Migration number: 0013  Web Push subscriptions
--
-- Browser push endpoints, one row per device per employee. Somebody signed in
-- on a phone and a laptop has two.
--
-- The VAPID keypair lives in `settings` (vapid_public_key / vapid_private_key)
-- and is generated on first use — see server/push.ts.
--
-- Pushes are sent WITHOUT a payload: the service worker wakes, fetches
-- /api/notifications, and shows the newest unread. That avoids implementing
-- the aes128gcm payload encryption, and means nothing sensitive ever passes
-- through the push service.

CREATE TABLE push_subscriptions (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  -- A failing endpoint is retired rather than deleted, so a device that comes
  -- back can be told apart from one that never subscribed.
  failed_at    TEXT
);

-- The endpoint URL is the device identity; re-subscribing must not duplicate.
CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions(endpoint);
CREATE INDEX idx_push_employee ON push_subscriptions(employee_id, failed_at);
