import type { Metadata, Viewport } from "next";
import { locale, t } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: `${t("app.name")} · ${t("app.tagline")}`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b3d33",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={locale.code} dir={locale.dir}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
