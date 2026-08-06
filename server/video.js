'use strict';
/**
 * WaxAllDl — Video compression engine v4 "DARK KNIGHT EDITION"
 *
 * UPGRADE dari engine v3 — fokus: STATUS WA ANTI PECAH / ANTI BURIK.
 *
 * Perbaikan utama vs v3:
 *  1. BUG v3: unsharp pakai nilai negatif (la=-0.6) → malah MENG-BLUR video.
 *     v4: sharpening positif halus + denoise dulu → detail tajam, noise bersih.
 *  2. Scaling pakai lanczos (v3 default bicubic) → downscale jauh lebih tajam.
 *  3. Smart profile: resolusi otomatis DITURUNKAN kalau bitrate jatah gak cukup,
 *     mending 720p tajam daripada 1080p burik/blocky setelah di-recompress WA.
 *  4. GOP 2 detik (keyint=60) → potongan 30 detik WA selalu mulai di keyframe,
 *     gak ada frame beku/pecah di awal clip status.
 *  5. CFR dipaksa (-fps_mode cfr) → video VFR dari HP gak stutter di WA.
 *  6. Tune 'film' dihapus (v3) — tune itu matiin deblocking → blocky di gradasi.
 *  7. AQ mode 3 + deblock halus → area gelap (tema malam) bersih dari macroblock.
 *  8. Bitrate ceiling dinaikkan + CRF dituning ulang per profil.
 *
 * Logika adaptif (otomatis sesuai durasi):
 *   ≤ 30 detik  → 1080p (Status HD)   ~10 Mbps, CRF 16
 *   ≤ 60 detik  → 720p  (Status Pro)  ~7 Mbps,  CRF 16
 *   ≤ 120 detik → 480p  (Status Clear)~4 Mbps,  CRF 17
 *   > 120 detik → 360p  (Status Light)~2.8 Mbps,CRF 17
 *
 * Pass utama: CRF (kualitas maksimal). Jika hasil melebihi MAX_OUTPUT_MB,
 * fallback ke pass ABR dengan bitrate terhitung (ukuran terjamin WA-friendly).
 */
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const config = require('./config');
const { log } = require('./logger');

// Pilih binary: FFMPEG_PATH env > ffmpeg-static > PATH
const BIN = config.FFMPEG_PATH || (typeof ffmpegStatic === 'string' ? ffmpegStatic : 'ffmpeg');
const PROBE = typeof ffprobeStatic?.path === 'string' ? ffprobeStatic.path : 'ffprobe';
ffmpeg.setFfmpegPath(BIN);
ffmpeg.setFfprobePath(PROBE);
log.info(`FFmpeg: ${BIN}`);
log.info(`FFprobe: ${PROBE}`);

const ENGINE_VERSION = '4.0.0-dk';
const FPS = 30;

// Profil kompresi v4 (bitrate dalam Mbps + batas bawah bitrate agar tidak burik)
// minKbps = bitrate minimum agar profil tersebut masih layak (tajam). Kalau jatah
// bitrate di bawah ini, lebih baik turun profil (resolusi lebih kecil tapi tajam).
const PROFILES = [
  { key: '1080p', label: '1080p (Full HD / Status HD)', box: { w: 1920, h: 1080 }, bitrateMbps: 10, crf: 16, minKbps: 4500 },
  { key: '720p', label: '720p (HD / Status Pro)', box: { w: 1280, h: 720 }, bitrateMbps: 7, crf: 16, minKbps: 2800 },
  { key: '480p', label: '480p (Status Clear)', box: { w: 854, h: 480 }, bitrateMbps: 4, crf: 17, minKbps: 1500 },
  { key: '360p', label: '360p (Status Light)', box: { w: 640, h: 360 }, bitrateMbps: 2.8, crf: 17, minKbps: 700 },
];

// Tuning x264 v4 "Dark Knight": bersih di area gelap, tajam di detail,
// GOP 2 detik biar potongan status WA mulai di keyframe (anti frame beku).
const X264_PARAMS =
  'ref=5:bframes=6:b-adapt=2:me=umh:subq=9:rc-lookahead=60:me_range=32:' +
  'keyint=60:keyint_min=15:scenecut=20:' +
  'aq-mode=3:aq-strength=0.95:deblock=-1,-1';
