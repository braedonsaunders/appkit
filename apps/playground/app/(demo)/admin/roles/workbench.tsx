'use client'

import { RolesAdmin } from '@appkit/iam/react'
import { DEMO_PERMISSION_GROUPS } from '../../../../lib/demo-iam'
import { demoIamClient } from '../../../../lib/demo-iam-client'

export function RolesWorkbench() {
  return (
    <RolesAdmin
      service={demoIamClient}
      permissionGroups={DEMO_PERMISSION_GROUPS}
      scopeOptions={{
        sites: [{ value: 'site-east', label: 'East site' }, { value: 'site-west', label: 'West site' }],
        departments: [{ value: 'operations', label: 'Operations' }, { value: 'finance', label: 'Finance' }],
        groups: [{ value: 'supervisors', label: 'Supervisors' }, { value: 'field-team', label: 'Field team' }],
        people: [{ value: 'member-2', label: 'Casey Grant' }, { value: 'member-3', label: 'Jordan Lee' }],
        crews: [{ value: 'crew-a', label: 'Crew A' }, { value: 'crew-b', label: 'Crew B' }],
      }}
    />
  )
}
