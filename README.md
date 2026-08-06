# ⚡ KyyPureStatus — Status HD, Tanpa Ribet

**by KyyDevv** · v4.0.0 · ⚔ **DARK KNIGHT EDITION**

> ## ⚔ Dark Knight Edition (v4) — Changelog
> - **Engine v4 "Anti-Burik"** (`server/video.js`):
>   - Fix bug v3: `unsharp` bernilai negatif yang malah **me-blur** video → sekarang sharpening positif halus.
>   - Denoise `hqdn3d` sebelum encode + downscale **lanczos** → detail tajam, noise gak jadi macroblock di WA.
>   - **Smart profile**: resolusi otomatis turun kalau jatah bitrate gak cukup (mending 720p tajam daripada 1080p burik).
>   - GOP 2 detik (`keyint=60`) → potongan 30 detik Status WA mulai di keyframe (anti frame beku).
>   - CFR dipaksa → video VFR dari HP gak stutter; tune `film` dihapus (biang blocky).
>   - Bitrate ceiling dinaikkan: 1080p @10M, 720p @7M, 480p @4M, 360p @2.8M (CRF 16-17).
>   - Preset default `slow` (kualitas maks) — bisa di-override env `FFMPEG_PRESET`.
> - **Fix bug server**: sweep berkala dulu menghapus file upload yang *sedang diproses*; sekarang aman.
> - **Fix bug smoke test**: timeout multi-target dinaikkan (kompres preset slow butuh waktu).
> - **UI Dark Knight**: obsidian + ember crimson + molten gold + steel; font display Cinzel;
>   animasi baru: bara api naik, kabut Gotham, searchlight Bat-Signal, judul glitch,
>   bingkai ksatria (conic border berputar), scanline, slash-reveal. **Logo asli tetap dipertahankan.**
> - **AIO lama DIHAPUS** → diganti **Downloader per-platform** (TikTok HD/NoWM/WM/MP3,
>   Instagram, YouTube MP4/MP3, Facebook) memakai scraper dari repo
>   `toolkuufinalltest` (tikwm + musicaldown + yuulabs + fastdl + ymcdn + savefbs,
>   lengkap dengan fallback chain). Module: `server/scraper-dk.js`.
>
> ### ⚡ v4.1 — Optimasi Performa ("biar gak ngelag")
> - **Semua `backdrop-blur` dihapus** (navbar/kartu/toast/modal) — blur di atas partikel
>   animasi = repaint mahal tiap frame; diganti background opaque.
> - **Glow orb & kabut**: `filter: blur(140px/48px)` + framer-motion diganti
>   **radial-gradient murni + animasi CSS** (compositor-only, nol repaint besar).
> - **Ember**: filter `drop-shadow` per-partikel dihapus (glow di-bake ke gradient) + `contain: strict`.
> - **Scanline** dulu animasi `top` (layout thrash) → sekarang `transform`.
> - **Bingkai ksatria** conic berputar kini statis di kartu besar (animasi hanya elemen kecil).
> - **Mode low-power otomatis**: CPU ≤4 thread / layar sentuh → partikel dikurangi,
>   smoke & searchlight dimatikan. `prefers-reduced-motion` dihormati penuh.
> - **Code-splitting vendor** (Vite): chunk utama 418KB → **87KB**; react/framer/socket/
>   icons/qr di-cache browser terpisah. Target build `es2020`.

---

Web app untuk mengirim video **HD-friendly** ke nomor WhatsApp sendiri, supaya kamu bisa langsung
**tahan lama → Teruskan → Status** dengan hasil yang **lebih tajam** daripada upload langsung dari galeri.

> **Kenapa lebih tajam?** Saat kamu upload video dari galeri, WhatsApp *meng-encode ulang* videonya
> (kualitas diturunkan). Dengan app ini, video dikirim sebagai pesan video native yang **sudah di-encode
> optimal** (H.264/AAC, bitrate tinggi, faststart). Saat di-forward ke Status, WhatsApp memakai media
> yang sudah ada — hasilnya tetap jernih/HD.

---

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 📱 **Koneksi WhatsApp** | QR Code real-time (auto-refresh) **atau** Pairing Code 8 digit |
| 💾 **Session persistent** | Multi-file auth state di volume — tidak perlu scan ulang saat restart/redeploy |
| 🔄 **Auto-reconnect** | Koneksi putus → connect ulang otomatis dengan backoff |
| 🎬 **Kompresi adaptif** | Otomatis menyesuaikan resolusi berdasarkan durasi (lihat tabel) |
| 📤 **Kirim video native** | Dikirim sebagai pesan video (bukan document) — siap di-forward ke Status |
| 📊 **Progress real-time** | Upload → Kompres (%, ETA, speed) → Kirim → Sukses, via Socket.io |
| 🕘 **Riwayat + Kirim Ulang** | Riwayat tersimpan, video hasil kompres disimpan (8 terakhir) untuk resend sekali klik |
| ⚙️ **Settings** | Nomor tujuan default, caption default, disconnect/logout, clear history |
| 🛡️ **Opsional App Key** | Proteksi akses jika deploy publik (env `APP_KEY`) |
| 🧹 **Auto-cleanup** | File upload sementara dihapus setelah diproses; video lama di-prune |
| 🚀 **Railway-ready** | Dockerfile + Procfile + volume mount + env example |

