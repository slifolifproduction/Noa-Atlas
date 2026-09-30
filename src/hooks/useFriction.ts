import { useEffect, useRef } from 'react';
import { useAtlas } from '../state/atlasStore';

/**
 * Keep a search that found nothing, once it has settled (typing paused for a
 * moment), so the places where the app falls short can be seen and improved.
 * Only the words searched for and where are kept, in the person's own atlas.
 */
export function useFrictionNote(query: string, results: number, where: string) {
  const noted = useRef('');
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || results > 0 || noted.current === q) return;
    const timer = setTimeout(() => {
      noted.current = q;
      useAtlas.getState().noteFriction(q, where);
    }, 1500);
    return () => clearTimeout(timer);
  }, [query, results, where]);
}
