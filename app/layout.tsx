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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before the first paint, so returning to the
            app in night mode never flashes a bright white screen first. Falls
            back to whatever the device prefers. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("reading-coach-theme");document.documentElement.dataset.theme=(s==="dark"||s==="light")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}catch(e){document.documentElement.dataset.theme="light";}})();`,
          }}
        />
      </head>
      <body className={`${andika.className} antialiased`}>{children}</body>
    </html>
  );
}
