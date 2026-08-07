import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    fullName: string;
    isSuperAdmin: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      isSuperAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    isSuperAdmin?: boolean;
  }
}
