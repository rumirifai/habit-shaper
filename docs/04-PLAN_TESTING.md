# 04 — Plan Testing Habit Shaper

| Field | Isi |
|---|---|
| Versi | 1.0 (2026-09-25) |
| Acuan | `01-PRD.md` v1.0, `02-SAD.md` v1.0, `03-SDD.md` v1.0 |
| Cakupan phase | Phase 1 – Phase 4 (Phase 0 dan Phase 5 tidak diuji di sini) |
| Aturan TS | Strict, `no-explicit-any: error`; test juga tanpa `any` |

Dokumen ini adalah matriks dan rencana testing. Setiap item memakai checklist `- [ ]` agar bisa ditandai saat dikerjakan. Semua ID test bersifat stabil (mis. `AUTH-I-01`) supaya bisa dirujuk di PR/commit.

Keluar scope (tidak dibuatkan test): reminder/notifikasi, sosial, gamifikasi ekstra, frekuensi custom, import/export, kalender, mobile native, analitik lanjutan, AI coach (lihat PRD §3.2). `StreakCache` juga tidak diuji karena belum diimplementasikan (SDD §2.1).

## 1. Perkakas dan Konvensi

| Kebutuhan | Pilihan terkunci |
|---|---|
| Unit + integration backend | Vitest (`vitest`), environment `node` |
| HTTP route testing | Supertest terhadap Express app (tanpa listen port) |
| Frontend testing | React Testing Library + Vitest environment `jsdom` + `user-event` |
| DB integration | PostgreSQL test database terpisah + Prisma (`prisma migrate deploy`) |
| Validasi kontrak | Skema Zod yang sama dengan kode produksi (tidak diduplikasi manual) |
| Timezone test | Proses test jalan dengan `TZ=Asia/Jakarta`; util tanggal diuji sebagai fungsi murni dengan parameter `today` eksplisit |

Layout yang disarankan:

```text
apps/api/
  vitest.config.ts
  tests/
    setup.ts            # buat app, siapkan DB, helper auth
    auth.integration.test.ts
    habits.integration.test.ts
    goals.integration.test.ts
    streak.integration.test.ts
  src/lib/__tests__/
    dates.unit.test.ts
    streak.unit.test.ts
    goal-progress.unit.test.ts
apps/web/
  vitest.config.ts
  src/__tests__/
    auth-ui.test.tsx
    habit-checkin.test.tsx
    weekly-view.test.tsx
    goal-picker.test.tsx
```

Konvensi:

- Satu test = satu perilaku. Nama test memakai pola `METHOD path -> ekspektasi (kode)`.
- Setiap integration test memakai user baru (isolasi tenant) kecuali test isolasi itu sendiri.
- Assertion error memakai envelope `{ error: { code, message } }`, bukan string mentah.
- Dilarang `as any` di test; bangun helper typed (mis. `authHeader(token: string)`).

## 2. Matriks Testing per Phase

### Phase 1 — DB + Auth (`apps/api`, Prisma + Auth)

Tujuan: skema sesuai SDD §2 dan isolasi multi-user (PRD FR-01, SDD §5).

#### 2.1 Integration — Auth routes

- [ ] `AUTH-I-01` `POST /api/v1/auth/register` 201 + body `{ user: { id, email, name } }`, tanpa `passwordHash` bocor.
- [ ] `AUTH-I-02` Register email duplikat -> 409/400 dengan envelope `error.code` terisi.
- [ ] `AUTH-I-03` Register email invalid / password terlalu pendek -> 400 `VALIDATION_ERROR` + `details` dari Zod.
- [ ] `AUTH-I-04` `POST /api/v1/auth/login` kredensial benar -> 200 `{ accessToken }` + set-cookie refresh `HttpOnly`.
- [ ] `AUTH-I-05` Login password salah -> 401, tidak ada cookie yang di-set.
- [ ] `AUTH-I-06` `POST /api/v1/auth/refresh` dengan cookie valid -> 200 access token baru.
- [ ] `AUTH-I-07` Refresh tanpa cookie / cookie rusak -> 401.
- [ ] `AUTH-I-08` `POST /api/v1/auth/logout` -> 204 + cookie di-clear.
- [ ] `AUTH-I-09` Akses route terproteksi tanpa token -> 401.
- [ ] `AUTH-I-10` Isolasi tenant: user A tidak bisa `GET /habits` milik user B; `GET /habits/:id` milik orang lain -> 404 (bukan 403).
- [ ] `AUTH-I-11` Password tersimpan sebagai hash (bukan plaintext) — cek via Prisma langsung.
- [ ] `AUTH-I-12` `requireAuth` menyuntik `req.user.id` bertipe `string` dan semua query habit/goal memfilter `ownerId`.

