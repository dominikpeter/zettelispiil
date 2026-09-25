import type { CapacitorConfig } from "@capacitor/cli";

// The phone apps are a native shell around zettelispiil.ch: every web release reaches the apps without a store update.
// native-shell/ only holds the page shown when the phone is offline.
const config: CapacitorConfig = {
  appId: "ch.zettelispiil.app",
  appName: "Zettelispiil",
  webDir: "native-shell",
  server: { url: "https://zettelispiil.ch", errorPath: "offline.html" },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#f5f1e8", showSpinner: false },
  },
  android: { backgroundColor: "#f5f1e8" },
  ios: { backgroundColor: "#f5f1e8", contentInset: "never" },
};

export default config;
