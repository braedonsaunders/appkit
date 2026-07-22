'use client'

import { AuditAdmin } from '@appkit/iam/react'
import { demoIamService } from '../../../../lib/demo-iam'

export function AuditWorkbench() {
  return <AuditAdmin service={demoIamService} />
}