### Phase 2 — API Inti Habits, Goals, Check-in, Streak (`apps/api`)

Tujuan: kontrak SDD §3.2–§3.4 + aturan bisnis PRD FR-02/FR-03/FR-06/FR-07.

#### 2.2 Integration — Habits CRUD

- [ ] `HAB-I-01` `POST /habits` POSITIVE valid -> 201 + tersimpan dengan `ownerId` benar.
- [ ] `HAB-I-02` `POST /habits` NEGATIVE valid -> 201.
- [ ] `HAB-I-03` `POST /habits` title kosong / type invalid -> 400 `VALIDATION_ERROR`.
- [ ] `HAB-I-04` `GET /habits` hanya mengembalikan milik user login + memuat status hari ini.
- [ ] `HAB-I-05` `GET /habits/:id` milik sendiri -> 200 + streak ringkas.
- [ ] `HAB-I-06` `GET /habits/:id` milik user lain -> 404.
- [ ] `HAB-I-07` `PATCH /habits/:id` ubah title/description -> 200; type tidak boleh diganti diam-diam bila diputuskan immutable (atau 400 bila ditolak).
- [ ] `HAB-I-08` `PATCH /habits/:id` milik orang lain -> 404.
- [ ] `HAB-I-09` `DELETE /habits/:id` -> 204 + check-in ikut terhapus + join `GoalHabit` ikut terhapus, goal lain tetap ada.

#### 2.3 Integration — Check-in dan Undo

- [ ] `CHK-I-01` `POST /habits/:id/check-in` tanpa body (hari ini WIB) -> 200 `{ habitId, date, streak }`.
- [ ] `CHK-I-02` Check-in ganda di hari sama -> 200 hasil identik, tidak ada baris ganda (unique `habitId+date`), streak tidak naik 2x.
- [ ] `CHK-I-03` Check-in habit NEGATIVE memakai endpoint sama dengan semantik DONE = hari bersih.
- [ ] `CHK-I-04` Check-in dengan `date` masa depan WIB -> 422 `FUTURE_DATE`.
- [ ] `CHK-I-05` Backfill kemarin / >7 hari lalu (default MVP) -> 422 `BACKFILL_NOT_ALLOWED`.
- [ ] `CHK-I-06` Check-in habit milik orang lain -> 404.
- [ ] `CHK-I-07` `DELETE /habits/:id/check-in?date=hari-ini` (undo) -> 204 + streak turun saat dihitung ulang.
- [ ] `CHK-I-08` Undo tanggal selain hari ini (MVP) -> 422/404 sesuai keputusan.
- [ ] `CHK-I-09` Undo check-in yang tidak ada -> 404 dengan envelope baku.

#### 2.4 Integration — Goals dan relasi many-to-many

- [ ] `GOAL-I-01` `POST /goals` dengan `habitIds` existing milik sendiri -> 201 + join terbentuk.
- [ ] `GOAL-I-02` `POST /goals` tanpa `habitIds` dan tanpa `newHabits` -> 422 pesan "minimal 1 habit".
- [ ] `GOAL-I-03` `POST /goals` dengan `newHabits` inline -> 201 + habit baru terbuat dengan `ownerId` sama + join terbentuk (transaksi atomik).
- [ ] `GOAL-I-04` `POST /goals` campuran `habitIds` + `newHabits` (build+break) -> 201.
- [ ] `GOAL-I-05` `POST /goals` memakai `habitId` milik user lain -> 404/422, goal tidak terbuat setengah jalan.
- [ ] `GOAL-I-06` `GET /goals` memuat `habitCount` + progres per goal.
- [ ] `GOAL-I-07` `GET /goals/:id` memuat daftar habits + progres (`weeklyCompletionPct`, `perHabit`).
- [ ] `GOAL-I-08` `PATCH /goals/:id` ubah title/description/deadline -> 200 dan tidak mengubah streak habit.
- [ ] `GOAL-I-09` `DELETE /goals/:id` -> 204 + habit dan check-in tetap utuh (hanya join dihapus); streak habit tidak berubah.
- [ ] `GOAL-I-10` `POST /goals/:id/habits` assign habit existing -> 200; assign ganda idempotent 200 tanpa duplikat.
- [ ] `GOAL-I-11` Assign habit milik orang lain -> 404.
- [ ] `GOAL-I-12` `DELETE /goals/:id/habits/:habitId` unassign satu dari banyak -> 200.
- [ ] `GOAL-I-13` Unassign habit terakhir dalam goal -> 422 (goal tidak boleh 0 habit).
- [ ] `GOAL-I-14` Error goal selalu envelope `{ error: { code, message, details? } }` untuk 400/401/404/422.

