// File: src/app/layout.tsx
import type { Metadata } from "next";
import { FirebaseProvider } from "@/firebase"; // Restoring the provider import
import "./globals.css";

export const metadata: Metadata = {
  title: 'AviaTrack',
  description: 'Construction project tracking for airports.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FirebaseProvider>
          {children}
        </FirebaseProvider>
      </body>
    </html>
  );
}