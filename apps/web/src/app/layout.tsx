import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Number Crunchers Practice",
  description:
    "Practice UIL Number Crunchers using your own TI-84 Plus CE as the keypad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* XP.css, copied to public/xp by scripts/copy-public-assets.mjs */}
        <link rel="stylesheet" href="/xp/XP.css" precedence="default" />
      </head>
      <body>{children}</body>
    </html>
  );
}
