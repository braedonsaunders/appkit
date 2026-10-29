import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertPinnedTemplateMemory, pinTemplateMemory } from './template-source'

test('pins a single read-only inode and publishes independent metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-template-'))
  try {
    const source = join(root, 'source')
    await mkdir(source)
    await writeFile(join(source, 'memory-ranges'), 'memory')
    await chmod(join(source, 'memory-ranges'), 0o400)
    await writeFile(join(source, 'state.json'), 'state')
    const child = join(root, 'child')
    await pinTemplateMemory(source, child, { disk: '/child.raw' })
    await assertPinnedTemplateMemory(source, child)
    const [a, b] = await Promise.all([stat(join(source, 'memory-ranges')), stat(join(child, 'memory-ranges'))])
    assert.equal(a.ino, b.ino)
    assert.equal(a.dev, b.dev)
    await writeFile(join(child, 'state.json'), 'changed')
    assert.equal(await readFile(join(source, 'state.json'), 'utf8'), 'state')
    await assert.rejects(pinTemplateMemory(source, child, {}), /EEXIST/)
    assert.equal(await readFile(join(child, 'config.json'), 'utf8'), '{"disk":"/child.raw"}')
    await rm(join(source, 'memory-ranges'))
    assert.equal(await readFile(join(child, 'memory-ranges'), 'utf8'), 'memory')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects writable, incomplete and unrelated memory sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desk-template-'))
  try {
    const source = join(root, 'source'), child = join(root, 'child')
    await mkdir(source)
    await writeFile(join(source, 'memory-ranges'), 'memory')
    await writeFile(join(source, 'state.json'), 'state')
    await assert.rejects(pinTemplateMemory(source, child, {}), /read-only/)
    await chmod(join(source, 'memory-ranges'), 0o400)
    await mkdir(child)
    await link(join(source, 'memory-ranges'), join(child, 'memory-ranges'))
    await assert.rejects(assertPinnedTemplateMemory(source, child), /ENOENT/)
    await writeFile(join(child, '.complete'), '1\n')
    await rm(join(child, 'memory-ranges'))
    await writeFile(join(child, 'memory-ranges'), 'memory', { mode: 0o400 })
    await assert.rejects(assertPinnedTemplateMemory(source, child), /does not pin/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
