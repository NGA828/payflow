import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";

/**
 * Coarse route gating only (JWT claims, no DB). Fine-grained tenant + role
 * checks are re-enforced by layouts/services on every request.
 */
const { auth } = NextAuth(authConfig);

const STAFF_PREFIXES = [
  "/dashboard",
  "/setup",
  "/organization",
  "/employees",
  "/team",
  "/payroll",
  "/payments",
  "/payslips",
  "/reports",
  "/settings",
  "/billing",
  "/audit-log",
];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const session = req.auth;

  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPortalArea = pathname === "/portal" || pathname.startsWith("/portal/");
  const isStaffArea = STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isAdminArea && !isPortalArea && !isStaffArea) return NextResponse.next();

  if (!session?.user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminArea && !session.user.isSuperAdmin) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = "/dashboard";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/setup/:path*",
    "/organization/:path*",
    "/employees/:path*",
    "/team/:path*",
    "/payroll/:path*",
    "/payments/:path*",
    "/payslips/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/audit-log/:path*",
    "/portal/:path*",
    "/admin/:path*",
  ],
};
