# API Map — tilawah.example.org (HITS CMS)

Reverse-engineered dari network traffic browser (bukan dokumentasi resmi). Base URL: `https://tilawah.example.org`. Semua endpoint `/api/*`, response JSON.

## Auth

- Login via form biasa (`POST` ke halaman login, Laravel session + cookie).
- Session pakai cookie `laravel_session` + CSRF cookie `XSRF-TOKEN`.
- Tiap request mutasi (`POST/PUT/DELETE`) WAJIB header `X-XSRF-TOKEN` (ambil dari cookie `XSRF-TOKEN`, url-decode) + `X-Requested-With: XMLHttpRequest`.
- Tidak ada API key/token terpisah — ini bukan public API, didesain buat dipakai frontend sendiri (Inertia.js + Vue/React SPA di atas Laravel).
- Kalau mau dashboard eksternal: harus login dulu (isi form via script/headless browser), simpan cookie jar, reuse tiap request. Session expired → redirect ke `/login?reason=expired`.

## Response envelope standar

```json
{
  "status": "success",
  "code": 200,
  "message": "...",
  "data": { ... },
  "spent": 0.223   // waktu eksekusi server (detik)
}
```

List endpoint punya `data.pagination`: `{ total, per_page, current_page, last_page }`.

---

## Master data

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/programs?per_page=100&filters[status]=1` | GET | List program (id, name, slug, description, status) |
| `/api/programs?page=1&per_page=10&keyword=&sort_by=id&sort=asc` | GET | List program versi paginated (halaman Program) |
| `/api/batches?page=1&per_page=50&sort_by=id&sort=desc&filters[program_id]={id}&keyword=` | GET | List batch dalam 1 program (id, name, start_date, end_date, program_id) |
| `/api/batches/{id}?minimal=1` | GET | Detail 1 batch (versi ringkas) |
| `/api/batch/set-active` | POST | Set batch aktif yang lagi ditampilkan di UI |
| `/api/levels?page=1&per_page=10&sort_by=id&sort=desc&keyword=` | GET | List level (Dasar, Lanjutan, Nuroniyyah, DPQ Shaifiyyah, dst) |
| `/api/moduls?per_page=999` | GET | List modul (materi belajar) — kosong di data ini |
| `/api/days?per_page=100` | GET | Master hari (Senin, Selasa, Senin & Kamis...). `int_days` = index hari (0=Senin) |
| `/api/sessions?per_page=100` | GET | Master jam sesi (Sesi 1 08:00-09:00, dst) |
| `/api/roles?pagesize=100` | GET | List role user (admin, guru, murid, dll) |

## Halaqah

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/halaqah?page=1&per_page=100&sort_by=id&sort=asc&simple=true&filters[batch_id]={id}` | GET | List halaqah dalam 1 batch (ringkas: id, name, type, day, session, level) |
| `/api/halaqah/{id}` | GET | **Detail lengkap** 1 halaqah: guru, murid (`users[]` dgn `pivot.type`='guru'/'murid'), semua `jadwals[]` (tiap pertemuan) + `presensis[]` per jadwal (kehadiran per murid) |

`jadwals[]` per item punya: `id, order, name, type, schedule_date, start_session_date, end_session_date, guru_id, online_url, offline_place, notes, task_name, task_description, task_due, status, status_label, moduls[], presensis[]`.

`presensis[]` per item: `id, halaqah_user_id, halaqah_jadwal_id, status, notes, lahn_jaliy, lahn_khofiy, task_submission_date, task_media_id`.

