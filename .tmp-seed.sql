INSERT INTO entries (id, employee_id, work_date, time_start, time_end, hours, notes, status) VALUES
  ('tmpchart-aug1', 'df6374f5-f09b-456a-8945-e6d19aba7a86', '2026-08-05', '08:00', '16:00', 8, 'tmp chart check', 'approved'),
  ('tmpchart-aug2', 'df6374f5-f09b-456a-8945-e6d19aba7a86', '2026-08-19', '08:00', '16:00', 8, 'tmp chart check', 'approved'),
  ('tmpchart-sep1', 'df6374f5-f09b-456a-8945-e6d19aba7a86', '2026-09-09', '08:00', '14:00', 6, 'tmp chart check', 'approved'),
  ('tmpchart-oct1', 'df6374f5-f09b-456a-8945-e6d19aba7a86', '2026-10-07', '08:00', '12:00', 4, 'tmp chart check', 'approved');
INSERT INTO entry_items (entry_id, work_type_id, units) VALUES
  ('tmpchart-aug1', 'wt-classification', 12), ('tmpchart-aug2', 'wt-classification', 8),
  ('tmpchart-sep1', 'wt-classification', 18), ('tmpchart-sep1', 'wt-qap', 6),
  ('tmpchart-oct1', 'wt-classification', 5), ('tmpchart-oct1', 'wt-qap', 3);
