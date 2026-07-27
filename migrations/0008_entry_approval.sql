-- Migration number: 0008  Entry approval workflow (opt-in)
--
-- entries.status: 'approved' | 'pending' | 'rejected'. Only 'approved'
-- entries count toward pay, reports, and trends. Existing rows default to
-- 'approved' so nothing changes retroactively.
-- settings 'require_entry_approval': '0' (off) | '1' (on). When on, entries
-- logged by employees start 'pending'; admin-logged entries are auto-approved.

ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
CREATE INDEX idx_entries_status ON entries(status);

INSERT OR IGNORE INTO settings (key, value) VALUES ('require_entry_approval', '0');
