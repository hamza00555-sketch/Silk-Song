import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silk·Song — خريطة فارلوم",
  description: "خريطة تفاعلية بشبكة إحداثيات للعبة Hollow Knight: Silksong",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="h-full overflow-hidden" style={{ background: '#09080F' }}>
        {children}
      </body>
    </html>
  );
}
