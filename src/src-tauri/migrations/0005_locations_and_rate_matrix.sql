-- Rate Matrix: destination-tier x seating-capacity based pricing.
--
-- provinces — global geographic reference (82 Philippine provinces + NCR, which
-- has no provinces of its own but still needs a destination entry). Used to
-- classify a booking's destination against the business's HQ province into a
-- pricing tier:
--   Tier 1 — same province as HQ ("within province")
--   Tier 2 — different province, same region as HQ ("within region")
--   Tier 3 — different region ("outside region" / interisland)
-- Not business-scoped — this is a fixed shared reference list, same for everyone.
create table provinces (
  id text primary key,
  name text not null,
  region_name text not null
);

insert into provinces (id, name, region_name) values
  ('ncr', 'Metro Manila (NCR)', 'NCR'),
  ('abra', 'Abra', 'CAR'),
  ('apayao', 'Apayao', 'CAR'),
  ('benguet', 'Benguet', 'CAR'),
  ('ifugao', 'Ifugao', 'CAR'),
  ('kalinga', 'Kalinga', 'CAR'),
  ('mountain-province', 'Mountain Province', 'CAR'),
  ('ilocos-norte', 'Ilocos Norte', 'Region I (Ilocos Region)'),
  ('ilocos-sur', 'Ilocos Sur', 'Region I (Ilocos Region)'),
  ('la-union', 'La Union', 'Region I (Ilocos Region)'),
  ('pangasinan', 'Pangasinan', 'Region I (Ilocos Region)'),
  ('batanes', 'Batanes', 'Region II (Cagayan Valley)'),
  ('cagayan', 'Cagayan', 'Region II (Cagayan Valley)'),
  ('isabela', 'Isabela', 'Region II (Cagayan Valley)'),
  ('nueva-vizcaya', 'Nueva Vizcaya', 'Region II (Cagayan Valley)'),
  ('quirino', 'Quirino', 'Region II (Cagayan Valley)'),
  ('aurora', 'Aurora', 'Region III (Central Luzon)'),
  ('bataan', 'Bataan', 'Region III (Central Luzon)'),
  ('bulacan', 'Bulacan', 'Region III (Central Luzon)'),
  ('nueva-ecija', 'Nueva Ecija', 'Region III (Central Luzon)'),
  ('pampanga', 'Pampanga', 'Region III (Central Luzon)'),
  ('tarlac', 'Tarlac', 'Region III (Central Luzon)'),
  ('zambales', 'Zambales', 'Region III (Central Luzon)'),
  ('batangas', 'Batangas', 'Region IV-A (CALABARZON)'),
  ('cavite', 'Cavite', 'Region IV-A (CALABARZON)'),
  ('laguna', 'Laguna', 'Region IV-A (CALABARZON)'),
  ('quezon', 'Quezon', 'Region IV-A (CALABARZON)'),
  ('rizal', 'Rizal', 'Region IV-A (CALABARZON)'),
  ('marinduque', 'Marinduque', 'MIMAROPA'),
  ('occidental-mindoro', 'Occidental Mindoro', 'MIMAROPA'),
  ('oriental-mindoro', 'Oriental Mindoro', 'MIMAROPA'),
  ('palawan', 'Palawan', 'MIMAROPA'),
  ('romblon', 'Romblon', 'MIMAROPA'),
  ('albay', 'Albay', 'Region V (Bicol Region)'),
  ('camarines-norte', 'Camarines Norte', 'Region V (Bicol Region)'),
  ('camarines-sur', 'Camarines Sur', 'Region V (Bicol Region)'),
  ('catanduanes', 'Catanduanes', 'Region V (Bicol Region)'),
  ('masbate', 'Masbate', 'Region V (Bicol Region)'),
  ('sorsogon', 'Sorsogon', 'Region V (Bicol Region)'),
  ('aklan', 'Aklan', 'Region VI (Western Visayas)'),
  ('antique', 'Antique', 'Region VI (Western Visayas)'),
  ('capiz', 'Capiz', 'Region VI (Western Visayas)'),
  ('guimaras', 'Guimaras', 'Region VI (Western Visayas)'),
  ('iloilo', 'Iloilo', 'Region VI (Western Visayas)'),
  ('negros-occidental', 'Negros Occidental', 'NIR (Negros Island Region)'),
  ('negros-oriental', 'Negros Oriental', 'NIR (Negros Island Region)'),
  ('siquijor', 'Siquijor', 'NIR (Negros Island Region)'),
  ('bohol', 'Bohol', 'Region VII (Central Visayas)'),
  ('cebu', 'Cebu', 'Region VII (Central Visayas)'),
  ('biliran', 'Biliran', 'Region VIII (Eastern Visayas)'),
  ('eastern-samar', 'Eastern Samar', 'Region VIII (Eastern Visayas)'),
  ('leyte', 'Leyte', 'Region VIII (Eastern Visayas)'),
  ('northern-samar', 'Northern Samar', 'Region VIII (Eastern Visayas)'),
  ('samar', 'Samar', 'Region VIII (Eastern Visayas)'),
  ('southern-leyte', 'Southern Leyte', 'Region VIII (Eastern Visayas)'),
  ('zamboanga-del-norte', 'Zamboanga del Norte', 'Region IX (Zamboanga Peninsula)'),
  ('zamboanga-del-sur', 'Zamboanga del Sur', 'Region IX (Zamboanga Peninsula)'),
  ('zamboanga-sibugay', 'Zamboanga Sibugay', 'Region IX (Zamboanga Peninsula)'),
  ('sulu', 'Sulu', 'Region IX (Zamboanga Peninsula)'),
  ('bukidnon', 'Bukidnon', 'Region X (Northern Mindanao)'),
  ('camiguin', 'Camiguin', 'Region X (Northern Mindanao)'),
  ('lanao-del-norte', 'Lanao del Norte', 'Region X (Northern Mindanao)'),
  ('misamis-occidental', 'Misamis Occidental', 'Region X (Northern Mindanao)'),
  ('misamis-oriental', 'Misamis Oriental', 'Region X (Northern Mindanao)'),
  ('davao-de-oro', 'Davao de Oro', 'Region XI (Davao Region)'),
  ('davao-del-norte', 'Davao del Norte', 'Region XI (Davao Region)'),
  ('davao-del-sur', 'Davao del Sur', 'Region XI (Davao Region)'),
  ('davao-occidental', 'Davao Occidental', 'Region XI (Davao Region)'),
  ('davao-oriental', 'Davao Oriental', 'Region XI (Davao Region)'),
  ('cotabato', 'Cotabato', 'Region XII (SOCCSKSARGEN)'),
  ('sarangani', 'Sarangani', 'Region XII (SOCCSKSARGEN)'),
  ('south-cotabato', 'South Cotabato', 'Region XII (SOCCSKSARGEN)'),
  ('sultan-kudarat', 'Sultan Kudarat', 'Region XII (SOCCSKSARGEN)'),
  ('agusan-del-norte', 'Agusan del Norte', 'Region XIII (Caraga)'),
  ('agusan-del-sur', 'Agusan del Sur', 'Region XIII (Caraga)'),
  ('dinagat-islands', 'Dinagat Islands', 'Region XIII (Caraga)'),
  ('surigao-del-norte', 'Surigao del Norte', 'Region XIII (Caraga)'),
  ('surigao-del-sur', 'Surigao del Sur', 'Region XIII (Caraga)'),
  ('basilan', 'Basilan', 'BARMM'),
  ('lanao-del-sur', 'Lanao del Sur', 'BARMM'),
  ('maguindanao-del-norte', 'Maguindanao del Norte', 'BARMM'),
  ('maguindanao-del-sur', 'Maguindanao del Sur', 'BARMM'),
  ('tawi-tawi', 'Tawi-Tawi', 'BARMM');

