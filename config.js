'use strict';
// Pengaturan kampanye. Ubah di sini, lalu restart server.
module.exports = {
  name: 'Peduli Karhutla',
  jargon: 'Dari Rakyat Untuk Hutan',
  targetAmount: 100_000_000, // target donasi: Rp 100 juta

  // Pilihan nominal (urut dari termurah ke termahal)
  presets: [5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
  minAmount: 1000,
  maxAmount: 10_000_000,

  qrisTtlMinutes: 15,        // lama QR ditampilkan sebagai "aktif" di layar
  paymentGraceMinutes: 10,   // pembayaran yang masuk sampai X menit setelah QR habis tetap dicocokkan

  // Payload QRIS statis (hasil baca QR dari gambar QRIS Anda).
  // Bisa ditimpa lewat variabel lingkungan QRIS_STATIC.
  qrisStatic:
    '00020101021126570011ID.DANA.WWW011893600915303604737502090360473750303UMI51440014ID.CO.QRIS.WWW0215ID10266166775420303UMI5204899953033605802ID5924Peduli Karhutla, Service6014Kota Samarinda61057511463044FA6',

  // Rencana alokasi dana (jumlah persen harus 100). Ditampilkan publik sebagai "rencana",
  // dibandingkan dengan dana yang benar-benar sudah dicairkan.
  allocation: [
    { key: 'pemadaman', label: 'Pemadaman & logistik relawan', percent: 40, note: 'Air, peralatan pemadam, BBM, konsumsi dan perlengkapan keselamatan relawan.' },
    { key: 'satwa', label: 'Penyelamatan & perawatan satwa', percent: 25, note: 'Evakuasi, pakan, obat dan perawatan satwa yang kehilangan habitat.' },
    { key: 'rehabilitasi', label: 'Rehabilitasi & penanaman kembali', percent: 20, note: 'Bibit pohon asli Kalimantan, penanaman dan perawatan lahan bekas terbakar.' },
    { key: 'edukasi', label: 'Edukasi & pencegahan', percent: 10, note: 'Penyuluhan desa, sekat bakar dan patroli pencegahan.' },
    { key: 'operasional', label: 'Operasional & transparansi', percent: 5, note: 'Biaya website, pelaporan dan administrasi penyaluran.' }
  ]
};
