# Auto-deploy: push ke `main` → live di VPS (tanpa SSH manual)

Setelah setup sekali di bawah, alurnya: **kamu merge/push ke `main` → GitHub
Actions build image off-box (GHCR) → SSH ke VPS jalankan `docker compose` →
migrasi + app naik → cek health.** Kamu tak perlu buka SSH lagi.

Build pindah ke Actions (bukan di VPS) supaya VPS yang juga jalan n8n tak
kehabisan RAM saat `next build`.

File terkait:
- `.github/workflows/deploy.yml` — pipeline-nya.
- `deploy/docker-compose.yml` — service `app`/`migrate` sekarang pakai `image:`
  dari GHCR (masih ada `build:` sebagai fallback lokal).

## Remote mana yang men-deploy

**Hanya `hilmihs`.** Semua secret VPS (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
`VPS_SSH_PORT`, `VPS_APP_DIR`) plus password login tilawah/mabni/berkah ada di
`hilmihs/dashboard-administrasi-edu`, jadi push ke sanalah yang benar-benar
menaikkan versi baru ke VPS.

`origin` (Tilawa Labs-Project-Dev) tidak punya satu pun secret. Workflow-nya dulu
tetap ikut jalan tiap push dan **selalu** mati di langkah SSH dengan
`error: missing server host` — build + push image ke GHCR sukses, lalu gagal,
lengkap dengan notifikasi merah yang tidak berarti apa-apa. Workflow-nya
sekarang **dimatikan di sisi repo** (Actions → Deploy to VPS → disabled, 5 Sep
2026); berkasnya sengaja dibiarkan identik di kedua repo supaya tidak ada
cabang yang perlu dirawat.

Artinya: push ke `origin` = menyimpan kode saja, **tidak** men-deploy. Kalau
suatu saat repo org mau jadi jalur deploy, salin dulu ke-9 secret itu ke sana
lalu aktifkan kembali workflow-nya — dan matikan yang di `hilmihs`, supaya
kunci SSH VPS tidak hidup di dua tempat sekaligus.

---

## Setup sekali (butuh **satu** sesi SSH / Web Console)

### 1. Buat deploy key (di mesin lokalmu)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/vps_deploy -N "" -C "gha-deploy"
```

Hasil: `~/.ssh/vps_deploy` (private) + `~/.ssh/vps_deploy.pub` (public).

### 2. Pasang public key di VPS

Salin isi `~/.ssh/vps_deploy.pub`, lalu di VPS (Web Console atau SSH terakhirmu):

```bash
echo '<isi vps_deploy.pub>' >> ~/.ssh/authorized_keys
```

### 3. Buat PAT read-only untuk GHCR + login docker di VPS

Image GHCR privat (ikut repo privat), jadi VPS harus login sekali.

1. GitHub → Settings → Developer settings → **Personal access tokens (classic)**
   → Generate → centang scope **`read:packages`** saja → copy token.
2. Di VPS:

```bash
echo '<PAT>' | docker login ghcr.io -u hilmihs --password-stdin
```

Login tersimpan di `~/.docker/config.json` — bertahan across reboot.

> Alternatif tanpa PAT: buka package GHCR jadi *public* (Packages → package →
> Package settings → Change visibility → Public). Lebih simpel, tapi image
> (berisi kode app) jadi publik. Rekomendasi: tetap privat + PAT.

### 4. Pastikan repo ada di VPS & catat path-nya

```bash
# kalau belum ada:
cd ~ && git clone https://github.com/hilmihs/dashboard-administrasi-edu.git
# path clone, mis: /home/ubuntu/dashboard-administrasi-edu
pwd
```

### 5. Isi GitHub repo secrets

Repo → Settings → Secrets and variables → **Actions** → New repository secret:

| Secret | Isi |
|---|---|
| `VPS_HOST` | `43.133.139.12` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_PORT` | `22` |
| `VPS_SSH_KEY` | seluruh isi `~/.ssh/vps_deploy` (private key, termasuk baris BEGIN/END) |
| `VPS_APP_DIR` | path clone dari langkah 4, mis. `/home/ubuntu/dashboard-administrasi-edu` |

`GITHUB_TOKEN` (push ke GHCR) sudah otomatis, tak perlu dibuat.

### 6. Cut-over pertama (sekali, manual)

Compose sekarang minta `image:` dari GHCR — image itu baru ada setelah Actions
jalan sekali. Urutan aman:

1. Merge branch ini ke `main` (workflow trigger di `main`).
2. Push → tab **Actions** jalan otomatis: build 2 image (runner + build),
   push GHCR, SSH deploy, health check.
3. Kalau perlu picu manual: Actions → **Deploy to VPS** → **Run workflow**.

Kalau build image (`build-main`) belum sempat ke-pull di VPS pas pertama,
compose akan tarik sendiri saat `docker compose pull`. Aman.

---

## Operasional harian

- **Deploy** = merge/push ke `main`. Selesai. Pantau di tab Actions.
- **Deploy manual** = Actions → Deploy to VPS → Run workflow.
- **Migrasi** ikut tiap deploy (service `migrate`: `db:migrate` + `seed:programs`,
  idempotent — drizzle catat migrasi yang sudah jalan).
- **Health gate**: kalau `https://dashboard.example.org` tak balas 200 dalam ~60 detik,
  workflow merah — kamu langsung tahu ada masalah.

## Rollback

Tiap build di-tag dengan SHA commit. Untuk balik ke versi lama, di VPS:

```bash
cd $VPS_APP_DIR
docker compose -f deploy/docker-compose.yml pull   # optional
# jalankan image lama by SHA:
docker run ...  # atau edit tag di compose ke :runner-<sha-lama> lalu up -d
```

Cara paling gampang: `git revert` commit bermasalah → push ke `main` → auto
re-deploy versi sebelumnya.

## Troubleshooting

- **Actions gagal di step Deploy (SSH)** → cek `VPS_SSH_KEY` lengkap (BEGIN/END),
  `VPS_HOST`/`PORT` benar, pubkey ada di `authorized_keys`. Kalau pesannya
  `error: missing server host`, secret-nya bukan salah tapi **tidak ada** —
  pastikan yang jalan repo `hilmihs`, bukan repo lain (lihat "Remote mana yang
  men-deploy" di atas).
- **`docker compose pull` unauthorized di VPS** → PAT `read:packages` expired /
  belum `docker login ghcr.io`. Ulangi langkah 3.
- **Health check merah tapi app sebenarnya jalan** → cek Caddy eksternal masih
  reverse-proxy ke `m-edu-app-1:3000` (lihat catatan di `deploy/docker-compose.yml`).
- **`git reset --hard` di VPS** membuang perubahan lokal di box — jangan edit
  file langsung di VPS; semua lewat repo.