-- Business's home base — the reference point for computing destination tiers.
-- One row per business (business_id is the primary key — this is tenant data,
-- not a per-device preference like app_settings).
create table business_profile (
  business_id text primary key,
  hq_province_id text references provinces(id),
  updated_at text not null
);

-- Admin-managed seating capacity categories (e.g. "3-5 seater", "6-7 seater").
-- Extensible — staff can register more bands as their fleet mix grows.
create table seating_bands (
  id text primary key,
  business_id text not null,
  label text not null,
  min_seats integer not null,
  max_seats integer, -- null = open-ended (e.g. "12+ seater")
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);

-- The standard rate card ("citizen's charter" style default schedule): one row
-- per seating band, with a standard rate for each of the 3 destination tiers.
create table rate_matrix (
  id text primary key,
  business_id text not null,
  seating_band_id text not null references seating_bands(id) on delete cascade,
  rate_tier1 text, -- within province
  rate_tier2 text, -- within region, different province
  rate_tier3 text, -- outside region / interisland
  created_at text not null,
  updated_at text not null
);

create index idx_seating_bands_business_id on seating_bands (business_id);
create index idx_rate_matrix_business_id on rate_matrix (business_id);
create index idx_rate_matrix_seating_band_id on rate_matrix (seating_band_id);

-- Vehicles: seating capacity determines which seating band (and therefore which
-- rate matrix row) a vehicle prices against.
alter table vehicles add column seats integer;

-- Bookings: destination drives the pricing tier. Nullable at the DB level for a
-- safe migration, but the booking form requires it going forward since price
-- now depends on it.
alter table bookings add column destination_province_id text references provinces(id);
