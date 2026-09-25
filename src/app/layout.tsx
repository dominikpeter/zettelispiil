import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin", "latin-ext"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Zettelispiil",
  description: "Schreiben, falten, erraten – das Partyspiel mit Zetteli.",
  appleWebApp: { capable: true, title: "Zettelispiil", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1d1a" },
  ],
};

// applies saved light/dark, color theme and language before first paint; "auto" leaves light/dark to the system
const prefsScript = `try{var d=document.documentElement,t=localStorage.getItem("theme"),p=localStorage.getItem("palette"),l=localStorage.getItem("lang");if(t==="light"||t==="dark")d.dataset.theme=t;if(p)d.dataset.palette=p;if(l)d.lang=l}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${bricolage.variable} ${caveat.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Script id="prefs" strategy="beforeInteractive">
          {prefsScript}
        </Script>
      </head>
      <body className="flex min-h-full flex-col font-sans pt-[env(safe-area-inset-top)]">
        {children}
      </body>
    </html>
  );
}
