# PRD — Habit Shaper

| Field | Isi |
|---|---|
| Produk | Habit Shaper — website pencatatan habit |
| Versi dokumen | 1.0 (2026-09-23) |
| Status | Approved untuk MVP |
| Bahasa implementasi | TypeScript strict (tanpa `any`) |
| Stack | Next.js (frontend), Express (backend), PostgreSQL + Prisma, Docker + Compose |

## 1. Ringkasan & Visi

Habit Shaper membantu seseorang **membentuk habit dari pencatatannya** berdasarkan dua sinyal utama: **streak** dan **goals**.

Prinsip produk: **lightweight dan simple**. Tidak ada fitur tambahan di luar tujuan awal sampai MVP selesai dan dievaluasi.

## 2. Objectives (Tujuan Produk)

1. User bisa memulai **habit positif** (build) dan menghentikan **habit negatif** (break) dalam satu aplikasi.
2. User mendapat umpan balik harian yang jelas: apakah streak berlanjut atau putus.
3. User mendapat gambaran mingguan: dalam 1 minggu (Senin–Minggu, WIB) ada berapa hari miss dan sisa toleransi.
4. User bisa mengelola **goals/tujuan** yang mengikat satu atau banyak habit sebagai ukuran keberhasilan.

### Success Metrics (MVP)

| Metric | Target awal |
|---|---|
| % user yang check-in ≥ 4 hari/minggu pertama | ≥ 50% |
| % goal yang punya ≥ 1 habit terhubung | 100% (enforced) |
| Rata-rata streak putus karena miss > toleransi | terpantau, bukan dihukum |
| p95 response API check-in & streak | < 300ms di lokal/docker |

## 3. Scope

### 3.1 In-scope (MVP)

- Multi-user login (register/login/logout).
- CRUD Habit dengan 2 mode: `POSITIVE` (membangun) dan `NEGATIVE` (menghilangkan).
- Daily streak:
  - Habit positif: menandai **melakukan** habit.
  - Habit negatif: menandai **tidak melakukan** kebiasaan buruk (clean day).
- Weekly streak: agregat Senin–Minggu WIB, menampilkan done/miss/sisa toleransi.
- Toleransi miss: **3 hari/minggu** (locked).
- CRUD Goals dengan relasi **many-to-many** ke Habit.
- Dashboard sederhana: daftar habit hari ini + streak + daftar goal + progres.

### 3.2 Out-of-scope (Future Backlog)

Aturan sesuai permintaan user: fitur di bawah **tidak dikerjakan sekarang**. Baru dibahas setelah fitur utama selesai:

- Reminder/notifikasi, push/email.
- Sosial (follow, leaderboard, share).
- Gamifikasi ekstra (XP, badge kompleks, level).
- Habit dengan frekuensi custom (mis. 3x/minggu, interval jam).
- Import/export, integrasi kalender, mobile native, analitik lanjutan, AI coach.

Backlog ini dicatat agar scope MVP tidak melebar.

## 4. User Persona

### P1 — Andini, 24, Pembentuk Habit Positif

- Pekerja kantoran, ingin rutin olahraga 20 menit dan membaca.
- Frustrasi dengan aplikasi habit yang terlalu ramai.
- Butuh: tandai selesai dalam < 10 detik, lihat streak berturut-turut, punya goal “Olahraga 30 hari”.

### P2 — Bagas, 28, Penghilang Kebiasaan Buruk

- Ingin berhenti merokok / begadang / jajan manis berlebih.
- Butuh: menandai hari bersih (tidak melakukan), melihat berapa hari bertahan, toleransi miss agar tidak langsung demotivasi saat gagal 1 hari.
- Sensitif terhadap rasa bersalah: penghapusan goal tidak boleh menghapus perjuangan streak.

### P3 (sekunder) — Operator/Maintainer

- Developer yang menjalankan via Docker Compose.
- Butuh setup < 10 menit, migrasi Prisma jelas, log error terbaca.

## 5. User Stories & Acceptance Criteria

### Auth

- **US-01:** Sebagai user, saya bisa register/login/logout sehingga data habit saya terisolasi.
  - AC: password di-hash; session via JWT httpOnly cookie; user A tidak bisa melihat data user B (403/404).

### Habit

- **US-02:** Sebagai user, saya bisa membuat habit positif/negatif.
  - AC: field `title`, `type (POSITIVE|NEGATIVE)`, `description?`; validasi Zod; muncul di daftar hari ini.
- **US-03:** Sebagai user, saya bisa edit/hapus habit.
  - AC: hapus habit menghapus check-in miliknya (cascade), tapi tidak menghapus goal lain — hanya melepas relasinya.
- **US-04:** Sebagai user habit positif, saya bisa check-in “sudah dilakukan” hari ini.
  - AC: 1 check-in per habit per hari (idempotent); check-in ganda tidak menambah streak; bisa undo di hari yang sama.
- **US-05:** Sebagai user habit negatif, saya bisa check-in “hari bersih” (tidak melakukan).
  - AC: semantik dibedakan di UI (“Hari bersih” vs “Selesai”), tapi mesin streak sama: DONE = lanjut, MISS/kosong = putus/terhitung miss.

