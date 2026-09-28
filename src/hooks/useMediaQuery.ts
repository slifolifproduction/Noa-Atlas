import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

/**
 * The inspector is a side panel from tablet width up and a bottom sheet on
 * phones. Pages use its width to keep content and graph focus clear of it.
 */
export function useInspectorWidth(): number {
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isDesktop = useIsDesktop();
  return isDesktop ? 400 : isTablet ? 360 : 0;
}
