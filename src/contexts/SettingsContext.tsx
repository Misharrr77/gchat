import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

const STORAGE_KEY = 'gchat_settings_v1';

export type ThemeMode = 'dark' | 'light';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type SendOnEnterMode = 'send' | 'newline';

export interface AppSettings {
  theme: ThemeMode;
  accentHue: number;
  fontScale: number;
  density: Density;
  soundEnabled: boolean;
  soundVolume: number;
  reduceMotion: boolean;
  vibrateOnNotify: boolean;
  sendOnEnter: SendOnEnterMode;
  sidebarWidth: 'normal' | 'wide';
}

const defaults: AppSettings = {
  theme: 'dark',
  accentHue: 217,
  fontScale: 1,
  density: 'comfortable',
  soundEnabled: true,
  soundVolume: 0.65,
  reduceMotion: false,
  vibrateOnNotify: false,
  sendOnEnter: 'send',
  sidebarWidth: 'normal',
};

function migrateTheme(parsed: Partial<AppSettings>): ThemeMode {
  const t = parsed.theme as string | undefined;
  if (t === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (t === 'light' || t === 'dark') return t;
  return defaults.theme;
}

function loadStored(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    delete (parsed as Record<string, unknown>).chatDaySeparators;

    return {
      ...defaults,
      ...parsed,
      theme: migrateTheme(parsed),
      soundVolume:
        typeof parsed.soundVolume === 'number' && !Number.isNaN(parsed.soundVolume)
          ? parsed.soundVolume
          : defaults.soundVolume,
    };
  } catch {
    return { ...defaults };
  }
}

function saveStored(s: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

export function applySettingsToDom(s: AppSettings) {
  const root = document.documentElement;
  const h = s.accentHue;
  root.style.setProperty('--accent', `${h} 91% 59%`);
  root.style.setProperty('--accent-hover', `${h} 91% 50%`);
  root.style.setProperty('--accent-light', `${h} 91% 68%`);
  root.style.setProperty('--accent-dark', `${h} 91% 43%`);
  root.style.fontSize = `${16 * s.fontScale}px`;
  root.dataset.theme = s.theme;
  root.dataset.density = s.density;
  if (s.reduceMotion) root.dataset.reduceMotion = '1';
  else delete root.dataset.reduceMotion;
}

type Ctx = {
  settings: AppSettings;
  setSettings: (p: Partial<AppSettings>) => void;
  resetSettings: () => void;
};

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setState] = useState<AppSettings>(() => loadStored());

  const setSettings = useCallback((p: Partial<AppSettings>) => {
    setState(prev => {
      const next = { ...prev, ...p };
      saveStored(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setState({ ...defaults });
    saveStored(defaults);
  }, []);

  useEffect(() => {
    applySettingsToDom(settings);
  }, [settings]);

  const value = useMemo(() => ({ settings, setSettings, resetSettings }), [settings, setSettings, resetSettings]);

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('useSettings requires SettingsProvider');
  return c;
}
