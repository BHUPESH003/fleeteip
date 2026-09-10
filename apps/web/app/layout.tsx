import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from "../lib/session-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "FleetIP",
  description: "Equipment rental and fleet ecosystem platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
