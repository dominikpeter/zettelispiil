import type { NextConfig } from "next";

// Only our own origin may run code, load data or frame the app. Inline scripts stay allowed for Next's bootstrap and the
// theme script in layout.tsx (ponytail: switch to per-request nonces in proxy.ts to drop 'unsafe-inline').
// Images may come from https for the sign-in providers' profile pictures. Dev needs eval for fast refresh, so the CSP is production only.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" }, // camera: the QR scanner
        ],
      },
    ];
  },
};

export default nextConfig;