### Streak

- **US-06:** Sebagai user, saya bisa melihat streak harian berjalan.
  - AC: angka current streak + tanggal terakhir; putus jika ada hari kosong (tidak ada toleransi di level harian — toleransi hanya di level mingguan).
- **US-07:** Sebagai user, saya bisa melihat ringkasan mingguan Senin–Minggu WIB.
  - AC: tampil `done: X/7`, `miss: Y`, `sisa toleransi: max(0, 3 - Y)`; minggu berjalan ter-highlight; ganti minggu bisa navigasi mundur.

### Goals

- **US-08:** Sebagai user, saya bisa membuat goal dengan minimal 1 habit.
  - AC (locked): form goal **wajib** assign ≥ 1 habit existing; jika tidak ada yang cocok, user **wajib buat habit baru inline** dalam alur yang sama; submit tanpa habit ditolak (422 + pesan jelas).
- **US-09:** Sebagai user, saya bisa mengombinasikan habit dalam 1 goal (build+build, break+break, atau build+break).
  - AC: relasi many-to-many via `GoalHabit`; 1 habit bisa dipakai banyak goals.
- **US-10:** Sebagai user, saya bisa edit/lihat/hapus goal.
  - AC: hapus goal **tidak mempengaruhi streak/check-in habit** (apresiasi streak yang berjalan); hanya baris join yang dihapus.
- **US-11:** Sebagai user, saya bisa melihat progres goal dari agregat streak habit.
  - AC: progres = fungsi dari check-in habit terhubung (definisi di SDD §4.4); tanpa habit = tidak ada progres (maka US-08 mencegah kondisi ini).

## 6. Kriteria Fitur Fungsional (FR)

| ID | Fitur | Kriteria |
|---|---|---|
| FR-01 | Auth multi-user | Register/login/logout, hashing argon2/bcrypt, isolasi `ownerId` |
| FR-02 | Habit CRUD | Title wajib, type enum, deskripsi opsional, milik user |
| FR-03 | Daily check-in | Unique `(habitId, date)`, timezone WIB, idempotent, undo hari sama |
| FR-04 | Daily streak | Dihitung dari urutan DONE berturut-turut; MISS/kosong memutus |
| FR-05 | Weekly view | Window Senin–Minggu WIB; toleransi 3 miss/minggu; counter sisa |
| FR-06 | Goal CRUD | Title wajib, target/deadline opsional, milik user |
| FR-07 | Goal–Habit link | Many-to-many; create goal wajib ≥1 habit atau create-inline; delete goal tidak hapus habit/streak |
| FR-08 | Dashboard | Daftar habit hari ini + status + current streak; daftar goal + progres |
| FR-09 | Validasi & error | Zod di backend; error envelope konsisten `{ error: { code, message, details? } }` |

## 7. Non-Functional Requirements

- Lightweight: tanpa state management berat jika tak perlu; query Prisma selektif; hindari N+1.
- Simple UI: alur utama ≤ 3 klik (buka → check-in → lihat streak).
- Performa: halaman dashboard < 2s di lokal; API streak < 300ms untuk 1 user.
- Mobile-friendly: layout responsif (check-in jempol-friendly).
- Maintainability: TypeScript strict, no `any`; lint + format; migrasi Prisma versioned.
- Portabilitas: jalan via `docker compose up` tanpa setup manual DB.

## 8. Aturan Terkunci (Keputusan Produk)

1. Relasi Goal–Habit: **many-to-many**. 1 goal bisa gabung banyak habit (campuran build/break). 1 habit bisa di-assign ke banyak goals.
2. Buat goal **minimal 1 habit**. Tanpa pilihan → buat habit baru inline.
3. Hapus goal **tidak reset streak** (hanya hapus join).
4. Minggu = **Senin–Minggu**, timezone **Asia/Jakarta (WIB)**.
5. Toleransi miss = **3/minggu** (level mingguan, bukan harian).
6. Tabel `User` wajib sejak awal (multi-user).
7. Streak = **computed dari CheckIn** (best practice, bukan counter manual). Detail di SDD.
8. TypeScript best practice: larang `any`; pakai `unknown`, union, narrowing, Zod.

## 9. Milestones (ringkas — detail di SAD §7)

- Phase 0: Setup monorepo + Docker + TS strict.
- Phase 1: DB + Prisma (User, Habit, Goal, GoalHabit, CheckIn) + auth.
- Phase 2: API habits/goals/check-in/streak.
- Phase 3: UI Next.js (auth, habit list, check-in, weekly, goals).
- Phase 4: Streak + weekly + goal progress hardening + edge cases.
- Phase 5: Compose prod, docs, UAT ringan.

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Double check-in / timezone salah | Unique constraint + normalisasi tanggal WIB di backend (bukan frontend) |
| Goal tanpa habit | Validasi wajib + alur create-inline |
| Scope creep | Backlog pasca-MVP dikunci di §3.2 |
| Performa streak saat data besar | Hitung per-user + index; cache opsional (lihat SAD/SDD) |
