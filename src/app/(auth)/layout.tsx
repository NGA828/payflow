import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10"
      style={{
        background:
          "radial-gradient(600px 300px at 15% 0%, rgba(79,70,229,.09), transparent 60%), radial-gradient(600px 300px at 92% 100%, rgba(13,148,136,.09), transparent 60%), #F8FAFC",
      }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex justify-center">
          <Link href="/" aria-label="PayFlow home">
            <Logo className="scale-110" />
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-white p-8 shadow-pop">{children}</div>
        <p className="mt-5 text-center text-xs text-muted">
          © {new Date().getFullYear()} PayFlow · Payroll built for African businesses
        </p>
      </div>
    </div>
  );
}
