import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { login, register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [affirmQuiz, setAffirmQuiz] = useState(false);
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState<'a' | 'b' | ''>('');
  const [q3, setQ3] = useState({ man: false, hetero: false, gay: false, woman: false });

  const toggleQ3 = (k: keyof typeof q3) => setQ3(p => ({ ...p, [k]: !p[k] }));

  /** Порядок в строке: женщина, гей, натурал, мужчина */
  const q3Words: { key: keyof typeof q3; label: string }[] = [
    { key: 'woman', label: 'женщина' },
    { key: 'gay', label: 'гей' },
    { key: 'hetero', label: 'натурал' },
    { key: 'man', label: 'мужчина' },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(username, password);
      } else {
        if (!username || !password) throw new Error('Заполни все поля');
        if (!affirmQuiz) throw new Error('Подтверди условие внизу формы');
        const q3list = (Object.entries(q3).filter(([, v]) => v) as [string, boolean][]).map(([k]) => k);
        await register(username, password, displayName || undefined, {
          affirmQuiz: true,
          quiz: { q1, q2: q2 || 'x', q3: q3list },
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] overflow-x-hidden overflow-y-scroll overscroll-y-contain bg-dark-900 [-webkit-overflow-scrolling:touch]"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* min-h-full + нижний запас: иначе на iOS длинная форма «обрезается» у второго вопроса */}
      <div className="w-full min-h-full flex flex-col items-stretch sm:items-center sm:justify-center px-4 pb-[max(8rem,env(safe-area-inset-bottom))] pt-2 sm:py-8">
        <div className="w-full max-w-md mx-auto shrink-0 sm:my-auto">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">gchat</h1>
        </div>

        <div className="bg-dark-800 rounded-2xl p-5 sm:p-8 border border-dark-600 shadow-2xl overflow-visible">
          <div className="flex mb-6 bg-dark-700 rounded-xl p-1">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError('');
              }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${isLogin ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError('');
              }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${!isLogin ? 'bg-accent text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Регистрация
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Имя пользователя</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                placeholder={isLogin ? 'Введи логин' : 'Придумай логин (латиница)'}
                required
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Отображаемое имя</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
                  placeholder="Как тебя называть?"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Пароль</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition pr-12"
                  placeholder="••••••••"
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-4 pt-2 border-t border-dark-600 scroll-mt-4 scroll-pb-24">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-dark-700/60 border border-red-500/25">
                  <input
                    type="checkbox"
                    className="accent-accent mt-1 w-4 h-4 flex-shrink-0"
                    checked={affirmQuiz}
                    onChange={e => setAffirmQuiz(e.target.checked)}
                  />
                  <span className="text-sm text-slate-200 leading-snug">Я подтверждаю: я не женщина и не натурал (обязательно для регистрации).</span>
                </label>

                {affirmQuiz && (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 mb-2">1. Вставьте пропущенное слово: «___ базед»</p>
                      <input
                        value={q1}
                        onChange={e => setQ1(e.target.value)}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent"
                        placeholder="Ответ одним словом"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-2">2. Гетеромразь осталась, её нужно…</p>
                      <label className="flex items-center gap-2 py-1.5 text-sm text-slate-300 cursor-pointer">
                        <input type="radio" name="q2" checked={q2 === 'a'} onChange={() => setQ2('a')} className="accent-accent" />
                        А) помиловать
                      </label>
                      <label className="flex items-center gap-2 py-1.5 text-sm text-slate-300 cursor-pointer">
                        <input type="radio" name="q2" checked={q2 === 'b'} onChange={() => setQ2('b')} className="accent-accent" />
                        Б) уничтожить
                      </label>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-2">3. Вычеркни лишнее (нажми по слову — появится зачёркивание):</p>
                      <div className="flex flex-wrap items-baseline justify-center gap-y-2 text-sm text-slate-200 leading-relaxed px-0.5">
                        {q3Words.map((w, i) => (
                          <span key={w.key} className="inline-flex items-baseline">
                            {i > 0 && <span className="text-slate-500 select-none">,&nbsp;</span>}
                            <button
                              type="button"
                              onClick={() => toggleQ3(w.key)}
                              className="group relative mx-0.5 px-0.5 py-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                            >
                              <span
                                className={`relative z-[1] transition-colors duration-300 ${q3[w.key] ? 'text-slate-500' : 'text-slate-100'}`}
                              >
                                {w.label}
                              </span>
                              <span
                                aria-hidden
                                className={`pointer-events-none absolute left-0 right-0 top-[54%] h-[2px] rounded-full bg-red-400 origin-left transition-transform duration-300 ease-out ${
                                  q3[w.key] ? 'scale-x-100' : 'scale-x-0'
                                }`}
                              />
                            </button>
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 text-center">Слова через запятую — касание переключает зачёркивание.</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (!isLogin && !affirmQuiz)}
              className="w-full py-3.5 sm:py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/25 min-h-[48px]"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isLogin ? 'Вхожу...' : 'Создаю...'}
                </span>
              ) : isLogin ? (
                'Войти'
              ) : (
                'Создать аккаунт'
              )}
            </button>
          </form>
        </div>
        </div>
        <div className="shrink-0 h-10 sm:h-6" aria-hidden />
      </div>
    </div>
  );
}
