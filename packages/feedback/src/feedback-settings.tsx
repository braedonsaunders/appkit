'use client'

import { Button, Input, SettingsRow, SettingsSection, Switch } from '@braedonsaunders/appkit-ui'
import { mergeFeedbackLabels, type FeedbackLabels } from './labels'

export type FeedbackSettingsValue = {
  enabled: boolean
  owner: string
  repo: string
  token: string
  hasToken: boolean
  labels: string
  searchDuplicates: boolean
}

export type FeedbackSettingsFormProps = {
  value: FeedbackSettingsValue
  onChange: (value: FeedbackSettingsValue) => void
  onSave: (value: FeedbackSettingsValue) => void | Promise<void>
  saving?: boolean
  labels?: Partial<FeedbackLabels>
}

export function FeedbackSettingsForm({
  value,
  onChange,
  onSave,
  saving = false,
  labels: labelOverrides,
}: FeedbackSettingsFormProps) {
  const labels = mergeFeedbackLabels(labelOverrides)

  function patch(partial: Partial<FeedbackSettingsValue>) {
    onChange({ ...value, ...partial })
  }

  return (
    <SettingsSection title={labels.settingsTitle} description={labels.settingsDescription} footer={
      <Button type="button" onClick={() => void onSave(value)} disabled={saving || !value.owner.trim() || !value.repo.trim()}>
        {saving ? labels.saving : labels.save}
      </Button>
    }>
      <SettingsRow title={labels.enabled} description={labels.enabledHelp}>
        <Switch
          checked={value.enabled}
          onChange={(event) => patch({ enabled: event.currentTarget.checked })}
        />
      </SettingsRow>
      <SettingsRow title={labels.owner} stacked>
        <Input value={value.owner} onChange={(event) => patch({ owner: event.target.value })} autoComplete="off" />
      </SettingsRow>
      <SettingsRow title={labels.repo} stacked>
        <Input value={value.repo} onChange={(event) => patch({ repo: event.target.value })} autoComplete="off" />
      </SettingsRow>
      <SettingsRow title={labels.token} description={value.hasToken ? labels.tokenSet : labels.tokenHelp} stacked>
        <Input
          type="password"
          value={value.token}
          onChange={(event) => patch({ token: event.target.value })}
          autoComplete="new-password"
        />
      </SettingsRow>
      <SettingsRow title={labels.labels} description={labels.labelsHelp} stacked>
        <Input value={value.labels} onChange={(event) => patch({ labels: event.target.value })} autoComplete="off" />
      </SettingsRow>
      <SettingsRow title={labels.searchDuplicates} description={labels.searchDuplicatesHelp}>
        <Switch
          checked={value.searchDuplicates}
          onChange={(event) => patch({ searchDuplicates: event.currentTarget.checked })}
        />
      </SettingsRow>
    </SettingsSection>
  )
}
