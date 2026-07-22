import type { DestinationAuthoringDefinition } from '@appkit/integrations'
import { slackDestination } from '@appkit/integrations/chat'
import { emailDestinationAuthoring } from '@appkit/integrations/email'
import { httpDestination } from '@appkit/integrations/http'
import { sheetsDestination } from '@appkit/integrations/sheets'
import { sqlDestination } from '@appkit/integrations/sql'
import { IntegrationsWorkbench } from './workbench'

const destinations: DestinationAuthoringDefinition[] = [
  httpDestination,
  sqlDestination,
  slackDestination,
  sheetsDestination,
  emailDestinationAuthoring,
].map((destination) => ({
  key: destination.key,
  name: destination.name,
  description: destination.description,
  iconKey: destination.iconKey,
  mappingKind: destination.mappingKind,
  configFields: [...destination.configFields].map((field) => ({
    ...field,
    ...('options' in field && field.options
      ? { options: [...field.options] }
      : {}),
  })),
  secretFields: [...destination.secretFields].map((field) => ({ ...field })),
  reversible: destination.reversible,
}))

export default function IntegrationsPage() {
  return <IntegrationsWorkbench destinations={destinations} />
}
