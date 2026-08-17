'use client'

import { AuditAdmin } from '@braedonsaunders/iam/react'
import { demoIamClient } from '../../../../lib/demo-iam-client'

export function AuditWorkbench() {
  return <AuditAdmin service={demoIamClient} />
}
