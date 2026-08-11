use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ROT003 — local SQLite cache + outbox-pattern sync (ROD002). Mirrors the Supabase
// schema from ROT002; see src-tauri/migrations/ for the SQL and rationale.
fn local_db_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init_local_cache",
            sql: include_str!("../migrations/0001_init_local_cache.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "outbox_and_sync_state",
            sql: include_str!("../migrations/0002_outbox_and_sync_state.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "app_settings",
            sql: include_str!("../migrations/0003_app_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "payment_and_rental_settings",
            sql: include_str!("../migrations/0004_payment_and_rental_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "locations_and_rate_matrix",
            sql: include_str!("../migrations/0005_locations_and_rate_matrix.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "cities_and_custom_rates",
            sql: include_str!("../migrations/0006_cities_and_custom_rates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "municipalities",
            sql: include_str!("../migrations/0007_municipalities.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "drop_business_cities",
            sql: include_str!("../migrations/0008_drop_business_cities.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "fix_city_fk_targets",
            sql: include_str!("../migrations/0009_fix_city_fk_targets.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "owners",
            sql: include_str!("../migrations/0010_owners.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "registry_and_action_log",
            sql: include_str!("../migrations/0011_registry_and_action_log.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "booking_actual_return",
            sql: include_str!("../migrations/0012_booking_actual_return.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "booking_departure_tracking",
            sql: include_str!("../migrations/0013_booking_departure_tracking.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "dashboard_label_settings",
            sql: include_str!("../migrations/0014_dashboard_label_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "booking_resolved_rate",
            sql: include_str!("../migrations/0015_booking_resolved_rate.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "booking_additional_payment",
            sql: include_str!("../migrations/0016_booking_additional_payment.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "action_log_booking_entity",
            sql: include_str!("../migrations/0017_action_log_booking_entity.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "remittance_summary_setting",
            sql: include_str!("../migrations/0018_remittance_summary_setting.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "action_log_booking_lifecycle",
            sql: include_str!("../migrations/0019_action_log_booking_lifecycle.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "auto_mark_departed_setting",
            sql: include_str!("../migrations/0020_auto_mark_departed_setting.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "vehicle_local_details",
            sql: include_str!("../migrations/0021_vehicle_local_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 22,
            description: "vehicle_image_fit",
            sql: include_str!("../migrations/0022_vehicle_image_fit.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 23,
            description: "location_visibility_settings",
            sql: include_str!("../migrations/0023_location_visibility_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "local_session_cache",
            sql: include_str!("../migrations/0024_local_session_cache.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "business_contact_number",
            sql: include_str!("../migrations/0025_business_contact_number.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 26,
            description: "owner_login_code",
            sql: include_str!("../migrations/0026_owner_login_code.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "sync_backfill_marker",
            sql: include_str!("../migrations/0027_sync_backfill_marker.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 28,
            description: "action_log_system_reset",
            sql: include_str!("../migrations/0028_action_log_system_reset.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 29,
            description: "odometer_gps_manual_entries",
            sql: include_str!("../migrations/0029_odometer_gps_manual_entries.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 30,
            description: "split_gps_locations_and_mileage",
            sql: include_str!("../migrations/0030_split_gps_locations_and_mileage.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 31,
            description: "gps_location_entries_coordinates",
            sql: include_str!("../migrations/0031_gps_location_entries_coordinates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 32,
            description: "gps_location_labels",
            sql: include_str!("../migrations/0032_gps_location_labels.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 33,
            description: "booking_remittance_split_override",
            sql: include_str!("../migrations/0033_booking_remittance_split_override.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 34,
            description: "default_remittance_summary_on",
            sql: include_str!("../migrations/0034_default_remittance_summary_on.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:racos.db", local_db_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
