import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/appIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// home-screen icon on iOS: the same Zetteli as the favicon, as PNG
export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={180} />, size);
}
