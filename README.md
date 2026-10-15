# Peduli Karhutla — Dari Rakyat Untuk Hutan

Website donasi terbuka: pilih nominal → isi nama → scan QRIS (nominal terisi otomatis) → konfirmasi → donatur bisa **mencetak kuitansi**, boleh menulis catatan publik, dan semua orang bisa memberi hati. Total donasi, target Rp 100 juta, pencairan dan lokasi penerima tampil **realtime**.

## Isi project
```
server.js            backend (Express + SQLite + realtime SSE)
config.js            target, pilihan nominal, QRIS statis, rencana alokasi dana
lib/qris.js          ubah QRIS statis -> dinamis (tag 54 + CRC16)
public/              website (index.html, kuitansi.html, admin.html, css, js, img, fonts)
.env.example         contoh pengaturan
```

## 1. Menjalankan di komputer sendiri
Butuh Node.js 18+ (disarankan 20/22).
```bash
npm install
cp .env.example .env      # lalu isi (lihat bagian 2)
npm start                 # buka http://localhost:3000
```
Uji logika QRIS: `npm test` (harus tertulis `QRIS OK`).

## 2. Isi file `.env` (wajib dibaca)
| Variabel | Fungsi |
|---|---|
| `BASE_URL` | Alamat publik website (alamat website), mis. `https://pedulikarhutla.id` |
| `ADMIN_PASSWORD` | Password panel `/admin`. **Wajib diganti**, minimal 12 karakter. Tanpa ini admin mati. |
| `MOOTA_SECRET` / `WEBHOOK_SECRET` | Konfirmasi pembayaran otomatis (bagian 4). |
| `UNIQUE_CODE` | `true` = tambah 1–99 rupiah di nominal agar tiap transaksi unik. |

### Kuitansi
Setelah pembayaran terkonfirmasi, donatur melihat tombol **Cetak kuitansi** di halaman. Kuitansi terbuka di `/kuitansi?id=...&token=...` (tautan rahasia milik donatur), lalu bisa dicetak atau disimpan sebagai PDF lewat tombol cetak browser. Donatur yang menutup halaman tetap bisa mengambilnya dari daftar **Kuitansi saya** di kotak donasi (tersimpan di browser yang sama).

## 3. Online-kan (hosting)
Website butuh server Node.js dan **disk yang awet** (database SQLite di folder `data/`). Pilihan mudah:
- **VPS** (mis. Niagahoster/IDCloudHost/DigitalOcean): `npm install`, jalankan dengan `pm2 start server.js --name karhutla`, pasang Nginx + HTTPS (Let's Encrypt), set `TRUST_PROXY=1`. Nginx wajib: `proxy_buffering off;` untuk `/api/stream`.
- **Railway / Render**: pasang repo, perintah start `npm start`, tambahkan *Persistent Disk/Volume* dan set `DATA_DIR` ke path disk itu. Isi semua variabel `.env` di dashboard, `TRUST_PROXY=1`.
Hosting statis (Netlify/GitHub Pages) **tidak bisa** karena butuh backend.

## 4. Konfirmasi pembayaran otomatis (penting, baca ini)
QRIS statis milik Anda hanya *menerima* uang; ia tidak memberi tahu website bahwa uang masuk. Agar halaman berubah "Berhasil" **otomatis**, website perlu sinyal dari mutasi rekening/e-wallet. Ada tiga cara, boleh dipakai bersamaan:

**A. Moota (webhook mutasi)** — daftar di moota.co, hubungkan rekening/e-wallet yang menerima QRIS Anda (cek dulu penyedia/rekening Anda didukung Moota), buat Webhook ke `https://DOMAIN-ANDA/api/webhook/moota`, salin *Secret Token* ke `MOOTA_SECRET`. Server memverifikasi header `Signature` (HMAC-SHA256) dan hanya memproses mutasi kredit (`CR`). Cocokkan dengan dokumentasi Moota terbaru bila format berubah.

**B. Webhook umum** — untuk aplikasi pembaca notifikasi (mis. notification forwarder di HP yang menerima notifikasi "dana masuk"). Kirim `POST https://DOMAIN-ANDA/api/webhook/payment` dengan header `x-webhook-secret: <WEBHOOK_SECRET>` dan body JSON `{"amount": 50000, "id": "id-unik-opsional"}`.

**C. Konfirmasi manual** — buka `/admin` → Donasi → tekan **Konfirmasi** pada donasi yang sudah Anda lihat masuk di mutasi.

**Cara pencocokan:** pembayaran dicocokkan ke donasi *menunggu* dengan nominal sama (yang paling lama dulu). Jika dua orang membayar nominal yang sama bersamaan, bisa tertukar. Bila kampanye ramai, set `UNIQUE_CODE=true` (nominal menjadi mis. Rp 50.037) sehingga setiap transaksi pasti unik; donatur membayar tepat jumlah yang tertera di layar.

## 5. Panel admin `/admin`
Masuk dengan `ADMIN_PASSWORD`.
- **Donasi**: lihat semua donasi, konfirmasi manual.
- **Pencairan dana**: catat tiap pencairan (tanggal, nominal, kebutuhan, lokasi, penerima, keterangan, link bukti). Otomatis muncul realtime di bagian *Penggunaan Dana*: total tersalur, jumlah pencairan, rincian per kebutuhan, per lokasi, dan riwayat.
- **Catatan**: hapus catatan yang tidak pantas.

## 6. Ubah pengaturan
Di `config.js`: `targetAmount` (100 juta), `presets` (pilihan nominal, urut termurah ke termahal), `allocation` (rencana persentase penggunaan dana, total harus 100), `qrisStatic` (payload QRIS). Restart server setelah mengubah.
Untuk mengganti QRIS: baca QR dari gambar QRIS baru (aplikasi pemindai/QR decoder), tempel teks hasilnya ke `QRIS_STATIC` di `.env`. Server menolak payload yang CRC-nya salah.

## 7. Daftar cek agar semua menu berfungsi
1. `npm start`, buka website, tidak ada error di terminal.
2. Pilih nominal → isi nama → QR muncul. Scan dengan aplikasi: nominal harus sama dengan di layar dan penerima "Peduli Karhutla, Service".
3. Bayar nominal kecil (Rp 1.000) sungguhan; pastikan halaman berubah *Berhasil* (webhook) atau konfirmasi dari `/admin`.
4. Tombol **Cetak kuitansi** muncul; buka, cetak/simpan PDF, cek nama, nominal dan nomor kuitansi.
5. Tulis catatan → tampil di semua perangkat tanpa refresh; beri hati dari HP lain.
6. `/admin` → catat pencairan → angka *Sudah disalurkan*, *Dicairkan sebanyak*, per lokasi ikut berubah di website.

## Keamanan & batasan jujur
- Hati: satu per pengunjung (ID acak di browser) + pembatasan per IP; orang yang sengaja mengulik bisa menambah hati. Untuk keamanan lebih ketat perlu login pengguna.
- Catatan hanya bisa ditulis dengan token rahasia donasi (disimpan di browser donatur) dan hanya setelah pembayaran terkonfirmasi, satu catatan per donasi.
- Data pencairan dan alokasi adalah **input pengelola**; website tidak mengarang angka. Awalnya kosong sampai Anda mencatat.
- Simpan cadangan folder `data/` secara berkala.
