# Restore Drill Runbook — Nexora / Clinora

**Purpose**: Prove that production backups are actually restorable, and measure RTO/RPO before Pilot launch.

**Scope**: One-time validation exercise. NOT automation. NOT production change.

---

## 1. Where Backups Come From

The production database runs on **Lovable Cloud (Supabase managed)**.
Supabase takes automatic daily backups of the Postgres instance:

- **Daily backups**: retained for 7 days on the free tier (longer on paid tiers).
- **PITR (Point-In-Time Recovery)**: available only on Pro plan and above.
- Backups are stored by Supabase infrastructure — we do **not** maintain a separate off-site copy yet.

**Single point of failure**: if the Supabase project itself is deleted or corrupted at the platform level, only Supabase support can recover it.

---

## 2. Restore Target (Isolated)

**Never restore into production.** Use one of these isolated targets:

### Option A — New temporary Supabase project (recommended)
1. Go to https://supabase.com/dashboard → New Project.
2. Name it `nexora-restore-drill-YYYYMMDD`.
3. Region: same as production.
4. Wait for provisioning (~2 min).

### Option B — Local Postgres (faster, no cost)
1. `docker run -d --name pg-restore -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:15`
2. Use this only if backup is in plain SQL dump format.

---

## 3. Restore Procedure

### Step 1 — Obtain the backup
- Dashboard → **Database → Backups** → select latest daily backup.
- Note the **backup timestamp** (this is your RPO baseline).
- Click **Download** (if available) or **Restore to project**.

### Step 2 — Trigger restore
- If using Option A: dashboard → Backups → "Restore to a new project" → select target.
- If using Option B: `psql -h localhost -p 5433 -U postgres -d postgres -f backup.sql`
- **Start a stopwatch** when restore begins.

### Step 3 — Wait for completion
- Stop the stopwatch when the restore is reported complete.
- This duration is your **estimated RTO** for a database-only restore.
- Add an operational buffer (DNS swap, app config, smoke test) of **~30 min** for real-world RTO.

---

## 4. Verification Checklist

Run `scripts/verify-restore.sql` against the restored target. It checks every critical table and prints row counts and integrity assertions.

Manual checks to confirm visually:

- [ ] `auth.users` count matches expectation (compare to production count taken before drill).
- [ ] `companies` table — at least the tenant companies exist.
- [ ] `orders` — recent orders present.
- [ ] `invoices` — invoice_number sequences intact.
- [ ] `payments` — sum per invoice matches `invoices.total_mad` for paid invoices.
- [ ] `inventory_levels` — derived values consistent (no negative `quantity_available`).
- [ ] `order_status_transitions` — audit trail rows exist.
- [ ] `loyalty_transactions` sum per user equals `profiles.loyalty_points`.
- [ ] All triggers present (run `select tgname from pg_trigger where tgname like 'trg_%'`).

---

## 5. Rollback Notes

- The restore target is **isolated** — no rollback is needed for production.
- After the drill: **delete the temporary project** to avoid lingering cost and to prevent confusion with production data.
- Document any anomalies in `restore-drill-report.md` (use the template).

---

## 6. RTO / RPO Definitions

- **RPO (Recovery Point Objective)** = how much data we can afford to lose.
  Today: up to **24 hours** (daily backups only, no PITR).
- **RTO (Recovery Time Objective)** = how fast we can be back up.
  Measure this during the drill.

If RPO > acceptable Pilot threshold → upgrade to Supabase Pro for PITR.

---

## 7. After the Drill

1. Fill in `docs/operations/restore-drill-report.md`.
2. Share the report with project owner.
3. If gaps found (missing data, broken trigger, etc.) — file as tickets BEFORE Pilot launch.
4. Re-run drill quarterly.
