export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="#3a4350" strokeWidth="1.3" />
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="#5c6673" strokeWidth="1.3" />
      <circle cx="16" cy="16" r="2.6" fill="#e6e0d0" />
      <circle cx="26.6" cy="10" r="2" fill="#5b9ae8" />
      <circle cx="7.4" cy="23.4" r="1.7" fill="#d6a531" />
    </svg>
  );
}
