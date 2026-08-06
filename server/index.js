'use strict';
/**
 * KyyPureStatus — Server utama (Express + Socket.io)
 *
 * Endpoint:
 *   GET  /api/config            → konfigurasi publik (ukuran maks, versi, dst)
 *   GET  /api/status            → status koneksi WhatsApp
 *   POST /api/connect/qr        → mulai socket & minta QR
 *   POST /api/connect/pairing   → minta pairing code 8 digit
 *   POST /api/disconnect        → putus koneksi (session disimpan)
 *   POST /api/logout            → logout + hapus session
 *   POST /api/upload            → upload video (multipart)
 *   GET  /api/history           → riwayat pengiriman
 *   DELETE /api/history/:id     → hapus entri riwayat
 *   DELETE /api/history         → hapus semua riwayat
 *   GET  /api/thumb/:id         → thumbnail video riwayat
 *
 * Socket events (client → server):
 *   video:process { uploadId, target, caption }
 *   video:resend  { id, target }
 *   video:cancel
 *   history:get / history:delete { id }
 *
 * Socket events (server → client):
 *   conn:update, job:start, compress:start, compress:progress,
 *   compress:done, send:start, send:done, send:error,
 *   history:update, notice
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');
const config = require('./config');
const scraper = require('./scraper-dk');
const { log } = require('./logger');
const historyStore = require('./history');
const WhatsAppManager = require('./whatsapp');
const videoLib = require('./video');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 2e6,
  cors: { origin: true, credentials: true },
});

app.use(express.json({ limit: '1mb' }));

/* ============================================================
 * Auth opsional (APP_KEY)
 * ============================================================ */
function authOk(req) {
  return !config.APP_KEY || req.get('x-app-key') === config.APP_KEY;
}
app.use('/api', (req, res, next) => {
  if (!authOk(req)) return res.status(401).json({ error: 'App key salah atau tidak ada.' });
  next();
});
io.use((socket, next) => {
  if (!config.APP_KEY || socket.handshake.auth?.key === config.APP_KEY) return next();
  next(new Error('unauthorized'));
});

/* ============================================================
 * WhatsApp manager
 * ============================================================ */
const wa = new WhatsAppManager(io);

/* ============================================================
 * Upload (multer) — file sementara di DATA_DIR/uploads
 * ============================================================ */
const uploads = new Map(); // uploadId → meta

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, `up_${crypto.randomBytes(8).toString('hex')}.upload`),
});
const uploadMw = multer({
  storage,
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      (file.mimetype || '').startsWith('video/') ||
      /\.(mp4|mov|mkv|avi|webm|3gp|m4v|mpeg|mpg|wmv|flv)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Itu bukan video bro'), ok);
  },
}).single('video');

/* ============================================================
 * Pipeline: proses video (compress → send) dengan single-flight
 * ============================================================ */
const activeJob = { running: false, cancel: null, uploadId: null };

function emitTo(socket, event, data) {
  try {
    socket.emit(event, data);
  } catch (_) { /* noop */ }
}

/** Normalisasi nomor tujuan: 0812… → 62812…, +62 → 62, dst */
function normalizeNumber(input) {
  let n = String(input || '').replace(/[^\d]/g, '');
  if (!n) throw new Error('Nomor tujuannya kosong.');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!/^\d{9,15}$/.test(n)) throw new Error('Nomor tujuannya gak valid. Contoh: 6281234567890');
  return n;
}

