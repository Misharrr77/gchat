import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    mq.addEventListener('change', fn);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', fn);
  }, [query]);

  return matches;
}
