import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LandShakeX",
  description: "Hunter-first parcel intelligence"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