function friendlyError(err) {
  const msg = (err && err.message) || 'Ada yang error, coba lagi ya.';
  if (/dibatalkan/i.test(msg)) return { code: 'CANCELED', message: 'Proses dibatalkan.' };
  if (/tidak terhubung|belum nyambung/i.test(msg)) return { code: 'NOT_CONNECTED', message: msg };
  if (/tidak terdaftar|gak ke-registrasi/i.test(msg)) return { code: 'NOT_REGISTERED', message: msg };
  if (/403|forbidden|ban|restrict/i.test(msg)) {
    return { code: 'BANNED', message: 'WA nolak kirim videonya (kemungkinan nomor lagi dibatasi). Coba lagi nanti atau ganti nomor.' };
  }
  if (/ffmpeg|codec|invalid data|moov|stream/i.test(msg)) {
    return { code: 'COMPRESS_FAILED', message: 'Gagal proses video. Pastikan formatnya didukung (MP4/MOV/MKV/AVI/WebM/3GP).' };
  }
  return { code: 'UNKNOWN', message: msg };
}

async function probeUpload(uploadId) {
  const meta = uploads.get(uploadId);
  if (!meta) throw new Error('File-nya ilang di server. Upload ulang aja.');
  if (!fs.existsSync(meta.file)) {
    uploads.delete(uploadId);
    throw new Error('File-nya ilang di server. Upload ulang aja.');
  }
  return meta;
}

/**
 * Proses utama: kompres + kirim.
 * @param {object} socket socket.io client
 * @param {object} p { uploadId?, resendId?, target, caption? }
 */
