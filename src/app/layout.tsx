import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaesWeb CRM AI | Dashboard",
  description: "Painel de atendimento NovaesWeb CRM AI com caixa de entrada privada.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
