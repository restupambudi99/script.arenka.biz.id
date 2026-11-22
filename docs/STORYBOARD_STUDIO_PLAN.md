# Usulan Storyboard Studio Arenka

Tanggal: 22 November 2026. Status: fondasi MVP lokal sudah diimplementasikan; belum dideploy.

## Tujuan dan batas yang sudah dikonfirmasi

Pengguna ingin menyatukan generator script dengan studio storyboard agar naskah, gambar, dan perpindahan antarscene konsisten. ChatGPT membantu penulisan script. Studio menyiapkan gambar dan prompt video; pengguna membuat video dengan Gemini Omni Flash 1.2 di Google Flow secara terpisah.

Tidak diperlukan integrasi API video atau rendering video final di studio pada tahap awal. Generasi gambar di situs tetap memerlukan akses API model gambar tersendiri. Kuota penyimpanan Cloudflare tidak mencakup biaya generasi AI.

## Rekomendasi lokasi dan teknologi

- Tambahkan `/studio` pada `script.arenka.biz.id`, dalam repo yang sama.
- Pertahankan Astro + React + EmDash yang sudah berjalan. Tambahkan Tailwind CSS dan shadcn/ui untuk editor studio.
- Next.js juga menggunakan React. Migrasi framework belum memberikan manfaat yang sepadan untuk kebutuhan ini; responsivitas dan kecepatan bergantung pada pengelolaan aset, pemuatan UI, dan pekerjaan generasi.
- Subdomain atau aplikasi terpisah baru dipertimbangkan bila studio mempunyai kebutuhan rilis, tim, atau layanan tersendiri.
- D1 menyimpan proyek, versi naskah, scene, metadata aset, dan status generasi. Gunakan struktur aplikasi tersendiri yang tidak mengubah tabel internal EmDash secara langsung.
- R2 menyimpan referensi, thumbnail, gambar hasil, dan paket ekspor. D1 menyimpan referensi objek, bukan gambar base64.
- Worker menangani autentikasi/otorisasi proyek dan permintaan model gambar dengan secret di server. Generasi gambar publik tidak boleh menjadi endpoint bebas pakai tanpa batas.

## Temuan dari kode lampiran

`affiliate_studio (3).tsx` dan lampiran teks mempunyai isi yang sama setelah normalisasi akhir baris: sekitar 3.904 baris.

Fitur yang dapat dipertahankan: upload karakter/produk/latar, perencanaan storyboard, editor naskah dan prompt per shot, sinkronisasi prompt, revisi gambar per scene, ekspor lembar storyboard, serta ZIP berisi gambar dan prompt per scene.

Hal yang perlu diubah saat porting:

1. `generateVisual` dapat memanggil `generateScripts` kembali ketika rancangan shot tidak sesuai jumlah scene. Generasi gambar harus menggunakan versi naskah yang disetujui, bukan diam-diam membuat naskah baru.
2. Mode storyboard mengirim referensi karakter/produk/latar asli, tetapi belum mengirim gambar scene sebelumnya. Pemakaian gambar hasil sebagai anchor yang ditemukan hanya berlaku untuk `character_builder`.
3. Sinkronisasi satu shot belum memasukkan keadaan scene sebelum dan sesudahnya. Perubahan aksi mudah memutus perpindahan antarshot.
4. Data terutama berada di React state dan gambar disimpan sebagai data URL. Belum ditemukan penyimpanan proyek yang bertahan setelah halaman dimuat ulang.
5. Permintaan Gemini dilakukan dari komponen browser dengan variabel key. Pindahkan kredensial dan pemanggilan provider ke server.
6. ID model preview ditulis langsung dalam kode. Periksa model dan skema request pada API yang benar sebelum mengaktifkan fitur gambar; konfigurasi gambar harus sesuai dokumentasi provider.
7. Retry saat ini berlaku untuk semua kegagalan HTTP. Bedakan error konfigurasi/autentikasi dari error sementara; batasi percobaan dan tampilkan alasan kegagalan.
8. Ketika parsing/perencanaan gagal, kode dapat mengisi shot dengan naskah generik. Tampilkan rancangan belum lengkap dan minta koreksi; jangan menandainya sebagai hasil siap produksi.
9. Instruksi panjang yang berulang seperti '100% identical' bukan jaminan konsistensi. Ada pula arahan visual yang berpotensi bertentangan, misalnya opsi kamera profesional dengan larangan gaya sinematik umum.
10. Pisahkan pilihan dialog di depan kamera, voice-over, dan ambience. Voice-over tidak selalu berarti karakter harus menggerakkan bibir.