async function runProcess(socket, p) {
  if (activeJob.running) {
    emitTo(socket, 'send:error', { code: 'BUSY', message: 'Masih ada video yang lagi diproses. Sabar dulu ges, tunggu selesai.' });
    return;
  }

  activeJob.running = true;
  let uploadMeta = null;
  let isResend = false;
  let resendEntry = null;
  const toDelete = [];

  try {
    emitTo(socket, 'job:start', { uploadId: p.uploadId || null, resendId: p.resendId || null });

    // 1) Siapkan sumber video
    if (p.resendId) {
      const entry = historyStore.get(p.resendId);
      resendEntry = entry;
      if (!entry || entry.status !== 'success' || !entry.videoFile) {
        throw new Error('Riwayat/file-nya udah dibersihin. Upload ulang aja.');
      }
      const vfile = path.join(config.VIDEOS_DIR, entry.videoFile);
      if (!fs.existsSync(vfile)) {
        throw new Error('File video lamanya udah kehapus dari server. Upload ulang ya.');
      }
      uploadMeta = { file: vfile, originalName: entry.originalName, ...videoLib.extractMeta(await videoLib.probe(vfile)) };
      isResend = true;
    } else {
      uploadMeta = await probeUpload(p.uploadId);
    }

    // 2) Validasi nomor tujuan (bisa multi: pisah koma/spasi/enter)
    //    resend: fallback ke nomor asal dari riwayat
    const rawTargets = String(p.targets || p.target || resendEntry?.targets || resendEntry?.target || '')
      .split(/[,;\s]+/)
      .filter(Boolean);
    if (!rawTargets.length) throw new Error('Nomor tujuannya kosong.');
    const targets = rawTargets.map(normalizeNumber);
    if (targets.length > 5) throw new Error('Maksimal 5 nomor tujuan sekaligus.');
    for (const t of targets) {
      const exists = await wa.isOnWhatsApp(t);
      if (!exists) {
        throw new Error(`${t} gak ke-registrasi di WA. Cek lagi nomornya.`);
      }
    }

    // 3) Kompres (kecuali resend — file sudah terkompres)
    let result;
    if (!isResend) {
      const plan = videoLib.plan(uploadMeta, p.quality);
      emitTo(socket, 'compress:start', { uploadId: p.uploadId, plan });

      const outFile = path.join(config.VIDEOS_DIR, `${p.uploadId}.mp4`);
      const thumbFile = path.join(config.VIDEOS_DIR, `${p.uploadId}.jpg`);
      const handle = videoLib.compressVideo(
        uploadMeta.file,
        outFile,
        uploadMeta,
        (prog) => emitTo(socket, 'compress:progress', { uploadId: p.uploadId, ...prog }),
        p.quality
      );
      activeJob.cancel = () => handle.cancel();
      result = await handle.promise;

      // Thumbnail untuk riwayat (best-effort)
      await videoLib.extractThumbnail(uploadMeta.file, thumbFile, uploadMeta.durationSec);

      emitTo(socket, 'compress:done', {
        uploadId: p.uploadId,
        sizeMB: +(result.sizeBytes / 1048576).toFixed(2),
        width: result.width,
        height: result.height,
        profileLabel: result.profileLabel,
      });
    } else {
      // Resend: pakai file lama, lewati kompresi
      const ffMeta = await videoLib.probe(uploadMeta.file);
      const m = videoLib.extractMeta(ffMeta);
      result = {
        file: uploadMeta.file,
        sizeBytes: fs.statSync(uploadMeta.file).size,
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
        profileLabel: 'Tersimpan',
        profileKey: 'saved',
      };
    }

    // 4) Kirim via WhatsApp (loop ke semua nomor tujuan)
    emitTo(socket, 'send:start', { targets });
    const sent = [];
    for (const t of targets) {
      sent.push(await wa.sendVideo(t, result.file, p.caption || undefined));
    }

    // 5) Catat riwayat
    const entry = historyStore.add({
      targets,
      target: targets[0],
      count: targets.length,
      quality: p.quality || 'auto',
      originalName: uploadMeta.originalName || 'video.mp4',
      durationSec: Math.round(result.durationSec * 10) / 10,
      width: result.width,
      height: result.height,
      resolution: `${result.width}x${result.height}`,
      sizeMB: +(result.sizeBytes / 1048576).toFixed(2),
      profileLabel: result.profileLabel,
      status: 'success',
      source: isResend ? 'resend' : 'upload',
      messageIds: sent.map((s) => s.messageId),
      videoFile: path.basename(result.file),
      thumbFile: isResend ? null : `${p.uploadId}.jpg`,
    });
    io.emit('history:update', historyStore.list());

    // 6) Bersihkan file upload sementara (video hasil kompres DIKECUALIKAN — dipakai utk resend)
    if (!isResend) toDelete.push(uploadMeta.file);
    log.info(`Selesai: ${entry.originalName} → ${targets.join(', ')} (${entry.sizeMB} MB, ${entry.resolution})`);

    emitTo(socket, 'send:done', {
      uploadId: p.uploadId,
      resendId: p.resendId || null,
      messageIds: sent.map((s) => s.messageId),
      targets,
      target: targets[0],
      meta: {
        sizeMB: entry.sizeMB,
        durationSec: entry.durationSec,
        resolution: entry.resolution,
        profileLabel: entry.profileLabel,
      },
    });
  } catch (err) {
    const f = friendlyError(err);
    log.error('Proses video gagal:', err.message);
    // Catat riwayat gagal (tanpa file video)
    if (uploadMeta) {
      historyStore.add({
        target: p.target || null,
        originalName: uploadMeta.originalName || 'video.mp4',
        status: 'failed',
        error: f.message,
        source: isResend ? 'resend' : 'upload',
      });
      io.emit('history:update', historyStore.list());
    }
    emitTo(socket, 'send:error', f);
  } finally {
    toDelete.forEach((f) => videoLib.rm(f));
    if (!isResend && p.uploadId) uploads.delete(p.uploadId);
    activeJob.running = false;
    activeJob.cancel = null;
  }
}

/* ============================================================
 * REST API
 * ============================================================ */
app.get('/api/config', (_req, res) => {
  res.json({
    appName: config.APP_NAME,
    brand: config.BRAND,
    theme: config.THEME,
    version: config.VERSION,
    engine: videoLib.ENGINE_VERSION,
    maxUploadMB: config.MAX_UPLOAD_MB,
    maxOutputMB: config.MAX_OUTPUT_MB,
    mockSend: config.MOCK_SEND,
    appKeyRequired: !!config.APP_KEY,
    // Profil kualitas untuk selector manual di UI
    profiles: videoLib.PROFILES.map(({ key, label, bitrateMbps, crf, minKbps }) => ({ key, label, bitrateMbps, crf, minKbps })),
  });
});

