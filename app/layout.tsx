import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerCompass — AI Career Recommendations",
  description: "Personalized, age-aware career guidance powered by local AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
