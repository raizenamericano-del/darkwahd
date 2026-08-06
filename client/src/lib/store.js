// Helper localStorage — preferensi user yang disimpan lokal

const KEYS = {
  target: 'kyps_default_target',
  caption: 'kyps_default_caption',
  key: 'kyps_key',
  page: 'kyps_page',
  quality: 'kyps_quality',
};

export const store = {
  getTarget: () => localStorage.getItem(KEYS.target) || '',
  setTarget: (v) => localStorage.setItem(KEYS.target, v || ''),
  getCaption: () => localStorage.getItem(KEYS.caption) || '',
  setCaption: (v) => localStorage.setItem(KEYS.caption, v || ''),
  getQuality: () => localStorage.getItem(KEYS.quality) || 'auto',
  setQuality: (v) => localStorage.setItem(KEYS.quality, v || 'auto'),
  getKey: () => localStorage.getItem(KEYS.key) || '',
  setKey: (v) => {
    if (v) localStorage.setItem(KEYS.key, v);
    else localStorage.removeItem(KEYS.key);
  },
  getPage: () => localStorage.getItem(KEYS.page) || 'connect',
  setPage: (v) => localStorage.setItem(KEYS.page, v),
  clear: () => {
    [KEYS.target, KEYS.caption, KEYS.key, KEYS.page, KEYS.quality].forEach((k) => localStorage.removeItem(k));
  },
};

export const fmtBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export const fmtDuration = (sec) => {
  sec = Math.round(sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const fmtEta = (sec) => {
  if (sec == null || !isFinite(sec)) return '…';
  if (sec < 60) return `${Math.ceil(sec)} dtk`;
  return `${Math.floor(sec / 60)} mnt ${Math.ceil(sec % 60)} dtk`;
};

export const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};
