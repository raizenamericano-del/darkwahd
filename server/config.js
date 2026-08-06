'use strict';
/**
 * KyyPureStatus — Konfigurasi server (env-based, Railway-ready)
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Data dir: Railway volume mount path > DATA_DIR env > ./data
// (selalu absolute — dibutuhkan res.sendFile dll)
const DATA_DIR = path.resolve(
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(ROOT, 'data')
);

const AUTH_DIR = process.env.AUTH_DIR || path.join(DATA_DIR, 'auth_info');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // file upload sementara
const VIDEOS_DIR = path.join(DATA_DIR, 'videos'); // video hasil kompres (untuk resend)
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Pastikan folder ada
[AUTH_DIR, UPLOAD_DIR, VIDEOS_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

const num = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const config = {
  ROOT,
  DATA_DIR,
  AUTH_DIR,
  UPLOAD_DIR,
  VIDEOS_DIR,
  HISTORY_FILE,
  PORT: num(process.env.PORT, 3000),
  APP_KEY: (process.env.APP_KEY || '').trim(),
  MAX_UPLOAD_MB: num(process.env.MAX_UPLOAD_MB, 100),
  MAX_OUTPUT_MB: num(process.env.MAX_OUTPUT_MB, 50),
  MOCK_SEND: process.env.MOCK_SEND === 'true' || process.env.MOCK_SEND === '1',
  FFMPEG_PATH: (process.env.FFMPEG_PATH || '').trim(),
  // Preset x264: slower = kualitas lebih tinggi per bitrate, tapi lebih lama.
  // v4 Dark Knight: default 'slow' — kualitas maksimal anti-burik;
  // set FFMPEG_PRESET=faster di env kalau server kecil butuh kecepatan.
  FFMPEG_PRESET: (process.env.FFMPEG_PRESET || 'slow').trim(),
  // Jumlah thread ffmpeg (default: min(CPU, 4) — aman utk container kecil)
  FFMPEG_THREADS: Math.max(1, Math.min(parseInt(process.env.FFMPEG_THREADS, 10) || os.cpus().length || 2, 8)),
  // Riwayat & retensi file
  KEEP_VIDEOS: 8, // berapa video hasil kompres terakhir yang disimpan (untuk Kirim Ulang)
  MAX_HISTORY: 30, // maksimal entri riwayat
  UPLOAD_TTL_MS: 60 * 60 * 1000, // file upload kedaluwarsa setelah 1 jam
  VERSION: '4.1.0',
  APP_NAME: 'KyyPureStatus',
  THEME: 'Dark Knight',
  BRAND: 'KyyDevv',
};

module.exports = config;
