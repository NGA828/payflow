import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config shared by middleware (no DB/bcrypt imports here).
 * Providers live in ./index.ts (Node runtime).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.isSuperAdmin = user.isSuperAdmin;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
      return session;
    },
  },
  providers: [], // added in index.ts
} satisfies NextAuthConfig;
