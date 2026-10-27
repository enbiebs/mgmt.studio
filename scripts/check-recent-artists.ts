// Checks the artist switcher's recents and search.  Run with:  npx tsx scripts/check-recent-artists.ts
import assert from 'node:assert/strict'
import { filterArtists, isSearching, parseRecent, pushRecent, recentArtists, RECENT_MAX } from '../src/lib/recent-artists'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const roster = ['Mascolo', 'Nimino', 'Sierra Bloom', 'Ñandú Rey', 'The Bloom Collective', 'Marlo'].map((name, i) => ({ id: `c${i}`, name }))

check('opening an artist puts them first, once, and the list stays short', () => {
  assert.deepEqual(pushRecent([], 'a'), ['a'])
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'c'), ['c', 'a', 'b'])
  assert.deepEqual(pushRecent(['a', 'b'], 'a'), ['a', 'b'])
  assert.equal(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f').length, RECENT_MAX); assert.deepEqual(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f').slice(0, 2), ['f', 'a'])
})
check('recent artists: only ones that still exist, newest first, never the one that is open', () => {
  assert.deepEqual(recentArtists(['c2', 'gone', 'c0', 'c1'], roster, 'c0').map(c => c.id), ['c2', 'c1'])
  assert.deepEqual(recentArtists([], roster), [])
})
check('typing finds artists: starts-with first, then any word, then anywhere; accents and capitals do not matter', () => {
  assert.deepEqual(filterArtists(roster, 'ma').map(c => c.name), ['Marlo', 'Mascolo'])
  assert.deepEqual(filterArtists(roster, 'bloom').map(c => c.name), ['Sierra Bloom', 'The Bloom Collective'])
  assert.deepEqual(filterArtists(roster, 'nandu').map(c => c.name), ['Ñandú Rey'])
  assert.deepEqual(filterArtists(roster, 'OLL').map(c => c.name), ['The Bloom Collective'])
  assert.deepEqual(filterArtists(roster, 'zzz'), [])
  assert.deepEqual(filterArtists(roster, '   ').map(c => c.name), ['Marlo', 'Mascolo', 'Nimino', 'Sierra Bloom', 'The Bloom Collective', 'Ñandú Rey'].sort((a, b) => a.localeCompare(b)), 'nothing typed shows everyone, A to Z')
  assert.deepEqual(filterArtists(roster, 'sierra b').map(c => c.name), ['Sierra Bloom'])
})
check('a name that starts with what you typed comes before one that only has it later, even when the later one is first alphabetically', () => {
  const r = [{ name: 'Abe Bloom' }, { name: 'Bloomfield' }, { name: 'Cara Hubloomer' }]
  assert.deepEqual(filterArtists(r, 'bloom').map(c => c.name), ['Bloomfield', 'Abe Bloom', 'Cara Hubloomer'])
})
check('names with letters that are not accents, other alphabets and punctuation are found by what people type', () => {
  const r = ['Bjørk', 'Łukasz Nowak', 'Mø', 'A$AP Rocky', "Guns N' Roses", "O'Brien", '방탄소년단', 'Ёлка'].map(name => ({ name }))
  const find = (q: string) => filterArtists(r, q).map(c => c.name)
  assert.deepEqual(find('bjork'), ['Bjørk']); assert.deepEqual(find('lukasz'), ['Łukasz Nowak']); assert.deepEqual(find('mo'), ['Mø'])
  assert.deepEqual(find('asap'), ['A$AP Rocky']); assert.deepEqual(find('obrien'), ["O'Brien"]); assert.deepEqual(find("guns n'"), ["Guns N' Roses"])
  assert.deepEqual(find('방탄'), ['방탄소년단']); assert.deepEqual(find('ёл'), ['Ёлка'])
})
check('a search that is only punctuation or spaces is not a search: everyone stays listed and Enter would have nothing to pick', () => {
  for (const q of ['', ' ', '.', '-', '!!!', ' . ']) assert.equal(isSearching(q), false, JSON.stringify(q))
  for (const q of ['a', 'ё', '방', '7']) assert.equal(isSearching(q), true, q)
  assert.equal(filterArtists(roster, '!!!').length, roster.length)
})
check('a damaged saved list is ignored, not trusted', () => {
  assert.deepEqual(parseRecent(null), []); assert.deepEqual(parseRecent('not json'), []); assert.deepEqual(parseRecent('{"a":1}'), [])
  assert.deepEqual(parseRecent('["a", 5, null, "b"]'), ['a', 'b'])
  assert.equal(parseRecent(JSON.stringify(Array.from({ length: 50 }, (_, i) => `x${i}`))).length, RECENT_MAX)
})
console.log(`${n} checks passed`)
