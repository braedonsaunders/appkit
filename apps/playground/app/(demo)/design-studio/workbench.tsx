'use client'

import * as React from 'react'
import { Eye, RotateCcw } from 'lucide-react'
import {
  createDesignDocument,
  normalizeDesignDocument,
  renderDesignDocumentHtml,
  type DesignData,
  type DesignDocument,
  type DesignFieldCatalog,
} from '@appkit/design-studio'
import { DesignStudioEditor } from '@appkit/design-studio/react'
import { hexColor } from '@appkit/tokens'
import { Button } from '@appkit/ui'

const STORAGE_KEY = 'appkit-demo:design-document:v1'
const theme = {
  primary: hexColor('primary'),
  accent: hexColor('warning'),
  paper: hexColor('surface'),
  ink: hexColor('fg'),
  muted: hexColor('fg-muted'),
  typeface: 'Arial, sans-serif',
}

const catalog: DesignFieldCatalog = {
  fields: [
    { key: 'organization.logo', label: 'Organization logo', group: 'Organization', semanticType: 'image' },
    { key: 'organization.name', label: 'Organization name', group: 'Organization', semanticType: 'text', example: 'Northstar Works' },
    { key: 'project.name', label: 'Project name', group: 'Project', semanticType: 'text', example: 'North Tower' },
    { key: 'project.number', label: 'Project number', group: 'Project', semanticType: 'text', example: 'P-1048' },
    { key: 'project.manager', label: 'Project manager', group: 'Project', semanticType: 'text', example: 'Alex Morgan' },
    { key: 'project.approvedOn', label: 'Approved on', group: 'Project', semanticType: 'date', example: '2026-07-20' },
    { key: 'project.qr', label: 'Project QR code', group: 'Project', semanticType: 'qr' },
  ],
}

const data: DesignData = {
  organization: {
    name: 'Northstar Works',
    logo: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="${theme.primary}"/><path d="M35 76 58 28l8 30h22L62 94l-8-29H35Z" fill="white"/></svg>`),
  },
  project: {
    name: 'North Tower',
    number: 'P-1048',
    manager: 'Alex Morgan',
    approvedOn: '2026-07-20',
    qr: svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="white"/><path d="M10 10h35v35H10zm65 0h35v35H75zM10 75h35v35H10zm52-14h12v12H62zm20 0h28v12H82zM60 82h14v28H60zm22 0h12v12H82zm16 16h12v12H98zM50 10h10v10H50zm0 20h10v20H50zm12 4h9v18h-9zM48 60h10v12H48zm28-10h12v9H76zm18 2h16v8H94zm-46 26h10v12H48zm28-2h9v10H76zm12 14h10v10H88z" fill="black"/><path d="M18 18h19v19H18zm65 0h19v19H83zM18 83h19v19H18z" fill="white"/><path d="M24 24h7v7h-7zm65 0h7v7h-7zM24 89h7v7h-7z" fill="black"/></svg>'),
  },
}

function createInitialDocument(): DesignDocument {
  const document = createDesignDocument({ name: 'Project credential', kind: 'project-credential', format: 'letter-landscape', theme })
  document.artboards[0]!.elements = [
    { id: 'frame', name: 'Frame', kind: 'rect', x: 0.45, y: 0.45, width: 10.1, height: 7.6, fill: 'transparent', stroke: theme.primary, strokeWidth: 0.03, locked: true },
    { id: 'logo', name: 'Organization logo', kind: 'image', field: 'organization.logo', x: 4.75, y: 0.82, width: 1.5, height: 1.5, fit: 'contain', radius: 0.12 },
    { id: 'title', name: 'Title', kind: 'text', text: 'PROJECT AUTHORIZATION', x: 1.2, y: 2.45, width: 8.6, height: 0.7, fontSize: 34, fontWeight: '700', color: theme.primary, align: 'center' },
    { id: 'project', name: 'Project name', kind: 'field', field: 'project.name', fallback: 'Project name', x: 1.3, y: 3.25, width: 8.4, height: 0.7, fontSize: 30, fontWeight: '700', color: theme.ink, align: 'center' },
    { id: 'number', name: 'Project number', kind: 'field', field: 'project.number', prefix: 'Project ', x: 3.8, y: 4.05, width: 3.4, height: 0.35, fontSize: 12, fontWeight: '600', color: theme.muted, align: 'center' },
    { id: 'rule', name: 'Divider', kind: 'line', x: 2.2, y: 4.65, width: 6.6, height: 0.01, fill: 'transparent', stroke: theme.primary, strokeWidth: 0.015 },
    { id: 'manager', name: 'Project manager', kind: 'field', field: 'project.manager', prefix: 'Project manager · ', x: 2.5, y: 5.15, width: 6, height: 0.4, fontSize: 13, fontWeight: '500', color: theme.ink, align: 'center' },
    { id: 'approved', name: 'Approval date', kind: 'field', field: 'project.approvedOn', prefix: 'Approved ', transform: 'date-long', x: 3.25, y: 5.62, width: 4.5, height: 0.35, fontSize: 11, fontWeight: '500', color: theme.muted, align: 'center' },
    { id: 'seal', name: 'Approval seal', kind: 'seal', text: 'NW', x: 1.1, y: 6.35, width: 0.9, height: 0.9, fill: theme.accent, stroke: theme.primary },
    { id: 'qr', name: 'Project QR code', kind: 'qr', field: 'project.qr', x: 9, y: 6.25, width: 1.1, height: 1.1, background: theme.paper, foreground: theme.ink },
  ]
  return document
}

export function DesignWorkbench() {
  const fallback = React.useMemo(createInitialDocument, [])
  const [document, setDocument] = React.useState(fallback)

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) setDocument(normalizeDesignDocument(JSON.parse(stored), fallback))
    } catch {
      // The current editor remains usable when browser storage is unavailable.
    }
  }, [fallback])

  function update(next: DesignDocument) {
    setDocument(next)
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* Keep the in-memory edit. */ }
  }

  function reset() {
    const next = createInitialDocument()
    setDocument(next)
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* Keep the reset in memory. */ }
  }

  function preview() {
    const blob = new Blob([renderDesignDocumentHtml(document, data)], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return <DesignStudioEditor
    document={document}
    onChange={update}
    catalog={catalog}
    data={data}
    theme={theme}
    actions={<><Button type="button" variant="outline" size="sm" onClick={reset}><RotateCcw size={14} />Reset</Button><Button type="button" variant="outline" size="sm" onClick={preview}><Eye size={14} />Preview output</Button></>}
  />
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
