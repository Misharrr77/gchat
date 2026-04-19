/** Звук и тактильный отклик нового сообщения (общие настройки из localStorage) */

const STORAGE_KEY = 'gchat_settings_v1';

const WAV_PATH = `${import.meta.env.BASE_URL}sounds/message.wav`;

let audioCtx: AudioContext | null = null;
let decodedNotify: AudioBuffer | null | undefined = undefined;
let decodePromise: Promise<void> | null = null;

function readSoundPrefs(): { enabled: boolean; volume: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, volume: 0.65 };
    const s = JSON.parse(raw) as { soundEnabled?: boolean; soundVolume?: number };
    return {
      enabled: s.soundEnabled !== false,
      volume:
        typeof s.soundVolume === 'number' && !Number.isNaN(s.soundVolume)
          ? Math.min(1, Math.max(0.03, s.soundVolume))
          : 0.65,
    };
  } catch {
    return { enabled: true, volume: 0.65 };
  }
}

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Декодируем WAV один раз (реальный короткий звук уведомления) */
function ensureDecoded(ctx: AudioContext): Promise<void> {
  if (decodedNotify !== undefined) return Promise.resolve();
  if (decodePromise) return decodePromise;
  decodePromise = fetch(WAV_PATH)
    .then(r => {
      if (!r.ok) throw new Error('no wav');
      return r.arrayBuffer();
    })
    .then(ab => ctx.decodeAudioData(ab.slice(0)))
    .then(buf => {
      decodedNotify = buf;
    })
    .catch(() => {
      decodedNotify = null;
    })
    .finally(() => {
      decodePromise = null;
    });
  return decodePromise;
}

/** Резерв: синтезированный мягкий «звонок», если WAV недоступен */
function playSynthFallback(ctx: AudioContext, gainValue: number) {
  const dur = 0.38;
  const sampleRate = ctx.sampleRate;
  const n = Math.ceil(sampleRate * dur);
  const buf = ctx.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);
  const f1 = 784;
  const f2 = 1180;
  const amp = Math.min(0.42, gainValue * 0.85);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.pow(Math.max(0, 1 - t / dur), 1.65) * Math.exp(-t * 4.8);
    data[i] =
      amp *
      env *
      (0.48 * Math.sin(2 * Math.PI * f1 * t) + 0.38 * Math.sin(2 * Math.PI * f2 * t));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 1;
  src.connect(g);
  g.connect(ctx.destination);
  src.start();
}

/** Прогрев декодирования после первого жеста пользователя — меньше задержка на первом уведомлении */
export function warmupNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ensureDecoded(ctx);
}

export function playNotificationSound() {
  void playNotificationSoundAsync();
}

async function playNotificationSoundAsync() {
  const { enabled, volume } = readSoundPrefs();
  if (!enabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  await ensureDecoded(ctx);

  const g = ctx.createGain();
  g.gain.value = Math.min(1.15, volume * 1.35);

  if (decodedNotify && decodedNotify.duration > 0) {
    const src = ctx.createBufferSource();
    src.buffer = decodedNotify;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(0);
    return;
  }

  playSynthFallback(ctx, volume);
}

/** Полная поддержка Vibration API: паттерн импульсов (Android / часть браузеров на телефонах) */
export function notifyNewMessageVibrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as { vibrateOnNotify?: boolean }) : {};
    if (!s.vibrateOnNotify) return;

    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.vibrate) return;

    nav.vibrate([48, 32, 76, 36, 92]);
  } catch {}
}
