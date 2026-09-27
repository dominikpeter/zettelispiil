import type { MetadataRoute } from "next";

// installable web app: "Add to Home Screen" starts full screen, without the browser bar
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zettelispiil",
    short_name: "Zettelispiil",
    description: "Das Partyspiel mit Zetteli: schreiben, in die Schüssel, erraten.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf8", // the default palette's canvas (Post-it), like layout.tsx's theme colour
    theme_color: "#fafaf8",
    lang: "de-CH",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
