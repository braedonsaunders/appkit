import { PageContainer } from '@appkitjs/ui'
import { UsersWorkbench } from './workbench'

export const metadata = { title: 'Users — appkit' }

export default function UsersPage() {
  return <PageContainer className="flex min-h-full flex-col"><UsersWorkbench /></PageContainer>
}
