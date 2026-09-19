import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DARA Apothecary | Health Equity & Herbal Knowledge",
  description: "To improve the health equity of black women and people who menstruate suffering from PMOS by providing accessible herbal knowledge.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#f4f0e1] text-[#282d29]">
        {children}
      </body>
    </html>
  );
}

