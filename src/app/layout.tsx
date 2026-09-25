import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traffic RakeBet",
  description: "Painel de gastos de Meta Ads por BM e conta de anúncio",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Traffic RakeBet",
  },
  other: {
    // Next só emite a tag padrão "mobile-web-app-capable" a partir de
    // appleWebApp.capable — iOS anterior ao 17.4 só reconhece o prefixo
    // "apple-", sem ele o Safari abre com a barra do navegador mesmo
    // instalado na tela de início.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#131318",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
