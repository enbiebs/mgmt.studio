// Checks the product's names.  Run with:  npx tsx scripts/check-brand.ts
// The whole product is "Artist Path"; "Mgmt Path" is only the management company's sign-in page. Both names live in
// src/lib/brand.ts and nowhere else, so a rename is one edit and a screen can never say the wrong one by accident.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { MANAGER_LOGIN_NAME, PRODUCT_NAME } from '../src/lib/brand'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const ROOT = join(__dirname, '..')

// Every source file, found by walking src/.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}
const FILES = sourceFiles(join(ROOT, 'src')).map(f => ({ path: relative(ROOT, f), text: readFileSync(f, 'utf8') }))

/** A line's code with comments taken off (a whole-line comment, or a trailing "// ..." after a space; "https://" is not one). */
function codeOf(line: string): string {
  const t = line.trim()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return ''
  return line.replace(/\s\/\/.*$/, '')
}

// Any way of typing either name, or the older "Mgmt Studio": any capitals, any gap (spaces, a non-breaking space, "&nbsp;").
// The one-word forms (mgmtpath.com, mgmtpath-forecast-holds, mgmtStudioType...) are stored ids and the web address, and must stay.
const NAME = /\b(mgmt\s+studio|(mgmt|artist)(\s|&nbsp;)+path)\b/i

check('the whole product is Artist Path and the manager sign-in is Mgmt Path', () => {
  assert.equal(PRODUCT_NAME, 'Artist Path')
  assert.equal(MANAGER_LOGIN_NAME, 'Mgmt Path')
})

check('the comment-stripper keeps code and drops comments', () => {
  assert.equal(codeOf('  // Mgmt Path does this'), '')
  assert.equal(codeOf(' * Artist Path does this'), '')
  assert.equal(codeOf("const a = 'Artist Path' // the name"), "const a = 'Artist Path'")
  assert.equal(codeOf("const u = 'https://www.mgmtpath.com'"), "const u = 'https://www.mgmtpath.com'")
})

check('the name finder catches every spelling and leaves stored ids and the domain alone', () => {
  for (const bad of ["'Mgmt Path'", "'Artist Path'", "'Mgmt path'", "'MGMT PATH'", "'artist path'", "'Mgmt  Path'", "'Mgmt Path'", "'Mgmt&nbsp;Path'", "'Mgmt Studio'"]) {
    assert.ok(NAME.test(bad), 'should catch ' + bad)
  }
  for (const ok of ["'https://www.mgmtpath.com'", "'mgmtpath-forecast-holds'", "ev.mgmtStudioType", "'MgmtPath/1.0'", "'Mgmt commission (%)'", "'Mgmt'", "'artist pathway'"]) {
    assert.ok(!NAME.test(ok), 'should leave ' + ok)
  }
})

check('no screen, email or document types a product name by hand', () => {
  const found: string[] = []
  for (const f of FILES) {
    if (f.path.endsWith('src/lib/brand.ts')) continue
    f.text.split('\n').forEach((line, i) => { if (NAME.test(codeOf(line))) found.push(`${f.path}:${i + 1}  ${line.trim()}`) })
  }
  assert.deepEqual(found, [], 'use PRODUCT_NAME / MANAGER_LOGIN_NAME from src/lib/brand.ts instead:\n' + found.join('\n'))
})

check('"Mgmt Path" is used on the sign-in page and nowhere else', () => {
  const users = FILES.filter(f => !f.path.endsWith('src/lib/brand.ts') && f.text.split('\n').some(l => !/^\s*import\b/.test(l) && /\bMANAGER_LOGIN_NAME\b/.test(codeOf(l)))).map(f => f.path)  // an import alone is not "using" it
  assert.deepEqual(users, ['src/app/login/page.tsx'])
})

console.log(`\n${n} checks passed`)
