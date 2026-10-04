# Demo build — Tilawa Labs (multi-programme administration dashboard)

Deployed as a public demo. Never merge back into `main`.

## The data generator

`scripts/seed-demo.ts` builds a coherent synthetic world — programmes, teachers,
halaqah, rosters, a schedule and the attendance against it — then the wall-board
furniture and a scorecard period. Deterministic: one fixed PRNG seed, so the
nightly reset reproduces the same screens.

Six traps it exists to get right. Every one of them renders an *empty* screen
rather than an error, which is why they cost time to find:

1. **`attendance_sync.status` is TEXT**, not an integer. `'1'`/`'2'` present,
   `'3'` (izin) excluded from the denominator. Integers leave headcounts correct
   and every percentage a dash.
2. **The joins run on upstream ids, never the uuid PKs.**
   `attendance_sync.halaqah_jadwal_id = jadwal_sync.tilawah_jadwal_id`,
   `attendance_sync.halaqah_user_id = students_sync.halaqah_user_id`,
   `students_sync.halaqah_id = halaqah_sync.tilawah_halaqah_id`.
3. **The batch-stray guard** drops a halaqah unless its `tilawah_batch_id`
   matches the programme's, or either is null. Both are left null; a mismatch
   empties the entire monthly report silently.
4. **`jadwal_sync."order"` must be non-null** or the per-meeting heatmap strip —
   the one genuinely visual element on the halaqah table — drops every meeting.
   It is also a reserved SQL word, so the generator quotes all identifiers.
5. **A halaqah named `[DEMO…` is filtered out** by `lib/enrollment.ts`. The
   obvious way to label demo data would have emptied the whole table.
6. **`students_sync` carries denormalised columns** the upstream sync would
   normally compute: `attendance_rate`, `hadir_count`, `effective_meetings`,
   `recorded_meetings`, `kehadiran_percentage`, `pengajar`. `/overview` reads its
   headline percentage from `attendance_rate` alone — leave it null and the hero
   shows "—" with every attendance row present and correct.

The mix is also tuned, not arbitrary: today's meetings are mostly taught and two
programmes sit below the 70% threshold. An earlier version left a third of the
circles unmet and the board read 28% attendance with six of six programmes below
target — honest about the data, wrong about the product.

## Identity

Programme **slugs are unchanged**; only `programs.name` and the `ORG_ROOT` labels
were replaced. Seven other files key off those slugs — colour maps, KBA report
blocks, recap exclusion rules, sync special-cases — and renaming them risks
breaking things nothing would surface. A slug is a URL token; the name is what a
visitor reads.

All twelve brand assets were regenerated at **identical pixel dimensions**. The
app imports them statically, so Next bakes the intrinsic size into the layout;
a differently-sized replacement silently reflows the login page, the icon rail
and the attendance card.

`assets/surat/ttd-signer.jpg` was a **scanned signature of a named person** —
the most sensitive file in the repository. Replaced with a SPECIMEN placeholder.

## Removed from this branch

- `public/sosialisasi-4-fitur.{html,pdf,-cover.jpg}` — a teacher-facing deck that
  was **reachable without a session** (middleware exempted it) and whose page-8
  screenshot carries teacher names that were never anonymised. The middleware
  exemption went with it.
- `docs/` — real names and working phone numbers across several planning
  documents. Not web-served, but it rides in the branch.
- `syafiq@mabni.id` and the production hostnames inside the `.dc.html` design
  mockups. The mockups themselves are fabricated sample data, not real exports.

## The seal — this one matters more than the other two demos

Unlike the event and teacher apps, this app can **write to real upstream systems
and send real WhatsApp messages**. Required before deploying:

| Variable | Value | Why |
|---|---|---|
| `KIRIMI_USER_CODE`, `KIRIMI_SECRET`, `KIRIMI_DEVICE_ID` | **all absent** | together they make `lib/integrations/kirimi.ts` actually send WhatsApp |
| `TILAWAH_BASE_URL`, `TILAWAH_LOGIN_EMAIL`, `TILAWAH_LOGIN_PASSWORD` | **absent** | logs into the live CMS and writes back |
| `TILAWAH_PUSH_TAUGHT` | never `1` | writes "Selesai" onto real meetings |
| `BERKAH_*`, `MABNI_*`, `MAAHIR_*`, `NAWA_*` | **absent** | base URLs default to real production hosts |
| `MAAHIR_API_KEY_TULIS` | **absent** | the write key |
| `STORAGE_BACKEND` | `local` | `azure_blob` uploads into a real container |
| `ADMIN_SQL_ENABLED` | **exactly `"false"`** | fail-open: anything else, including unset, leaves the raw SQL console on |
| `CRON_SECRET` | long random | unset makes the check `Bearer undefined`, which anyone can send |
| `AGENT_TOKEN`, `OPS_SECRET`, `DAFTAR_SITE_TOKEN` | absent | under 24 chars closes those gates |

**Publish only the `coordinator` credential, never the `super_coordinator` one.**
`purgeStraysAction` performs uncapped deletes and `resetPasswordAction` can change
any account's password — both gated by `requireSuperUser()` alone, with no env
flag behind them. A visitor with the super password could wipe the mirror tables
and lock the owner out.

## Accounts

`coordinator@tilawalabs.demo` / `demo123` — granted three of the six programmes,
which is also what makes the access-control difference visible.
`super@tilawalabs.demo` exists for maintenance and is deliberately not published.
