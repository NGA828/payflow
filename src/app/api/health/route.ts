import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEnv, resolveQueueDriver } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckStatus = "up" | "down" | "skipped";

interface HealthReport {
  status: "ok" | "degraded" | "down";
  version: string;
  uptimeSeconds: number;
  checks: {
    env: { status: CheckStatus; error?: string };
    database: { status: CheckStatus; latencyMs?: number; error?: string };
    queue: { status: CheckStatus; driver: "bullmq" | "inline"; note?: string };
  };
}

export async function GET() {
  const report: HealthReport = {
    status: "ok",
    version: process.env.npm_package_version ?? "0.1.0",
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      env: { status: "up" },
      database: { status: "down" },
      queue: { status: "skipped", driver: "inline" },
    },
  };

  let env;
  try {
    env = getEnv();
    report.checks.queue.driver = resolveQueueDriver(env);
    if (report.checks.queue.driver === "inline") {
      report.checks.queue = {
        status: "up",
        driver: "inline",
        note: "Redis not configured — jobs execute in-process",
      };
    } else {
      report.checks.queue = { status: "up", driver: "bullmq" };
    }
  } catch (error) {
    report.checks.env = { status: "down", error: error instanceof Error ? error.message : "invalid env" };
  }

  try {
    const started = performance.now();
    await getDb().$queryRaw`SELECT 1`;
    report.checks.database = {
      status: "up",
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
    };
  } catch (error) {
    report.checks.database = {
      status: "down",
      error: error instanceof Error ? error.message : "unreachable",
    };
  }

  if (report.checks.database.status === "down" || report.checks.env.status === "down") {
    report.status = "down";
  } else if (report.checks.queue.status === "down") {
    report.status = "degraded";
  }

  return NextResponse.json(report, { status: report.status === "down" ? 503 : 200 });
}