## Alur pengguna yang diusulkan

1. Buat proyek dari brief generator: produk, sasaran audiens, tujuan, platform, rasio, dan target durasi.
2. Buka Copywriter GPT dengan brief dan format keluaran scene yang disarankan.
3. Tempel hasil ChatGPT ke studio. Tampilkan hasil parsing untuk dikoreksi; pengguna tidak perlu menulis JSON. Sediakan editor scene manual bila format hasil tidak cocok.
4. Setujui naskah. Simpan sebagai versi yang terkunci untuk generasi visual.
5. Unggah referensi karakter, produk, pakaian, dan lokasi. Tetapkan aturan visual proyek.
6. Tinjau daftar scene: naskah, tujuan adegan, aksi, kamera, durasi, audio, keadaan awal/akhir, serta transisi.
7. Buat dan setujui gambar acuan utama. Gunakan acuan yang disetujui untuk scene berikutnya.
8. Revisi gambar atau prompt pada scene tertentu. Simpan versi lama dan tandai hasil turunan yang perlu ditinjau jika script atau acuan berubah.
9. Unduh paket Flow: gambar per scene, prompt video per scene, naskah lengkap, lembar storyboard, dan data proyek.
10. Unggah gambar dan tempel prompt di Flow secara manual.

Membuka GPT tidak mengembalikan hasil chat secara otomatis ke situs. Tahap impor naskah harus terlihat jelas dalam alur pengguna. Jika kelak ingin otomatis penuh, rancang integrasi API penulisan naskah tersendiri.

## Kontrak data untuk konsistensi

Satu proyek menjadi sumber bersama untuk script, gambar, dan prompt video. Field inti yang diusulkan:

| Entitas | Data utama |
| --- | --- |
| Project | Brief, rasio, target durasi, pemilik, versi naskah aktif |
| ScriptVersion | Naskah asli, asal, waktu, status persetujuan |
| VisualReferences | Karakter, produk, pakaian, lingkungan, pencahayaan, gambar acuan yang disetujui |
| Scene | ID tetap, urutan, durasi, potongan naskah, tujuan adegan, aksi, kamera, mode audio |
| SceneContinuity | Keadaan awal/akhir: posisi subjek, arah pandang, tangan pemegang produk, kondisi benda, lokasi, transisi |
| SceneAssets | Versi gambar, prompt gambar/video, referensi yang dipakai, status persetujuan, versi input |
| GenerationJob | Scene, status, error yang aman ditampilkan, provider/model, percobaan, metadata hasil |

Prompt gambar dan prompt video disusun dari Scene dan VisualReferences yang sama. Prompt gambar menerangkan komposisi satu momen; prompt video menerangkan gerak, urutan aksi, kamera, suara, dan kondisi akhir.

Perubahan naskah menandai gambar/prompt terkait sebagai perlu ditinjau. Perubahan keadaan akhir scene juga menandai sambungan scene berikutnya. Jangan mengubah aset yang disetujui atau mengulang semua generasi secara otomatis.

## Strategi kontinuitas dan kesan natural

- Gunakan referensi asli sebagai acuan tetap di setiap generasi. Tambahkan gambar scene sebelumnya yang sudah disetujui untuk sambungan yang memang memerlukannya.
- Hindari mengandalkan rantai gambar hasil semata karena kesalahan visual dapat ikut diteruskan.
- Catat kondisi awal dan akhir. Contoh: scene 1 selesai dengan tutup tumbler terbuka di tangan kiri; scene 2 dimulai dari keadaan tersebut.
- Izinkan perpindahan lokasi atau perubahan sudut jika disengaja dan tercatat. Konsisten tidak berarti semua frame harus sama.
- Gunakan aksi yang konkret, jeda, ekspresi, dan gerakan kamera yang mempunyai tujuan. Batasi banyaknya aksi dalam satu shot.
- Sesuaikan panjang dialog dengan durasi dan sisakan ruang untuk jeda; hitungan kata hanya perkiraan, bukan jaminan durasi.
- Tinjau logo, bentuk produk, wajah, tangan, dan hubungan antarshot sebelum ekspor. Tidak ada janji identik 100% dari prompt saja.
- Lembar storyboard merupakan tampilan ringkasan. Gambar tiap scene diekspor terpisah untuk digunakan sebagai referensi Flow.
- Bedakan scene cerita, shot kamera, dan klip video. Banyaknya kotak pada lembar storyboard tidak boleh menentukan durasi cerita secara otomatis.

## UI dan performa

