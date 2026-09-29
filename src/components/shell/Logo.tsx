/**
 * The mark: a sighting circle with its four cardinal ticks, a fixed centre,
 * and one body in orbit, in the signal colour.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#ece8df" strokeOpacity="0.9" strokeWidth="1.1" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="#ece8df" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M16 1.5v4M16 26.5v4M1.5 16h4M26.5 16h4" stroke="#ece8df" strokeOpacity="0.55" strokeWidth="1" />
      <circle cx="16" cy="16" r="1.6" fill="#ece8df" />
      <circle cx="23.4" cy="8.6" r="2.1" fill="#ff5a1f" />
    </svg>
  );
}

/** "Cognitive Atlas", set like a masthead. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="display text-[19px] tracking-[-0.01em] text-ink">
        Cognitive <em className="italic">Atlas</em>
      </span>
    </span>
  );
}
