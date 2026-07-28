import { PageContainer, PageHeader } from '@appkit/ui'
import { AvatarComposerDemo } from '../../../components/avatar-composer-demo'

export const metadata = { title: 'Avatars — AppKit playground' }

/**
 * The @appkit/avatars proof: the real composer and the real renderer over a
 * small synthetic parts library, so the placement model, the head viewport,
 * and both render variants can be exercised without an image provider.
 */
export default function AvatarsDemoPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Avatars"
        description="A parts library composed into one full-body figure. Every portrait in an application is a viewport on that figure — there is no second image."
      />
      <AvatarComposerDemo />
    </PageContainer>
  )
}
