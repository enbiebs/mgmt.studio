// ──────────────────────────────────────────────────────────
//  The day sheet / advance sheet -> PDF. Made in the person's own browser from the same sheet the screen shows (lib/day-sheet.ts), so it
//  can never show more than the screen does. Loaded only when someone asks for the PDF (the PDF library is large).
// ──────────────────────────────────────────────────────────

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { DaySheet } from '@/lib/day-sheet'
import { pdfSafe as t } from '@/lib/pdf-text'
import { PRODUCT_NAME } from '@/lib/brand'

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, color: INK },
  eyebrow: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold' },
  artist: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  venue: { fontSize: 14, marginTop: 4 },
  city: { fontSize: 10, color: MUTED, marginTop: 2 },
  date: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 8 },
  weather: { fontSize: 9, color: MUTED, marginTop: 2 },
  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 14, marginBottom: 6 },
  title: { fontSize: 8, letterSpacing: 1.5, color: MUTED, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 110, color: MUTED, paddingRight: 8 },
  value: { flex: 1, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 4, color: MUTED },
  empty: { marginTop: 16, color: MUTED },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED },
})

/** The PDF document for one sheet. */
export function daySheetDocument(sheet: DaySheet) {
  const advance = sheet.kind === 'advance'
  return (
    <Document title={t(`${advance ? 'Advance' : 'Day sheet'} - ${sheet.artist} - ${sheet.venue}`)} author={PRODUCT_NAME}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.eyebrow}>{advance ? 'ADVANCE · PLEASE CHECK AND CORRECT' : 'DAY SHEET'}</Text>
        <Text style={styles.artist}>{t(sheet.artist)}</Text>
        <Text style={styles.venue}>{t(sheet.venue)}</Text>
        <Text style={styles.city}>{t(sheet.city)}</Text>
        <Text style={styles.date}>{t(sheet.dateLine)}</Text>
        {sheet.weather ? <Text style={styles.weather}>{t(sheet.weather)}</Text> : null}
        <View style={styles.rule} />

        {sheet.sections.map(sec => (
          <View key={sec.key}>
            <Text style={styles.title} minPresenceAhead={40}>{t(sec.title.toUpperCase())}</Text>
            {sec.rows.map((r, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.label}>{t(r.label)}</Text>
                <Text style={styles.value}>{t(r.value)}</Text>
              </View>
            ))}
            {sec.note ? <Text style={styles.note}>{t(sec.note)}</Text> : null}
          </View>
        ))}
        {sheet.sections.length === 0 ? <Text style={styles.empty}>Nothing has been filled in for this show yet.</Text> : null}

        <View style={styles.footer} fixed>
          <Text>{`Made with ${PRODUCT_NAME}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
