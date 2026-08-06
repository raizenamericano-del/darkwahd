'use strict';
/**
 * KyyPureStatus — WhatsApp manager (Baileys, multi-device)
 *
 * - Session persistent via multi-file auth state di folder volume
 * - Auto-reconnect dengan backoff kalau koneksi putus
 * - QR Code & Pairing Code (8 digit)
 * - Status koneksi di-broadcast ke client via Socket.io
 */
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('./config');
const { log } = require('./logger');

const silentLogger = pino({ level: 'silent' });

const withTimeout = (p, ms, msg) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'Timeout')), ms)),
  ]);

class WhatsAppManager {
  constructor(io) {
    this.io = io;
    this.sock = null;
    this.state = 'idle'; // idle|starting|qr|pairing|connecting|connected|reconnecting|disconnected|logged_out
    this.phone = null;
    this.connectedAt = null;
    this.latestQr = null;
    this.pairingCode = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.starting = false;
    this._shuttingDown = false;
  }

  /** Status publik untuk client */
  status() {
    return {
      mock: config.MOCK_SEND,
      state: this.state,
      phone: this.phone,
      realSession: this.state === 'connected',
      connectedAt: this.connectedAt,
      qr: this.state === 'qr' ? this.latestQr : null,
    };
  }

  /** Update state + broadcast ke semua client */
  setState(state) {
    this.state = state;
    if (state !== 'qr') this.latestQr = null;
    if (state !== 'pairing') this.pairingCode = null;
    try {
      this.io.emit('conn:update', this.status());
    } catch (_) { /* noop */ }
    log.info(`Koneksi WhatsApp: ${state}${this.phone ? ` (${this.phone})` : ''}`);
  }