### Tabel Kompresi Adaptif (otomatis)

| Durasi video | Resolusi target | Bitrate maks | Kualitas (CRF) |
|---|---|---|---|
| **≤ 30 detik** | **1080p** (1920×1080 / 1080×1920 portrait) | cap 6 Mbps | CRF 17 — Full HD maksimal |
| **31 – 60 detik** | **720p** (1280×720 / 720×1280) | cap 4 Mbps | CRF 17 — HD |
| **61 – 120 detik** | 480p | cap 2.5 Mbps | CRF 16 |
| **> 120 detik** | 360p | cap 1.5 Mbps | CRF 16 |

- Orientasi otomatis: video **portrait 9:16** (khas Status) diproses dengan box portrait.
- **Tidak pernah upscale** — video kecil dibiarkan sesuai ukuran aslinya.
- Pass utama CRF (kualitas maksimal); jika hasil melebihi `MAX_OUTPUT_MB`, otomatis fallback ke pass ABR.
- Output selalu `.mp4` (H.264 `high` + AAC 160k, 30 fps, `+faststart`, `level 4.1`) — kompatibel penuh dengan WhatsApp.
- **Tuning x264 halus** (`ref=4:bframes=3:me=umh:subq=7:rc-lookahead=40`) — detail & motion lebih baik di bitrate yang sama.

---

## 🧱 Tech Stack

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3 + Framer Motion + Socket.io-client + qrcode.react + canvas-confetti
- **Backend:** Node.js + Express 4 + Socket.io
- **WhatsApp:** @whiskeysockets/baileys (multi-device, multi-file auth state)
- **Video:** fluent-ffmpeg + ffmpeg-static + ffprobe-static
- **Deploy:** Railway (1 service, volume utk `/data`, env vars) — Dockerfile & Procfile disertakan

```
┌─────────────┐   Socket.io (progress, QR, status)    ┌──────────────────────────┐
│  Browser     │ ───────────────────────────────────▶ │  Node.js (Express)        │
│  React SPA   │   HTTP (/api/upload, /api/*)         │  ├─ WhatsAppManager       │
└─────────────┘                                       │  │   (Baileys, QR/pairing)│
                                                      │  ├─ VideoEngine (ffmpeg)  │
                                                      │  ├─ HistoryStore (JSON)   │
                                                      │  └─ Socket.io hub         │
                                                      └───────────┬──────────────┘
                                                                  │
                                        ┌─────────────────────────┼──────────────────────┐
                                        ▼                         ▼                      ▼
                                   /data/auth_info          /data/uploads          /data/videos
                                   (session Baileys,        (file sementara,       (hasil kompres utk
                                    persistent di volume)    dihapus otomatis)       riwayat/resend)
```

---

## 🚀 Deploy ke Railway

1. **Push repo ini ke GitHub.**

2. **Buat project baru di Railway** → *Deploy from GitHub repo* → pilih repo ini.
   Railway otomatis mendeteksi `Dockerfile`.

3. **Tambahkan Volume** (penting! session WhatsApp harus persistent):
   - *New* → *Volume* → mount ke path **`/data`**
   - Attach volume ke service KyyPureStatus

4. **Environment Variables** (Railway akan set `PORT` otomatis):

   | Variable | Wajib | Default | Keterangan |
   |---|---|---|---|
   | `DATA_DIR` | ✅ | `/data` | Path volume (session + data). Set ke `/data` agar tersimpan di volume |
   | `APP_KEY` | Opsional | *(kosong)* | Jika diisi, web butuh key utk dibuka (disarankan utk deploy publik) |
   | `MAX_UPLOAD_MB` | Opsional | `100` | Batas ukuran video yang boleh di-upload |
   | `MAX_OUTPUT_MB` | Opsional | `50` | Batas ukuran hasil kompresi |
   | `FFMPEG_THREADS` | Opsional | `min(CPU,4)` | Jumlah thread ffmpeg (kurangi utk container RAM kecil) |
   | `FFMPEG_PATH` | Opsional | auto | Path ffmpeg custom |
   | `MOCK_SEND` | ⚠️ JANGAN | `false` | Mode uji (simulasi kirim tanpa WhatsApp asli) |

   > Jika memakai Nixpacks (tanpa Dockerfile), `Procfile` (`web: npm start`) akan dipakai otomatis.

5. **Deploy.** Setelah running:
   - Buka URL service → halaman Koneksi
   - **Scan QR** (atau **Pairing Code**)
   - Setelah `Terhubung` → upload video → **Compress & Send**
   - Buka WhatsApp di HP → tahan lama video → **Teruskan → Status** 🎉

