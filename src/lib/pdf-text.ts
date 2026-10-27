// Text for a PDF, shared by every PDF we make. The PDF's built-in fonts only carry Western European characters: anything else is
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
