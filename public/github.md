repo: hilmihs/tilawa-labs-dashboard
branch: main

## Last sync
date: 2026-08-15
### Updated in this project
- Redesign exploration (not a code port): icon-rail + data-console visual language, softened dark rail, light app / dark TV board.
- Sample data reflects the Tilawah/halaqah attendance flavor (HITS Reguler, Batch 12).
- Preserved shadcn/blue DNA: blue-600 accent, neutral surfaces, Geist + Geist Mono, status-tone pills.

## Screen map
| Screen | Built from |
| --- | --- |
| Kehadiran — Dir B.dc.html | app/[program]/dashboard (AttendanceDashboard, HalaqahTable) |
| Inbox.dc.html | app/[program]/inbox |
| Laporan.dc.html | app/[program]/laporan (+ export) |
| Scorecard.dc.html | app/[program]/scorecard |
| Peserta.dc.html | app/[program]/peserta |
| Pengajar.dc.html | app/[program]/pengajar |
| Silabus.dc.html | app/[program]/silabus |
| Overview.dc.html | app/page.tsx (all-programs overview) |
| TV Board.dc.html | lobby/TV display (dark) |

## Notes
- Kehadiran — Dir A / Dir C .dc.html are the two rejected exploration directions (kept for reference).
- Surat (HKM letter generator) not yet built — deprioritized in scoping.
