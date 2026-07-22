import { Badge, PageHeader } from '@appkit/ui'
import { AttachmentWorkbench } from './workbench'

export const metadata = { title: 'Attachments — appkit' }

export default function AttachmentsPage() {
  return <div className="app-scroll h-full overflow-y-auto">
    <main className="mx-auto max-w-[92rem] space-y-6 px-6 py-8">
      <PageHeader
        title="Attachment workspace"
        description="Upload, search, filter, preview, download, expand, and remove files attached to a record."
        actions={<Badge variant="outline">Database-free demo</Badge>}
      />
      <AttachmentWorkbench />
    </main>
  </div>
}
