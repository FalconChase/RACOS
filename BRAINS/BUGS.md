# BUGS.md
# RACOS persistent bug register. BUG IDs are ecosystem-wide (RC001). Empty at GAP onboarding (GA004).
---
| ID | SEVERITY | ITEM | FOUND | STATUS |
|----|----------|------|-------|--------|
| RC001 | MED | SearchableSelect rendered a full-screen invisible click-catching overlay while open. A click meant for another button elsewhere on the page (e.g. Settings "Save") landed on the overlay instead of its target, closing the dropdown and swallowing the click. Affected every screen using the component. | SES006 | FIXED — FX001 |
| RC002 | HIGH | business_profile.hq_city_id / custom_rates.city_id / bookings.destination_city_id still declared `references cities(id)` after migration 0008 dropped the `cities` table. The app's real tauri-plugin-sql (sqlx) runtime enforces foreign keys — unlike the Python sqlite3-module dry-run used to verify migrations — so any write to those columns failed at runtime with "no such table: main.cities". Symptom: HQ province/city (and by extension custom rates / booking destinations) silently couldn't be saved. | SES006 | FIXED — FX002 |
