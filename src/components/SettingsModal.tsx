import { useSettings, type AppSettings, type ThemeMode, type Density, type SendOnEnterMode } from '../contexts/SettingsContext';
import { X, RotateCcw, Sun, Moon, Volume2, VolumeX, Vibrate, Type, Layout, MessageSquare, PanelLeft, Sparkles } from 'lucide-react';

const THEME_OPTIONS: { v: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { v: 'dark', label: 'Тёмная', icon: <Moon size={16} /> },
  { v: 'light', label: 'Светлая', icon: <Sun size={16} /> },
];

const DENSITY: { v: Density; label: string }[] = [
  { v: 'compact', label: 'Плотно' },
  { v: 'comfortable', label: 'Обычно' },
  { v: 'spacious', label: 'Свободно' },
];

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings, resetSettings } = useSettings();
  const isLight = settings.theme === 'light';

  if (!open) return null;

  const field = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) =>
    setSettings({ [key]: val } as Partial<AppSettings>);

  const chip = 'px-3 py-2 rounded-xl text-xs font-medium border transition flex items-center gap-2 justify-center';
  const chipOn = isLight
    ? 'bg-accent/15 border-accent text-slate-900 ring-1 ring-accent/35 shadow-sm'
    : 'bg-accent/25 border-accent text-white ring-1 ring-accent/20';
  const chipOff = isLight
    ? 'bg-slate-100 border-slate-400 text-slate-800 hover:bg-slate-200 hover:border-slate-500 hover:text-slate-950 shadow-sm'
    : 'bg-dark-700/80 border-dark-600 text-slate-400 hover:text-white hover:bg-dark-700';

  const panel = isLight ? 'bg-white border-slate-300' : 'bg-dark-800 border-dark-600';
  const headerBorder = isLight ? 'border-slate-200' : 'border-dark-600';
  const sectionTitle = isLight ? 'text-slate-600' : 'text-slate-500';
  const labelText = isLight ? 'text-slate-700' : 'text-slate-300';
  const hintText = isLight ? 'text-slate-600' : 'text-slate-500';
  const iconBtn = isLight
    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    : 'text-slate-400 hover:text-white hover:bg-dark-700';
  const resetBtn = isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-500 hover:text-white hover:bg-dark-700';

  const titleClr = isLight ? 'text-slate-900' : 'text-white';

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
      <div
        className={`relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] ${panel} sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col border`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center gap-3 px-4 py-3 ${headerBorder} border-b flex-shrink-0`}>
          <Sparkles size={18} className="text-accent flex-shrink-0" />
          <h2 className={`text-lg font-bold flex-1 ${titleClr}`}>Настройки</h2>
          <button type="button" onClick={() => resetSettings()} className={`p-2 rounded-xl transition ${resetBtn}`} title="Сбросить всё">
            <RotateCcw size={17} />
          </button>
          <button type="button" onClick={onClose} className={`p-2 rounded-xl transition ${iconBtn}`}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-8">
          <section>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${sectionTitle}`}>
              <Moon size={13} /> Оформление
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {THEME_OPTIONS.map(({ v, label, icon }) => (
                <button
                  key={v}
                  type="button"
                  className={`${chip} flex-1 min-w-[88px] ${settings.theme === v ? chipOn : chipOff}`}
                  onClick={() => field('theme', v)}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <label className={`flex items-center gap-3 text-sm mb-1 ${labelText}`}>
              <span className="text-accent">●</span> Цвет акцента (оттенок)
            </label>
            <input
              type="range"
              min={0}
              max={360}
              value={settings.accentHue}
              onChange={e => field('accentHue', +e.target.value)}
              className="w-full accent-accent h-2"
            />
            <p className={`text-[11px] mt-1 ${hintText}`}>Текущий: {settings.accentHue}° — кнопки и выделения обновляются сразу.</p>
          </section>

          <section>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${sectionTitle}`}>
              <Type size={13} /> Текст и интерфейс
            </h3>
            <label className={`text-sm mb-2 block ${labelText}`}>Масштаб шрифта</label>
            <input
              type="range"
              min={85}
              max={125}
              step={5}
              value={Math.round(settings.fontScale * 100)}
              onChange={e => field('fontScale', +e.target.value / 100)}
              className="w-full accent-accent h-2 mb-1"
            />
            <p className={`text-[11px] ${hintText}`}>{Math.round(settings.fontScale * 100)}%</p>

            <p className={`text-sm mt-4 mb-2 ${labelText}`}>Плотность списков</p>
            <div className="flex flex-wrap gap-2">
              {DENSITY.map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  className={`${chip} flex-1 ${settings.density === v ? chipOn : chipOff}`}
                  onClick={() => field('density', v)}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className={`text-sm mt-4 mb-2 flex items-center gap-2 ${labelText}`}>
              <PanelLeft size={14} /> Ширина списка чатов
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${chip} flex-1 ${settings.sidebarWidth === 'normal' ? chipOn : chipOff}`}
                onClick={() => field('sidebarWidth', 'normal')}
              >
                Обычная
              </button>
              <button
                type="button"
                className={`${chip} flex-1 ${settings.sidebarWidth === 'wide' ? chipOn : chipOff}`}
                onClick={() => field('sidebarWidth', 'wide')}
              >
                Шире
              </button>
            </div>
          </section>

          <section>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${sectionTitle}`}>
              <Volume2 size={13} /> Звук и отклик
            </h3>
            <button
              type="button"
              className={`w-full mb-3 ${chip} ${settings.soundEnabled ? chipOn : chipOff}`}
              onClick={() => field('soundEnabled', !settings.soundEnabled)}
            >
              {settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              Звук новых сообщений: {settings.soundEnabled ? 'вкл.' : 'выкл.'}
            </button>
            <label className={`text-sm mb-2 block ${!settings.soundEnabled ? 'opacity-45' : ''} ${labelText}`}>Громкость уведомления</label>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(settings.soundVolume * 100)}
              disabled={!settings.soundEnabled}
              onChange={e => field('soundVolume', +e.target.value / 100)}
              className="w-full accent-accent h-2 disabled:opacity-40"
            />
            <button
              type="button"
              className={`w-full mt-3 ${chip} ${settings.vibrateOnNotify ? chipOn : chipOff}`}
              onClick={() => field('vibrateOnNotify', !settings.vibrateOnNotify)}
            >
              <Vibrate size={16} />
              Вибрация при сообщении (паттерн, если устройство поддерживает)
            </button>
            <p className={`text-[11px] mt-2 ${hintText}`}>
              На ПК вибрации часто нет — на телефоне используется последовательность импульсов Vibration API.
            </p>
          </section>

          <section>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${sectionTitle}`}>
              <MessageSquare size={13} /> Чат
            </h3>
            <p className={`text-sm mb-2 ${labelText}`}>Enter в поле сообщения</p>
            <div className="flex gap-2">
              {(
                [
                  { v: 'send' as SendOnEnterMode, label: 'Enter — отправить' },
                  { v: 'newline' as SendOnEnterMode, label: 'Enter — новая строка' },
                ] as const
              ).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  className={`${chip} flex-1 text-[11px] leading-tight ${settings.sendOnEnter === v ? chipOn : chipOff}`}
                  onClick={() => field('sendOnEnter', v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className={`text-[11px] mt-2 ${hintText}`}>
              Режим «отправить»: Shift+Enter — новая строка. Режим «новая строка»: Ctrl+Enter — отправить.
            </p>
          </section>

          <section>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${sectionTitle}`}>
              <Layout size={13} /> Доступность
            </h3>
            <button
              type="button"
              className={`w-full ${chip} ${settings.reduceMotion ? chipOn : chipOff}`}
              onClick={() => field('reduceMotion', !settings.reduceMotion)}
            >
              Уменьшить анимации
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
