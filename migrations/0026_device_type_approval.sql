-- Migration number: 0026  Device type proposals need admin approval
--
-- Anyone assigned to an installation-style work type (currently Telematics
-- Installation) can propose a new device type from the entry form; it lands
-- 'pending' — inactive and invisible outside the approval queue — until an
-- admin approves it. Mirrors the existing pending-employee-account pattern
-- (employees.approval_status / created_by / approved_by / approval_note)
-- exactly. Existing rows and anything an admin adds directly default to
-- 'approved', so today's behaviour is unchanged.

ALTER TABLE device_types ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE device_types ADD COLUMN created_by TEXT REFERENCES employees(id);
ALTER TABLE device_types ADD COLUMN approved_by TEXT REFERENCES employees(id);
ALTER TABLE device_types ADD COLUMN approved_at TEXT;
ALTER TABLE device_types ADD COLUMN approval_note TEXT;

CREATE INDEX idx_device_types_approval ON device_types(approval_status);
