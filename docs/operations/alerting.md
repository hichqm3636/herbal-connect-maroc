# Operational Alerting — Pilot Minimal Layer

**Goal**: Production failures must become visible immediately. This is NOT a full monitoring platform. Two layers only:

1. **External uptime monitor** — detects total outage / SSL / DNS failures.
2. **Internal operational alert** — detects functional failures (error spikes, payment failures) via the `system_alerts` table populated by a scheduled DB function.

---

## Layer 1 — External Uptime Monitor (Manual Setup)

### Recommended service: UptimeRobot (free) or BetterStack

### Endpoints to monitor

| Name | URL | Method | Expected | Interval |
|---|---|---|---|---|
| Home page | `https://herbal-connect-maroc.lovable.app/` | GET | 200 | 5 min |
| Login route | `https://herbal-connect-maroc.lovable.app/login` | GET | 200 | 5 min |
| Health (Supabase REST) | `https://jarlejsbrxtrusfjklkg.supabase.co/rest/v1/` | GET (with `apikey` header) | 200 | 10 min |

### Notification channels

Configure UptimeRobot/BetterStack to alert via:
- **Email**: project owner email
- **WhatsApp**: optional, via UptimeRobot integrations or BetterStack → Twilio
- **Trigger condition**: 2 consecutive failed checks (avoid flapping).

### Setup steps

1. Sign up at https://uptimerobot.com (free tier = 50 monitors, 5-min interval).
2. Add monitor for each endpoint above.
3. Add contact: email of project owner.
4. Optional: enable Public Status Page for transparency with pilot vendors.

**This step is performed by a human and is NOT automated by the platform.** Document the monitor IDs / dashboard URL here once configured:

```
UptimeRobot dashboard: __________________
Monitor IDs:           __________________
```

---

## Layer 2 — Internal Operational Alerts

A new table `public.system_alerts` is populated by `public.check_operational_health()`, which runs every 15 minutes via `pg_cron`.

### Conditions checked

| Condition | Threshold | Severity |
|---|---|---|
| `client_error_logs` rows in last 15 min | > 20 | `warning` |
| `client_error_logs` rows in last 15 min | > 100 | `critical` |
| Invoices stuck `issued` > 7 days with no payment | > 5 | `warning` |
| Orders stuck `pending` > 48 hours | > 10 | `warning` |

### Where alerts appear

- Table `public.system_alerts` (RLS: super_admin only).
- Super-admin can review alerts in the existing `/super-admin/errors` page (or wherever they choose to surface them).
- Each alert row carries: `kind`, `severity`, `message`, `details jsonb`, `created_at`.

### Dedup

Alerts are deduplicated by `(kind, severity)` within a 1-hour window — the function will not insert a second row for the same condition until the window expires. This prevents alert spam.

### Notification channel (manual)

For now, alerts are **visible in the database / super-admin UI only**.
To push them to email/WhatsApp:
- A super-admin checks `/super-admin/errors` daily, OR
- Configure a future polling integration (out of scope for this sprint).

---

## Who Receives Alerts

| Layer | Channel | Recipient |
|---|---|---|
| Uptime (Layer 1) | Email + optional WhatsApp | Project owner |
| Internal (Layer 2) | `system_alerts` table | Super-admin (manual review) |

---

## Out of Scope (Intentional)

- Grafana / Prometheus / Datadog
- Distributed tracing
- Incident management tooling
- Per-tenant SLA dashboards
- Auto-remediation

These can be added post-Pilot if the platform grows.

---

## Operational SOP When an Alert Fires

1. **Uptime alert** → check Lovable Cloud status, then Supabase status page, then deploy logs.
2. **`critical` internal alert** → open `/super-admin/errors`, identify error pattern, file ticket.
3. **`warning` internal alert** → review within 24h, no immediate action needed unless trend continues.