> ⚠️ **PENTING:** Set **1 replica saja**. Dua instance akan berebut session WhatsApp yang sama.

---

## 💻 Menjalankan Lokal (Development)

```bash
# 1. Install semua dependency (root + client)
npm install

# 2. (Opsional) buat file .env — lihat .env.example
cp .env.example .env

# 3. Jalankan server (Express :3001) + client (Vite :5173) bersamaan
npm run dev
# buka http://localhost:5173

# Production build + jalankan
npm run build
npm start        # http://localhost:3000
```

> Dev tanpa Vite: cukup `npm run dev:server` lalu buka `http://localhost:3001` (API-only, frontend tidak tersaji).

### Smoke test (tanpa WhatsApp asli)

```bash
MOCK_SEND=true npm run smoke
# menguji: server boot, profil adaptif 1080p/720p, kompresi + progress, cancel,
# upload → socket → kirim (mock) → riwayat → kirim ulang
```

---

## 📖 Cara Pakai (Alur Lengkap)

1. **Hubungkan nomor sekunder** kamu:
   - **QR Code:** buka WhatsApp → titik tiga (⋯) → *Perangkat Tertaut* → *Tautkan Perangkat* → scan.
   - **Pairing Code:** masukkan nomor (format `628xxxxxxxxxx`) → *Dapatkan Kode* → di WhatsApp pilih
     *Tautkan dengan nomor telepon saja* → masukkan kode 8 digit.
2. Setelah **Terhubung**, kamu otomatis pindah ke halaman **Kirim Video**.
3. **Upload video** (drag & drop atau pilih file, maks 100 MB default). App langsung menampilkan
   **Rencana Kompresi**: `⏱ 24 dtk → 📺 1080p (Full HD) · 1920×1080 · ±15 MB`.
4. Isi **nomor tujuan** (biasanya nomor utama kamu sendiri) + caption opsional → **Compress & Send**.
5. Tunggu progress: *Kompres (persen + ETA)* → *Kirim via WhatsApp*.
6. **Sukses!** Buka WhatsApp di HP → chat dari nomor pengirim → **tahan lama video** → **Teruskan → Status** → posting. ✨
7. Video sebelumnya bisa **dikirim ulang** dari Riwayat (tanpa upload ulang).

---

## ⚠️ Disclaimer & Risiko

- **Gunakan nomor SEKUNDER.** Library tidak resmi (Baileys) melanggar ToS WhatsApp dan dapat
  menyebabkan nomor **diblokir**. KyyDevv tidak bertanggung jawab atas pemblokiran.
- Video >30 detik akan **dipotong WhatsApp menjadi 30 detik** saat diposting ke Status.
- File di server dibersihkan otomatis (upload sementara langsung dihapus; video hasil kompres
  disimpan maksimal 8 terakhir untuk fitur Kirim Ulang).

---

## 🛠 Troubleshooting

| Masalah | Solusi |
|---|---|
| QR tidak muncul | Klik *Muat Ulang QR*; pastikan server bisa akses internet (koneksi ke WhatsApp diblokir di beberapa hosting) |
| Pairing code error "sudah terhubung" | Logout dulu dari Settings → baru pairing ulang |
| `Nomor tidak terdaftar` | Pastikan format `628xxxxxxxxxx` (tanpa `+`/`0` di depan) |
| Send gagal / 403 | Nomor sedang dibatasi WhatsApp — tunggu beberapa saat, atau pakai nomor lain |
| Session hilang setelah redeploy | Cek volume ter-attach di path `/data` dan `DATA_DIR=/data` |
| Video gagal diproses | Format tidak didukung atau file rusak — konversi dulu ke MP4 (H.264) |
| QR muncul terus-menerus | Ada instance kedua yang berebut session — pastikan 1 replica saja |

---

## 📁 Struktur Project

```
kyypurestatus/
├── Procfile / Dockerfile / .env.example
├── package.json            # workspaces: server deps (root) + client
├── server/
│   ├── index.js            # Express + Socket.io + pipeline upload→kompres→kirim
│   ├── whatsapp.js         # Baileys manager (QR, pairing, reconnect, session)
│   ├── video.js            # ffmpeg engine (profil adaptif, progress, ETA)
│   ├── history.js          # riwayat JSON (persistent)
│   └── config.js / logger.js
├── client/                 # React + Vite + Tailwind + Framer Motion
│   ├── public/             # favicon & logo (favicon.png, logo.png)
│   └── src/
│       ├── assets/         # logo resmi KyyDevv (logo.png)
│       ├── App.jsx         # socket, gate, toasts, navigasi, aurora background
│       └── components/     # ConnectPage, SendPage, HistoryPanel, Settings, dll
├── scripts/smoke.js        # smoke test end-to-end
└── samples/                # video contoh utk uji coba
```

---

Dibuat dengan ♥ oleh **KyyDevv** — *Status HD, Tanpa Ribet.*
