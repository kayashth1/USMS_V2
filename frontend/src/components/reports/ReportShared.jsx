import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";

// ── Skeleton components ───────────────────────────────────────────────────────

export function CardSkeleton({ count = 3 }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-${Math.min(count, 4)} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-gray-100 animate-pulse shrink-0" />
            <div className="space-y-2 flex-1 pt-1">
              <div className="h-2.5 bg-gray-100 rounded animate-pulse w-24" />
              <div className="h-6 bg-gray-200 rounded animate-pulse w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + i * 10}px` }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: cols }).map((_, j) => (
                  <td key={j} className="px-4 py-3.5">
                    <div
                      className="h-3 bg-gray-100 rounded animate-pulse"
                      style={{
                        width: j === 0 ? "130px" : j === cols - 1 ? "60px" : "80px",
                        marginLeft: j === cols - 1 ? "auto" : undefined,
                        opacity: 1 - i * 0.08,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ReportSkeleton({ cards = 3, tableRows = 8, tableCols = 5 }) {
  return (
    <div className="space-y-5">
      <CardSkeleton count={cards} />
      <TableSkeleton rows={tableRows} cols={tableCols} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, description }) {
  return (
    <Card>
      <CardContent className="py-20 text-center space-y-3">
        {Icon && <Icon size={36} className="mx-auto text-gray-200" />}
        <p className="font-medium text-gray-500">{title}</p>
        {description && <p className="text-sm text-gray-400">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

export function ErrorState({ message, onRetry }) {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
          <AlertCircle size={20} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-medium text-gray-800">Failed to load report</p>
          <p className="text-sm text-gray-500 mt-1">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────

export function downloadExcel(headers, dataRows, filename) {
  const esc   = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const mkCell = v => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const mkRow  = cells => `<Row>${cells.map(mkCell).join("")}</Row>`;
  const xml    = [
    `<?xml version="1.0"?>`,
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`,
    `<Worksheet ss:Name="Report"><Table>`,
    mkRow(headers),
    ...dataRows.map(mkRow),
    `</Table></Worksheet></Workbook>`,
  ].join("\n");
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: `${filename}.xls` }).click();
  URL.revokeObjectURL(url);
}

// ── INR formatter (shared) ────────────────────────────────────────────────────
export const INR = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

export function fmtDate(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, total, pageSize, onChange }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 print:hidden">
      <p className="text-xs text-gray-500">{from}–{to} of {total}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="px-3 py-1.5 text-xs text-gray-500">{page} / {totalPages}</span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
