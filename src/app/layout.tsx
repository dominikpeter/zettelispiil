import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat } from "next/font/google";
import { NativeShell } from "@/components/NativeShell";
import "./globals.css";

// `subsets` only picks what is preloaded: latin covers DE/EN/FR; the latin-ext files still load on demand when a word needs them
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["600", "700"] });

const description = "Schreiben, falten, erraten – das Partyspiel mit Zetteli. Gratis, kein Konto nötig.";
export const metadata: Metadata = {
  metadataBase: new URL("https://zettelispiil.ch"),
  title: "Zettelispiil",
  description,
  appleWebApp: { capable: true, title: "Zettelispiil", statusBarStyle: "black-translucent" },
  // the WhatsApp/iMessage/Slack link-preview card; the image itself is opengraph-image.tsx (Next wires it in automatically)
  // no explicit url: it would be inherited by every page (a room link shouldn't advertise itself as the home page);
  // metadataBase plus the actual request path is enough
  openGraph: { title: "Zettelispiil", description, siteName: "Zettelispiil", locale: "de_CH", type: "website" },
  twitter: { card: "summary_large_image", title: "Zettelispiil", description },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    // the default palette's canvas (Post-it), so the browser bar and the page are one colour
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

// applies saved light/dark, color theme and language before first paint; "auto" leaves light/dark to the system
// "neon" was renamed to "postit" (it became the default); a phone that saved "neon" still gets its own colors, not a blank fallback
const prefsScript = `try{var d=document.documentElement,t=localStorage.getItem("theme"),p=localStorage.getItem("palette"),l=localStorage.getItem("lang");if(p==="neon")p="postit";if(t==="light"||t==="dark")d.dataset.theme=t;if(p)d.dataset.palette=p;if(l)d.lang=l}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${bricolage.variable} ${caveat.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* a plain inline script runs as the parser reaches it; next/script's beforeInteractive only queues it for Next's runtime, so the saved theme came in late */}
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans pt-[env(safe-area-inset-top)]">
        {children}
        <NativeShell />
      </body>
    </html>
  );
}
