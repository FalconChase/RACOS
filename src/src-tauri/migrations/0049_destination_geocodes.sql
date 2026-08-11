-- Caches a booking destination's resolved coordinates so Map > Destination
-- history never re-geocodes the same municipality/province twice. Same
-- provider and rate-limit spirit as gps_location_labels (0030) — Nominatim,
-- free, no key — but the opposite direction: forward geocoding a place name
-- into coordinates instead of reverse-geocoding coordinates into a name.
-- Purely a rebuildable cache derived from municipalities/provinces (both
-- global reference data), so this is local-only — never queued to the
-- outbox, unlike gps_location_labels.
--
-- location_key is destination_city_id when a specific municipality was
-- picked, or 'province:{province_id}' when the booking only ever set a
-- province — see lib/repo/destinationGeocodes.ts buildLocationKey, the one
-- place that key format is defined.
create table destination_geocodes (
  business_id text not null,
  location_key text not null,
  province_id text not null,
  municipality_id text,
  display_name text not null,
  latitude real not null,
  longitude real not null,
  raw_response text,
  resolved_at text not null,
  primary key (business_id, location_key)
);
