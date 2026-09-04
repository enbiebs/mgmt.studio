import type { LegalTemplateClause } from '@/types'

// Fill-in-the-blank engine for Legal templates. Placeholders are just
// [BRACKETED TEXT] inside clause bodies — no separate schema to keep in
// sync with the editable clause language.

export function extractPlaceholders(clauses: LegalTemplateClause[]): string[] {
  const seen = new Set<string>()
  const re = /\[([^\]]+)\]/g
  for (const c of clauses) {
    let m: RegExpExecArray | null
    while ((m = re.exec(c.body)) !== null) seen.add(m[1])
  }
  return Array.from(seen)
}

export function fillClauses(clauses: LegalTemplateClause[], values: Record<string, string>): LegalTemplateClause[] {
  return clauses.map(c => ({
    ...c,
    body: c.body.replace(/\[([^\]]+)\]/g, (full, key: string) => {
      const v = values[key]
      return v && v.trim() ? v.trim() : full
    }),
  }))
}

// Best-effort prefill so the common fields (artist name, today's date)
// aren't retyped every time — anything else starts blank.
export function guessDefault(placeholder: string, clientName: string): string {
  const p = placeholder.trim().toUpperCase()
  if (p === 'DATE') {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
  if (p === 'ARTIST STAGE NAME' || p === 'ARTIST NAME' || p === 'ARTIST' || p === 'ARTIST LEGAL NAME') {
    return clientName
  }
  return ''
}

function escapeRtf(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch
    else if (code > 127) out += `\\u${code}?`
    else out += ch
  }
  return out
}

// A hand-rolled .rtf — opens directly in Word/Pages/Google Docs with real
// bold headers and paragraph breaks, without pulling in a docx library.
export function buildRtf(title: string, clauses: LegalTemplateClause[]): string {
  const header = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs24 `
  const titleLine = `{\\qc\\b\\fs32 ${escapeRtf(title)}}\\par\\par\\ql `
  const body = clauses.map(c => {
    const clauseTitle = `{\\b ${escapeRtf(c.title)}}\\par `
    const clauseBody = escapeRtf(c.body).split('\n').map(line => (line.trim() ? line : '') + '\\par ').join('')
    return clauseTitle + clauseBody + '\\par '
  }).join('')
  return header + titleLine + body + '}'
}

export function downloadRtf(filename: string, title: string, clauses: LegalTemplateClause[]) {
  const rtf = buildRtf(title, clauses)
  const blob = new Blob([rtf], { type: 'application/rtf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.rtf') ? filename : `${filename}.rtf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
