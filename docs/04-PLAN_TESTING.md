# 04 — Plan Testing Habit Shaper

| Field         | Isi                                                         |
| ------------- | ----------------------------------------------------------- |
| Versi         | 1.0 (2026-09-25)                                            |
| Acuan         | `01-PRD.md` v1.0, `02-SAD.md` v1.0, `03-SDD.md` v1.0        |
| Cakupan phase | Phase 1 – Phase 4 (Phase 0 dan Phase 5 tidak diuji di sini) |
| Aturan TS     | Strict, `no-explicit-any: error`; test juga tanpa `any`     |

Dokumen ini adalah matriks dan rencana testing. Setiap item memakai checklist `- [ ]` agar bisa ditandai saat dikerjakan. Semua ID test bersifat stabil (mis. `AUTH-I-01`) supaya bisa dirujuk di PR/commit.

Keluar scope (tidak dibuatkan test): reminder/notifikasi, sosial, gamifikasi ekstra, frekuensi custom, import/export, kalender, mobile native, analitik lanjutan, AI coach (lihat PRD §3.2). `StreakCache` juga tidak diuji karena belum diimplementasikan (SDD §2.1).

## 1. Perkakas dan Konvensi

| Kebutuhan                  | Pilihan terkunci                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Unit + integration backend | Vitest (`vitest`), environment `node`                                                                                  |
| HTTP route testing         | Supertest terhadap Express app (tanpa listen port)                                                                     |
| Frontend testing           | React Testing Library + Vitest environment `jsdom` + `user-event`                                                      |
| DB integration             | PostgreSQL test database terpisah + Prisma (`prisma migrate deploy`)                                                   |
| Validasi kontrak           | Skema Zod yang sama dengan kode produksi (tidak diduplikasi manual)                                                    |
| Timezone test              | Proses test jalan dengan `TZ=Asia/Jakarta`; util tanggal diuji sebagai fungsi murni dengan parameter `today` eksplisit |

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

- [x] `AUTH-I-01` `POST /api/v1/auth/register` 201 + body `{ user: { id, email, name } }`, tanpa `passwordHash` bocor.
- [x] `AUTH-I-02` Register email duplikat -> 409 `CONFLICT`.
- [x] `AUTH-I-03` Register email invalid / password terlalu pendek -> 400 `VALIDATION_ERROR` + `details` dari Zod.
- [x] `AUTH-I-04` `POST /api/v1/auth/login` kredensial benar -> 200 `{ accessToken, user }` + set-cookie refresh `HttpOnly`.
- [x] `AUTH-I-05` Login password salah -> 401, tidak ada cookie yang di-set.
- [x] `AUTH-I-06` `POST /api/v1/auth/refresh` dengan cookie valid -> 200 access token baru dan user.
- [x] `AUTH-I-07` Refresh tanpa cookie / cookie rusak -> 401.
- [x] `AUTH-I-08` `POST /api/v1/auth/logout` -> 204 + cookie di-clear.
- [x] `AUTH-I-09` Akses route terproteksi tanpa token -> 401.
- [x] `AUTH-I-10` Isolasi tenant: user A tidak bisa `GET /habits` milik user B; `GET /habits/:id` milik orang lain -> 404 (bukan 403).
- [x] `AUTH-I-11` Password tersimpan sebagai hash (bukan plaintext) — cek via Prisma langsung.
- [x] `AUTH-I-12` `requireAuth` menyuntik `req.user.id` bertipe `string` dan semua query habit/goal memfilter `ownerId`.

### Phase 2 — API Inti Habits, Goals, Check-in, Streak (`apps/api`)

Tujuan: kontrak SDD §3.2–§3.4 + aturan bisnis PRD FR-02/FR-03/FR-06/FR-07.

#### 2.2 Integration — Habits CRUD

