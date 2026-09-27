"use client";

import { useEffect } from "react";
import { isNative, syncStatusBar } from "@/lib/native";

/** what only the phone apps do, once for every page: for now, a status bar that matches the theme */
export function NativeShell() {
  useEffect(() => (isNative() ? syncStatusBar() : undefined), []);
  return null;
}