app.get('/api/status', (_req, res) => res.json(wa.status()));

app.post('/api/connect/qr', async (_req, res) => {
  try {
    const st = await wa.requestQR();
    res.json(st);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/connect/pairing', async (req, res) => {
  try {
    const code = await wa.requestPairing(req.body?.number);
    res.json({ code });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/disconnect', async (_req, res) => {
  await wa.disconnect();
  res.json({ ok: true });
});

app.post('/api/logout', async (_req, res) => {
  await wa.logout();
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  uploadMw(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `Ukuran videonya melebihi ${config.MAX_UPLOAD_MB} MB.`
        : err.message || 'Upload gagal.';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Belum ada file yang di-upload.' });

    try {
      const meta = videoLib.extractMeta(await videoLib.probe(req.file.path));
      if (!meta.width || !meta.height || !meta.durationSec) {
        videoLib.rm(req.file.path);
        return res.status(400).json({ error: 'File-nya gak kebaca sebagai video. Pake MP4/MOV/MKV/AVI/WebM/3GP ya.' });
      }
      const uploadId = crypto.randomBytes(8).toString('hex');
      uploads.set(uploadId, {
        file: req.file.path,
        originalName: req.file.originalname || 'video.mp4',
        sizeBytes: req.file.size,
        uploadedAt: Date.now(),
        ...meta,
      });
      res.json({ uploadId, plan: videoLib.plan(meta), meta: { originalName: req.file.originalname, sizeMB: +(req.file.size / 1048576).toFixed(2) } });
    } catch (e) {
      videoLib.rm(req.file.path);
      res.status(400).json({ error: 'File-nya gak valid sebagai video.' });
    }
  });
});

app.get('/api/history', (_req, res) => res.json(historyStore.list()));

app.delete('/api/history/:id', (req, res) => {
  historyStore.remove(req.params.id);
  io.emit('history:update', historyStore.list());
  res.json({ ok: true });
});

app.delete('/api/history', (_req, res) => {
  historyStore.clear();
  io.emit('history:update', historyStore.list());
  res.json({ ok: true });
});

app.get('/api/thumb/:id', (req, res) => {
  const entry = historyStore.get(req.params.id);
  if (!entry || !entry.thumbFile) return res.status(404).end();
  const f = path.join(config.VIDEOS_DIR, entry.thumbFile);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});

/* ============================================================
 * Socket.io
 * ============================================================ */
io.on('connection', (socket) => {
  log.info(`Client terhubung: ${socket.id}`);
  socket.emit('conn:update', wa.status());
  socket.emit('history:update', historyStore.list());

  socket.on('video:process', (p) => runProcess(socket, p || {}));
  socket.on('video:resend', (p) => runProcess(socket, { ...(p || {}), resendId: p?.id || p?.resendId }));
  socket.on('video:cancel', () => {
    try {
      if (activeJob.cancel) activeJob.cancel();
    } catch (_) { /* noop */ }
  });
  socket.on('history:get', () => socket.emit('history:update', historyStore.list()));
  socket.on('history:delete', (id) => {
    historyStore.remove(id);
    io.emit('history:update', historyStore.list());
  });
  socket.on('disconnect', () => log.info(`Client putus: ${socket.id}`));
});

/* ============================================================
 * Static frontend (production) + SPA fallback
 * ============================================================ */
const DIST = path.join(config.ROOT, 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

/* ============================================================
 * Cleanup berkala: file upload basi & prune video lama
 * ============================================================ */
function sweep() {
  const now = Date.now();
  // Upload basi (> 1 jam) — hapus file + meta
  for (const [id, m] of uploads) {
    if (now - m.uploadedAt > config.UPLOAD_TTL_MS) {
      videoLib.rm(m.file);
      uploads.delete(id);
    }
  }
  // FIX v4: file yatim di folder upload (sisa crash) — dulu SEMUA file dihapus
  // termasuk upload yang SEDANG diproses ffmpeg. Sekarang hanya hapus file
  // yang tidak terdaftar di Map `uploads` DAN umurnya > TTL (aman utk job aktif).
  const activeFiles = new Set([...uploads.values()].map((m) => path.basename(m.file)));
  // Video hasil kompres: sisakan KEEP_VIDEOS terbaru yang masih ada di riwayat
  const list = historyStore.list();
  const kept = new Set();
  for (const e of list) {
    if (e.status === 'success' && e.videoFile) {
      if (kept.size < config.KEEP_VIDEOS) {
        kept.add(e.videoFile);
        if (e.thumbFile) kept.add(e.thumbFile);
      }
    }
  }
  try {
    for (const f of fs.readdirSync(config.VIDEOS_DIR)) {
      if (!kept.has(f)) videoLib.rm(path.join(config.VIDEOS_DIR, f));
    }
  } catch (_) { /* noop */ }
  // Upload sisa di folder (crash dll) — lihat FIX v4 di atas
  try {
    for (const f of fs.readdirSync(config.UPLOAD_DIR)) {
      if (activeFiles.has(f)) continue; // jangan sentuh file yang lagi diproses
      const fp = path.join(config.UPLOAD_DIR, f);
      try {
        const st = fs.statSync(fp);
        if (now - st.mtimeMs > config.UPLOAD_TTL_MS) videoLib.rm(fp);
      } catch (_) { /* noop */ }
    }
  } catch (_) { /* noop */ }
}
setInterval(sweep, 10 * 60 * 1000);

/* ============================================================
 * DOWNLOADER v4.1 — scraper ported dari repo toolkuufinalltest
 * TikTok (HD/NoWM/WM/MP3) · Instagram · YouTube (MP4/MP3) · Facebook
 * ============================================================ */
app.post('/api/downloader', async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    const platform = String(req.body?.platform || '').trim().toLowerCase();
    if (!url) return res.status(400).json({ status: false, error: 'URL kosong' });
    if (!scraper.isValidHttpUrl(url)) return res.status(400).json({ status: false, error: 'URL tidak valid' });

    let result;
    const direct = {
      tiktok: scraper.handleTiktok,
      instagram: scraper.handleInstagram,
      youtube: scraper.handleYoutube,
      facebook: (u) => scraper.downloadFromSavefbs(u),
    };
    if (platform && direct[platform]) {
      // Tab spesifik → handler langsung; fallback ke router umum bila gagal
      try {
        result = await direct[platform](url);
      } catch (_e) {
        result = await scraper.handleAio(url);
      }
    } else {
      result = await scraper.handleAio(url);
    }
    res.json({ status: true, ...result, source: 'Dark Knight Scraper' });
  } catch (e) {
    res.status(502).json({ status: false, error: e.message || 'Scraper gagal' });
  }
});

/* ============================================================
 * Startup & shutdown
 * ============================================================ */
async function start() {
  httpServer.listen(config.PORT, '0.0.0.0', () => {
    log.info(`⚡ ${config.APP_NAME} v${config.VERSION} (by ${config.BRAND}) jalan di :${config.PORT}`);
    log.info(`   Data dir: ${config.DATA_DIR}`);
    if (config.MOCK_SEND) log.warn('   ⚠ MOCK_SEND aktif — koneksi WhatsApp di-simulasikan!');
    if (config.APP_KEY) log.info('   App Key: aktif');
  });
  // Mulai koneksi WhatsApp (session persistent akan langsung open jika valid)
  wa.start().catch((e) => log.error('Start WhatsApp gagal:', e.message));
  sweep();
}

function shutdown(signal) {
  log.warn(`${signal} diterima — shutdown bersih...`);
  wa.shutdown().finally(() => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Jalankan langsung jika file ini dieksekusi (bukan di-require)
if (require.main === module) {
  start();
}

module.exports = { app, httpServer, io, start, wa, runProcess };
