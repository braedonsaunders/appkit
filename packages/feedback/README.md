# @braedonsaunders/appkit-feedback

An in-app product issue reporter. The package owns the header control, the
modal, short triage, PII redaction, and a GitHub Issues adapter. The host owns
the model, help source, secrets, persistence, and egress.

This is product-bug reporting, not a helpdesk and not a second assistant. The
person types what went wrong. A scoped agent either answers from host help,
asks at most two questions, or files a generalized issue.

```bash
pnpm add @braedonsaunders/appkit-feedback @braedonsaunders/appkit-ui
```

Import `@braedonsaunders/appkit-feedback/styles.css` beside the AppKit UI
stylesheet so Tailwind scans the React entry.

```tsx
import { createHttpFeedbackClient } from '@braedonsaunders/appkit-feedback'
import { FeedbackLauncher } from '@braedonsaunders/appkit-feedback/react'

const client = createHttpFeedbackClient({ url: '/feedback/turn' })

export function HeaderActions({ pathname }: { pathname: string }) {
  return <FeedbackLauncher client={client} context={{ pathname }} />
}
```

Place `FeedbackLauncher` in `AppShell`'s `header` slot. It works in both topbar
and sidebar navigation because it is chrome, not a nav item.

## Host-owned boundaries

- route authentication and `feedback.use` authorization
- the language model and tenant AI policy
- help search/read tools (manual, docs, status page)
- sealed destination credentials
- outbound HTTP to the issue tracker
- audit and any conversation persistence

The package never fetches the public internet. Pass `request` into
`createGithubIssuePublisher`.

```ts
import { createFeedbackTools, createGithubIssuePublisher, feedbackSystemPrompt } from '@braedonsaunders/appkit-feedback'

const publisher = createGithubIssuePublisher({
  owner,
  repo,
  token,
  labels: ['feedback'],
  request: hostEgressRequest,
})

const tools = createFeedbackTools({
  knowledge: hostHelp,
  publisher,
  context,
  redact: { denyList: [userName, userEmail, tenantName] },
})
```

`submit_issue` redacts emails, phones, record ids, query strings, and the host
deny list before the publisher runs. The model may see the original report; the
filed issue does not.

## Settings

`FeedbackSettingsForm` is a controlled operator form. The host saves. There is
no package-owned table in this version.
