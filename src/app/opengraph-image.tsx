import { ImageResponse } from "next/og";

// the WhatsApp/link-preview card: what a shared zettelispiil.ch link actually looks like in a chat.
// next/og (Satori) can't read the app's own CSS variables, so the Post-it colours are repeated here as plain hex.
/* eslint-disable shadcn/no-raw-colors -- rendered to a PNG, where theme CSS variables do not exist */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Zettelispiil: das Partyspiel mit Zetteli";

const Slip = ({ rotate, x, bg = "#fffcd6" }: { rotate: number; x: number; bg?: string }) => (
  <div
    style={{
      position: "absolute", left: x, bottom: 210, width: 150, height: 190, background: bg, borderRadius: "10px 10px 3px 3px",
      transform: `rotate(${rotate}deg)`, boxShadow: "0 18px 40px -12px rgba(0,0,0,0.55)",
    }}
  />
);

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f0f11", fontFamily: "sans-serif" }}>
        <div style={{ position: "relative", width: 1200, height: 420, display: "flex" }}>
          <Slip rotate={-10} x={330} bg="#bdef6b" />
          <Slip rotate={7} x={520} bg="#f3f566" />
          <Slip rotate={-4} x={710} bg="#ff9d78" />
          {/* the bowl */}
          <div style={{ position: "absolute", left: 500, bottom: 130, width: 200, height: 130, display: "flex" }}>
            <svg viewBox="0 0 120 80" width="200" height="130">
              <path d="M6 34h108c0 24-24 42-54 42S6 58 6 34z" fill="#ff5ca0" />
              <path d="M6 34h108" stroke="#ff5ca0" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        {/* next/og only bundles a regular-weight font (no custom font loaded here); the size alone carries the weight */}
        <div style={{ display: "flex", fontSize: 96, color: "#f3f566", letterSpacing: "-0.02em" }}>Zettelispiil</div>
        <div style={{ display: "flex", fontSize: 34, color: "#c6c6cc", marginTop: 8 }}>Das Partyspiel mit Zetteli, direkt im Handy</div>
      </div>
    ),
    { ...size },
  );
}
