// Vendor matching + change detection. Pure functions (no server-only imports)
// so the bill confirmation screen can re-check live as details are edited.
import type { Vendor, VendorField } from '@/types'

export function normalizeVendorName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export type VendorDetails = Pick<Vendor, 'address' | 'email' | 'phone' | 'taxId' | 'bankLast4' | 'bankFingerprint'>
export type VendorChange = { field: VendorField; saved?: string; incoming?: string }

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const sameText: Record<'address' | 'email' | 'phone' | 'taxId', (a: string, b: string) => boolean> = {
  address: (a, b) => squash(a) === squash(b),
  email: (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
  // Compare the last 10 digits so "+1 (212) 555-0100" equals "212-555-0100".
  phone: (a, b) => a.replace(/\D/g, '').slice(-10) === b.replace(/\D/g, '').slice(-10),
  taxId: (a, b) => a.replace(/[^a-z0-9]/gi, '').toLowerCase() === b.replace(/[^a-z0-9]/gi, '').toLowerCase(),
}

export const VENDOR_FIELD_LABEL: Record<VendorField, string> = {
  address: 'Address', email: 'Email', phone: 'Phone', taxId: 'Tax ID', bank: 'Bank account',
}

// Only a real conflict counts as a change: a detail the saved vendor lacks is
// new information, and a detail missing from this bill proves nothing.
export function diffVendor(saved: Vendor, incoming: VendorDetails): VendorChange[] {
  const changes: VendorChange[] = []
  for (const field of ['address', 'email', 'phone', 'taxId'] as const) {
    const a = saved[field]
    const b = incoming[field]
    if (a && b && !sameText[field](a, b)) changes.push({ field, saved: a, incoming: b })
  }
  // Full-number fingerprints when both sides have one; otherwise (a masked
  // "****1234" on either side) fall back to comparing the last 4 digits.
  const bankChanged = saved.bankFingerprint && incoming.bankFingerprint
    ? saved.bankFingerprint !== incoming.bankFingerprint
    : Boolean(saved.bankLast4 && incoming.bankLast4 && saved.bankLast4 !== incoming.bankLast4)
  if (bankChanged) {
    changes.push({
      field: 'bank',
      saved: saved.bankLast4 ? `account ending ${saved.bankLast4}` : undefined,
      incoming: incoming.bankLast4 ? `account ending ${incoming.bankLast4}` : undefined,
    })
  }
  return changes
}
