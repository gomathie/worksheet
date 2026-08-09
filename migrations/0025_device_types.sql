-- Migration number: 0025  Device types become admin-managed, plus the
-- replaced device on a replacement job
--
-- Device makes (Teltonika, Concox, ...) move from a fixed list in code to an
-- admin-managed table, same pattern as departments and work types — so a
-- newly-carried brand can be added without a deploy.
--
-- `entry_cards.device_type` continues to mean "what's installed now" (kept
-- as-is, still a TEXT id — the seed rows below reuse the same slugs, so no
-- existing row needs rewriting). A replacement job additionally records
-- `replaced_device_type`: the faulty unit that came out. Together they let
-- reporting answer "which makes fail most often, and what replaces them" —
-- NULL for a new install, where nothing was removed.

CREATE TABLE device_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_device_types_name ON device_types(name);

INSERT INTO device_types (id, name, position) VALUES
  ('teltonika', 'Teltonika', 0),
  ('concox', 'Concox', 1),
  ('istartek', 'iStartek', 2),
  ('calamp', 'Calamp', 3);

ALTER TABLE entry_cards ADD COLUMN replaced_device_type TEXT;
