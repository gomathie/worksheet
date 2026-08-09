-- Migration number: 0023  Installation-style cards (device type per job)
--
-- "Telematics Installation" moves from a plain daily count to per-job cards,
-- like Classification/QAP, since each install needs its own type — and for
-- a telematics device, its own device make. Cards for this work type reuse
-- the entry_cards table (card_name/total_audits/time_completed get sensible
-- fixed values rather than becoming nullable) but are excluded from the
-- audit-style duplicate-clash checks: installing three Teltonika units in a
-- day is normal, not a repeat the way logging "Boost_us" twice is.

ALTER TABLE entry_cards ADD COLUMN installation_type TEXT;
ALTER TABLE entry_cards ADD COLUMN device_type TEXT;

-- 'audit' (Classification/QAP-style: name + total audits + time, duplicate
-- checked) | 'installation' (type + device, never duplicate-checked).
ALTER TABLE work_types ADD COLUMN card_style TEXT NOT NULL DEFAULT 'audit';

UPDATE work_types SET card_based = 1, card_style = 'installation'
  WHERE name = 'Telematics Installation';
