-- Migration number: 0005  Per-employee custom rates
--
-- An employee's work-type assignment may carry its own points_per_unit.
-- NULL means "use the work type's general rate". Overrides apply wherever
-- points are computed (dashboard, reports, payments).

ALTER TABLE employee_work_types ADD COLUMN points_per_unit REAL;
