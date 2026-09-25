import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/lib/brand-mark";

const SIZES = new Set([192, 512]);

export function generateStaticParams() {
  return [...SIZES].map((size) => ({ size: String(size) }));
}

/** PNG app icons for the web manifest (Android home screen, install prompt). */
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const src = `data:image/svg+xml,${encodeURIComponent(brandMarkSvg({ rounded: false }))}`;
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={size} height={size} alt="" />
    ),
    { width: size, height: size },
  );
}
