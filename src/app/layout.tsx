import type { Metadata, Viewport } from "next";
import "./globals.css";
import { config, SITE_NAME } from "@/lib/config";
import { ConsentBanner } from "@/components/site/ConsentBanner";

const title = "EARTHFLIGHT — Free 3D Earth Flight Simulator in Your Browser";
const description =
  "Pilot a spaceship from orbit down into real 3D cities. Free browser-based Earth flight simulator: fly around the planet, explore New York, Tokyo, London, Paris, Dubai and more. No download.";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: title, template: `%s · ${SITE_NAME}` },
  description,
  applicationName: SITE_NAME,
  keywords: [
    "3D Earth flight simulator",
    "fly around Earth online",
    "spaceship Earth simulator",
    "explore Earth in 3D",
    "free browser spaceship simulator",
    "fly through cities online",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title,
    description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#02060c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
