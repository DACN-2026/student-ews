-- Source academic terms may have no start_date. The configured current term
-- then determines whether a signed future leave/return can affect live scope.
ALTER TABLE student_study_suspensions
  ADD COLUMN from_calendar_active boolean NOT NULL DEFAULT false,
  ADD COLUMN return_calendar_active boolean NOT NULL DEFAULT false;