const AUDIO_BITRATE_K = 192; // audio premium (status musik / voice lebih jelas)
const AUDIO_BITRATE = `${AUDIO_BITRATE_K}k`;

/** Pilih profil dasar berdasarkan durasi video (detik) + override manual */
function pickProfile(durationSec, quality) {
  if (quality && quality !== 'auto') {
    const p = PROFILES.find((x) => x.key === quality);
    if (p) return p;
  }
  if (durationSec <= 30) return PROFILES[0];
  if (durationSec <= 60) return PROFILES[1];
  if (durationSec <= 120) return PROFILES[2];
  return PROFILES[3];
}

/**
 * SMART PROFILE (anti-burik): hitung jatah bitrate dari MAX_OUTPUT_MB & durasi,
 * lalu turunkan profil sampai bitrate profil muat di atas batas minimumnya.
 * Contoh: video 55 detik di-limit 50MB → jatah ~6.9Mbps → 720p oke.
 * Tapi video 115 detik → jatah ~3.3Mbps → 480p (bukan 720p burik).
 */
function smartProfile(baseProfile, durationSec, hasAudio) {
  const maxBytes = config.MAX_OUTPUT_MB * 1024 * 1024;
  const audioBytes = hasAudio ? (AUDIO_BITRATE_K * 1000 * durationSec) / 8 : 0;
  const sustainableKbps = Math.floor(((maxBytes * 0.92 - audioBytes) * 8) / Math.max(1, durationSec) / 1000);
  let idx = PROFILES.indexOf(baseProfile);
  if (idx < 0) idx = 0;
  while (idx < PROFILES.length - 1 && sustainableKbps < PROFILES[idx].minKbps) idx++;
  return { profile: PROFILES[idx], sustainableKbps, downgraded: idx > PROFILES.indexOf(baseProfile) };
}

/** Probe file video dengan ffprobe */
function probe(file) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, meta) => (err ? reject(err) : resolve(meta)));
  });
}

/** Ekstrak metadata penting dari hasil ffprobe */
function extractMeta(ffMeta) {
  const v = (ffMeta.streams || []).find((s) => s.codec_type === 'video');
  const a = (ffMeta.streams || []).find((s) => s.codec_type === 'audio');
  const duration =
    (v && v.duration ? parseFloat(v.duration) : 0) ||
    (ffMeta.format && ffMeta.format.duration ? parseFloat(ffMeta.format.duration) : 0);
  const rot = parseInt((v && v.tags && v.tags.rotation) || 0, 10) || 0;
  return {
    durationSec: Math.max(0, duration),
    width: (v && v.width) || 0,
    height: (v && v.height) || 0,
    hasAudio: !!a,
    rotation: rot % 360,
  };
}

/**
 * Tentukan dimensi output (genap, aman utk H.264).
 * - Tidak pernah upscale (video kecil dibiarkan sesuai aslinya)
 * - Memperhitungkan rotation metadata (autorotate saat decode)
 */
function targetDims(profile, srcW, srcH, rotation) {
  const rotated = rotation === 90 || rotation === 270;
  const postW = rotated ? srcH || 2 : srcW || 2;
  const postH = rotated ? srcW || 2 : srcH || 2;
  const portrait = postH > postW;
  const box = portrait ? { w: profile.box.h, h: profile.box.w } : profile.box;
  const factor = Math.min(box.w / postW, box.h / postH, 1);
  const w = Math.max(2, Math.floor((postW * factor) / 2) * 2);
  const h = Math.max(2, Math.floor((postH * factor) / 2) * 2);
  return { width: w, height: h, box };
}

/** Buat rencana kompresi untuk ditampilkan ke user (client) */
function plan(meta, quality) {
  const base = pickProfile(meta.durationSec, quality);
  const { profile, sustainableKbps, downgraded } = smartProfile(base, meta.durationSec, meta.hasAudio);
  const { width, height } = targetDims(profile, meta.width, meta.height, meta.rotation);
  const estMB = Math.max(1, Math.round((profile.bitrateMbps * meta.durationSec) / 8));
  return {
    engine: ENGINE_VERSION,
    profileKey: profile.key,
    profileLabel: profile.label,
    quality: profile.key,
    width,
    height,
    durationSec: Math.round(meta.durationSec * 10) / 10,
    fps: FPS,
    estimatedMB: estMB,
    maxOutputMB: config.MAX_OUTPUT_MB,
    sustainableKbps,
    downgraded,
    trimNote:
      meta.durationSec > 30.5
        ? 'Video >30 detik bakal dipotong WA jadi 30 detik pas di-post ke Status.'
        : null,
  };
}

