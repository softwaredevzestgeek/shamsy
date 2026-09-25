import type { MetadataRoute } from "next";
import en from "@/i18n/en.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${en.app.name} · ${en.app.tagline}`,
    short_name: en.app.name,
    description: en.login.heroTitle,
    start_url: "/orders",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f2",
    theme_color: "#0b3d33",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/pwa-icon/192", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/pwa-icon/512", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
