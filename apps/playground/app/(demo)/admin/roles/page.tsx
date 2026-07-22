import { PageContainer } from '@appkit/ui'
import { RolesWorkbench } from './workbench'

export const metadata = { title: 'Roles — appkit' }

export default function RolesPage() {
  return <PageContainer className="flex min-h-full flex-col"><RolesWorkbench /></PageContainer>
}
