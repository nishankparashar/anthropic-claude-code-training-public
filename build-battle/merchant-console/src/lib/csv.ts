import { merchantById } from "@/data/merchants"
import { Payment, PaymentFilters } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope (NWP-101). Both arrive from the
 * client, so they are parsed against the allowlists here before the route
 * handler uses them. The card last four is off unless explicitly requested,
 * because these files go to merchants.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/** What ships when the client does not ask for columns: everything but last four. */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] = EXPORT_COLUMNS.filter(
  (column) => column !== "last4",
)

export const EXPORT_SCOPES = ["filter", "all"] as const

export type ExportScope = (typeof EXPORT_SCOPES)[number]

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Parse a comma-separated column list from the client. Absent means the
 * default set; unknown names are rejected rather than dropped, so a typo never
 * quietly produces a different file. Order is kept, duplicates collapse.
 */
export function parseExportColumns(raw: string | null): Parsed<ExportColumn[]> {
  if (raw === null) return { ok: true, value: [...DEFAULT_EXPORT_COLUMNS] }

  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) return { ok: false, error: "Select at least one column" }

  const unknown = names.filter(
    (name) => !EXPORT_COLUMNS.includes(name as ExportColumn),
  )
  if (unknown.length > 0) return { ok: false, error: "Unknown export column" }

  return { ok: true, value: [...new Set(names)] as ExportColumn[] }
}

/** Absent means the current filter; anything outside the allowlist is rejected. */
export function parseExportScope(raw: string | null): Parsed<ExportScope> {
  if (raw === null) return { ok: true, value: "filter" }
  if (EXPORT_SCOPES.includes(raw as ExportScope)) {
    return { ok: true, value: raw as ExportScope }
  }
  return { ok: false, error: "Unknown export scope" }
}

/**
 * The filename label for a scope. Built only from allowlisted values (the
 * parsed status, or a fixed word), so client text never reaches the header.
 */
export function exportLabel(scope: ExportScope, filters: PaymentFilters): string {
  if (scope === "all") return "all"
  const status = filters.status && filters.status !== "all" ? filters.status : null
  const narrowed = Boolean(
    filters.merchantId || filters.search || filters.from || filters.to,
  )
  if (status && !narrowed) return status
  if (status || narrowed) return "filtered"
  return "all"
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  if (columns.length === 0) {
    throw new Error("An export needs at least one column")
  }
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

export function exportFilename(date = new Date(), label?: string): string {
  const day = date.toISOString().slice(0, 10)
  return label ? `payments-${label}-${day}.csv` : `payments-${day}.csv`
}
