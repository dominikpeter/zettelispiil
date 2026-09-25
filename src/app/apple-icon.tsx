import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// home-screen icon: the same Zetteli as the favicon, drawn as PNG for iOS
/* eslint-disable shadcn/no-raw-colors -- rendered to a PNG by next/og, where theme CSS variables do not exist */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#25003d" }}>
        <svg width="150" height="150" viewBox="0 0 64 64">
          <g transform="rotate(-8 32 32)">
            <path d="M10 14h44v31l-3.7 3-3.6-2.6-3.7 3-3.6-2.6-3.7 3-3.6-2.6-3.7 3-3.6-2.6-3.7 3-3.7-2.6-3.4 2.6z" fill="#fffcd6" />
            <path d="M22 21.5c5.5-1.2 12-1.6 19-1-5.4 5.8-11 11.8-17.8 18.6 6.4-.9 12.8-1.1 19.8-.6" fill="none" stroke="#03071e" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
