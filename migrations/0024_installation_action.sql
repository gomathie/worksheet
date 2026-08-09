-- Migration number: 0024  Installation action (new install vs. replacement)
--
-- Besides new installs, telematics work also covers swapping out a device
-- that has failed — same device makes either way, but worth distinguishing:
-- a month of replacements says something different than a month of new
-- installs at the same total count. See shared/installations.ts.

ALTER TABLE entry_cards ADD COLUMN installation_action TEXT;
