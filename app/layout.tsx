import type { Metadata, Viewport } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Thulla — A table for your people",
  description: "The classic Punjabi card game. Play with friends, anywhere.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icon-192.png" },
  appleWebApp: {
    capable: true,
    title: "Thulla",
    statusBarStyle: "black-translucent",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#102d27",
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