## Pertemuan (jadwal per sesi)

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/pertemuans/{id}` | GET | Detail 1 pertemuan (schedule_date, start/end_session_date, guru, dll) |
| `/api/pertemuans/{id}` | PUT | **Update pertemuan.** Body wajib semua field (lihat contoh bawah), bukan partial update |
| `/api/pertemuans/{id}` | DELETE | **Hapus pertemuan.** ⚠️ Sering balas `500 {"message":"Gagal menghapus pertemuan"}` **padahal barisnya benar-benar terhapus** (GET-nya jadi 404). Jangan percaya status code — verifikasi lewat re-fetch `/api/halaqah/{id}`. Live-verified 30 Jul 2026: 24 delete, 1 balas sukses, 23 balas 500, semuanya terhapus. |

Body PUT yang jalan:
```json
{
  "id": 5064,
  "name": "Tahsin Al-Fatihah",
  "order": 2,
  "type": "offline",
  "start_session_date": "2026-07-18 00:00:00",
  "end_session_date": "2026-07-18 00:45:00",
  "guru_id": 2054,
  "online_url": "",
  "offline_place": "Masjid Nurul Iman Blok M",
  "notes": "",
  "task_name": "",
  "task_description": "",
  "task_due": null,
  "status": 1,
  "moduls": [],
  "schedule_date": "2026-07-18",
  "halaqah_id": 197,
  "batch_id": 8
}
```
**Gotcha**: `end_session_date` HARUS > `start_session_date`, kalau sama (placeholder 00:00-00:00) API balikin 400 `"The end session date field must be a date after start session date."`

**Jadwal `status`**: `1` Aktif (belum disentuh) · `3` Mulai · `4` Selesai. Tidak ada
endpoint set-status — satu-satunya cara mengubahnya adalah PUT full-body di atas
dengan `status` diganti. Live-verified 5 Sep 2026: PUT `4` → `1` nyangkut, tilawah
tidak menghitung ulang status di server (kekhawatiran di
`lib/sync/push-meeting-taught.ts` tidak terjadi untuk arah turun ini).

**Resep "kosongkan pertemuan"** — dipakai kalau pengajar salah isi dan mau ulang
dari nol (kasus HITS 28 Akhwat April p10, 5 Sep 2026), lihat
`scripts/hits28apr-hapus-presensi-p10.ts`:

1. `GET /api/halaqah/{halaqahId}` → ambil `jadwals[].presensis[].id` milik pertemuan itu.
2. `DELETE /api/presensis/{id}` per baris (balas 500 tapi terhapus — lihat section Write).
3. `PUT /api/pertemuans/{id}` full-body dengan `status: 1` untuk mencabut tanda mulai mengajar.
4. Re-fetch `/api/halaqah/{halaqahId}` sebagai bukti: `presensis` kosong, `status_label` "Aktif".

Sesudahnya jalankan `pnpm sync:tilawah <slug> --sweep` supaya cermin dashboard ikut
bersih — prune presensi ada di `lib/sync/tilawah-sync.ts` (baris hantu yang sudah
hilang upstream dicabut per jadwal).

## Users (guru / murid)

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/users?filters[role]=guru&filters[batch_id]={id}&page=1&per_page=10&sort_by=name&sort=asc&keyword=` | GET | List guru dalam 1 batch |
| `/api/users?filters[role]=murid&filters[batch_id]={id}&page=1&per_page=10` | GET | List murid dalam 1 batch |
| `/api/users?filters[role]=murid&filters[batch_id]={id}&filters[halaqah_user_status]=0&page=1&per_page=10` | GET | Murid yg belum masuk halaqah manapun (status=0) |
| `/users/{id}` (bukan `/api/`) | GET (page) | Halaman detail user — data di-inject server-side (Inertia), gak ada fetch API terpisah ketangkep |