#### 2.5 Integration — Streak endpoints

- [ ] `STRK-I-01` `GET /habits/:id/streak?range=daily` -> `{ current, longest, lastDoneDate }` konsisten dengan unit calc.
- [ ] `STRK-I-02` `GET /habits/:id/streak?range=weekly&week=yyyy-mm-dd` menormalisasi ke Senin + `{ done, miss, allowance: 3, remaining, days[7] }`.
- [ ] `STRK-I-03` Weekly `remaining = max(0, 3 - miss)`; `miss > 3` tetap 0, bukan negatif.
- [ ] `STRK-I-04` `week` invalid -> 400 `VALIDATION_ERROR`.
- [ ] `STRK-I-05` Streak habit milik orang lain -> 404.

### Phase 3 — UI Next.js (React Testing Library)

Tujuan: alur PRD US-02–US-11 dalam ≤3 klik, label POSITIVE vs NEGATIVE benar.

- [ ] `UI-01` Form register/login menampilkan error validasi (email invalid, password pendek) tanpa submit ke API.
- [ ] `UI-02` Daftar habit hari ini render dari API + status DONE/PENDING per habit.
- [ ] `UI-03` Tombol check-in habit POSITIVE berlabel "Selesai" dan memanggil `POST check-in`; optimistik/tunggu response lalu refresh badge.
- [ ] `UI-04` Tombol check-in habit NEGATIVE berlabel "Hari bersih" (bukan "Selesai").
- [ ] `UI-05` Tombol undo hanya untuk hari ini; setelah undo badge kembali PENDING.
- [ ] `UI-06` Detail streak harian menampilkan `current`, `longest`, `lastDoneDate`.
- [ ] `UI-07` Weekly view Senin–Minggu menampilkan `done X/7`, `miss Y`, `sisa toleransi max(0, 3-Y)` + highlight minggu berjalan.
- [ ] `UI-08` Navigasi minggu mundur memanggil API dengan `week` yang dinormalisasi ke Senin.
- [ ] `UI-09` Form goal menolak submit tanpa habit (pesan "minimal 1 habit") sebelum request.
- [ ] `UI-10` Goal picker bisa pilih habit existing + buat habit baru inline dalam satu submit.
- [ ] `UI-11` Daftar goal menampilkan progres (`weeklyCompletionPct`, per-habit done/miss).
- [ ] `UI-12` Hapus goal menampilkan konfirmasi dan copy "streak habit tidak ikut terhapus".
- [ ] `UI-13` State error API (401/404/422) dirender sebagai pesan ramah, bukan crash.

### Phase 4 — Logic Hardening: unit murni + edge (`apps/api` dan `apps/web` logika)

Tujuan: algoritma SDD §4 dan state machine SDD §5. Semua unit tanpa DB.

#### 2.6 Unit — util tanggal WIB (SDD §4.1)

- [ ] `DATE-U-01` `todayWib()` format `yyyy-mm-dd` dan memakai zona `Asia/Jakarta` (mock `Date` di batas tengah malam UTC vs WIB).
- [ ] `DATE-U-02` `mondayOfWeekWib()` untuk Senin -> dirinya sendiri.
- [ ] `DATE-U-03` `mondayOfWeekWib()` untuk Minggu -> Senin 6 hari sebelumnya.
- [ ] `DATE-U-04` `mondayOfWeekWib()` untuk Rabu -> Senin minggu sama.
- [ ] `DATE-U-05` `mondayOfWeekWib()` melewati batas bulan/tahun (mis. 2026-09-28 Senin vs 2026-10-04 Minggu; 2025-12-29 Senin vs 2026-01-04 Minggu).
- [ ] `DATE-U-06` `prevDate`/`addDays` benar di batas bulan dan tahun kabisat.
- [ ] `DATE-U-07` Input tanggal invalid ditolak Zod (`z.string().date()`), bukan dilempar sebagai `Invalid Date` diam-diam.

