-- Whether the Fleet car-detail popup's image frame crops the car_image to
-- fill the square frame ("cover", the original default) or shrinks it down
-- so the whole image is visible, letterboxed if needed ("contain"). Set
-- alongside car_image itself from the Registry Vehicles edit form. Local-only,
-- same as car_image — see migration 0021_vehicle_local_details.sql.
alter table vehicles add column car_image_fit text not null default 'cover' check (car_image_fit in ('cover', 'contain'));
