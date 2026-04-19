import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useChat } from '../contexts/ChatContext';

export default function JoinInvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { refresh, setActive } = useChat();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api.invites.join(code);
        if (cancelled) return;
        await refresh();
        setActive(d.conversation);
        navigate('/', { replace: true });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось вступить');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, navigate, refresh, setActive]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-dark-900 p-6 text-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-slate-400 text-sm">{error || 'Подключаем к чату…'}</p>
      {error && (
        <button type="button" className="mt-4 text-accent text-sm underline" onClick={() => navigate('/')}>
          На главную
        </button>
      )}
    </div>
  );
}