- [x] `HAB-I-01` `POST /habits` POSITIVE valid -> 201 + tersimpan dengan `ownerId` benar.
- [x] `HAB-I-02` `POST /habits` NEGATIVE valid -> 201.
- [x] `HAB-I-03` `POST /habits` title kosong / type invalid -> 400 `VALIDATION_ERROR`.
- [x] `HAB-I-04` `GET /habits` hanya mengembalikan milik user login + `checkIn`, `checkedIn`, dan ringkasan streak untuk tanggal yang diminta (default WIB hari ini).
- [x] `HAB-I-05` `GET /habits/:id` milik sendiri -> 200 + streak ringkas.
- [x] `HAB-I-10` Malformed UUID pada path habit -> 400 `VALIDATION_ERROR`; UUID valid yang tidak ada atau bukan milik user -> 404.
- [x] `HAB-I-06` `GET /habits/:id` milik user lain -> 404.
- [x] `HAB-I-07` `PATCH /habits/:id` ubah title/description -> 200; schema menolak field `type` sebagai input tambahan.
- [x] `HAB-I-08` `PATCH /habits/:id` milik orang lain -> 404.
- [x] `HAB-I-09` `DELETE /habits/:id` body replacement kosong tanpa goal terkait -> 204 + check-in ikut terhapus.
- [x] `HAB-I-11` Delete habit terakhir pada goal tanpa replacement -> 422 `REPLACEMENT_REQUIRED`; habit dan relasi tetap ada.
- [x] `HAB-I-12` Delete habit terakhir pada beberapa goal dengan pengganti existing -> 204; semua goals tetap berisi habit dan habit lama/check-in hilang.
- [x] `HAB-I-13` Delete habit dengan replacement milik user lain -> 404; tidak ada mutasi parsial.
- [x] `HAB-I-14` Replacement habit baru dibuat inline dalam transaksi dan dapat dipasang ke lebih dari satu goal.
- [x] `HAB-I-15` Replacement invalid/duplikat atau goal tambahan -> error sesuai kontrak; tidak ada mutasi parsial.

#### 2.3 Integration — Check-in dan Undo

- [x] `CHK-I-01` `POST /habits/:id/check-in` tanpa body (hari ini WIB) -> 200 `{ habitId, date, streak }`.
- [x] `CHK-I-02` Check-in ganda di hari sama -> 200 hasil identik, tidak ada baris ganda (unique `habitId+date`), streak tidak naik 2x.
- [x] `CHK-I-03` Check-in habit NEGATIVE memakai endpoint sama dengan semantik DONE = hari bersih.
- [x] `CHK-I-04` Check-in dengan `date` masa depan WIB -> 422 `FUTURE_DATE`.
- [x] `CHK-I-05` Backfill kemarin / >7 hari lalu (default MVP) -> 422 `BACKFILL_NOT_ALLOWED`.
- [x] `CHK-I-06` Check-in habit milik orang lain -> 404.
- [x] `CHK-I-07` `DELETE /habits/:id/check-in?date=hari-ini` (undo) -> 204 + streak turun saat dihitung ulang.
- [x] `CHK-I-08` Undo tanggal lampau atau masa depan -> 422 (`BACKFILL_NOT_ALLOWED` atau `FUTURE_DATE`).
- [x] `CHK-I-09` Undo check-in yang tidak ada -> 204 idempotent tanpa body.
- [x] `CHK-I-10` Dua check-in konkuren untuk habit/tanggal sama -> kedua request sukses, response sama, hanya satu baris tersimpan.

#### 2.4 Integration — Goals dan relasi many-to-many

- [x] `GOAL-I-01` `POST /goals` dengan `habitIds` existing milik sendiri -> 201 + join terbentuk.
- [x] `GOAL-I-02` `POST /goals` tanpa `habitIds` dan tanpa `newHabits` -> 422 pesan "minimal 1 habit".
- [x] `GOAL-I-03` `POST /goals` dengan `newHabits` inline -> 201 + habit baru terbuat dengan `ownerId` sama + join terbentuk (transaksi atomik).
- [x] `GOAL-I-04` `POST /goals` campuran `habitIds` + `newHabits` (build+break) -> 201.
- [x] `GOAL-I-05` `POST /goals` memakai `habitId` milik user lain -> 404 dan goal tidak terbuat setengah jalan.
- [x] `GOAL-I-15` `habitIds` duplikat saat create goal -> 400 `VALIDATION_ERROR`.
- [x] `GOAL-I-06` `GET /goals` memuat `habitCount` + progres per goal.
- [x] `GOAL-I-07` `GET /goals/:id` memuat daftar habits + progres (`weeklyCompletionPct`, `perHabit`).
- [x] `GOAL-I-08` `PATCH /goals/:id` ubah title/description/deadline -> 200 dan tidak mengubah streak habit.
- [x] `GOAL-I-09` `DELETE /goals/:id` -> 204 + habit dan check-in tetap utuh (hanya join dihapus); streak habit tidak berubah.
- [x] `GOAL-I-10` `POST /goals/:id/habits` assign habit existing -> 200; assign ganda idempotent 200 tanpa duplikat.
- [x] `GOAL-I-11` Assign habit milik orang lain -> 404.
- [x] `GOAL-I-12` `DELETE /goals/:id/habits/:habitId` unassign satu dari banyak -> 204 tanpa body.
- [x] `GOAL-I-13` Unassign habit terakhir dalam goal -> 422 (goal tidak boleh 0 habit).
- [x] `GOAL-I-14` Error goal selalu envelope `{ error: { code, message, details? } }` untuk 400/401/404/422.
- [x] `GOAL-I-16` Alur inline edit goal `POST /habits` → `POST /goals/:id/habits` -> habit muncul di `GET /habits` dan relasi muncul di `GET /goals`.
- [x] `GOAL-I-17` Habit yang dibuat hari ini memulai denominator/miss progres dari tanggal pembuatan WIB secara inklusif.

