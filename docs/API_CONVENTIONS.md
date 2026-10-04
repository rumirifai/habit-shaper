# Konvensi Implementasi Backend API

Acuan kerja untuk endpoint backend baru dan perubahan API berikutnya. Konvensi ini mengikuti kontrak yang berlaku di `docs/03-SDD.md` serta pola Express/Prisma yang digunakan di `apps/api`. Jika keputusan kontrak berubah, perbarui SDD dan testing plan sebelum mengubah implementasi.

## 1. Struktur tanggung jawab

Tempatkan kode sesuai tanggung jawab berikut:

| Lokasi             | Tanggung jawab                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `src/routes/`      | Daftarkan method/path, autentikasi, dan middleware validasi secara eksplisit.                      |
| `src/schemas/`     | Definisikan schema Zod dan tipe input hasil inferensi.                                             |
| `src/middleware/`  | Validasi request, autentikasi, dan cross-cutting concern HTTP.                                     |
| `src/controllers/` | Orkestrasi request-response, authorization/resource lookup, pemanggilan service/Prisma.            |
| `src/services/`    | Business logic yang dapat dipakai lintas endpoint atau yang layak diuji secara terpisah dari HTTP. |
| `src/lib/`         | Integrasi infrastruktur bersama seperti Prisma, JWT, dan error API.                                |
| `src/utils/`       | Helper murni yang tidak mengatur alur bisnis endpoint.                                             |

Controller mengikuti resource/kemampuan endpoint. Logic streak berada di `services/streak.ts`; ringkasan streak dapat dipakai oleh controller habit/check-in, sedangkan endpoint streak detail tetap ditangani controller tersendiri. Jangan menggandakan rumus bisnis di controller.

## 2. Route dan versi API

- API publik menggunakan prefix `/api/v1`, yang dipasang pada app/router utama. File route mendaftarkan path relatif router, misalnya `router.get("/:id", ...)`.
- Gunakan resource noun dan method HTTP sesuai operasi: `GET` baca, `POST` buat/aksi, `PATCH` ubah sebagian, `DELETE` hapus.
- Tempatkan `requireAuth` pada router yang seluruh endpoint-nya memerlukan login; untuk route publik seperti register/login, jangan menambah autentikasi.
- Susun middleware route dengan urutan: autentikasi (jika perlu), validasi params/query/body, controller.
- Parameter path yang merepresentasikan ID database divalidasi sebagai UUID. UUID valid tetapi resource tidak ada atau bukan milik user menghasilkan `404`; UUID malformed menghasilkan `400 VALIDATION_ERROR`.

Contoh:

```ts
router.use(requireAuth);
router.patch(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(updateHabitSchema, "Input habit tidak valid."),
  updateHabit,
);
```

## 3. Validasi request

- Definisikan schema di `src/schemas/` menggunakan Zod; gunakan `.strict()` agar field tambahan tidak diterima tanpa sengaja.
- Ekspor tipe input melalui `z.infer<typeof schema>`.
- Terapkan `validateBody`, `validateQuery`, atau `validateParams` pada route, bukan mengulang `safeParse` di controller.
- Ambil nilai hasil parse dari response locals menggunakan helper bertipe `validatedBody<T>(res)`, `validatedQuery<T>(res)`, dan `validatedParams<T>(res)`.
- Validasi format/struktur request menghasilkan `400` dengan envelope `VALIDATION_ERROR` dan `details` Zod bila relevan.
- Aturan domain yang kontraknya menyatakan `422` harus dipetakan secara spesifik. Jangan mengubah semua kegagalan Zod menjadi `422`; input malformed tetap `400`.
- Hindari transformasi tersembunyi yang mengubah semantik client. Default yang disepakati, seperti tanggal WIB hari ini, boleh diterapkan dalam schema/helper dan harus didokumentasikan.

## 4. Autentikasi dan ownership

- Route privat menggunakan `requireAuth`; controller memperoleh identitas dari `req.user?.id`.
- Setiap query atau mutasi resource milik user harus dibatasi dengan `ownerId` dalam operasi database. Jangan mengambil resource berdasarkan ID saja lalu mengandalkan pemeriksaan di tahap lain.
- Untuk resource milik user lain, balas `404 NOT_FOUND`, bukan `403`, sesuai kontrak isolasi owner.
- Jangan pernah mengembalikan `passwordHash`, JWT refresh token, atau rahasia konfigurasi dalam response maupun log.
- Logout menaikkan `User.tokenVersion` dan membersihkan refresh cookie. Perubahan mekanisme session/token harus diselaraskan dengan SDD.

## 5. Bentuk response dan status

