# Restore Drill Report — Template

> Fill this in after each drill. Keep one report per drill (rename with date suffix, e.g. `restore-drill-report-2026-05-19.md`).

## Drill metadata

| Field | Value |
|---|---|
| Drill date | YYYY-MM-DD |
| Operator | (name) |
| Production project ref | `jarlejsbrxtrusfjklkg` |
| Restore target | (new project ref / local docker) |
| Backup timestamp used | YYYY-MM-DD HH:MM UTC |
| Backup type | daily / PITR |

## Timing

| Phase | Duration |
|---|---|
| Backup download / restore trigger | __ min |
| Restore execution | __ min |
| Verification SQL run | __ min |
| **Total RTO (DB-only)** | __ min |
| Operational buffer (DNS/app smoke test) | ~30 min |
| **Effective RTO** | __ min |

## RPO observed

| Metric | Value |
|---|---|
| Backup age at drill start | __ hours |
| **Effective RPO** | __ hours |

## Verification results

Paste the output of `scripts/verify-restore.sql` below:

```
(paste here)
```

### Manual checks

- [ ] auth.users count OK
- [ ] companies present
- [ ] orders present
- [ ] invoices intact (invoice_number unique per company+year)
- [ ] payments sum reconciles with invoices
- [ ] inventory_levels consistent (no negatives)
- [ ] order_status_transitions present
- [ ] loyalty totals reconcile
- [ ] All `trg_*` triggers present

## Issues encountered

| # | Issue | Severity | Action |
|---|---|---|---|
| 1 | | | |

## Missing objects (if any)

(list tables, triggers, functions, or rows that did not survive the restore)

## Conclusions

- Restore **succeeded / failed / partial**: ___
- RTO acceptable for Pilot? **yes / no**
- RPO acceptable for Pilot? **yes / no**
- Recommended actions before Pilot launch:
  1.
  2.

## Cleanup

- [ ] Temporary restore project deleted
- [ ] Local docker container removed (if used)
- [ ] Report committed to repo
