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
