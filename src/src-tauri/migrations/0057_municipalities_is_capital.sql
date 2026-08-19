-- ROT052 Phase 2 — flags each province's capital municipality, so a
-- region-level destination's resolved "representative point" (see
-- lib/repo/regionRepresentativePoints.ts, migration 0058) can be labelled
-- with an actual city name instead of just the province. Static PSGC/DILG
-- reference data, the same for every business on RACOS — not tied to any
-- particular HQ location, so it doesn't reintroduce per-business hardcoding.
--
-- Sourced from public PSGC/DILG references this session, with the
-- genuinely ambiguous ones (recent capital-seat transfers, the 2022
-- Maguindanao split) specifically verified rather than assumed — e.g.
-- Agusan del Norte's de jure capital is Cabadbaran City (not Butuan City,
-- which is only the de facto seat), and Basilan's capital moved from
-- Isabela City to Lamitan in 2017. Falcon: worth a spot-check against your
-- own source if anything here looks off — a wrong flag only ever means one
-- province's representative point shows its plain name instead of a city
-- (see the fallback in regionRepresentativePoints.ts), never wrong data.
--
-- NCR has no single "capital" (it's a collection of independent cities, not
-- a province) — deliberately left unflagged. Maguindanao del Norte/del Sur
-- (the 2022 split) have zero municipality rows in this table at all (see
-- migration 0007's comment) — nothing to flag there either; both simply
-- fall back to their plain province name, same graceful degradation as any
-- unmatched province below.
alter table municipalities add column is_capital integer not null default 0;

update municipalities set is_capital = 1 where id in (
  'abra-bangued', 'apayao-kabugao', 'benguet-la-trinidad', 'ifugao-lagawe',
  'kalinga-city-of-tabuk', 'mountain-province-bontoc',
  'ilocos-norte-city-of-laoag', 'ilocos-sur-city-of-vigan',
  'la-union-city-of-san-fernando', 'pangasinan-lingayen',
  'batanes-basco', 'cagayan-tuguegarao-city', 'isabela-city-of-ilagan',
  'nueva-vizcaya-bayombong', 'quirino-cabarroguis',
  'aurora-baler', 'bataan-city-of-balanga', 'bulacan-city-of-malolos',
  'nueva-ecija-city-of-palayan', 'pampanga-city-of-san-fernando',
  'tarlac-city-of-tarlac', 'zambales-iba',
  'batangas-batangas-city', 'cavite-city-of-trece-martires',
  'laguna-santa-cruz', 'quezon-city-of-lucena', 'rizal-city-of-antipolo',
  'marinduque-boac', 'occidental-mindoro-mamburao',
  'oriental-mindoro-city-of-calapan', 'palawan-city-of-puerto-princesa',
  'romblon-romblon',
  'albay-city-of-legazpi', 'camarines-norte-daet', 'camarines-sur-pili',
  'catanduanes-virac', 'masbate-city-of-masbate', 'sorsogon-city-of-sorsogon',
  'aklan-kalibo', 'antique-san-jose', 'capiz-city-of-roxas', 'guimaras-jordan',
  'iloilo-city-of-iloilo',
  'negros-occidental-city-of-bacolod', 'negros-oriental-city-of-dumaguete',
  'siquijor-siquijor',
  'bohol-city-of-tagbilaran', 'cebu-city-of-cebu',
  'biliran-naval', 'eastern-samar-city-of-borongan', 'leyte-city-of-tacloban',
  'northern-samar-catarman', 'samar-city-of-catbalogan',
  'southern-leyte-city-of-maasin',
  'zamboanga-del-norte-city-of-dipolog', 'zamboanga-del-sur-city-of-pagadian',
  'zamboanga-sibugay-ipil', 'sulu-jolo',
  'bukidnon-city-of-malaybalay', 'camiguin-mambajao', 'lanao-del-norte-tubod',
  'misamis-occidental-city-of-oroquieta',
  'misamis-oriental-city-of-cagayan-de-oro',
  'davao-de-oro-nabunturan', 'davao-del-norte-city-of-tagum',
  'davao-del-sur-city-of-digos', 'davao-occidental-malita',
  'davao-oriental-city-of-mati',
  'cotabato-city-of-kidapawan', 'sarangani-alabel',
  'south-cotabato-city-of-koronadal', 'sultan-kudarat-isulan',
  'agusan-del-norte-city-of-cabadbaran', 'agusan-del-sur-prosperidad',
  'dinagat-islands-san-jose', 'surigao-del-norte-city-of-surigao',
  'surigao-del-sur-city-of-tandag',
  'basilan-city-of-lamitan', 'lanao-del-sur-city-of-marawi', 'tawi-tawi-bongao'
);
