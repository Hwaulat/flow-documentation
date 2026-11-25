# Flow Documentation (FlowDoc)

Aplikasi dokumentasi alur proses proyek, daftar fitur, dan poin kebutuhan pelanggan berbasis web dalam bahasa Indonesia dengan gaya UIARC yang bersih, fokus pada keterbacaan, dan bergerak halus (`prefers-reduced-motion` didukung penuh).

## Prinsip Tanpa Login & Batas Penyimpanan Lokal

- **Langsung ke halaman utama (tanpa login):** Tidak ada autentikasi, akun pengguna, cloud sync, ataupun ketergantungan jaringan saat aplikasi dijalankan. Membuka aplikasi langsung masuk ke **Dasbor Proyek** (`/`).
- **Penyimpanan lokal di IndexedDB (`project-flow-local`):** Seluruh data proyek, fitur, catatan alur, poin pelanggan, dan lampiran gambar (PNG/JPEG/GIF/WebP maks. 10 MB per file) disimpan secara lokal di peramban dan perangkat ini saja (*bukan* file SQLite terpisah di luar peramban).
- **Portabilitas & pencadangan mandiri:** Karena data berada pada profil peramban saat ini (dan dapat terhapus apabila cache/data situs dibersihkan), gunakan menu **Cadangan & Ekspor** (`/backup`) untuk mengunduh arsip lengkap `.zip` (termasuk semua file gambar), ekspor `.json`, ekspor Markdown `.zip` per proyek, atau cetak/simpan ke PDF, serta memulihkan data dari arsip cadangan.

## Fitur Utama

- **Dasbor Proyek (`/`):** Kartu proyek dengan metrik ringkas, pencarian cepat, filter status (*Aktif*, *Ditunda*, *Selesai*), pengurutan, serta pembuatan & penyuntingan detail proyek secara langsung tanpa data dummy bawaan.
- **Ruang Kerja Proyek (`/projects/:projectId`):** Catatan alur proses proyek beserta lampiran gambar berlebar penuh (*full container width*) dan daftar fitur berbentuk kartu. Klik kartu fitur untuk membuka halaman detail fitur.
- **Detail Fitur & Tabel Poin Pelanggan (`/projects/:projectId/features/:featureId`):** Catatan alur fitur, lampiran gambar fitur, serta seluruh poin kebutuhan pelanggan dalam tampilan **tabel data** lengkap dengan pencarian/filter tabel, tambah cepat (`Enter` untuk simpan), edit, ubah urutan naik/turun, duplikasi (beserta lampiran gambarnya), pindahkan ke fitur lain, metadata opsional (*tanggal disebutkan*, *sumber*, *disampaikan oleh*), dan lampiran gambar per poin.
- **Pencarian Global (`/` atau `Ctrl/Cmd + K`):** Pencarian lintas proyek, alur proses, fitur, dan poin pelanggan dengan pencocokan AND berbasis awalan kata (*case-insensitive*), filter proyek/fitur/sumber/tanggal, dan navigasi langsung ke elemen tujuan dengan sorotan visual.
- **Penghapusan Aman & Sampah (`/trash`):** Toast **Urungkan** (*Undo*) langsung saat menghapus, halaman Sampah untuk proyek/fitur/poin/gambar, pemulihan otomatis beserta item induknya bila ikut terhapus, serta penghapusan permanen dengan konfirmasi.
- **Cadangan, Ekspor & Penyimpanan (`/backup`):** Pantau kuota dan mode penyimpanan persisten peramban, status cadangan terakhir, unduh/pulihkan arsip `.zip` & `.json`, ekspor Markdown `.zip` dan PDF per proyek, serta opsi reset penyimpanan lokal.

## Pengembangan Lokal

Kebutuhan: Node.js 22+ dan npm.

```sh
npm install --legacy-peer-deps --no-package-lock
npm run dev
```

Perintah pengembangan dan verifikasi:

```sh
npm run dev
npm test
npm run build
```

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f44b2263-7c1a-4dc7-b711-5a7b134ce5a3).
