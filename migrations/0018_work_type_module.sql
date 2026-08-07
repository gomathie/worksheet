-- Migration number: 0018  Group work types into modules
--
-- Classification and QAP are not two unrelated work types that happen to be
-- logged as cards — they are one body of work, done by the same people with
-- the same cards, and the card flow only ever made sense for them. Naming that
-- grouping lets the interface say "Data Analytics" instead of listing two
-- types that the reader has to know belong together.
--
-- A plain nullable column rather than a modules table: a module is a label on
-- a work type, not a thing with its own properties, and nothing yet needs to
-- attach staffing or permissions to one. A table can come later if it does.

ALTER TABLE work_types ADD COLUMN module TEXT;

-- The card-based types are what prompted this, so they seed the first module.
-- Anything else stays unassigned and behaves exactly as before.
UPDATE work_types SET module = 'Data Analytics' WHERE card_based = 1;

CREATE INDEX idx_work_types_module ON work_types(module);
