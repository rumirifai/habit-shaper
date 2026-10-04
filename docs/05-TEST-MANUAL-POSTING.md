# Pengujian Manual API dengan Posting TUI

Dokumen ini menjelaskan koleksi request yang dipakai untuk smoke test API secara manual melalui plugin **Posting TUI**. Koleksi berada di `habit-shaper-collections/`; standar implementasi dan kontrak endpoint tetap mengacu ke `API_CONVENTIONS.md` dan `03-SDD.md`.

## Prasyarat

- Docker Desktop dan Docker Compose aktif.
- Jalankan dari root repo:

  ```powershell
  docker compose up --build -d db api
  docker compose exec api npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
  ```

- API dapat diakses dari host pada `http://localhost:4000`; healthcheck: `http://localhost:4000/health`.
- Posting TUI/plugin Posting sudah terpasang dan bisa membuka folder koleksi lokal.
- PostgreSQL dev Compose memakai default user/password/database `habit` / `habit_dev_password` / `habitshaper`, kecuali diubah lewat `.env`.

## Menjalankan koleksi

1. Buka `habit-shaper-collections/` sebagai collection/folder pada Posting TUI.
2. Jalankan request di `.auth/` terlebih dahulu. Ganti email dan password contoh di `register.posting.yaml` dengan akun test yang unik bila akun tersebut sudah pernah dibuat.
3. Jalankan `login.posting.yaml`. Handler `scripts/refresh_handler.py` menyimpan `$ACCESS_TOKEN` untuk request privat berikutnya.
4. Jalankan request habit: buat/list/detail/edit, check-in hari ini, streak, lalu undo bila perlu. Handler `scripts/habit_handler.py` menyimpan `$HABIT_ID` dari respons habit agar bisa dipakai request terkait.
5. Jalankan request goal: create/list/detail/edit/assign/unassign/delete. Lakukan create goal dengan `$HABIT_ID` yang sudah tersimpan.
6. Jalankan logout setelah selesai.

Request dan handler ada di direktori `.auth/`, `.habits/`, `.goals/`, dan `scripts/`. Variabel `$ACCESS_TOKEN`, `$HABIT_ID`, dan variabel goal dikelola oleh response scripts pada koleksi. Jika nilai tidak terisi, cek response request sebelumnya dan pastikan handler terkait terpasang/berhasil berjalan.

## Urutan smoke test yang disarankan

1. Register atau login → pastikan register tidak membocorkan `passwordHash`, login mengembalikan access token.
2. Buat habit `POSITIVE`, lalu check-in hari ini → periksa status DONE dan streak.
3. Buat habit `NEGATIVE`, lalu check-in → maknanya “hari bersih”.
4. Ambil daily/weekly streak; verifikasi minggu Senin–Minggu, sisa toleransi, dan status tanggal future.
5. Buat goal dengan habit existing; coba create tanpa habit untuk memeriksa aturan 422.
6. Uji assign/unassign dan delete goal; hapus goal tidak boleh menghapus habit atau check-in.
7. Uji delete habit yang menjadi satu-satunya habit goal dengan replacement; pastikan relasi pengganti terbentuk atomik.
8. Logout dan pastikan cookie sesi dibersihkan.

Semua error harus mengikuti envelope `{ "error": { "code", "message", "details?" } }`. Bentuk request invalid menghasilkan 400 `VALIDATION_ERROR`; pelanggaran aturan bisnis menggunakan status/kode yang ditetapkan kontrak (misalnya goal tanpa habit: 422 `UNPROCESSABLE_ENTITY`). Posting TUI adalah pemeriksaan manual/smoke test dan tidak menggantikan Vitest integration/unit tests.

## Catatan Compose dan perubahan kode

Compose memasang source API (`apps/api/src`), source web (`apps/web`), serta `packages/shared/src` sebagai bind mounts; perubahan file source tersebut terlihat di container melalui watcher tanpa build image ulang. Perubahan Dockerfile, dependency, `package.json` workspace, atau file yang hanya disalin saat image build perlu `docker compose up --build` dan container recreate. Compose juga memasang volume anonim pada `/app/node_modules`, yang bisa menutupi dependencies dari image baru; jika dependency berubah, perbarui install di container atau recreate volume anonim dengan `docker compose up --build --renew-anon-volumes`. Hindari menghapus volume database `pgdata` saat hanya ingin memperbarui kode/dependency.

## Koleksi Postman

Folder `postman/` juga memuat koleksi Postman untuk request yang sama. Gunakan salah satu client sesuai kebutuhan; kontrak endpoint dan test terotomasi tetap menjadi acuan.