#### 2.5 Integration — Streak endpoints

- [x] `STRK-I-01` `GET /habits/:id/streak?range=daily` -> `{ current, longest, lastDoneDate }` konsisten dengan kalkulasi jendela 90 hari.
- [x] `STRK-I-02` `GET /habits/:id/streak?range=weekly&week=yyyy-mm-dd` menormalisasi ke Senin + `{ done, miss, allowance: 3, remaining, days[7] }`.
- [x] `STRK-I-03` Weekly `remaining = max(0, 3 - miss)`; `miss > 3` tetap 0, bukan negatif.
- [x] `STRK-I-04` `week` invalid -> 400 `VALIDATION_ERROR`.
- [x] `STRK-I-05` Streak habit milik orang lain -> 404.

### Phase 3 — UI Next.js (React Testing Library)

Tujuan: alur PRD US-02–US-11 dalam ≤3 klik, label POSITIVE vs NEGATIVE benar.

- [x] `UI-01` Form register/login menampilkan error validasi (email invalid, password pendek) tanpa submit ke API.
- [x] `UI-02` Daftar habit hari ini render dari API + status DONE/PENDING per habit.
- [x] `UI-03` Tombol check-in habit POSITIVE berlabel "Selesai" dan memanggil `POST check-in`; optimistik/tunggu response lalu refresh badge.
- [x] `UI-04` Tombol check-in habit NEGATIVE berlabel "Hari bersih" (bukan "Selesai").
- [x] `UI-05` Tombol undo hanya untuk hari ini; setelah undo badge kembali PENDING.
- [x] `UI-06` Detail streak harian menampilkan `current`, `longest`, `lastDoneDate`.
- [x] `UI-07` Weekly view Senin–Minggu menampilkan `done X/7`, `miss Y`, `sisa toleransi max(0, 3-Y)` + highlight minggu berjalan.
- [x] `UI-08` Navigasi minggu mundur memanggil API dengan `week` yang dinormalisasi ke Senin.
- [x] `UI-09` Form goal menolak submit tanpa habit (pesan "minimal 1 habit") sebelum request.
- [x] `UI-10` Goal picker bisa pilih habit existing + buat habit baru inline dalam satu submit.
- [x] `UI-11` Daftar goal menampilkan progres (`weeklyCompletionPct`, per-habit done/miss).
- [x] `UI-12` Hapus goal menampilkan konfirmasi dan copy "streak habit tidak ikut terhapus".
- [x] `UI-13` State error API (401/404/422) dirender sebagai pesan ramah, bukan crash.
- [x] `UI-14` Weekly view tidak meminta data saat initial render; disclosure habit memicu maksimal satu fetch awal dan menyimpan hasil untuk buka ulang.
- [x] `UI-15` Filter jenis dan pencarian judul menyaring daftar lokal tanpa request tambahan.
- [x] `UI-16` Mobile nav membuka/menutup menu Habit/Goals/Keluar dengan tombol keyboard-accessible.
- [x] `UI-17` Dialog delete meminta replacement per goal terdampak, mendukung habit existing/inline, dan tidak mengirim request jika belum lengkap.
- [x] `UI-18` Form create habit mengirim jenis/field valid dan menampilkan hasil/error.
- [x] `UI-19` Editor goal menampilkan habit yang terhubung dan menyimpan assignment habit existing secara atomik melalui `PATCH /goals/:id`.
- [x] `UI-20` Editor goal dapat unassign salah satu dari beberapa habit; unassign terakhir disabled dengan penjelasan aturan minimal satu habit.
- [x] `UI-21` Editor goal dapat memilih “Buat habit baru…”, mengisi jenis dan nama, lalu membuat serta menghubungkan habit secara atomik; jika penyimpanan gagal, tidak ada habit atau relasi parsial, dan retry yang berhasil hanya membuat satu habit yang terhubung.