Desktop: daftar scene di kiri, gambar aktif di tengah, naskah/prompt/pengaturan scene di kanan. Ponsel: satu scene aktif dengan tab Gambar, Naskah, dan Prompt Flow; pemilih scene ringkas serta tombol simpan/ekspor yang mudah dijangkau.

Gunakan komponen shadcn/ui seperti Tabs, Sheet/Drawer, Dialog, Select, dan Progress. Gunakan thumbnail, pemuatan gambar bertahap, penyimpanan otomatis yang tertunda singkat, dan status pekerjaan yang dapat dipulihkan. Hindari membawa seluruh gambar resolusi penuh sebagai base64 di state UI. Muat modul studio saat rute studio dibuka dan hilangkan penundaan splash buatan.

## Tahap awal yang direkomendasikan

### Sudah tersedia pada fondasi MVP lokal

- Rute `/studio` di aplikasi Astro + React yang sama.
- Impor naskah tempel dengan pemisahan heading Scene/Adegan/Shot, editor naskah, brief proyek, scene, durasi, aksi, visual, keadaan awal/akhir, dan gambar referensi per scene.
- Prompt Google Flow dibentuk dari konteks proyek dan data scene, dapat disalin atau diunduh sekaligus.
- Autosave localStorage pada browser, serta ekspor JSON.
- Sudah tersedia di produksi: persistence project D1, asset R2 privat, izin EmDash editor, unggahan referensi, dan generation image endpoint Gemini server-side. Migrasi D1 sudah diterapkan. Secret Gemini belum dikonfigurasi sehingga pembuatan gambar belum aktif.

### Integrasi persistence tahap berikutnya

- Tabel `studio_projects` dan `studio_assets` ditambahkan melalui `migrations/studio/0001_storyboard_studio.sql`.
- API proyek dan aset berada di `src/pages/api/studio/`. Akses dibatasi untuk user EmDash dengan izin `content:edit_any`, diperiksa per pemilik proyek, dan permintaan tulis diverifikasi same-origin.
- Data proyek disinkronkan ke D1; unggahan JPEG/PNG/WebP sampai 8 MB disimpan di R2 dan dilayani melalui endpoint privat milik user. Data URL gambar lokal tidak dikirim ke D1.
- Cookie sesi diberi domain `.arenka.biz.id` agar sesi EmDash dari apex dapat dikenali pada subdomain generator.
- Migrasi D1 `migrations/studio/0001_storyboard_studio.sql` sudah diterapkan ke database produksi Arenkabiz pada 22 November 2026.
- Pembuatan storyboard still memakai endpoint Gemini server-side dengan model `gemini-nano-banana-2.1`, maksimal dua referensi dari project yang sama, penyimpanan hasil ke R2, dan batas 10 percobaan per user per 24 jam. Endpoint memerlukan `GEMINI_API_KEY`; key belum dikonfigurasi.
- Pemanggilan API gambar dapat menggunakan kuota berbayar provider. Pastikan plan/billing key sebelum mengaktifkan pembuatan gambar. Video tetap dibuat manual di Google Flow.

Bangun satu alur yang lengkap dahulu: satu proyek UGC 4–6 scene, satu karakter, satu produk, satu lokasi, naskah dari ChatGPT, satu gambar disetujui per scene, prompt Flow, dan ekspor ZIP. Total durasi dan durasi per shot dapat berbeda; tidak perlu memaksa semua shot 15 detik.

Urutan implementasi:

1. Format proyek/scene, impor dan editor naskah, penyimpanan proyek.
2. Integrasi referensi dan model gambar server, persetujuan gambar utama, generasi/revisi per scene.
3. Prompt Flow dari data yang sama, pemeriksaan kontinuitas, ekspor aset dan proyek.
4. Optimasi ponsel, pemulihan pekerjaan gagal, serta pemeriksaan akses dan batas penggunaan.

Character Builder 24 pose, TTS, banyak gaya tambahan, dan render video final tidak menjadi syarat versi awal. Tidak ada estimasi waktu/biaya tetap sampai akses API gambar dan cakupan UI dipilih.

## Referensi

- shadcn/ui mendukung Astro + React + Tailwind: https://ui.shadcn.com/docs/installation/astro
- Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Gemini Omni 1.2 Flash untuk video: https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemini-omni-1-2-flash/

Tautan share Gemini pengguna belum dapat dibuka oleh alat penelusuran saat analisis ini. Rancangan di atas bersumber dari kode lampiran, proyek lokal, dokumentasi resmi, dan klarifikasi pengguna mengenai Flow manual.