- Pertahankan response sukses yang spesifik endpoint dan sudah ditetapkan SDD; jangan mengubah wrapper atau nama field tanpa memperbarui kontrak serta test.
- Response error memakai satu envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid.",
    "details": {}
  }
}
```

- Gunakan `sendApiError(res, status, code, message, details?)` agar struktur konsisten.
- Status umum: `200` sukses dengan body, `201` resource dibuat, `204` sukses tanpa body, `400` request/schema invalid, `401` autentikasi invalid, `404` resource tidak ditemukan/tidak dimiliki, `409` konflik, `422` aturan bisnis yang secara kontrak tidak dapat diproses.
- Operasi yang ditetapkan idempotent harus mempertahankan hasil idempotennya. Contoh: undo check-in tanpa baris menghasilkan `204`; assign habit yang sudah terhubung menghasilkan sukses tanpa membuat relasi ganda.
- Jangan menulis body setelah status `204`.

## 6. Controller, service, dan database

- Controller bertanggung jawab pada HTTP dan orkestrasi; pindahkan kalkulasi murni atau aturan yang dipakai beberapa endpoint ke service.
- Gunakan hasil Zod yang sudah divalidasi, bukan `req.body`, `req.query`, atau `req.params` mentah untuk input bisnis.
- Gunakan transaksi Prisma untuk operasi multi-langkah yang harus atomik, misalnya membuat goal bersama habit inline dan relasinya.
- Mutasi DELETE yang membutuhkan penggantian relasi sebelum cascade (mis. hapus habit terakhir pada goal) harus memvalidasi seluruh replacement dan menerapkan assign + delete dalam satu transaksi; jangan memecah operasi menjadi request FE berurutan.
- Cegah N+1 query untuk response list. Pilih field/include yang diperlukan dan jaga filter owner pada query utama maupun query relasi.
- Gunakan `deleteMany`/`updateMany` dengan filter owner bila perlu menggabungkan otorisasi dengan mutasi; periksa `count` untuk membedakan resource hilang dari operasi berhasil.
- Tanggal bisnis dinormalisasi ke date-only WIB melalui helper yang ada (`todayWIB`, `dateOnlyToUTC`, dan helper tanggal terkait). Hindari membandingkan tanggal kebiasaan berdasarkan timezone browser atau `Date` lokal tanpa normalisasi.
- Error Prisma dengan arti domain khusus ditangani di lokasi operasi. Misalnya `P2002` pada upsert check-in dapat menjadi idempotent success; jangan biarkan mapping generik `P2002 → 409` menimpa kontrak tersebut.

## 7. Error handling dan logging

- Tangkap error sebagai `unknown`; jangan gunakan `any`.
- Untuk error yang bisa dipetakan, gunakan narrowing terhadap `Prisma.PrismaClientKnownRequestError` dan tangani kode yang relevan. Mapping umum tersedia di `handleApiError`; override hanya untuk kontrak operasi yang memang berbeda.
- Jangan mengirim pesan internal, query, stack trace, credential, atau token kepada client. Error tak terduga memberikan respons internal generik.
- Jangan mengirim response kedua jika `res.headersSent` sudah benar.
- Logging request berbentuk JSON dengan level, method, path, userId bila tersedia, durasi, status, dan code. Jangan memasukkan body, cookie, header authorization, password, atau token.
- Untuk error yang sudah ditangani sebagai response domain, set `res.locals.errorCode` melalui `sendApiError` agar request log membawa code yang tepat.

## 8. Test dan perubahan kontrak

- Tambahkan integration test pada file resource terkait di `apps/api/tests/`; test endpoint harus memeriksa status, envelope/shape response penting, efek database, dan isolasi ownership yang dijanjikan.
- Untuk perilaku idempotent, panggil operasi lebih dari sekali lalu periksa bahwa state database tidak berduplikasi dan response sesuai kontrak.
- Assertion status harus tegas. Hindari menerima alternatif seperti `[200, 204]` atau `[400, 422]` jika kontrak sudah memilih satu status.
- Untuk business logic murni yang kompleks, tempatkan kalkulasi di service dan uji secara terpisah dari HTTP bila sesuai.
- Perbarui `docs/03-SDD.md` dan `docs/04-PLAN_TESTING.md` bersama perubahan kontrak. Checklist hanya ditandai selesai setelah assertion dan implementasi terkait diverifikasi.
- Verifikasi perubahan dengan typecheck, lint, integration tests terkait, validasi Prisma bila schema berubah, serta Compose/runtime jika perubahan menyentuh konfigurasi atau startup.

## 9. Kontrak backend yang perlu dijaga

- Timezone baku: `Asia/Jakarta` (WIB); tanggal API menggunakan format `yyyy-mm-dd`.
- Ownership: resource user lain disembunyikan sebagai `404`.
- Goal harus memiliki minimal satu habit; create tanpa habit dan unassign habit terakhir menggunakan `422`.
- Check-in harian idempotent; backfill dan tanggal masa depan ditolak sesuai kode/status di SDD.
- Streak dihitung dari data check-in melalui service bersama. Endpoint `GET /habits/:id/streak` tetap digunakan untuk daily/weekly detail; response habit dan check-in juga menyertakan ringkasan sesuai SDD.
- Perhitungan longest streak pada implementasi saat ini dibatasi window 90 hari; perubahan definisi window harus memperbarui dokumentasi dan test.
