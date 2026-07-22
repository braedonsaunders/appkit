import { createIamHttpHandler } from '@appkit/iam/http'
import { getDemoIamService } from '../../../../lib/server/iam'

/**
 * The public playground deliberately disables authentication. The explicit
 * no-op gate keeps that demo policy visible while the reusable handler requires
 * every real application to supply authorization.
 */
const handler = createIamHttpHandler({
  authorize: async () => {},
  resolveService: getDemoIamService,
})

export const POST = handler