  /** Mulai / mulai ulang socket Baileys */
  async start() {
    if (this.starting || this._shuttingDown) return;
    this.starting = true;
    try {
      this._teardown();
      this.setState('starting');

      const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR);
      let version;
      try {
        version = (await fetchLatestBaileysVersion()).version;
      } catch (_) {
        version = undefined; // pakai default Baileys
      }

      this.sock = makeWASocket({
        auth: state,
        version,
        logger: silentLogger,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        fireInitQueries: true,
      });

      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('connection.update', (u) => this._onConnUpdate(u));
      this.sock.ev.on('pairing.code', (code) => {
        // Fallback: beberapa versi Baileys kirim code lewat event
        this.pairingCode = code;
        this.setState('pairing');
      });
    } catch (err) {
      log.error('Gagal start socket:', err.message);
      this.setState('disconnected');
    } finally {
      this.starting = false;
    }
  }

  _teardown() {
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (_) { /* noop */ }
    }
    this.sock = null;
  }

  _onConnUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.latestQr = qr;
      this.setState('qr');
    }
    if (update.receivedPendingNotifications === true) {
      // QR sudah dipindai, menunggu handshake selesai
      this.setState('connecting');
    }
    if (connection === 'connecting') {
      this.setState('connecting');
    }
    if (connection === 'open') {
      this.reconnectAttempts = 0;
      this.phone = (this.sock?.user?.id || '').split(':')[0] || null;
      this.connectedAt = Date.now();
      this.setState('connected');
    }
    if (connection === 'close') {
      this._onClose(lastDisconnect?.error);
    }
  }

  _onClose(err) {
    const code = err?.output?.statusCode;
    this.phone = null;
    this.connectedAt = null;
    this.sock = null;

    if (this._shuttingDown || this.manualDisconnect) {
      this.manualDisconnect = false;
      return;
    }

    if (code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) {
      // 401 logged out / 403 forbidden — session tidak valid lagi
      log.warn(`Session ditutup (code ${code}) — hapus session lokal`);
      this.clearSession();
      this.setState('logged_out');
    } else {
      // Koneksi putus sementara — reconnect otomatis dengan backoff
      log.warn(`Koneksi terputus (code ${code ?? 'unknown'}) — reconnect dalam beberapa detik`);
      this.setState('reconnecting');
      const delay = Math.min(30000, 2000 * 2 ** Math.min(this.reconnectAttempts, 4));
      this.reconnectAttempts += 1;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.start(), delay);
    }
  }

  /** Hapus file session lokal (logout penuh) */
  clearSession() {
    try {
      fs.rmSync(config.AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(config.AUTH_DIR, { recursive: true });
    } catch (_) { /* noop */ }
  }

  /** Pastikan socket jalan; return status */
  async ensureStarted() {
    if (!this.sock) await this.start();
    return this.status();
  }

  /** Minta QR (kalau belum connected, socket akan emit QR via conn:update) */
  async requestQR() {
    if (this.state === 'connected') return this.status();
    if (!this.sock || this.state === 'idle' || this.state === 'logged_out') await this.start();
    return this.status();
  }

  /** Minta Pairing Code 8 digit untuk nomor tertentu */
  async requestPairing(number) {
    const clean = String(number).replace(/[^\d]/g, '');
    if (!/^\d{9,15}$/.test(clean)) {
      throw new Error('Nomornya gak valid. Pake format internasional: 6281234567890');
    }
    if (!clean.startsWith('62')) {
      throw new Error('Nomornya harus diawali 62 (kode Indonesia). Contoh: 6281234567890');
    }
    if (this.state === 'connected') {
      throw new Error('WA-nya udah nyambung. Logout dulu kalau mau pairing ulang.');
    }
    if (!this.sock || this.state === 'idle' || this.state === 'logged_out') await this.start();

    // Tunggu socket siap (connecting) sebelum requestPairingCode
    await this._waitState(['starting', 'connecting', 'qr', 'pairing', 'connected'], 15000);

    let code;
    try {
      code = await withTimeout(this.sock.requestPairingCode(clean), 20000, 'Timeout meminta pairing code');
    } catch (err) {
      throw new Error(`Gagal ambil pairing code: ${err.message}`);
    }
    this.pairingCode = code;
    this.setState('pairing');
    return this._formatCode(code);
  }

  _formatCode(code) {
    return String(code || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8);
  }

  _waitState(states, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (states.includes(this.state)) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('Koneksi ke WA belum siap, coba lagi'));
        setTimeout(tick, 300);
      };
      tick();
    });
  }

  async _ensureConnected(timeoutMs) {
    if (config.MOCK_SEND && this.state !== 'connected') return; // mode uji
    if (this.state !== 'connected') {
      await this._waitState(['connected'], timeoutMs || 15000).catch(() => {
        throw new Error('WA belum nyambung. Scan QR / pairing code dulu ya.');
      });
    }
  }

  /** Cek apakah nomor terdaftar di WhatsApp */
  async isOnWhatsApp(number) {
    if (config.MOCK_SEND && this.state !== 'connected') return true; // mode uji
    await this._ensureConnected(15000);
    const jid = `${number}@s.whatsapp.net`;
    try {
      const res = await withTimeout(this.sock.onWhatsApp(jid), 10000);
      return !!res?.[0]?.exists;
    } catch (_) {
      return true; // gagal cek → lanjutkan saja, send akan error bila memang salah
    }
  }

  /**
   * Kirim video sebagai pesan video native (bukan document),
   * supaya bisa di-forward ke Status langsung dari HP.
   */
  async sendVideo(number, filePath, caption) {
    // Mode uji: simulasi kirim
    if (config.MOCK_SEND && this.state !== 'connected') {
      log.info(`[MOCK] Kirim video ke ${number}`);
      await new Promise((r) => setTimeout(r, 2500));
      return { mock: true, messageId: 'MOCK-' + Date.now(), jid: `${number}@s.whatsapp.net` };
    }

    await this._ensureConnected(20000);
    const jid = `${number}@s.whatsapp.net`;
    const content = { video: { url: filePath, mimetype: 'video/mp4' } };
    if (caption) content.caption = caption;

    const res = await this.sock.sendMessage(jid, content, { media: { forceUpload: true } });
    log.info(`Video terkirim ke ${jid} (id: ${res?.key?.id})`);
    return { mock: false, messageId: res?.key?.id || null, jid };
  }

  /** Putuskan koneksi tapi simpan session (bisa connect lagi tanpa scan) */
  async disconnect() {
    this.manualDisconnect = true;
    try {
      if (this.sock) this.sock.end(new Error('disconnect manual'));
    } catch (_) { /* noop */ }
    this.sock = null;
    this.phone = null;
    this.connectedAt = null;
    this.setState('idle');
  }

  /** Logout penuh: hapus session lokal + WhatsApp side */
  async logout() {
    try {
      if (this.sock && this.state === 'connected') {
        await withTimeout(this.sock.logout(), 10000).catch(() => {});
      }
    } catch (_) { /* noop */ }
    this.clearSession();
    this._teardown();
    this.phone = null;
    this.connectedAt = null;
    this.setState('logged_out');
  }

  async shutdown() {
    this._shuttingDown = true;
    clearTimeout(this.reconnectTimer);
    try {
      if (this.sock) this.sock.end(undefined);
    } catch (_) { /* noop */ }
  }
}

module.exports = WhatsAppManager;
