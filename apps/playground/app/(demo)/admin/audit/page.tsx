import { PageContainer } from '@appkit/ui'
import { AuditWorkbench } from './workbench'

export const metadata = { title: 'Audit log — appkit' }

export default function AuditPage() {
  return <PageContainer className="flex min-h-full flex-col"><AuditWorkbench /></PageContainer>
}
