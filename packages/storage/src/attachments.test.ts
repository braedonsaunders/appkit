import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListNavProvider } from '@appkit/ui'
import { AttachmentPanel } from './attachment-panel'
import { createMemoryAttachmentAdapter } from './attachments-memory'
import {
  attachmentGroup,
  createHttpAttachmentAdapter,
  formatAttachmentSize,
  isPreviewableAttachment,
  type AttachedFile,
} from './attachments'

const target = { targetTable: 'records', targetId: 'record-1' }
const image: AttachedFile = {
  id: 'file-1',
  attachmentId: 'attachment-1',
  name: 'evidence.png',
  fileType: 'png',
  contentType: 'image/png',
  sizeBytes: 2048,
  createdAt: '2026-07-21T12:00:00.000Z',
  createdBy: 'user-1',
}

test('classifies, previews, and formats attachment metadata like the source workspace', () => {
  assert.equal(attachmentGroup(image), 'image')
  assert.equal(isPreviewableAttachment(image), true)
  assert.equal(attachmentGroup({ contentType: 'application/pdf' }), 'pdf')
  assert.equal(attachmentGroup({ contentType: 'text/csv' }), 'other')
  assert.equal(formatAttachmentSize(512), '512 B')
  assert.equal(formatAttachmentSize(2048), '2 KB')
  assert.equal(formatAttachmentSize(1_572_864), '1.5 MB')
})

test('memory adapter provides a complete database-free list/upload/remove lifecycle', async () => {
  const revoked: string[] = []
  const adapter = createMemoryAttachmentAdapter({
    seed: [{ target, attachment: image, url: 'data:image/png;base64,seed' }],
    createId: () => 'file-2',
    now: () => new Date('2026-07-22T09:30:00.000Z'),
    createdBy: 'user-2',
    createObjectUrl: () => 'blob:upload',
    revokeObjectUrl: (url) => revoked.push(url),
  })
  assert.deepEqual(await adapter.list(target), [image])
  const uploaded = await adapter.upload(target, new File(['hello'], 'notes.txt', { type: 'text/plain' }))
  assert.equal(uploaded.id, 'file-2')
  assert.equal(uploaded.createdBy, 'user-2')
  assert.equal(adapter.url(uploaded, 'download'), 'blob:upload')
  assert.equal((await adapter.list(target)).length, 2)
  await adapter.remove(target, uploaded)
  assert.deepEqual(revoked, ['blob:upload'])
  assert.deepEqual(await adapter.list(target), [image])
  adapter.dispose?.()
})

test('HTTP adapter retains the production route and response contract', async () => {
  const calls: { url: string; method: string }[] = []
  const responses = [
    Response.json({ attachments: [image] }),
    Response.json({ attachment: image }),
    new Response(null, { status: 204 }),
  ]
  const adapter = createHttpAttachmentAdapter({
    collectionUrl: '/api/attachments',
    fileUrl: (attachment, intent) => `/api/files/${attachment.id}?intent=${intent}`,
    fetcher: async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' })
      return responses.shift() ?? new Response(null, { status: 500 })
    },
  })
  assert.deepEqual(await adapter.list(target), [image])
  assert.equal((await adapter.upload(target, new File(['x'], 'evidence.png', { type: 'image/png' }))).id, image.id)
  await adapter.remove(target, image)
  assert.deepEqual(calls, [
    { url: '/api/attachments?targetTable=records&targetId=record-1', method: 'GET' },
    { url: '/api/attachments', method: 'POST' },
    { url: '/api/attachments/attachment-1', method: 'DELETE' },
  ])
  assert.equal(adapter.url(image, 'preview'), '/api/files/file-1?intent=preview')
})

test('attachment workspace renders the source two-pane loading shell through the React entrypoint', () => {
  const adapter = createMemoryAttachmentAdapter({ seed: [{ target, attachment: image, url: 'data:image/png;base64,seed' }] })
  const markup = renderToStaticMarkup(React.createElement(ListNavProvider, {
    value: { pathname: '/records/1', search: '', replace() {}, push() {} },
    children: React.createElement(AttachmentPanel, {
      ...target,
      canEdit: true,
      adapter,
    }),
  }))
  assert.match(markup, /Attachments/)
  assert.match(markup, /Add files/)
  assert.match(markup, /Search attachments/)
  assert.match(markup, /Loading/)
  assert.match(markup, /Select a file to preview/)
})
