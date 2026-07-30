# Stage 1 — Local Traccar + Android client, proving the full pipeline

Goal: prove tracker → Traccar → forward → Supabase end to end, using your own
PC (Docker) and phone (Traccar Client app) as stand-ins for the real GT06
device. Zero cost, doesn't touch the real tracker or DAGPS.

Nothing in this stage touches the RACOS codebase or the local `racos.db` —
same as Stage 0, this is entirely Traccar (your PC) → Supabase.

---

## 0. Prerequisites

- Docker Desktop installed and running (Settings → confirm WSL2 backend is on).
- Your phone and PC on the **same Wi-Fi network**.
- 5 minutes where your PC won't sleep/lock (so the container keeps running).

Verify Docker's ready — run in PowerShell:

```powershell
docker --version
```

---

## 1. Get your PC's LAN IP

The phone will connect to this, not `localhost`. Run:

```powershell
ipconfig
```

Look under your active **Wi-Fi adapter** for `IPv4 Address` (something like
`192.168.1.42`). Write it down — call it `<PC_IP>` below.

---

## 2. Run Traccar once with defaults (to get the real config file)

```powershell
docker run --name traccar --hostname traccar --detach --restart unless-stopped `
  --publish 8082:8082 `
  --publish 5000-5300:5000-5300 `
  --publish 5000-5300:5000-5300/udp `
  traccar/traccar:latest
```

Confirm it's up: open `http://localhost:8082` in a browser — you should see
the Traccar screen. Note: this version doesn't ship a default `admin`/`admin`
account — it shows a Register screen instead, and by default self-registration
is disabled (you'll hit a "Registration disabled" error if you try). That's
fixed in the next step alongside forwarding, so don't register yet.

---

## 3. Pull out the real config file, enable registration, and add forwarding

Rather than guessing at a minimal config, copy the one the image actually
ships with, so nothing else breaks:

```powershell
mkdir C:\traccar-local
docker cp traccar:/opt/traccar/conf/traccar.xml C:\traccar-local\traccar.xml
```

Open `C:\traccar-local\traccar.xml` in a text editor. Just before the closing
`</properties>` tag, add:

```xml
<entry key='users.registration'>true</entry>
<entry key='forward.enable'>true</entry>
<entry key='forward.url'>https://nnsjqnxvpkercbbwvqjj.supabase.co/functions/v1/gps-ingest?secret=GLIkkoqcG_8akhUa86gvcWQ7DmqVY9Ui</entry>
<entry key='forward.type'>json</entry>
```

`users.registration=true` lets you self-register the first (admin) account —
after that, it's worth setting this back to `false` via the web UI's Server
Settings once you're registered, so no one else can register on your local
instance.

(`forward.type=json` is the current official key — POSTs a JSON body rather
than query params, matching what `gps-ingest` expects. The secret rides in
the URL's query string since forwarding can't reliably send custom headers,
same reasoning as before.)

Save the file, then recreate the container with it mounted, plus a data
volume so devices/config persist across restarts:

```powershell
docker stop traccar
docker rm traccar
mkdir C:\traccar-local\data

docker run --name traccar --hostname traccar --detach --restart unless-stopped `
  --publish 8082:8082 `
  --publish 5000-5300:5000-5300 `
  --publish 5000-5300:5000-5300/udp `
  --volume C:\traccar-local\traccar.xml:/opt/traccar/conf/traccar.xml:ro `
  --volume C:\traccar-local\data:/opt/traccar/data:rw `
  traccar/traccar:latest
```

Refresh `http://localhost:8082` — should still log in fine with `admin`/`admin`.

---

## 4. Register a test device in Traccar

In the Traccar web UI: **Devices → Add** (the `+` button).

- Name: `Stage 1 Test`
- Identifier: `STAGE1TEST` (this is what has to match Supabase — case-sensitive)

Save it.

---

## 5. Create a matching test vehicle in Supabase

Same disposable-test-data pattern as Stage 0 — tell me when you're at this
step and I'll insert a throwaway business + vehicle with
`gps_device_id = 'STAGE1TEST'` directly in Supabase, and clean it up once
Stage 1 is confirmed working.

---

## 6. Install and configure Traccar Client on your phone

From Play Store, install **Traccar Client** (the official lightweight app,
not "Traccar Manager").

Open it → Settings (or the setup screen on first launch):

- **Device identifier**: `STAGE1TEST` (must exactly match step 4)
- **Server URL**: `http://<PC_IP>:5055` — use the IP from step 1, e.g.
  `http://192.168.1.42:5055`
- Frequency: leave default, or lower it (e.g. every 10–15s) so you don't
  wait long for the first fix.

Turn tracking **on**.

---

## 7. Verify

Two places to check, in order:

1. **Traccar's own map** (`http://localhost:8082`) — within a minute you
   should see `Stage 1 Test` appear with a live position. If nothing shows
   up here, the problem is phone → Traccar (see troubleshooting), not
   Traccar → Supabase — no point checking Supabase yet.

2. **Supabase** — once step 7.1 works, tell me and I'll query
   `vehicle_locations` for the `STAGE1TEST` vehicle to confirm forwarding
   reached Supabase. I can also check the `gps-ingest` Edge Function logs
   directly if forwarding looks like it's firing but nothing's landing.

---

## 8. Troubleshooting

**Phone can't reach the PC at all (step 7.1 empty):**
Windows Defender Firewall likely blocked the inbound connection the first
time Docker published those ports — especially if your Wi-Fi network is set
to "Public" instead of "Private" in Windows network settings. Check
Settings → Network & Internet → Wi-Fi → your network's profile, and/or look
for a Windows Firewall pop-up asking to allow Docker Desktop that may have
been dismissed.

**Traccar shows the position but nothing reaches Supabase:**
Check the Edge Function logs (Dashboard → Edge Functions → Logs, filtered to
`gps-ingest`, same tab we used in Stage 0) for a request. If it shows a 400
with `"error": "missing required fields"`, the response body includes
`received: <payload>` — that's the real shape Traccar's `forward.type=json`
actually sent, useful if it doesn't match what the function expects.

**Traccar container won't start after adding the mounted config:**
Usually a syntax error in the hand-edited `traccar.xml` (missing closing
tag, stray character). `docker logs traccar` will show the parse error.

---

## 9. Cleanup when done

- Tell me to delete the test business/vehicle/location rows in Supabase
  (same as Stage 0).
- Optionally `docker stop traccar` if you don't want it running in the
  background — or leave it running if you want to keep testing.
