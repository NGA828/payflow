"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, LockOpen, Send, Undo2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form-state";
import { useSuccessToast } from "@/lib/use-success-toast";
import { formatMoney } from "@/lib/format";
import {
  approvePeriodAction,
  rejectPeriodAction,
  submitPeriodAction,
  unlockPeriodAction,
} from "@/features/payroll/actions";

/**
 * Review & approval interactions. All four are plain inline forms (no
 * dialogs) — the review cockpit keeps the decision, its reason and its
 * consequence in one eyeline, and the forms stay progress-enhancement
 * friendly.
 */

function InlineError({ state }: { state: FormState }) {
  const fieldError = state.fieldErrors?.reason?.[0];
  const message = fieldError ?? (state.status === "error" ? state.message : undefined);
  if (!message) return null;
  return (
    <p role="alert" className="text-[12px] text-danger">
      {message}
    </p>
  );
}

export function SubmitPeriodButton({ periodId }: { periodId: string }) {
  const [state, formAction] = useActionState(submitPeriodAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="payrollPeriodId" value={periodId} />
      <SubmitButton variant="teal" size="sm">
        <Send className="h-3.5 w-3.5" /> Submit for approval
      </SubmitButton>
      <InlineError state={state} />
    </form>
  );
}

export function ApprovePeriodButton({ periodId }: { periodId: string }) {
  const [state, formAction] = useActionState(approvePeriodAction, IDLE_FORM_STATE);
  useSuccessToast(state);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="payrollPeriodId" value={periodId} />
      <SubmitButton variant="primary" size="sm">
        <CheckCircle2 className="h-3.5 w-3.5" /> Approve payroll
      </SubmitButton>
      <InlineError state={state} />
    </form>
  );
}

function ReasonForm({
  periodId,
  action,
  placeholder,
  buttonLabel,
  icon: Icon,
  variant,
}: {
  periodId: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  placeholder: string;
  buttonLabel: string;
  icon: typeof Undo2;
  variant: "destructive" | "secondary";
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const succeeded = useSuccessToast(state);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (succeeded) setReason("");
  }, [succeeded]);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input type="hidden" name="payrollPeriodId" value={periodId} />
        <Input
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={placeholder}
          error={Boolean(state.fieldErrors?.reason)}
          className="h-8 w-[320px] text-[12.5px]"
          aria-label={buttonLabel}
        />
        <SubmitButton variant={variant} size="sm">
          <Icon className="h-3.5 w-3.5" /> {buttonLabel}
        </SubmitButton>
      </div>
      <InlineError state={state} />
    </form>
  );
}

export function RejectPeriodForm({ periodId }: { periodId: string }) {
  return (
    <ReasonForm
      periodId={periodId}
      action={rejectPeriodAction}
      placeholder="Why is it being sent back? (min 5 characters)"
      buttonLabel="Send back"
      icon={Undo2}
      variant="destructive"
    />
  );
}

export function UnlockPeriodForm({ periodId }: { periodId: string }) {
  return (
    <ReasonForm
      periodId={periodId}
      action={unlockPeriodAction}
      placeholder="Reason for unlocking — recorded in the audit log"
      buttonLabel="Unlock period"
      icon={LockOpen}
      variant="secondary"
    />
  );
}

// ── Charts ─────────────────────────────────────────────────────────

/** Compact money tick: 2 300 000 → "2.3 M", 850 000 → "850 k". */
function compactTick(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

const AXIS_STYLE = { fill: "#94A3B8", fontSize: 11, fontFamily: "inherit" } as const;

export function DeptCostChart({
  data,
}: {
  data: Array<{ name: string; net: number; employees: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickFormatter={compactTick}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ ...AXIS_STYLE, fill: "#475569", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "#F8FAFC" }}
          formatter={(value) => [formatMoney(value as number), "Net pay"] as const}
        />
        <Bar dataKey="net" fill="#4F46E5" radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetTrendChart({
  data,
}: {
  data: Array<{ label: string; net: number; current: boolean; name: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} dy={6} />
        <YAxis
          tickFormatter={compactTick}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          cursor={{ stroke: "#CBD5E1", strokeDasharray: "3 3" }}
          formatter={(value, _name, item) => [
            formatMoney(value as number),
            (item as { payload?: { name?: string } })?.payload?.name ?? "Net pay",
          ]}
          labelFormatter={(label) => `Period: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="net"
          stroke="#0D9488"
          strokeWidth={2.5}
          isAnimationActive={false}
          dot={(props) => {
            const { cx, cy, payload } = props as unknown as {
              cx: number;
              cy: number;
              payload: { current: boolean };
            };
            return payload.current ? (
              <g key="current">
                <circle cx={cx} cy={cy} r={7} fill="none" stroke="#4F46E5" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={3.5} fill="#4F46E5" />
              </g>
            ) : (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill="#0D9488" />
            );
          }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
