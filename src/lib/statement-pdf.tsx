// ──────────────────────────────────────────────────────────
//  An artist statement -> PDF. Made in the person's own browser from the same statement the window shows (lib/statement.ts). Loaded only
//  when someone asks for the PDF.
// ──────────────────────────────────────────────────────────

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Statement } from '@/lib/statement'
import { dateWord } from '@/lib/contract-dates'
import { fmtMoney } from '@/lib/money'
import { pdfSafe as t } from '@/lib/pdf-text'
import { PRODUCT_NAME } from '@/lib/brand'

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 60, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, color: INK },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold' },
  artist: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  period: { fontSize: 12, marginTop: 4 },
  meta: { color: MUTED, marginTop: 3 },
  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 14, marginBottom: 4 },
  currency: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 16 },
  head: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 3 },
  row: { flexDirection: 'row', paddingVertical: 2 },
  label: { flex: 1, paddingRight: 8 },
  amount: { width: 90, textAlign: 'right' },
  num: { width: 74, textAlign: 'right' },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: RULE, paddingTop: 3, marginTop: 2 },
  bold: { fontFamily: 'Helvetica-Bold' },
  netRow: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: INK, paddingTop: 5, marginTop: 8 },
  th: { fontSize: 8, color: MUTED, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 22, color: MUTED },
  empty: { marginTop: 24, color: MUTED },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
})

export function statementDocument(s: Statement) {
  return (
    <Document title={t(`Statement - ${s.artist} - ${s.period.label}`)} author={t(s.company || PRODUCT_NAME)}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.eyebrow}>STATEMENT</Text>
        <Text style={styles.artist}>{t(s.artist)}</Text>
        <Text style={styles.period}>{t(s.period.label)}</Text>
        <Text style={styles.meta}>{t(`${s.company ? `Prepared by ${s.company} · ` : ''}${dateWord(s.generated)}`)}</Text>
        <View style={styles.rule} />

        {s.empty && s.sections.length === 0 ? <Text style={styles.empty}>Nothing is recorded for this period.</Text> : null}

        {s.sections.map(sec => {
          const money = (n: number) => t(fmtMoney(n, sec.currency))
          return (
            <View key={sec.currency}>
              <Text style={styles.currency}>{t(`Amounts in ${sec.currency}`)}</Text>

              {sec.income.length > 0 || sec.costs.length > 0 ? (
                <View wrap={false}>
                  {sec.income.length > 0 ? (
                    <View>
                      <Text style={styles.head}>MONEY IN</Text>
                      {sec.income.map(l => <View key={l.label} style={styles.row}><Text style={styles.label}>{t(l.label)}</Text><Text style={styles.amount}>{money(l.amount)}</Text></View>)}
                      <View style={styles.totalRow}><Text style={[styles.label, styles.bold]}>Total in</Text><Text style={[styles.amount, styles.bold]}>{money(sec.incomeTotal)}</Text></View>
                    </View>
                  ) : null}
                  {sec.costs.length > 0 ? (
                    <View>
                      <Text style={styles.head}>MONEY OUT</Text>
                      {sec.costs.map(l => <View key={l.label} style={styles.row}><Text style={styles.label}>{t(l.label)}</Text><Text style={styles.amount}>{money(l.amount)}</Text></View>)}
                      <View style={styles.totalRow}><Text style={[styles.label, styles.bold]}>Total out</Text><Text style={[styles.amount, styles.bold]}>{money(sec.costsTotal)}</Text></View>
                    </View>
                  ) : null}
                  <View style={styles.netRow}><Text style={[styles.label, styles.bold]}>Net for the period</Text><Text style={[styles.amount, styles.bold]}>{money(sec.net)}</Text></View>
                </View>
              ) : null}

              {sec.shows.length > 0 ? (
                <View>
                  <Text style={styles.head}>SHOWS AND WHAT WAS TAKEN FROM THEM</Text>
                  <Text style={styles.meta}>Fees as booked; the money in above is counted when it arrived.</Text>
                  <View style={styles.row}>
                    <Text style={[styles.th, styles.label]}>SHOW</Text><Text style={[styles.th, styles.num]}>FEE</Text><Text style={[styles.th, styles.num]}>AGENCY</Text><Text style={[styles.th, styles.num]}>MGMT</Text><Text style={[styles.th, styles.num]}>TO ARTIST</Text>
                  </View>
                  {sec.shows.map((sh, i) => (
                    <View key={i} style={styles.row} wrap={false}>
                      <Text style={styles.label}>{t(`${dateWord(sh.date)} · ${sh.venue}${sh.city ? `, ${sh.city}` : ''}`)}</Text>
                      <Text style={styles.num}>{money(sh.fee)}</Text><Text style={styles.num}>{money(sh.agency)}</Text><Text style={styles.num}>{money(sh.management)}</Text><Text style={styles.num}>{money(sh.net)}</Text>
                    </View>
                  ))}
                  <View style={styles.totalRow} wrap={false}>
                    <Text style={[styles.label, styles.bold]}>Total</Text>
                    <Text style={[styles.num, styles.bold]}>{money(sec.showTotals.fee)}</Text><Text style={[styles.num, styles.bold]}>{money(sec.showTotals.agency)}</Text>
                    <Text style={[styles.num, styles.bold]}>{money(sec.showTotals.management)}</Text><Text style={[styles.num, styles.bold]}>{money(sec.showTotals.net)}</Text>
                  </View>
                </View>
              ) : null}

              {sec.owed > 0 ? <View style={styles.row} wrap={false}><Text style={[styles.label, styles.meta]}>{t(`Invoices sent and still unpaid, as of ${dateWord(s.generated)}`)}</Text><Text style={styles.amount}>{money(sec.owed)}</Text></View> : null}
            </View>
          )
        })}

        <Text style={styles.note}>
          {t(`These figures come from what is recorded in ${PRODUCT_NAME}${s.sources.length > 0 ? ` (${s.sources.join(', ').toLowerCase()})` : ''}. Money that has not been recorded is not in them. Each currency is shown on its own and never added to another.`)}
        </Text>

        <View style={styles.footer} fixed>
          <Text>{`Made with ${PRODUCT_NAME}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
