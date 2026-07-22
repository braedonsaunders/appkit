'use client'

import * as React from 'react'
import { createMemoryAttachmentAdapter, type MemoryAttachmentSeed } from '@appkit/storage/memory'
import { AttachmentPanel } from '@appkit/storage/react'

const TARGET = { targetTable: 'projects', targetId: 'project-demo' }
const PDF_URL = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA2NSA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDcyIDcwMCBUZCAoQXBwS2l0IGF0dGFjaG1lbnQgcHJldmlldykgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNDcgMDAwMDAgbiAKdHJhaWxlciA8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MTcKJSVFT0Y='

const SEED: MemoryAttachmentSeed[] = [
  seeded('file-1', 'workspace-plan.svg', 'image/svg+xml', 184_230, '2026-07-21T15:42:00.000Z', diagramUrl('Workspace plan', ['Identity', 'Workflows', 'Reports'])),
  seeded('file-2', 'launch-checklist.pdf', 'application/pdf', 428_120, '2026-07-21T13:20:00.000Z', PDF_URL),
  seeded('file-3', 'import-template.csv', 'text/csv', 18_402, '2026-07-20T17:08:00.000Z', 'data:text/csv;charset=utf-8,name%2Cstatus%0AExample%2Cready'),
  seeded('file-4', 'architecture.svg', 'image/svg+xml', 263_881, '2026-07-20T11:30:00.000Z', diagramUrl('Application architecture', ['Interface', 'Runtime', 'Adapters'])),
  seeded('file-5', 'rollout-plan.pdf', 'application/pdf', 516_920, '2026-07-19T16:10:00.000Z', PDF_URL),
  seeded('file-6', 'implementation-notes.txt', 'text/plain', 8_190, '2026-07-18T10:45:00.000Z', 'data:text/plain;charset=utf-8,Implementation%20notes'),
  seeded('file-7', 'access-review.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 92_810, '2026-07-17T09:05:00.000Z', 'data:application/octet-stream;base64,AA=='),
  seeded('file-8', 'budget-model.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 144_200, '2026-07-16T14:15:00.000Z', 'data:application/octet-stream;base64,AA=='),
]

export function AttachmentWorkbench() {
  const adapter = React.useMemo(() => createMemoryAttachmentAdapter({
    seed: SEED,
    createdBy: 'Ada Lovelace',
  }), [])
  React.useEffect(() => () => adapter.dispose?.(), [adapter])
  return <AttachmentPanel
    {...TARGET}
    adapter={adapter}
    canEdit
    pageSize={4}
    initialSelectedId="file-1"
  />
}

function seeded(
  id: string,
  name: string,
  contentType: string,
  sizeBytes: number,
  createdAt: string,
  url: string,
): MemoryAttachmentSeed {
  return {
    target: TARGET,
    url,
    attachment: {
      id,
      attachmentId: `attachment-${id}`,
      name,
      fileType: name.split('.').pop() ?? '',
      contentType,
      sizeBytes,
      createdAt,
      createdBy: 'Ada Lovelace',
    },
  }
}

function diagramUrl(title: string, lanes: string[]): string {
  const laneMarkup = lanes.map((lane, index) => `<g transform="translate(${60 + index * 230} 220)"><rect width="190" height="110" rx="18" fill="Canvas" stroke="Highlight" stroke-width="3"/><text x="95" y="62" text-anchor="middle" fill="CanvasText" font-family="system-ui" font-size="19" font-weight="650">${lane}</text></g>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520" style="color-scheme:light dark"><rect width="800" height="520" rx="28" fill="Canvas"/><rect x="28" y="28" width="744" height="464" rx="22" fill="Canvas" stroke="GrayText" stroke-opacity=".35"/><text x="60" y="110" fill="CanvasText" font-family="system-ui" font-size="36" font-weight="700">${title}</text><text x="60" y="150" fill="GrayText" font-family="system-ui" font-size="18">Attached design reference</text>${laneMarkup}<path d="M250 275h38M480 275h38" stroke="Highlight" stroke-width="4" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
