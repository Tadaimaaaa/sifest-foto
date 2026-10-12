import type { Metadata } from "next";
import { Inter, Outfit, Fredoka } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: "SI-FEST 2026 Photobooth",
  description: "Capture Your SI-FEST Moment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable} ${fredoka.variable} font-sans bg-slate-900 text-white min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
