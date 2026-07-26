-- Device-level app preferences (date/time display format). Single row, not
-- synced to Supabase — this is a per-device UI preference, not tenant data.
create table app_settings (
  id integer primary key check (id = 1),
  date_format text not null default 'MDY' check (date_format in ('MDY', 'DMY', 'ISO')),
  time_format text not null default '12h' check (time_format in ('12h', '24h'))
);

insert into app_settings (id) values (1);
