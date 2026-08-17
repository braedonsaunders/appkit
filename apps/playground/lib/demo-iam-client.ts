import { createHttpIamService } from '@appkitjs/iam/http'

/** Same service contract as the durable adapter; the demo intentionally has no auth gate. */
export const demoIamClient = createHttpIamService({ endpoint: '/api/demo/iam' })