## Reports

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/reports/jam-mengajar?page=1&per_page=10&keyword=&sort_by=name&sort=asc&date_filter={"created_at":{"start":"YYYY-MM-DD 00:00:00","end":"YYYY-MM-DD 23:59:59"}}` | GET | Rekap jam mengajar guru per rentang tanggal |
| `/api/reports/absensi-murid?page=1&per_page=10` | GET | **Rekap kehadiran murid, lintas SEMUA program** (gak perlu filter batch). Tiap item: `user{id,name,user_code,phone,avatar}, program, halaqah, halaqah_id, pertemuan ("6/26"), pengajar, kehadiran_percentage`. Total 1395 murid di sistem ini. |
| `/api/reports/program?filters[id]={program_id}` | GET | ⚠️ Balikin 500 "API Error" di data ini (kemungkinan bug backend) — hati-hati kalau mau dipakai |

---

## Write endpoints (CREATE / UPDATE) — verified 2026-07-14

Ditemukan lewat capture XHR + replay via `window.axios` (auto-handle XSRF). **Semua mutasi lewat `window.axios` di tab yang udah login** paling aman (baseURL + XSRF-TOKEN header di-set otomatis oleh app). `fetch` manual butuh header `X-XSRF-TOKEN` (decode cookie) — dan pembacaan `document.cookie` sering diblok tool sandbox.

**Gotcha besar — method spoofing**: resource `halaqah` & `users` **tidak** menerima HTTP `PUT` langsung (balik `405 The PUT method is not supported`). Update WAJIB `POST` ke `/{id}` dengan field `_method: "PUT"` (Laravel method spoofing).

**Gotcha — write `users` balas `302 → /login` padahal BERHASIL** (live-verified 7 Sep 2026, 3 akun): `POST /api/users/{id}` + `_method:"PUT"` dari sesi admin bisa balik `302` ke halaman login seolah tidak terautentikasi, **tapi barisnya benar-benar berubah**. Sama seperti DELETE pertemuan/presensi: jangan percaya status code, verifikasi lewat re-fetch `/api/users/{id}`. Real `PUT` ke path yang sama juga balas `302` — tapi belum terbukti menulis, jadi tetap pakai bentuk `POST` + `_method`.

**Tidak ada endpoint hapus user.** `DELETE /api/users/{id}` terdaftar di router (muncul di daftar "Supported methods") tapi selalu `302 → /login` dengan sesi admin, semua bentuk header dicoba (polos, XHR, Inertia, `?_method=DELETE`); bandingkan `DELETE /api/presensis/{id}` → `404` wajar dan `DELETE /api/pertemuans/{id}` → `500` wajar. Permission-nya ber-`guard_name: "api"`, jadi kemungkinan route ini minta token API, bukan cookie session. Pengganti yang dipakai: nonaktifkan dengan `status: 0` (reversible) — lihat `scripts/nonaktifkan-duplikat-guru.ts`.

### Halaqah

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/halaqah` | POST | **Buat halaqah.** Body: `{batch_id, name, type("offline"/"online"/"hybrid"), level_id, day_id, session_id, description, user_id, status:1}`. `user_id` = **guru** (satu guru per halaqah). |
| `/api/halaqah/{id}` | POST + `_method:"PUT"` | **Update halaqah** (termasuk ganti guru via `user_id`). Body sama seperti create + `_method:"PUT"`. PUT langsung → 405. |
| `/api/pertemuans` | POST | **Buat pertemuan/jadwal** (satu per call). Body: `{name, order, type, start_session_date"YYYY-MM-DD HH:MM:SS", end_session_date, guru_id, online_url, offline_place, notes, task_name, task_description, task_due, status:1, moduls:[], schedule_date"YYYY-MM-DD", halaqah_id, batch_id}`. **Jam riil disimpan di `start_session_date`/`end_session_date`** (mis. 18:00-18:45), bukan di label sesi halaqah. Tidak ada endpoint bulk-generate — loop manual per pertemuan. |
| `/api/pertemuans/{id}` | PUT | Update pertemuan (lihat body di section Pertemuan atas). |
| `/api/pertemuans/{id}` | DELETE | Hapus pertemuan — **status code tidak bisa dipercaya**, lihat section Pertemuan atas. |
| `/api/presensis` | POST | **Isi presensi 1 murid untuk 1 pertemuan.** Body JSON flat: `{halaqah_user_id, halaqah_jadwal_id, status, notes}`. `halaqah_user_id` = `users[].pivot.id` dari `/api/halaqah/{id}` (BUKAN `user_id`). Status yang sudah dikonfirmasi live: `1` Hadir, `2` Telat, `3` Izin/Sakit; `0` Alfa belum pernah ditulis. Satu murid per call — tidak ada bulk. Boleh diisi walau jadwal sudah `Selesai`. |
| `/api/presensis?per_page=n` | GET | List presensi (paginated) — `data.presensis[]`. Berguna untuk verifikasi setelah write. |
| `/api/presensis/{id}` | DELETE | **Hapus presensi 1 murid untuk 1 pertemuan.** ⚠️ Sama seperti DELETE pertemuan: balas `500 {"message":"Gagal menghapus presensi"}` **padahal barisnya benar-benar terhapus**. Verifikasi lewat re-fetch `/api/halaqah/{id}`, jangan percaya status code. Id yang tidak ada balas `404 {"message":"Data presensi tidak ditemukan."}`. Live-verified 5 Sep 2026: 7 delete, 7 balas 500, `presensis[]` jadi kosong semua. Tidak ada bulk — satu id per call. |

Contoh create body yang jalan (halaqah 203):
```json
{"batch_id":8,"name":"HITS NURIM 00147 07","type":"offline","level_id":6,
 "day_id":12,"session_id":14,"description":"","user_id":61,"status":1}
```

### Users (murid / guru)

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/users` | POST | **Buat user** (murid/guru). Lihat body di bawah. `email` **WAJIB** (422 kalau kosong), walau banyak murid lama `email=null` (hasil import, bypass validasi). `password` default = nomor HP. `gender`: `1`=Laki-laki, `2`=Perempuan. |
| `/api/users/{id}` | POST + `_method:"PUT"` | **Update user / enroll ke halaqah.** Set `halaqah_id` + `move_reason` (**WAJIB**, 422 kalau kosong) buat masukkan/pindahkan murid ke halaqah. |

Body create murid (yang jalan):
```json
{"name":"...","email":"<hp>@murid.hits","phone":"628...","user_code":"",
 "gender":2,"role":"murid","bio":"","wag":"Belum",
 "halaqah_id":203,"old_halaqah_id":null,"move_reason":"",
 "password":"628...","password_confirmation":"628...","batch_id":8,
 "meta":{"bio":"","wag":"Belum"}}
