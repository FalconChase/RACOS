-- ROP011 follow-up — "Record through MAP" trail recorder. Coordinates are
-- kept as real structured numeric columns (not just parsed out of
-- location_text) specifically so a future location-processing feature has
-- clean data to work with. Manual entries leave these null; map-recorded
-- entries fill both alongside a coordinate-string location_text.

alter table public.gps_location_entries
  add column latitude  double precision,
  add column longitude double precision,
  add constraint gps_location_entries_lat_lng_pair check ((latitude is null) = (longitude is null));
