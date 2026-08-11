-- Two more optional vehicle detail fields, same local-only spirit as
-- fuel/fuel_capacity/transmission/car_image/notes (see migration
-- 0021_vehicle_local_details.sql and 0044_vehicle_notes.sql):
--   color       — e.g. "White", "Silver"
--   description — free-text variant/trim descriptor, e.g. "1.3 XLE CVT",
--                  distinct from model (which stays just "Vios").
alter table vehicles add column color text;
alter table vehicles add column description text;
