-- Migration number: 0012  Card-based work types (Classification & QAP)
--
-- Card-based work types are logged as individual cards (card name, total
-- audits, time completed) instead of a typed count. The unit count for such a
-- type equals the number of cards of that type on the entry; entry_items still
-- stores that derived count, so all reporting/points logic is unchanged.
-- Employees granted the 'direct_counts' right may type the number directly.

ALTER TABLE work_types ADD COLUMN card_based INTEGER NOT NULL DEFAULT 0;
UPDATE work_types SET card_based = 1 WHERE id IN ('wt-classification', 'wt-qap');

CREATE TABLE entry_cards (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  work_type_id   TEXT NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  card_name      TEXT NOT NULL,
  total_audits   INTEGER NOT NULL DEFAULT 0,
  time_completed TEXT,                    -- HH:MM (or free text), optional
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_cards_entry ON entry_cards(entry_id);
CREATE INDEX idx_entry_cards_type ON entry_cards(work_type_id);
