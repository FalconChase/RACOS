-- Flips the DateTimePicker minute-dial default from 15 to 5 minutes.
-- app_settings is a single local row (id = 1) created back in migration
-- 0003, not something a fresh insert ever recreates, so existing installs
-- need this explicit update rather than relying on 0052's column default —
-- same reasoning as 0034's show_remittance_summary flip. Only touches rows
-- still sitting at the old default (15), so a device that already
-- deliberately picked 15 in Settings keeps that choice.
update app_settings set time_step_minutes = 5 where id = 1 and time_step_minutes = 15;
