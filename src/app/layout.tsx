import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crm.novaesweb.com.br";

export const viewport: Viewport = {
  themeColor: "#0f0b1e",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NovaesWeb CRM AI — Atendimento Inteligente e Automação no WhatsApp",
    template: "%s | NovaesWeb CRM AI",
  },
  description:
    "Plataforma completa de CRM e Atendimento Inteligente com Inteligência Artificial para WhatsApp. Multi-atendentes, automações de vendas, suporte 24/7 e gestão de clientes.",
  applicationName: "NovaesWeb CRM AI",
  authors: [{ name: "NovaesWeb", url: "https://novaesweb.com.br" }],
  generator: "Next.js",
  keywords: [
    "CRM",
    "WhatsApp",
    "Inteligência Artificial",
    "NovaesWeb",
    "Atendimento Automático",
    "Chatbot WhatsApp",
    "Automação de Vendas",
    "Multiempresa",
    "Gestão de Clientes"
  ],
  icons: {
    icon: [
      { url: "/novaes-crm-ia-logo.jpg", sizes: "32x32", type: "image/jpeg" },
      { url: "/novaes-crm-ia-logo.jpg", sizes: "192x192", type: "image/jpeg" },
    ],
    apple: [
      { url: "/novaes-crm-ia-logo.jpg", sizes: "180x180", type: "image/jpeg" },
    ],
    shortcut: ["/novaes-crm-ia-logo.jpg"],
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl,
    siteName: "NovaesWeb CRM AI",
    title: "NovaesWeb CRM AI — Atendimento Inteligente e Automação no WhatsApp",
    description:
      "Transforme o atendimento do seu negócio com Inteligência Artificial integrada ao WhatsApp. Respostas instantâneas, cardápios, agendamentos e suporte 24 horas.",
    images: [
      {
        url: "/novaes-crm-ia-logo.jpg",
        width: 1024,
        height: 1024,
        alt: "Logo Oficial NovaesWeb CRM AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NovaesWeb CRM AI — Atendimento Inteligente no WhatsApp",
    description:
      "Plataforma de CRM e automação de atendimento com IA para WhatsApp. Atendimento humanizado e ágil 24/7.",
    images: ["/novaes-crm-ia-logo.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/novaes-crm-ia-logo.jpg" />
        <link rel="apple-touch-icon" href="/novaes-crm-ia-logo.jpg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