### Phase 4 — Logic Hardening: unit murni + edge (`apps/api` dan `apps/web` logika)

Tujuan: algoritma SDD §4 dan state machine SDD §5. Semua unit tanpa DB.

#### 2.6 Unit — util tanggal WIB (SDD §4.1)

- [x] `DATE-U-01` `todayWIB()` format `yyyy-mm-dd` dan memakai zona `Asia/Jakarta` (mock `Date` di batas tengah malam UTC vs WIB).
- [x] `DATE-U-02` `mondayOfWeekWIB()` untuk Senin -> dirinya sendiri.
- [x] `DATE-U-03` `mondayOfWeekWIB()` untuk Minggu -> Senin 6 hari sebelumnya.
- [x] `DATE-U-04` `mondayOfWeekWIB()` untuk Rabu -> Senin minggu sama.
- [x] `DATE-U-05` `mondayOfWeekWIB()` melewati batas bulan/tahun (mis. 2026-09-28 Senin vs 2026-10-04 Minggu; 2025-12-29 Senin vs 2026-01-04 Minggu).
- [x] `DATE-U-06` `addDays` benar di batas bulan dan tahun kabisat.
- [x] `DATE-U-07` Input tanggal invalid ditolak Zod (`z.string().date()`), bukan dilempar sebagai `Invalid Date` diam-diam.

#### 2.7 Unit — daily streak (SDD §4.2)

- [x] `DAILY-U-01` 5 DONE berturut-turut -> `current = 5`.
- [x] `DAILY-U-02` Pola DONE, DONE, kosong, DONE (hari ini) -> `current = 1` (1 hari kosong memutus).
- [x] `DAILY-U-03` Hari ini belum DONE tapi kemarin DONE beruntun -> `current` dihitung dari kemarin (hari ini PENDING, belum memutus).
- [x] `DAILY-U-04` `MISS` eksplisit == hari kosong untuk pemutus streak.
- [x] `DAILY-U-05` Habit NEGATIVE memakai mesin sama: DONE = lanjut, kosong/MISS = putus.
- [x] `DAILY-U-06` Undo hari ini (hapus DONE) menurunkan `current` saat dihitung ulang.
- [x] `DAILY-U-07` Tidak ada toleransi di level harian: 1 miss kemarin membuat `current` mulai dari 0/1, bukan dilanjutkan.

#### 2.8 Unit — longest streak

- [x] `LONG-U-01` Data campuran (mis. run 3, putus, run 5) -> `longest = 5`.
- [x] `LONG-U-02` Semua DONE -> `longest = jumlah hari`.
- [x] `LONG-U-03` Baris FUTURE tidak ikut memutus/menambah `longest`.
- [x] `LONG-U-04` Riwayat kosong -> `longest = 0`, `lastDoneDate = null`.

#### 2.9 Unit — weekly + allowance 3 (SDD §4.3)

- [x] `WEEK-U-01` Minggu penuh 7 DONE -> `done 7, miss 0, remaining 3`.
- [x] `WEEK-U-02` `done 4, miss 3` -> `remaining 0` (batas pas).
- [x] `WEEK-U-03` `miss 5` -> `remaining 0` (clamp, bukan negatif).
- [x] `WEEK-U-04` Hari ini PENDING (kosong) berstatus `PENDING`, bukan `MISS`; hari lalu yang kosong berstatus `MISS`.
- [x] `WEEK-U-05` Tanggal > today berstatus `FUTURE` dan tidak dihitung `done/miss`.
- [x] `WEEK-U-06` `weekStart` selalu Senin, `weekEnd = weekStart + 6` (Minggu).
- [x] `WEEK-U-07` `MISS` eksplisit dan kosong masa lalu sama-sama `miss + 1`.

