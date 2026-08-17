import type { DestinationAuthoringDefinition } from '@appkitjs/integrations'
import { slackDestination } from '@appkitjs/integrations/chat'
import { emailDestinationAuthoring } from '@appkitjs/integrations/email'
import { httpDestination } from '@appkitjs/integrations/http'
import { sheetsDestination } from '@appkitjs/integrations/sheets'
import { sqlDestination } from '@appkitjs/integrations/sql'
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
