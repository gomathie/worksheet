-- Migration number: 0028  News/announcements
--
-- A right holder can broadcast a message to everyone, either as a plain item
-- in the News feed ('feed') or as a modal that interrupts login while it's
-- still live ('popup'). Every row carries its own expiry (expires_at) —
-- there is no "leave it up forever" option; "active" is purely a read-time
-- filter (expires_at >= today), so nothing needs a cleanup job.

CREATE TABLE news (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  body         TEXT,
  style        TEXT NOT NULL DEFAULT 'feed', -- 'feed' | 'popup'
  created_by   TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL                 -- YYYY-MM-DD, inclusive
);

-- The two lists the feature actually draws: the live feed (filtered on
-- expires_at) and, on login, the live pop-ups specifically.
CREATE INDEX idx_news_expires ON news(expires_at);
CREATE INDEX idx_news_style ON news(style, expires_at);
