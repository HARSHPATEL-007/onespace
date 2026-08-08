import type { Metadata } from "next";
import "@n0va/ui/tokens.css";
import "@n0va/ui/styles.css";
import "@n0va/modules-ani/ani.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "N0VA Workspace",
  description: "One Enterprise System. A Modular Suite.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}