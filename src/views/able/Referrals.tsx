"use client";

import Card from "@/components/ui/Card";
import FinCard from "@/components/ui/FinCard";
import Empty from "@/components/ui/Empty";
import DataTable, { ColumnsButton, useTablePrefs, type Column } from "@/components/ui/DataTable";
import { fmtInt } from "@/lib/chartTheme";
import { STAT_NEUTRAL, STAT_POSITIVE } from "@/lib/statColors";
import ReportPage, { Amount } from "./ReportPage";
import {
  MARKETING_PATH,
  MARKETING_REFRESH_MS,
  fmtAmount,
  type MarketingReferralCode,
  type MarketingReport,
} from "./marketingTypes";

const count = (key: keyof MarketingReferralCode, header: string): Column<MarketingReferralCode> => ({
  key,
  header,
  align: "right",
  width: 120,
  cell: (r) => <span className="num">{fmtInt(r[key] as number)}</span>,
  sortValue: (r) => r[key] as number,
});

const COLUMNS: Column<MarketingReferralCode>[] = [
  {
    key: "code",
    header: "Code",
    width: 180,
    hideable: false,
    cell: (r) => <span className="font-mono text-ink">{r.code}</span>,
    sortValue: (r) => r.code.toLowerCase(),
  },
  count("signups", "Signups"),
  count("kycApproved", "KYC approved"),
  count("carded", "Cards"),
  count("deposited", "Deposited"),
  count("spenders", "Spenders"),
  {
    key: "depositUsdt",
    header: "Deposits USDT",
    align: "right",
    width: 140,
    cell: (r) => <span className="num">{fmtAmount(r.depositUsdt)}</span>,
    sortValue: (r) => r.depositUsdt,
  },
  {
    key: "spendUsd",
    header: "Card spend USD",
    align: "right",
    width: 140,
    cell: (r) => <span className="num">{fmtAmount(r.spendUsd)}</span>,
    sortValue: (r) => r.spendUsd,
  },
];

export default function Referrals() {
  return (
    <ReportPage<MarketingReport> title="Referral program" path={MARKETING_PATH} refreshMs={MARKETING_REFRESH_MS}>
      {(m) => <ReferralsBody codes={m.referralCodes} />}
    </ReportPage>
  );
}

function ReferralsBody({ codes }: { codes: MarketingReferralCode[] }) {
  const prefs = useTablePrefs("able-referral-codes", COLUMNS);
  const refDeposits = codes.reduce((n, r) => n + r.depositUsdt, 0);
  const refSpend = codes.reduce((n, r) => n + r.spendUsd, 0);
  // The API sorts codes by signups, most first.
  const best = codes[0];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <FinCard label="Codes in play" valueClass={STAT_NEUTRAL} note="Codes with at least one signup">
          {fmtInt(codes.length)}
        </FinCard>
        <FinCard label="Best code" valueClass={STAT_NEUTRAL} note={best ? `${fmtInt(best.signups)} signups` : "No referrals yet"}>
          <span className="break-all font-mono">{best ? best.code : "-"}</span>
        </FinCard>
        <FinCard label="Referred deposits" valueClass={STAT_POSITIVE} note="Lifetime, across referred users">
          <Amount value={fmtAmount(refDeposits)} unit="USDT" />
        </FinCard>
        <FinCard label="Referred card spend" valueClass={STAT_NEUTRAL} note="Lifetime, across referred users">
          <Amount value={fmtAmount(refSpend)} unit="USD" />
        </FinCard>
      </div>

      <Card
        title="Codes, downstream conversion, and referred money"
        bodyClassName="p-0"
        actions={codes.length > 0 ? <ColumnsButton columns={COLUMNS} hidden={prefs.hidden} toggleHidden={prefs.toggleHidden} /> : undefined}
      >
        {codes.length > 0 ? (
          <DataTable
            columns={COLUMNS}
            rows={codes}
            rowKey={(r) => r.code}
            hidden={prefs.hidden}
            widths={prefs.widths}
            setWidths={prefs.setWidths}
            defaultSort={{ key: "signups", dir: "desc" }}
          />
        ) : (
          <Empty compact title="No referrals yet" />
        )}
      </Card>
    </>
  );
}
