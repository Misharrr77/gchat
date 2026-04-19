let audioCtx: AudioContext | null = null;

const STORAGE_KEY = 'gchat_settings_v1';

export function playNotificationSound() {
  try {
    let peak = 0.15;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { soundEnabled?: boolean; soundVolume?: number };
        if (s.soundEnabled === false) return;
        if (typeof s.soundVolume === 'number' && !Number.isNaN(s.soundVolume)) {
          peak = Math.min(0.55, Math.max(0.02, s.soundVolume * 0.45));
        }
      }
    } catch {}

    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(peak, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.2);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
  } catch {}
}
