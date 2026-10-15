// Checks the folder-link helpers.  Run with:  npx tsx scripts/check-drive-links.ts
import assert from 'node:assert/strict'
import { DRIVE_FOLDERS, SECTION_FOLDER, folderLabel, folderLink, isWebAddress, showFolder } from '../src/lib/drive-links'

// only plain web addresses count
for (const ok of ['https://drive.google.com/drive/folders/abc?usp=drive_link', 'http://example.com/x', '  https://x.io/a  '.trim()]) assert.ok(isWebAddress(ok), ok)
for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'ftp://x', '//evil.com', 'drive.google.com/x', 'https://', 'https://a b', '', null, undefined, 5, 'https://' + 'a'.repeat(600)]) assert.ok(!isWebAddress(bad), String(bad))

const client = { profile: { drive: { root: 'https://drive.google.com/drive/folders/ROOT', touring: 'https://drive.google.com/drive/folders/TOUR', music: 'javascript:alert(1)' } } }
assert.equal(folderLink(client, 'root'), 'https://drive.google.com/drive/folders/ROOT')
assert.equal(folderLink(client, 'music'), undefined)          // a stored bad value is never offered
assert.equal(folderLink(client, 'finance'), undefined)
assert.equal(folderLink(null, 'root'), undefined)
assert.equal(folderLink({ profile: undefined }, 'root'), undefined)

// a show opens its own folder first, then Touring, then the artist's main folder
assert.deepEqual(showFolder(client, { driveUrl: 'https://drive.google.com/drive/folders/SHOW' }), { url: 'https://drive.google.com/drive/folders/SHOW', kind: 'show' })
assert.deepEqual(showFolder(client, {}), { url: 'https://drive.google.com/drive/folders/TOUR', kind: 'touring' })
assert.deepEqual(showFolder(client, { driveUrl: 'javascript:alert(1)' }), { url: 'https://drive.google.com/drive/folders/TOUR', kind: 'touring' })
assert.deepEqual(showFolder({ profile: { drive: { root: 'https://x.io/r' } } }, {}), { url: 'https://x.io/r', kind: 'artist' })
assert.equal(showFolder({ profile: undefined }, {}), undefined)

// every section that has a folder points at a real one
for (const key of Object.values(SECTION_FOLDER)) assert.ok(DRIVE_FOLDERS.some(f => f[0] === key), String(key))
assert.equal(folderLabel('promoterMedia'), 'Promoter Media')
assert.equal(new Set(DRIVE_FOLDERS.map(f => f[0])).size, DRIVE_FOLDERS.length)
console.log('drive-links: all checks passed')
