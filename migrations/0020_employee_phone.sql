-- Migration number: 0020  Employee phone number, for SMS notifications
--
-- Optional; SMS delivery is skipped for anyone without one, same as email.
-- Stored as entered by the admin (e.g. local format like 0241234567) — the
-- mNotify client does light digit-only cleanup, no reformatting.

ALTER TABLE employees ADD COLUMN phone TEXT;
