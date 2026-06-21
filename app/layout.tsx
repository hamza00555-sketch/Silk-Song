import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silk·Song — Map of Pharloom",
  description: "Interactive coordinate grid map of Hollow Knight: Silksong",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden" style={{ background: '#09080F' }}>
        {children}
      </body>
    </html>
  );
}
