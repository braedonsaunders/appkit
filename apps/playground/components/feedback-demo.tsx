'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import {
  createMemoryIssuePublisher,
  createScriptedFeedbackClient,
  type MemoryIssueRecord,
} from '@braedonsaunders/appkit-feedback'
import {
  FeedbackLauncher,
  FeedbackSettingsForm,
  type FeedbackSettingsValue,
} from '@braedonsaunders/appkit-feedback/react'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@braedonsaunders/appkit-ui'

const HELP = [
  {
    id: 'nav',
    title: 'Change the menu layout',
    url: '/admin/settings',
    excerpt: 'Open the account menu and choose Menu layout to switch between the top bar and the sidebar.',
    body: 'Open the account menu. Choose Menu layout. Pick Top bar or Sidebar.',
  },
]

const knowledge = {
  async search(query: string) {
    const needle = query.toLowerCase()
    return HELP.filter((article) => `${article.title} ${article.body} ${article.excerpt}`.toLowerCase().includes(needle) || /how|menu|sidebar|navigation/.test(needle))
      .map(({ id, title, url, excerpt }) => ({ id, title, url, excerpt }))
  },
  async read(id: string) {
    const article = HELP.find((item) => item.id === id)
    return article ? { title: article.title, url: article.url, body: article.body } : null
  },
}

const memory = createMemoryIssuePublisher()
const publisher = {
  records: memory.records,
  searchOpen: memory.searchOpen?.bind(memory),
  async create(draft: Parameters<typeof memory.create>[0]) {
    const issue = await memory.create(draft)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('appkit-feedback-records'))
    return issue
  },
}
const client = createScriptedFeedbackClient({
  knowledge,
  publisher,
  defaultLabels: ['feedback'],
})

function useFiledRecords(): MemoryIssueRecord[] {
  const [records, setRecords] = React.useState<MemoryIssueRecord[]>([...publisher.records])
  React.useEffect(() => {
    function refresh() {
      setRecords([...publisher.records])
    }
    window.addEventListener('appkit-feedback-records', refresh)
    return () => window.removeEventListener('appkit-feedback-records', refresh)
  }, [])
  return records
}

export function FeedbackPlaygroundLauncher() {
  const pathname = usePathname()
  return <FeedbackLauncher client={client} context={{ pathname, pageTitle: 'Playground', appVersion: 'demo' }} />
}

export function FeedbackPackageDemo() {
  const [settings, setSettings] = React.useState<FeedbackSettingsValue>({
    enabled: true,
    owner: 'acme',
    repo: 'product',
    token: '',
    hasToken: true,
    labels: 'feedback',
    searchDuplicates: true,
  })
  const records = useFiledRecords()
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Header control</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <FeedbackLauncher client={client} context={{ pathname, pageTitle: 'Feedback demo', appVersion: 'demo' }} />
          <p className="text-sm text-fg-muted">
            The same control sits in the playground header. Try “How do I change the menu layout?” or describe a broken save button.
          </p>
        </CardContent>
      </Card>

      <FeedbackSettingsForm
        value={settings}
        onChange={setSettings}
        onSave={async (next) => {
          setSettings(next)
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Filed drafts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.length === 0 ? (
            <p className="text-sm text-fg-muted">No issues have been filed in this session.</p>
          ) : records.map((record) => (
            <div key={record.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-fg">#{record.number} {record.title}</p>
                {record.labels.map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-fg-muted">{record.body}</pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
