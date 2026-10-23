import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeScript = `try{var theme=(localStorage.getItem("legal-theme")??localStorage.getItem("theme"));document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(theme==="dark"?"dark":"light")}catch{}`;

export const metadata: Metadata = {
  title: {
    default: "Hemia Legal",
    template: "%s | Hemia Legal",
  },
  description: "Workspace de documentación B2B",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "32x32" }],
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
      className={`${sans.variable} ${geistMono.variable} light h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
