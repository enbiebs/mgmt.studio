// Runs every check script in scripts/ (check-*.ts) one after another and says which passed.  Run with:  npm test
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const files = readdirSync(new URL('.', import.meta.url)).filter(f => /^check-.*\.ts$/.test(f)).sort()
const failed = []
for (const file of files) {
  const r = spawnSync('npx', ['tsx', `scripts/${file}`], { encoding: 'utf8' })
  const ok = r.status === 0
  console.log(`${ok ? 'pass' : 'FAIL'}  ${file}`)
  if (!ok) {
    failed.push(file)
    console.log((r.stdout + r.stderr).split('\n').slice(-30).join('\n'))
  }
}
console.log(`\n${files.length - failed.length} of ${files.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
