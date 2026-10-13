// ──────────────────────────────────────────────────────────
//  Offer sheet -> PDF. Server-only (used by /api/offer-sheets/[id]/pdf).
//  Lays out the same rows the on-screen sheet shows (sheetRows / dealRows),
//  so the two can never disagree.
// ──────────────────────────────────────────────────────────

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { OfferSheet } from '@/types'
import { sheetRows, dealGroups, pctLabel, money } from '@/lib/offer-sheet'

// The PDF's built-in fonts only carry Western European characters. Anything else is
// swapped for its plain letter (accents dropped) or a "?", rather than printing garbage.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 && ch !== '\n') continue
    if (code < 0x100 || WIN_ANSI_EXTRAS.has(ch)) { out += ch; continue }
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    out += plain.length > 0 && (plain.codePointAt(0) ?? 0xffff) < 0x100 ? plain : '?'
  }
  return out
}

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, color: INK },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold' },
  artist: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  version: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  confidential: { fontSize: 8, letterSpacing: 1.5, color: MUTED, textAlign: 'right', marginTop: 3 },
  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 14, marginBottom: 14 },
  dealRow: { flexDirection: 'row', marginBottom: 4 },
  dealLabel: { width: 178, color: MUTED, paddingRight: 8 },
  groupTitle: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4 },
  dealValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  messageBox: { marginTop: 12, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
  messageLabel: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 4, marginTop: 16 },
  th: { fontSize: 8, letterSpacing: 1, color: MUTED, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', paddingVertical: 3, alignItems: 'flex-start' },
  labelCol: { flex: 1, paddingRight: 8 },
  amountCol: { width: 80, textAlign: 'right' },
  pctCol: { width: 62, textAlign: 'right', color: MUTED },
  head: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 2 },
  sub: { fontSize: 8, color: MUTED },
  bold: { fontFamily: 'Helvetica-Bold' },
  totalRow: { borderTopWidth: 1, borderTopColor: RULE },
  netRow: { borderTopWidth: 1.5, borderTopColor: INK, marginTop: 6, paddingTop: 6 },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
})

function sentOn(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function OfferSheetPdf({ sheet }: { sheet: OfferSheet }) {
  const sn = sheet.snapshot
  const t = pdfSafe
  return (
    <Document title={t(`Offer sheet - ${sn.offer.venue} - V${sheet.version}`)} author="Mgmt Studio">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.eyebrow}>OFFER SHEET</Text>
            <Text style={styles.artist}>{t(sn.artistName)}</Text>
          </View>
          <View>
            <Text style={styles.version}>{`V${sheet.version}`}</Text>
            <Text style={styles.confidential}>CONFIDENTIAL</Text>
          </View>
        </View>
        <View style={styles.rule} />

        {dealGroups(sn).map((group, gi) => (
          <View key={gi}>
            {group.title && <Text style={styles.groupTitle} minPresenceAhead={50}>{t(group.title.toUpperCase())}</Text>}
            {group.rows.map(([label, value], i) => (
              <View key={`${label}-${i}`} style={styles.dealRow} wrap={false}>
                <Text style={styles.dealLabel}>{t(label)}</Text>
                <Text style={styles.dealValue}>{t(value)}</Text>
              </View>
            ))}
          </View>
        ))}

        {sheet.message && (
          <View style={styles.messageBox} wrap={false}>
            <Text style={styles.messageLabel}>MESSAGE FROM YOUR MANAGER</Text>
            <Text>{t(sheet.message)}</Text>
          </View>
        )}

        <View style={styles.tableHeader} minPresenceAhead={240}>
          <Text style={[styles.th, styles.labelCol]}>{sn.lines ? 'BUDGET' : 'SUMMARY'}</Text>
          <Text style={[styles.th, styles.amountCol]}>{sn.currency}</Text>
          <Text style={[styles.th, styles.pctCol]}>% GROSS</Text>
        </View>

        {sheetRows(sn).map((r, i) => {
          if (r.kind === 'head') return <Text key={i} style={styles.head} minPresenceAhead={70}>{t(r.label.toUpperCase())}</Text>
          const strong = r.kind !== 'line'
          return (
            <View key={i} wrap={false} style={[styles.row, ...(r.kind === 'total' ? [styles.totalRow] : []), ...(r.kind === 'net' ? [styles.netRow] : [])]}>
              <View style={styles.labelCol}>
                <Text style={strong ? styles.bold : undefined}>{t(r.label)}</Text>
                {r.sub && <Text style={styles.sub}>{t(r.sub)}</Text>}
              </View>
              <Text style={[styles.amountCol, ...(strong ? [styles.bold] : [])]}>{r.amount === undefined ? '' : money(r.amount, sn.currency)}</Text>
              <Text style={styles.pctCol}>{pctLabel(r.pct)}</Text>
            </View>
          )
        })}

        {sn.budgetNotes && (
          <View style={styles.messageBox} wrap={false}>
            <Text style={styles.messageLabel}>NOTES / ASSUMPTIONS</Text>
            <Text>{t(sn.budgetNotes)}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{t(`Sent ${sentOn(sheet.sentAt)} · Version ${sheet.version}`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderOfferSheetPdf(sheet: OfferSheet): Promise<Uint8Array> {
  const buf = await renderToBuffer(<OfferSheetPdf sheet={sheet} />)
  return new Uint8Array(buf)
}