#### 2.7 Unit — daily streak (SDD §4.2)

- [ ] `DAILY-U-01` 5 DONE berturut-turut -> `current = 5`.
- [ ] `DAILY-U-02` Pola DONE, DONE, kosong, DONE (hari ini) -> `current = 1` (1 hari kosong memutus).
- [ ] `DAILY-U-03` Hari ini belum DONE tapi kemarin DONE beruntun -> `current` dihitung dari kemarin (hari ini PENDING, belum memutus).
- [ ] `DAILY-U-04` `MISS` eksplisit == hari kosong untuk pemutus streak.
- [ ] `DAILY-U-05` Habit NEGATIVE memakai mesin sama: DONE = lanjut, kosong/MISS = putus.
- [ ] `DAILY-U-06` Undo hari ini (hapus DONE) menurunkan `current` saat dihitung ulang.
- [ ] `DAILY-U-07` Tidak ada toleransi di level harian: 1 miss kemarin membuat `current` mulai dari 0/1, bukan dilanjutkan.

#### 2.8 Unit — longest streak

- [ ] `LONG-U-01` Data campuran (mis. run 3, putus, run 5) -> `longest = 5`.
- [ ] `LONG-U-02` Semua DONE -> `longest = jumlah hari`.
- [ ] `LONG-U-03` Baris FUTURE tidak ikut memutus/menambah `longest`.
- [ ] `LONG-U-04` Riwayat kosong -> `longest = 0`, `lastDoneDate = null`.

#### 2.9 Unit — weekly + allowance 3 (SDD §4.3)

- [ ] `WEEK-U-01` Minggu penuh 7 DONE -> `done 7, miss 0, remaining 3`.
- [ ] `WEEK-U-02` `done 4, miss 3` -> `remaining 0` (batas pas).
- [ ] `WEEK-U-03` `miss 5` -> `remaining 0` (clamp, bukan negatif).
- [ ] `WEEK-U-04` Hari ini PENDING (kosong) berstatus `PENDING`, bukan `MISS`; hari lalu yang kosong berstatus `MISS`.
- [ ] `WEEK-U-05` Tanggal > today berstatus `FUTURE` dan tidak dihitung `done/miss`.
- [ ] `WEEK-U-06` `weekStart` selalu Senin, `weekEnd = weekStart + 6` (Minggu).
- [ ] `WEEK-U-07` `MISS` eksplisit dan kosong masa lalu sama-sama `miss + 1`.
- [ ] `WEEK-U-08` Elapsed days: `weeklyCompletionPct = round(100 * sum(done) / max(1, habitCount * elapsedDays))`.

#### 2.10 Unit — progres goal (SDD §4.4)

- [ ] `GOAL-U-01` 1 goal 2 habit: agregat `sum(done)` benar + `habitCount = 2`.
- [ ] `GOAL-U-02` Campuran build+break dihitung dengan DONE yang sama.
- [ ] `GOAL-U-03` Goal tanpa habit tidak mungkin lolos validasi (ditolak di level Zod, bukan dihitung 0%).
- [ ] `GOAL-U-04` Pembagi memakai `max(1, habitCount * elapsedDays)` sehingga tidak division-by-zero.

#### 2.11 Edge case lintas lapisan (SDD §5)

