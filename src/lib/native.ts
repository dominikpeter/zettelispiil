// The phone apps (Capacitor) load zettelispiil.ch in a native shell. Where the shell can do better than the browser
// (a real vibration on iPhones, the system share sheet, keeping the screen on), these helpers use it; on the web
// they fall back to the browser. Plugins load only inside the app, so web visitors download none of them.

type Cap = { isNativePlatform?: () => boolean };
export const isNative = () => typeof window !== "undefined" && !!(window as { Capacitor?: Cap }).Capacitor?.isNativePlatform?.();

/** a short tap you can feel: the Taptic Engine in the app, navigator.vibrate on Android browsers */
export function feel(pattern: number | number[]) {
  if (isNative()) {
    import("@capacitor/haptics").then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: Array.isArray(pattern) ? ImpactStyle.Heavy : ImpactStyle.Light })).catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

/** the system share sheet; false when neither the app nor the browser has one (the caller copies the link instead) */
export async function share(data: { title: string; text: string; url: string }) {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ ...data, dialogTitle: data.title });
    return true;
  }
  if (!navigator.share) return false;
  await navigator.share(data);
  return true;
}

/** keep the screen on while it matters (a turn): the app's plugin, or the browser's Screen Wake Lock. Returns the release */
export function stayAwake(): () => void {
  if (isNative()) {
    import("@capacitor-community/keep-awake").then(({ KeepAwake }) => KeepAwake.keepAwake()).catch(() => {});
    return () => void import("@capacitor-community/keep-awake").then(({ KeepAwake }) => KeepAwake.allowSleep()).catch(() => {});
  }
  let lock: WakeLockSentinel | null = null;
  let gone = false;
  navigator.wakeLock
    ?.request("screen")
    .then((l) => {
      if (gone) l.release().catch(() => {});
      else lock = l;
    })
    .catch(() => {}); // not supported, or the page is hidden: the screen just behaves as usual
  return () => {
    gone = true;
    lock?.release().catch(() => {});
  };
}

/** the status bar (clock, battery) readable on either theme: light text on dark, dark on light; follows the theme picked
 * in the settings and, on "Auto", the system. Returns the cleanup. Only in the phone apps */
export function syncStatusBar(): () => void {
  const root = document.documentElement;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : media.matches;
    import("@capacitor/status-bar").then(({ StatusBar, Style }) => StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })).catch(() => {});
  };
  apply();
  const watch = new MutationObserver(apply);
  watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", apply);
  return () => {
    watch.disconnect();
    media.removeEventListener("change", apply);
  };
}

type AppleSignIn = { authorize(o: { nonce: string }): Promise<{ identityToken: string; givenName?: string; familyName?: string }> };
/** whether this app build has the native Sign in with Apple (ios/App/App/AppleSignIn.swift); older builds don't */
export const hasAppleSignIn = () =>
  isNative() && !!(window as { Capacitor?: { isPluginAvailable?: (n: string) => boolean } }).Capacitor?.isPluginAvailable?.("AppleSignIn");

/** Apple's own sign-in sheet (Face ID), no web page: resolves with Apple's signed token, rejects when cancelled */
export async function appleIdToken(nonce: string) {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<AppleSignIn>("AppleSignIn").authorize({ nonce });
}
