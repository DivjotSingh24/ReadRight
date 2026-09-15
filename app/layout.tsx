// The root layout wraps every page: it sets up <html>, <body>, the font,
// and the page title shown in the browser tab.

import type { Metadata } from "next";
import { Andika } from "next/font/google";
import "./globals.css";

// Andika is a free Google font made for beginning readers: letters like
// "a" and "g" look the way kids learn to write them.
const andika = Andika({
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reading Coach",
  description: "Read a story out loud and get friendly coaching.",
};

// LayoutProps is a type Next.js generates for us; it describes `children`.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${andika.className} min-h-screen bg-stone-50 text-slate-800 antialiased`}>
        {children}
      </body>
    </html>
  );
}
