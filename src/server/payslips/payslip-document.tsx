import * as React from "react";
import type { ReactElement } from "react";
import {
  Circle,
  Document,
  Page,
  Path,
  Rect,
  Svg,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import { registerInterFonts } from "@/server/payslips/fonts";
import type { PayslipLine, PayslipViewModel } from "@/server/payslips/payslip-view";

/**
 * Branded A4 payslip — mirrors payflow-design-system.html §Payslip PDF:
 * ink header rule, dashed itemization, teal net-pay panel, footer legal line.
 */

const INK = "#0F172A";
const BODY = "#475569";
const MUTED = "#94A3B8";
const SLATE_100 = "#F1F5F9";
const PRIMARY = "#4F46E5";
const TEAL_50 = "#F0FDFA";
const TEAL_100 = "#CCFBF1";
const TEAL_700 = "#0F766E";
const AMBER_700 = "#B45309";

function LogoMark() {
  return (
    <Svg width={30} height={30} viewBox="0 0 32 32">
      <Rect width={32} height={32} rx={8} fill={PRIMARY} />
      <Path
        d="M9 21.5c3-1 4.5-6.5 7-7s4 5.5 7 4.5"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={9} cy={21} r={2.1} fill="#FFFFFF" />
      <Circle cx={23} cy={16} r={2.1} fill="#FFFFFF" />
    </Svg>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingVertical: 2.5,
      }}
    >
      <Text style={{ fontSize: 11, color: MUTED }}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: 500, color: INK }}>{value}</Text>
    </View>
  );
}

function SectionLabel({ children, first }: { children: string; first?: boolean }) {
  return (
    <Text
      style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: 1,
        color: MUTED,
        marginTop: first ? 12 : 15,
        marginBottom: 3,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

function ItemRow({ label, amount, last }: PayslipLine & { last: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingVertical: 5.5,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: SLATE_100,
        borderBottomStyle: "dashed",
      }}
    >
      <Text style={{ fontSize: 11, color: BODY }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: 500, color: INK }}>{amount}</Text>
    </View>
  );
}

function TotalRow({ label, amount }: PayslipLine) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderTopWidth: 1.5,
        borderTopColor: INK,
        borderTopStyle: "solid",
        paddingTop: 8,
        marginTop: 2,
      }}
    >
      <Text style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{amount}</Text>
    </View>
  );
}

export function PayslipPdfDocument({ view }: { view: PayslipViewModel }) {
  return (
    <Document
      title={`Payslip ${view.payslipNumber}`}
      author={view.companyName}
      creator="PayFlow"
      producer="PayFlow"
    >
      <Page size="A4" style={{ fontFamily: "Inter", paddingHorizontal: 46, paddingVertical: 40 }}>
        {view.watermark ? (
          <Text
            fixed
            style={{
              position: "absolute",
              top: "44%",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 110,
              fontWeight: 700,
              color: INK,
              opacity: 0.05,
              transform: "rotate(-32deg)",
              letterSpacing: 8,
            }}
          >
            {view.watermark}
          </Text>
        ) : null}

        {/* Branded header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottomWidth: 2,
            borderBottomColor: INK,
            borderBottomStyle: "solid",
            paddingBottom: 13,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <LogoMark />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: 700, color: INK }}>{view.companyName}</Text>
              {view.companySubline ? (
                <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 3 }}>
                  {view.companySubline}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 9, letterSpacing: 1.4, color: MUTED }}>PSLIP</Text>
            <Text style={{ fontSize: 12, fontWeight: 600, color: INK, marginTop: 2 }}>
              {view.payslipNumber}
            </Text>
          </View>
        </View>

        {/* Identity */}
        <View style={{ marginTop: 12 }}>
          <IdentityRow label="Employee" value={view.employeeLine} />
          <IdentityRow label="Department / Position" value={view.orgLine} />
          <IdentityRow label="Period / Pay date" value={view.periodLine} />
        </View>

        {/* Earnings */}
        <SectionLabel first>Earnings</SectionLabel>
        <View>
          {view.earnings.map((line, i) => (
            <ItemRow key={line.label} {...line} last={i === view.earnings.length - 1} />
          ))}
          <TotalRow label="Gross salary" amount={view.gross} />
        </View>

        {/* Deductions */}
        <SectionLabel>Deductions</SectionLabel>
        <View>
          {view.deductions.map((line, i) => (
            <ItemRow key={line.label} {...line} last={i === view.deductions.length - 1} />
          ))}
          <TotalRow label="Total deductions" amount={view.totalDeductions} />
        </View>

        {/* Net pay */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: TEAL_50,
            borderWidth: 1,
            borderColor: TEAL_100,
            borderStyle: "solid",
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            marginTop: 16,
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Net salary payable</Text>
          <Text style={{ fontSize: 16, fontWeight: 700, color: TEAL_700, letterSpacing: -0.2 }}>
            {view.net} {view.currency}
          </Text>
        </View>

        {/* Footer */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 9, color: MUTED, textAlign: "center" }}>
            {view.generatedLine} · PayFlow · This document was produced electronically and is valid
            without signature.
          </Text>
          {view.stale ? (
            <Text style={{ fontSize: 9, color: AMBER_700, textAlign: "center", marginTop: 4 }}>
              Adjustments changed after the last payroll run — totals reflect the last processed
              run; reprocess to refresh this document.
            </Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayslipPdf(view: PayslipViewModel): Promise<Buffer> {
  registerInterFonts();
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(
    (<PayslipPdfDocument view={view} />) as ReactElement<DocumentProps>,
  );
}
