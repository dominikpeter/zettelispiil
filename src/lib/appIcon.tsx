// the app icon (a Zetteli with a Z) as JSX for next/og: iOS home screen, the PWA manifest and the native apps share it
/* eslint-disable shadcn/no-raw-colors -- rendered to a PNG by next/og, where theme CSS variables do not exist */
export function AppIcon({ size, pad = 0 }: { size: number; pad?: number }) {
  const inner = Math.round(size * (1 - pad) * 0.83);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#25003d" }}>
      <svg width={inner} height={inner} viewBox="0 0 64 64">
        <g transform="rotate(-8 32 32)">
          <path d="M10 14h44v31l-3.7 3-3.6-2.6-3.7 3-3.6-2.6-3.7 3-3.6-2.6-3.7 3-3.6-2.6-3.7 3-3.7-2.6-3.4 2.6z" fill="#fffcd6" />
          <path d="M22 21.5c5.5-1.2 12-1.6 19-1-5.4 5.8-11 11.8-17.8 18.6 6.4-.9 12.8-1.1 19.8-.6" fill="none" stroke="#03071e" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
