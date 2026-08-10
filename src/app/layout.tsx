import type { Metadata } from "next";
import { Toaster } from "sonner";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PayFlow — Payroll built for African businesses",
    template: "%s · PayFlow",
  },
  description:
    "PayFlow replaces spreadsheet payroll with a secure, multi-tenant payroll platform: employees, payroll runs, approvals, payments and payslips — in XAF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
