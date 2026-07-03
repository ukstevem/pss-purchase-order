import "./globals.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { AuthProvider } from "@platform/auth";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthGate } from "@/components/AuthGate";
import { ReactNode } from "react";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Purchase Orders | PSS",
  description: "Purchase order management — create, issue, expedite, account",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body style={{ fontFamily: "var(--font-montserrat), 'Montserrat', system-ui, sans-serif" }}>
        <AuthProvider>
          <AuthGate>
            <div className="flex min-h-screen">
              <AppSidebar />
              <main className="flex-1 min-w-0">{children}</main>
            </div>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