#### 2.10 Unit — progres goal (SDD §4.4)

- [x] `GOAL-U-01` 1 goal 2 habit: agregat `sum(done)` benar + `habitCount = 2`.
- [x] `GOAL-U-02` Campuran build+break dihitung dengan DONE yang sama.
- [x] `GOAL-U-03` Goal tanpa habit tidak mungkin lolos validasi (ditolak di level Zod, bukan dihitung 0%).
- [x] `GOAL-U-04` Pembagi memakai `max(1, total active days per habit)` sehingga tidak division-by-zero.
- [x] `GOAL-U-05` Habit baru mulai dihitung pada tanggal dibuat dalam WIB secara inklusif; tanggal lebih awal tidak menjadi miss.
- [x] `GOAL-U-06` Hari ini tanpa DONE masuk denominator persentase, tetapi belum menjadi miss; hari aktif lampau tanpa DONE dihitung miss.
- [x] Progres goal memakai total hari aktif per habit, dari tanggal dibuat WIB inklusif sampai hari ini; tanggal sebelum pembuatan tidak masuk denominator.

Eksekusi unit Phase 4: `npm exec --workspace @habit-shaper/api -- vitest run --config vitest.unit.config.ts` — **38 test lulus**.
Eksekusi backend integration: `npm exec --workspace @habit-shaper/api -- vitest run` dengan `DATABASE_URL` test dan `TZ=Asia/Jakarta` — **102 test lulus**.

#### 2.11 Edge case lintas lapisan (SDD §5)

- [x] `EDGE-01` Backfill kemarin ditolak 422 `BACKFILL_NOT_ALLOWED`; data tetap MISS.
- [x] `EDGE-02` Future date ditolak 422 `FUTURE_DATE`.
- [x] `EDGE-03` Backend menentukan hari ini pada timezone WIB; date-only yang dikirim client tidak dapat mengganti otoritas tanggal server.
- [x] `EDGE-04` Double check-in konkuren tidak membuat duplikat (unique constraint; hasil idempotent).
- [x] `EDGE-05` Hapus goal: habit + check-in utuh; hitung ulang streak sebelum/sesudah sama.
- [x] `EDGE-06` Hapus habit: check-in + join ikut hilang; goal lain tidak ikut terhapus atau harus mendapat replacement.
- [x] `EDGE-07` Assign lintas user 404; tidak ada join yang terbentuk.
- [x] `EDGE-08` Hari kosong masa lalu = MISS implisit untuk daily dan weekly (konsisten di kedua fungsi).
- [x] `EDGE-09` Param `week` sembarang tanggal dinormalisasi ke Senin-nya; invalid -> 400.
- [x] `EDGE-10` Prisma `P2002` check-in idempotent; `P2025` -> 404; `P2003` -> 422; mapping diuji.
- [x] `EDGE-11` Tidak ada `any` di kode test maupun sumber: typecheck + ESLint lolos.

## 3. Command Windows (PowerShell)

Semua command dari root monorepo `D:\habit-shaper` kecuali disebut lain. Gunakan PowerShell, bukan Git Bash, agar env dan path konsisten.

### 3.1 Setup sekali saja

```powershell
# dari D:\habit-shaper
node --version; npm --version
npm install

# Database test PostgreSQL yang sudah disediakan/aktif
$env:DATABASE_URL = "postgresql://habit:habit_dev_password@localhost:5432/habitshapertest?schema=public"
$env:TZ = "Asia/Jakarta"
npm exec --workspace @habit-shaper/api -- prisma migrate deploy --schema prisma/schema.prisma
```

### 3.2 Backend: unit saja (cepat, tanpa DB)

```powershell
# dari D:\habit-shaper (unit tidak memakai database)
npm exec --workspace @habit-shaper/api -- vitest run --config vitest.unit.config.ts
```

### 3.3 Backend: integration per file (butuh DB test menyala)

```powershell
# dari D:\habit-shaper\apps\api
$env:DATABASE_URL = "postgresql://habit:habit_dev_password@localhost:5432/habitshapertest?schema=public"
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
npm exec --workspace @habit-shaper/api -- vitest run --config vitest.unit.config.ts
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
