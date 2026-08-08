import type { Metadata } from "next";
import { Barlow_Condensed, Montserrat } from "next/font/google";
import "./globals.css";

const sans = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

const display = Barlow_Condensed({
  weight: "600",
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
});

const themeScript = `try{document.documentElement.classList.toggle("dark",localStorage.getItem("theme")==="dark")}catch{}`;

export const metadata: Metadata = {
  title: "Hemia Legal",
  description: "Workspace de documentación B2B",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
