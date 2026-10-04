# Maahir — Data Export / Sync (pull all data out)

> **Goal:** let another party pull the entire maahir dataset (all base tables) out of prod on their own, on a schedule. No SSH needed — everything goes through the admin SQL API.
> Companion to `HANDOVER-MAAHIR.md` (which documents the schema & the admin SQL API itself).

## ⚠️ Sensitive data
The export contains **PII**: WhatsApp numbers, `password_hash` (bcrypt), `audio_url`, names. Treat every export as confidential. It is **gitignored** (`maahir-export/`) — never commit it. Transfer over a secure channel; delete when no longer needed.

## Prerequisites
`.env.local` (or the environment) must have:
- `ADMIN_API_URL` = `https://maahir.example.org` (or `NEXT_PUBLIC_APP_URL` as fallback)
- `ADMIN_API_TOKEN` = the bearer token that matches the server's `ADMIN_API_TOKEN`
- Server must have `ADMIN_DB_API=on` (it is, in prod).

The token is the whole key to the data — rotate it after handover if the recipient shouldn't retain standing access.

## Tool: `scripts/export-maahir-data.ts`

```bash
# Full export, all tables → ./maahir-export/<table>.json + _manifest.json
npx tsx --env-file=.env.local scripts/export-maahir-data.ts

# Options
npx tsx --env-file=.env.local scripts/export-maahir-data.ts \
  --out=/secure/path/maahir-2026-07-23 \
  --format=ndjson \            # 'json' (array, default) | 'ndjson' (1 record/line, stream-friendly)
  --only=peserta,setoran,rekaman \   # subset of tables
  --exclude=audit_log,session_log    # skip noisy/large tables
```

### What it does
- Discovers all `BASE TABLE`s in schema `public` (58 tables) from `information_schema`.
- For each table: reads **every** row via keyset pagination on `ctid` (1000 rows/page — the admin API's read cap), writing `<out>/<table>.<json|ndjson>`.
- Writes `<out>/_manifest.json`: `{ exportedAt, host, format, tableCount, rowCount, tables:{ <table>: <rowCount> } }`.
- Read-only (only `SELECT`; the admin API runs reads in a `READ ONLY` transaction and rolls back). It never modifies prod.

### Output layout
```
maahir-export/
├── _manifest.json
├── peserta.json
├── setoran.json
├── rekaman.json
├── hits_halaqah.json
└── … one file per table
```

## Consistency caveat (important)
Each table (and each 1000-row page) is a **separate** read transaction — this is **not** a single point-in-time snapshot. Rows written to prod mid-export can cause tiny drift (e.g. `audit_log` grows on every admin query, so its exported count is always ~a few behind a fresh `count(*)`). For most handover/analytics purposes this is fine.

If you need an **exactly consistent** snapshot, use a real dump instead:
- `scripts/generate-sql-dump.ts` → `db-migration/maahir_full_dump.sql` (portable full restore), or
- a server-side `pg_dump` (requires DB access, which the app team has via the VPS), or
- the pre-built bundle `maahir-db-handoff.tar.gz`.

Use this JSON export for **ongoing sync/integration** (easy to diff/load per table); use the SQL dump for a **one-shot faithful clone**.

## Incremental / scheduled sync (recipient side)
v1 is a **full** export each run. To sync incrementally:
- **Diff by primary key**: keep the previous export; upsert changed rows into your store keyed by each table's PK (`id` on most tables; `kode` on `indikator_standar`). New/changed rows overwrite; deletions need a full-set compare.
- **Timestamp filter** (where available): many tables have `created_at` (and some `decided_at`/`checked_at`/`updated_at`). For append-mostly tables (`setoran`, `kehadiran_peserta`, `audit_log`, `hits_keterangan_harian`) you can extend the tool to add `WHERE created_at >= <last-run>` — cheaper than full pulls. Tables without a timestamp must be pulled in full.
- **Schedule**: run on the recipient's side via cron, e.g. nightly:
  ```
  0 2 * * *  cd /path && npx tsx --env-file=.env.local scripts/export-maahir-data.ts --out=/data/maahir/$(date +\%F)
  ```

## Loading the data on the other side
The JSON/NDJSON is store-agnostic. Typical loads:
- **Postgres clone**: create the schema from `db-migration/schema.sql`, then `COPY`/insert each table's file (respecting FK order — load parents before children: `musyrif`/`kelas`/`peserta` → `setoran` → `rekaman`, etc.). For a faithful clone prefer `maahir_full_dump.sql` directly.
- **Warehouse / other DB**: load each `<table>.ndjson` as a raw table; the `_manifest.json` gives you the table list + expected counts to validate.

Table purposes, relationships, and which tables are deprecated are in `HANDOVER-MAAHIR.md` → *Data Model*.

## Security checklist for handover
- [ ] Give the recipient a **dedicated** `ADMIN_API_TOKEN`, not the one the app team uses day-to-day.
- [ ] Rotate/revoke that token when the sync arrangement ends (change `ADMIN_API_TOKEN` on the server + redeploy env).
- [ ] Remember the token grants **full SQL** (read *and* write) via `/api/admin/db`. There is no read-only-scoped token today — if the recipient must be read-only, that's a follow-up (add a scoped token/role to the admin API).
- [ ] Transfer exports over a secure channel; storage at rest should be encrypted.
