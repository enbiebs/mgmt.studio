// ──────────────────────────────────────────────────────────
//  An invoice -> PDF. Made in the person's own browser from the same document the screen and the email use (lib/invoice-doc.ts). Loaded
//  only when someone asks for the PDF (the PDF library is large).
// ──────────────────────────────────────────────────────────

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { InvoiceDoc } from '@/lib/invoice-doc'
import { dateWord } from '@/lib/contract-dates'
import { fmtMoney } from '@/lib/money'
import { pdfSafe as t } from '@/lib/pdf-text'
import { PRODUCT_NAME } from '@/lib/brand'

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 60, paddingHorizontal: 52, fontFamily: 'Helvetica', fontSize: 10, color: INK },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold' },
  number: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  dates: { textAlign: 'right' },
  dateLine: { marginBottom: 2 },
  muted: { color: MUTED },
  paidMark: { marginTop: 4, fontFamily: 'Helvetica-Bold', color: '#15803d' },
  parties: { flexDirection: 'row', marginTop: 26 },
  party: { flex: 1, paddingRight: 12 },
  partyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4, marginTop: 28 },
  th: { fontSize: 8, letterSpacing: 1, color: MUTED, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE },
  descCol: { flex: 1, paddingRight: 8 },
  qtyCol: { width: 44, textAlign: 'right' },
  rateCol: { width: 78, textAlign: 'right' },
  amountCol: { width: 86, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginRight: 16 },
  totalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  owedLine: { textAlign: 'right', marginTop: 4, color: MUTED },
  notes: { marginTop: 28 },
  notesText: { marginTop: 4, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 28, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
})

export function invoiceDocument(d: InvoiceDoc) {
  const money = (n: number) => t(fmtMoney(n, d.currency))
  return (
    <Document title={t(`Invoice ${d.number} - ${d.billedTo}`)} author={t(d.from)}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.top}>
          <View>
            <Text style={styles.eyebrow}>INVOICE</Text>
            <Text style={styles.number}>{t(d.number)}</Text>
          </View>
          <View style={styles.dates}>
            <Text style={styles.dateLine}>{`Issued ${t(dateWord(d.issued))}`}</Text>
            <Text style={styles.dateLine}>{`Due ${t(dateWord(d.due))}`}</Text>
            {d.paid ? <Text style={styles.paidMark}>{d.paidOn ? `PAID ${t(dateWord(d.paidOn))}` : 'PAID'}</Text> : null}
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.eyebrow}>FROM</Text>
            <Text style={styles.partyName}>{t(d.from)}</Text>
            {d.from !== d.artist ? <Text style={styles.muted}>{t(`for ${d.artist}`)}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.eyebrow}>BILLED TO</Text>
            <Text style={styles.partyName}>{t(d.billedTo)}</Text>
            {d.billedToEmail ? <Text style={styles.muted}>{t(d.billedToEmail)}</Text> : null}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.descCol]}>DESCRIPTION</Text>
          <Text style={[styles.th, styles.qtyCol]}>QTY</Text>
          <Text style={[styles.th, styles.rateCol]}>RATE</Text>
          <Text style={[styles.th, styles.amountCol]}>AMOUNT</Text>
        </View>
        {d.lines.map((l, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.descCol}>{t(l.description)}</Text>
            <Text style={styles.qtyCol}>{String(l.quantity)}</Text>
            <Text style={styles.rateCol}>{money(l.rate)}</Text>
            <Text style={styles.amountCol}>{money(l.amount)}</Text>
          </View>
        ))}

        <View style={styles.totalRow} wrap={false}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{money(d.total)}</Text>
        </View>
        {!d.paid && d.outstanding < d.total ? <Text style={styles.owedLine}>{`Still to pay: ${money(d.outstanding)}`}</Text> : null}

        {d.notes ? (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.eyebrow}>NOTES</Text>
            <Text style={styles.notesText}>{t(d.notes)}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{`Made with ${PRODUCT_NAME}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
