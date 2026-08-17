import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  exportPortableDeskHome,
  importPortableDeskHome,
  type DeskHomeSourceEntry,
  type PortableDeskHomeArchive,
  type PortableDeskHomeEntry,
  type PortableDeskHomeImport,
  type PortableDeskHomeSink,
  type PortableDeskHomeSource,
} from './portable-home'

function source(entries: DeskHomeSourceEntry[], files: Record<string, string>): PortableDeskHomeSource {
  return {
    async *entries() {
      yield* entries
    },
    async readFile(path) {
      const value = files[path]
      if (value === undefined) throw new Error(`Missing ${path}`)
      return Buffer.from(value)
    },
  }
}

function memorySink() {
  const written: PortableDeskHomeEntry[] = []
  const files = new Map<string, string>()
  let commits = 0
  let rollbacks = 0
  const writer: PortableDeskHomeImport = {
    async writeDirectory(entry) {
      written.push(entry)
    },
    async writeFile(entry, bytes) {
      written.push(entry)
      files.set(entry.path, Buffer.from(bytes).toString())
    },
    async writeSymlink(entry) {
      written.push(entry)
    },
    async commit() {
      commits += 1
    },
    async rollback() {
      rollbacks += 1
    },
  }
  const sink: PortableDeskHomeSink = { async begin() { return writer } }
  return { sink, written, files, get commits() { return commits }, get rollbacks() { return rollbacks } }
}

const entries: DeskHomeSourceEntry[] = [
  { path: 'Documents', kind: 'directory', mode: 0o755, modifiedAt: null },
  { path: 'Documents/report.txt', kind: 'file', mode: 0o640, modifiedAt: '2026-08-17T12:00:00.000Z' },
  { path: 'latest.txt', kind: 'symlink', mode: 0o777, modifiedAt: null, target: 'Documents/report.txt' },
]

test('portable desk homes round-trip verified files, directories, and safe symlinks', async () => {
  const archive = await exportPortableDeskHome(source(entries, { 'Documents/report.txt': 'finished work' }), {
    now: () => new Date('2026-08-17T13:00:00.000Z'),
  })
  assert.equal(archive.manifest.totalBytes, 13)
  assert.equal(archive.blobs.size, 1)
  assert.deepEqual(archive.manifest.entries.map((entry) => entry.path), [
    'Documents',
    'latest.txt',
    'Documents/report.txt',
  ])

  const target = memorySink()
  await importPortableDeskHome(archive, target.sink)
  assert.equal(target.commits, 1)
  assert.equal(target.rollbacks, 0)
  assert.equal(target.files.get('Documents/report.txt'), 'finished work')
  assert.deepEqual(target.written.map((entry) => entry.kind), ['directory', 'symlink', 'file'])
})

test('portable desk homes deduplicate identical file bodies', async () => {
  const archive = await exportPortableDeskHome(source([
    { path: 'a.txt', kind: 'file', mode: 0o600, modifiedAt: null },
    { path: 'b.txt', kind: 'file', mode: 0o600, modifiedAt: null },
  ], { 'a.txt': 'same', 'b.txt': 'same' }))
  assert.equal(archive.blobs.size, 1)
  assert.equal(archive.manifest.totalBytes, 8)
})

test('portable desk homes reject path traversal and symlinks outside the home', async () => {
  await assert.rejects(
    exportPortableDeskHome(source([
      { path: '../secret', kind: 'file', mode: 0o600, modifiedAt: null },
    ], { '../secret': 'nope' })),
    /escapes its root/,
  )
  await assert.rejects(
    exportPortableDeskHome(source([
      { path: 'link', kind: 'symlink', mode: 0o777, modifiedAt: null, target: '../../etc/passwd' },
    ], {})),
    /escapes its root/,
  )
})

test('portable desk homes verify content before beginning a replacement', async () => {
  const archive = await exportPortableDeskHome(source(entries, { 'Documents/report.txt': 'finished work' }))
  const [digest] = archive.blobs.keys()
  assert.ok(digest)
  const corrupt: PortableDeskHomeArchive = {
    manifest: archive.manifest,
    blobs: new Map([[digest, Buffer.from('changed')]]),
  }
  let began = false
  const sink: PortableDeskHomeSink = {
    async begin() {
      began = true
      return memorySink().sink.begin(archive.manifest, new AbortController().signal)
    },
  }
  await assert.rejects(importPortableDeskHome(corrupt, sink), /failed content verification/)
  assert.equal(began, false)
})

test('portable desk home import rolls back when a staged write fails', async () => {
  const archive = await exportPortableDeskHome(source(entries, { 'Documents/report.txt': 'finished work' }))
  let rollbacks = 0
  const sink: PortableDeskHomeSink = {
    async begin() {
      return {
        async writeDirectory() {},
        async writeFile() { throw new Error('disk full') },
        async writeSymlink() {},
        async commit() {},
        async rollback() { rollbacks += 1 },
      }
    },
  }
  await assert.rejects(importPortableDeskHome(archive, sink), /disk full/)
  assert.equal(rollbacks, 1)
})
