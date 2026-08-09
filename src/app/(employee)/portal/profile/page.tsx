import type { Metadata } from "next";
import { requireEmployeeContext } from "@/server/tenant/employee-context";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "My Profile" };
export const dynamic = "force-dynamic";

export default async function PortalProfilePage() {
  const ctx = await requireEmployeeContext();
  const employee = await getDb().employee.findUnique({
    where: { id: ctx.employee.id },
    include: {
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  });
  if (!employee) return <p>Employee not found</p>;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">My profile</h1>
        <p className="mt-1 text-[13px] text-muted">Limited view — sensitive payment details are masked. Contact HR for changes.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Full name" value={`${employee.firstName} ${employee.lastName}`} />
            <Field label="Employee code" value={employee.employeeCode} />
            <Field label="Email" value={employee.email ?? "—"} />
            <Field label="Phone" value={employee.phone ?? "—"} />
            <Field label="Department" value={employee.department.name} />
            <Field label="Position" value={employee.position.title} />
            <Field label="Date hired" value={formatDate(employee.dateHired)} />
            <Field label="Employment type" value={employee.employmentType} />
            <Field label="Status" value={<Badge variant={employee.status === "ACTIVE" ? "teal" : "grey"}>{employee.status}</Badge> as unknown as string} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll information</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Basic salary" value="Masked — visible on payslips" />
            <Field label="Payment method" value={employee.paymentMethodPreference} />
            <Field label="Bank / Provider" value={employee.mobileMoneyProvider ?? "—"} />
            <Field label="Account (masked)" value="•••• •••• ••••" />
            <p className="mt-2 text-[12px] text-muted">Payment details are encrypted at rest and only revealed to authorized payroll staff. Your payslips show the computed net amounts.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-[13px]">
          <p><span className="text-muted">Login email:</span> <span className="font-medium text-ink">{ctx.user.email}</span></p>
          <p><span className="text-muted">Company:</span> <span className="font-medium text-ink">{ctx.company.name}</span></p>
          <p className="mt-2 text-[12px] text-muted">To update your profile, contact your HR manager. Password can be changed via the account settings (if enabled).</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className="text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}