function parseTimemark(tm) {
  const parts = String(tm || '').split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** '5M' * 2 → '10M'; '3500k' * 2 → '7000k' */
function mulBitrate(bitrate, factor) {
  const m = String(bitrate).match(/^([\d.]+)([kM])?$/);
  if (!m) return bitrate;
  return `${Math.round(parseFloat(m[1]) * factor)}${m[2] || ''}`;
}

/** Kumpulkan opsi output ffmpeg v4 (codec, filter, bitrate, warna, GOP) */
function buildOutputOptions({ vf, hasAudio, crf, bitrate }) {
  const opts = [
    '-map_metadata', '-1',
    '-c:v', 'libx264',
    '-preset', config.FFMPEG_PRESET,
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-fps_mode', 'cfr', // paksa constant frame rate — video HP (VFR) gak stutter di WA
    '-threads', String(config.FFMPEG_THREADS),
    '-vf', vf,
    '-x264-params', X264_PARAMS,
    '-movflags', '+faststart',
    '-max_muxing_queue_size', '1024',
  ];
  if (crf) {
    opts.push('-crf', String(crf), '-maxrate', bitrate, '-bufsize', mulBitrate(bitrate, 2));
  } else {
    opts.push('-b:v', bitrate, '-maxrate', bitrate, '-bufsize', mulBitrate(bitrate, 2));
  }
  if (hasAudio) {
    opts.push('-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', '48000', '-ac', '2');
  } else {
    opts.push('-an');
  }
  return opts;
}

/**
 * Jalankan ffmpeg dengan progress callback.
 * Kembalikan { promise, cancel } — cancel() menghentikan proses.
 */
function runFfmpeg(input, output, outputOptions, durationSec, onProgress) {
  let proc = null;
  let canceled = false;
  let lastEmit = 0;
  const startedAt = Date.now();

  const promise = new Promise((resolve, reject) => {
    proc = ffmpeg(input)
      .output(output)
      .outputOptions(['-y', ...outputOptions])
      .on('start', (cmd) => {
        log.debug('ffmpeg:', cmd.length > 300 ? cmd.slice(0, 300) + '…' : cmd);
      })
      .on('progress', (p) => {
        if (canceled) return;
        const outSec = parseTimemark(p.timemark);
        if (outSec == null || !durationSec) return;
        const elapsed = (Date.now() - startedAt) / 1000;
        const speed = elapsed > 0 ? outSec / elapsed : 0;
        const percent = Math.min(99, Math.round((outSec / durationSec) * 100));
        const etaSec = speed > 0 ? Math.max(0, (durationSec - outSec) / speed) : null;
        const now = Date.now();
        if (now - lastEmit > 500) {
          lastEmit = now;
          try {
            onProgress({ percent, etaSec, speed, outSec });
          } catch (_) { /* noop */ }
        }
      })
      .on('error', (err) => reject(canceled ? new Error('Proses dibatalkan') : err))
      .on('end', () => resolve())
      .run();
  });

  return {
    promise,
    cancel: () => {
      canceled = true;
      try {
        if (proc) proc.kill('SIGKILL');
      } catch (_) { /* noop */ }
    },
  };
}

/**
 * Rantai filter v4 "ANTI BURIK":
 *  1. hqdn3d ringan  → bersihkan noise sensor SEBELUM encode (biar noise gak
 *     jadi macroblock setelah di-recompress WhatsApp)
 *  2. scale lanczos  → downscale tajam (v3 pakai default yang lebih lembut)
 *  3. eq halus       → angkat brightness/kontras/saturasi dikit biar "pop" di HP
 *  4. unsharp POSITIF→ sharpen halus (v3 BUG: nilai negatif = blur!)
 *  5. setsar + format→ rasio piksel & format warna aman utk semua pemutar
 */
function buildFilterChain(width, height) {
  return [
    'hqdn3d=1.2:1.2:5:5',
    `scale=${width}:${height}:flags=lanczos`,
    'eq=brightness=0.02:contrast=1.06:saturation=1.05',
    'unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.6:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.3',
    'setsar=1',
    'format=yuv420p',
  ].join(',');
}

/**
 * Kompres video (engine v4).
 * @param {string} input path file asli
 * @param {string} output path file hasil (.mp4)
 * @param {object} meta hasil extractMeta()
 * @param {Function} onProgress ({percent, etaSec, speed})
 * @returns handle { promise, cancel }
 */
function compressVideo(input, output, meta, onProgress, quality) {
  const base = pickProfile(meta.durationSec, quality);
  const { profile, downgraded } = smartProfile(base, meta.durationSec, meta.hasAudio);
  if (downgraded) {
    log.info(`Smart profile: ${base.key} → ${profile.key} (jatah bitrate gak cukup, biar gak burik)`);
  }
  const { width, height } = targetDims(profile, meta.width, meta.height, meta.rotation);
  const vf = buildFilterChain(width, height);
  const bitrate = `${profile.bitrateMbps}M`;
  const maxBytes = config.MAX_OUTPUT_MB * 1024 * 1024;

  // Referensi run aktif — cancel harus membatalkan pass yang sedang berjalan
  let activeRun = null;

  // Pass 1: CRF — kualitas terbaik
  const pass1 = runFfmpeg(
    input,
    output,
    buildOutputOptions({ vf, hasAudio: meta.hasAudio, crf: profile.crf, bitrate }),
    meta.durationSec,
    onProgress
  );
  activeRun = pass1;

  const final = pass1.promise
    .then(async () => {
      const size = fs.existsSync(output) ? fs.statSync(output).size : 0;
      if (size > maxBytes) {
        log.warn(`Hasil ${(size / 1048576).toFixed(1)}MB melebihi batas ${config.MAX_OUTPUT_MB}MB — fallback ke ABR pass`);
        fs.rmSync(output, { force: true });
        // Hitung bitrate video agar total ≈ MAX_OUTPUT_MB (audio dihitung 192k sesuai encoder)
        const audioBytes = meta.hasAudio ? (AUDIO_BITRATE_K * 1000 * meta.durationSec) / 8 : 0;
        const targetVidBytes = maxBytes * 0.92 - audioBytes;
        const bps = Math.max(300000, Math.floor((targetVidBytes * 8) / Math.max(1, meta.durationSec)));
        const capBps = profile.bitrateMbps * 1000000;
        const abr = Math.min(bps, capBps);
        const pass2 = runFfmpeg(
          input,
          output,
          buildOutputOptions({ vf, hasAudio: meta.hasAudio, crf: null, bitrate: `${Math.round(abr / 1000)}k` }),
          meta.durationSec,
          onProgress
        );
        activeRun = pass2; // cancel sekarang membidik pass 2
        await pass2.promise;
      }
      const finalSize = fs.existsSync(output) ? fs.statSync(output).size : 0;
      return {
        file: output,
        sizeBytes: finalSize,
        width,
        height,
        durationSec: meta.durationSec,
        profileKey: profile.key,
        profileLabel: profile.label,
        bitrate,
        engine: ENGINE_VERSION,
      };
    })
    .catch((err) => {
      fs.rmSync(output, { force: true });
      throw err;
    });

  return {
    promise: final,
    cancel: () => {
      try {
        if (activeRun) activeRun.cancel();
      } catch (_) { /* noop */ }
    },
  };
}

/** Ambil thumbnail (1 frame) untuk riwayat */
function extractThumbnail(input, outFile, durationSec) {
  return new Promise((resolve) => {
    const at = Math.min(Math.max(0.5, durationSec * 0.1), 10);
    ffmpeg(input)
      .screenshots({
        timemarks: [at],
        filename: path.basename(outFile),
        folder: path.dirname(outFile),
        size: '320x?',
      })
      .on('end', () => resolve(true))
      .on('error', () => resolve(false));
  });
}

/** Hapus file jika ada (helper) */
function rm(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch (_) { /* noop */ }
}

module.exports = {
  BIN,
  FPS,
  PROFILES,
  ENGINE_VERSION,
  pickProfile,
  smartProfile,
  probe,
  extractMeta,
  plan,
  targetDims,
  buildFilterChain,
  compressVideo,
  extractThumbnail,
  rm,
};
