import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/lib/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded mask, so the square version is used here.
export default function AppleIcon() {
  const src = `data:image/svg+xml,${encodeURIComponent(brandMarkSvg({ rounded: false }))}`;
  return new ImageResponse(
    (
      <img src={src} width={180} height={180} alt="" />
    ),
    size,
  );
}