```
⚠️ **`halaqah_id` di payload CREATE TIDAK meng-enroll** murid ke pivot halaqah (cuma bikin user). Enrollment = call **kedua** ke `POST /api/users/{id}` + `_method:"PUT"` + `halaqah_id` + `move_reason` (wajib). NIM (`user_code`) di-generate belakangan (sempat null sesaat setelah create).

### Master Hari & Sesi (Pengaturan)

| Endpoint | Method | Keterangan |
|---|---|---|
| `/api/days` | GET | List hari. **Scoped per program aktif** — hasil beda tergantung batch/program yang lagi dipilih. |
| `/api/days` | POST | Buat hari. Body `{name, int_days:[idx]}` (0=Senin…5=Sabtu,6=Ahad). ⚠️ Balik **200 tapi tidak persist** kalau nama duplikat dengan record hidden (mis. "Sabtu" sudah ada `id 12` tapi ke-exclude dari master list). |
| `/api/sessions` | GET/POST | Sama pola. Buat sesi body `{name, start_hour"HH:MM", end_hour"HH:MM"}`. Master juga scoped per program. |

**Kunci inkonsistensi**: master `days`/`sessions` yang dipakai halaqah bisa **beda** dari yang muncul di halaman `/hari` `/sesi`. Halaqah HITS Masjid Nurul Iman semua pakai `day_id 12` ("Sabtu") + `session_id 14` ("00:00-00:00") yang **tidak muncul** di master list biasa — tapi **muncul** di dropdown form Tambah Halaqah saat program context sudah benar. Jam riil pertemuan disimpan per-jadwal (`start/end_session_date`), bukan di label sesi (semua halaqah pakai placeholder 00:00-00:00).

**Guru dropdown quirk**: dropdown "Pilih Guru" di form halaqah **tidak** menampilkan guru yang baru dibuat tanpa halaqah assignment (search balik "Data tidak ditemukan") walau guru itu valid di `/api/users?filters[role]=guru&filters[batch_id]=X`. Workaround: buat halaqah dgn guru placeholder, lalu `POST /api/halaqah/{id}` `_method:PUT` set `user_id` ke guru target.

---

## Insight buat bikin dashboard

1. **Endpoint paling kaya buat dashboard**: `/api/reports/absensi-murid` (kehadiran per murid, cross-program, udah dihitung `kehadiran_percentage`) dan `/api/halaqah/{id}` (detail penuh termasuk `presensis` mentah kalau butuh breakdown per pertemuan/per lahn tajwid).
2. **Field `performance` di object halaqah** ("0.00" di semua data yg keliatan) — kemungkinan belum di-trigger recalculate oleh backend, jangan diandalkan dulu tanpa verifikasi.
3. **Pola paginasi seragam**: `page, per_page, sort_by, sort, keyword` — gampang dibikin generic fetcher.
4. **Filter pakai bracket notation**: `filters[key]=value` (Laravel style), termasuk nested kayak `date_filter[created_at][start]`.
5. **Semua endpoint list butuh `batch_id` atau `program_id`** kecuali `absensi-murid` — kalau mau agregat lintas program/batch, mulai dari situ.
6. **Rate/reliability**: gak ada rate-limit header kelihatan, tapi ini server produksi kecil — kalau bikin dashboard polling, jangan terlalu agresif (gunakan interval wajar, cache di client).
7. **Tidak ada endpoint bulk/export** ketemu — kalau butuh export besar, tetap harus paginate manual per `per_page`.

## Cara pakai dari luar (non-browser)

```
1. POST login (butuh reverse-engineer field name form login / pakai headless browser sekali buat dapat cookie)
2. Simpan Set-Cookie: laravel_session=..., XSRF-TOKEN=...
3. Tiap request: Cookie header + X-XSRF-TOKEN (decode dari XSRF-TOKEN cookie) + X-Requested-With: XMLHttpRequest
4. GET endpoint apapun di atas seperti biasa
```

Kalau dashboard jalan di browser yang sama (extension/bookmarklet/script disuntik ke tab yang udah login), tinggal `fetch(url, {credentials:'include'})` — persis kayak yang dipakai buat audit & fix tanggal kemarin.