- [ ] `EDGE-01` Backfill kemarin ditolak 422 `BACKFILL_NOT_ALLOWED`; data tetap MISS.
- [ ] `EDGE-02` Future date ditolak 422 `FUTURE_DATE`.
- [ ] `EDGE-03` Otoritas tanggal: backend menentukan hari ini (WIB); kiriman `date` client yang beda zona tetap dinormalisasi/ditolak, bukan dipercaya mentah.
- [ ] `EDGE-04` Double check-in konkuren tidak membuat duplikat (unique constraint; `P2002` diperlakukan sukses idempotent).
- [ ] `EDGE-05` Hapus goal: habit + check-in utuh; hitung ulang streak sebelum/sesudah sama.
- [ ] `EDGE-06` Hapus habit: check-in + join ikut hilang; goal lain tidak ikut terhapus.
- [ ] `EDGE-07` Assign lintas user 404; tidak ada join yang terbentuk.
- [ ] `EDGE-08` Hari kosong masa lalu = MISS implisit untuk daily dan weekly (konsisten di kedua fungsi).
- [ ] `EDGE-09` Param `week` sembarang tanggal dinormalisasi ke Senin-nya; invalid -> 400.
- [ ] `EDGE-10` Prisma `P2002` check-in -> 200 idempotent; `P2025` -> 404; `P2003` -> 404/422 (mapping diuji, bukan asumsi).
- [ ] `EDGE-11` Tidak ada `any` di kode test maupun sumber: `tsc --noEmit` + ESLint `no-explicit-any` lolos.

## 3. Command Windows (PowerShell)

Semua command dari root monorepo `D:\habit-shaper` kecuali disebut lain. Gunakan PowerShell, bukan Git Bash, agar env dan path konsisten.

### 3.1 Setup sekali saja

```powershell
# dari D:\habit-shaper
node --version; npm --version
npm install

# DB test via compose (service db saja, port 5432)
docker compose up -d db

# env test backend (contoh; sesuaikan nama file env proyek)
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/habit_shaper_test?schema=public"
$env:TZ = "Asia/Jakarta"
npx --prefix apps/api prisma migrate deploy
```

### 3.2 Backend: unit saja (cepat, tanpa DB)

```powershell
# dari D:\habit-shaper\apps\api
npx vitest run src/lib/__tests__/dates.unit.test.ts src/lib/__tests__/streak.unit.test.ts src/lib/__tests__/goal-progress.unit.test.ts
```

### 3.3 Backend: integration per file (butuh DB test menyala)

```powershell
# dari D:\habit-shaper\apps\api
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/habit_shaper_test?schema=public"
$env:TZ = "Asia/Jakarta"

npx vitest run tests/auth.integration.test.ts
npx vitest run tests/habits.integration.test.ts
npx vitest run tests/goals.integration.test.ts
npx vitest run tests/streak.integration.test.ts
```

### 3.4 Backend: semua test + coverage + typecheck + lint

```powershell
# dari D:\habit-shaper\apps\api
npx vitest run
npx vitest run --coverage
npx tsc --noEmit
npx eslint . --max-warnings=0
```

### 3.5 Frontend (RTL)

```powershell
# dari D:\habit-shaper\apps\web
npx vitest run
npx vitest run src/__tests__/habit-checkin.test.tsx src/__tests__/weekly-view.test.tsx
npx vitest run --coverage
npx tsc --noEmit
npx eslint . --max-warnings=0
```

### 3.6 Watch mode saat mengembangkan (opsional)

```powershell
# terminal 1 — backend
cd D:\habit-shaper\apps\api; npx vitest watch tests/habits.integration.test.ts

# terminal 2 — frontend
cd D:\habit-shaper\apps\web; npx vitest watch src/__tests__/weekly-view.test.tsx
```

### 3.7 Menyalakan ulang DB test bila kotor

```powershell
# reset total database test (HATI-HATI: hanya untuk DB test)
docker compose down -v
docker compose up -d db
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/habit_shaper_test?schema=public"
npx --prefix apps/api prisma migrate deploy
```

## 4. Exit Criteria per Phase (HITL gate)

- Phase 1 lolos bila `AUTH-I-01`–`AUTH-I-12` hijau + review ERD.
- Phase 2 lolos bila `HAB-I`, `CHK-I`, `GOAL-I`, `STRK-I` hijau + kontrak cocok SDD §3.
- Phase 3 lolos bila `UI-01`–`UI-13` hijau + walkthrough 3 klik < 10 detik/check-in.
- Phase 4 lolos bila `DATE-U`, `DAILY-U`, `LONG-U`, `WEEK-U`, `GOAL-U`, `EDGE-01`–`EDGE-11` hijau.
- Setiap gate: jalankan `tsc --noEmit` + ESLint `no-explicit-any` + `vitest run` terkait, lalu minta review manusia sebelum lanjut (SAD §8.2).
