/**
 * Seed — idempotent upserts.
 * Phase 0: platform subscription plans. Phase 1: platform super admin.
 * Demo company, staff users, employees and payroll history land with Phase 8.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { createServerPrismaClient, disposeDb } from "../lib/db";

let prisma!: PrismaClient;

const plans = [
  {
    code: "starter",
    name: "Starter",
    maxEmployees: 10,
    priceMonthly: 7500,
    trialDays: 14,
  },
  {
    code: "growth",
    name: "Growth",
    maxEmployees: 50,
    priceMonthly: 18000,
    trialDays: 14,
  },
  {
    code: "business",
    name: "Business",
    maxEmployees: 250,
    priceMonthly: 40000,
    trialDays: 14,
  },
] as const;

const SUPER_ADMIN_EMAIL = "superadmin@payflow.test";
const DEFAULT_SUPER_ADMIN_PASSWORD = "PayFlow-Admin#1";

async function main() {
  prisma = await createServerPrismaClient();

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        maxEmployees: plan.maxEmployees,
        priceMonthly: plan.priceMonthly,
        trialDays: plan.trialDays,
      },
      create: plan,
    });
  }
  console.log(`Seeded ${plans.length} subscription plans.`);

  const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_SUPER_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: { isSuperAdmin: true, isActive: true },
    create: {
      email: SUPER_ADMIN_EMAIL,
      fullName: "PayFlow Platform Admin",
      passwordHash,
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Seeded super admin: ${SUPER_ADMIN_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disposeDb();
  });
