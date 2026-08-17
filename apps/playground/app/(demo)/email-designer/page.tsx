import { PageHeader } from '@braedonsaunders/ui'
import { EmailWorkbench } from './workbench'

export const metadata = { title: 'Email designer — appkit' }

export default function EmailDesignerPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-6">
      <PageHeader
        title="Email designer"
        description="Author a message or a signature from email-safe blocks, drop in merge fields and repeating tables, and see the compiled output render."
      />
      <div className="min-h-0 flex-1">
        <EmailWorkbench />
      </div>
    </div>
  )
}
