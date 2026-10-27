// Checks the spreadsheet file writer.  Run with:  npx tsx scripts/check-csv.ts
import assert from 'node:assert/strict'
import { csvCell, csvFileName, toCsv } from '../src/lib/csv'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

check('numbers stay numbers, yes/no for true/false, nothing for blanks', () => {
  assert.equal(csvCell(1250.5), '1250.5'); assert.equal(csvCell(-3), '-3'); assert.equal(csvCell(0), '0')
  assert.equal(csvCell(NaN), ''); assert.equal(csvCell(Infinity), '')
  assert.equal(csvCell(true), 'Yes'); assert.equal(csvCell(false), 'No')
  assert.equal(csvCell(null), ''); assert.equal(csvCell(undefined), '')
})
check('text with commas, quotes or edge spaces is quoted, quotes doubled', () => {
  assert.equal(csvCell('Smith, Jo'), '"Smith, Jo"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""'); assert.equal(csvCell(' pad '), '" pad "'); assert.equal(csvCell('plain'), 'plain')
})
check('a line break inside a cell never makes a second row', () => {
  assert.equal(csvCell('a\r\nb\nc\rd'), 'a b c d')
})
check('text that a spreadsheet would run as a formula is switched off', () => {
  for (const f of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '=HYPERLINK("http://evil","x")', '\t=1']) {
    const c = csvCell(f)
    assert.ok(c.startsWith("'") || c.startsWith(`"'`), f + ' -> ' + c)
  }
  assert.equal(csvCell('=1+1'), "'=1+1"); assert.equal(csvCell('a=b'), 'a=b'); assert.equal(csvCell('-'), "'-")
})
check('a real negative number is not touched, but the same digits as text are made safe', () => {
  assert.equal(csvCell(-5), '-5'); assert.equal(csvCell('-5'), "'-5")
})
check('the file has a byte-order mark for Excel, a header, Windows line endings, columns in order', () => {
  const csv = toCsv(['Name', 'Amount'], [{ Amount: 5, Name: 'Ann' }, { Name: 'B, Co', Amount: 1.5, Ignored: 'x' }])
  assert.equal(csv, '\uFEFFName,Amount\r\nAnn,5\r\n"B, Co",1.5\r\n')
})
check('no rows is just the header', () => assert.equal(toCsv(['A'], []), '\uFEFFA\r\n'))
check('file names are safe', () => {
  assert.equal(csvFileName(['Invoices', 'Noted / Mgmt: Co'], '2026-10-26T10:00:00Z'), 'Invoices - Noted Mgmt Co - 2026-10-26.csv')
  assert.equal(csvFileName(['', 'X'], '2026-01-02'), 'X - 2026-01-02.csv')
})
console.log(`${n} checks passed`)
