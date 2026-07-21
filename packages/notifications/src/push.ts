import {
  sendWebPushNotification,
  validateWebPushSubscription,
  validateWebPushSubscriptionForPersistence,
  type WebPushPayload,
  type WebPushVapidDetails,
} from '@appkit/jobs/web-push'

export type PushSubscription = {
  id: string
  tenantId: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export type PushSubscriptionStore = {
  upsert(input: Omit<PushSubscription, 'id'>): Promise<PushSubscription>
  find(input: { tenantId: string; userId: string; subscriptionId: string }): Promise<PushSubscription | null>
  remove(input: { tenantId: string; userId: string; subscriptionId?: string; endpoint?: string }): Promise<void>
}

export type PushDelivery = {
  tenantId: string
  userId: string
  subscriptionId: string
  title: string
  body?: string
  linkPath?: string
}

export async function registerPushSubscription(input: {
  store: PushSubscriptionStore
  tenantId: string
  userId: string
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  userAgent?: string | null
}): Promise<PushSubscription> {
  const validated = await validateWebPushSubscriptionForPersistence(input.subscription)
  return input.store.upsert({
    tenantId: input.tenantId,
    userId: input.userId,
    endpoint: validated.endpoint,
    p256dh: validated.keys.p256dh,
    auth: validated.keys.auth,
    userAgent: input.userAgent,
  })
}

/** Send one retry-safe queued delivery and prune unusable subscriptions. */
export async function processPushDelivery(input: {
  delivery: PushDelivery
  store: PushSubscriptionStore
  vapid: WebPushVapidDetails
  send?: (input: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; payload: WebPushPayload; vapid: WebPushVapidDetails }) => Promise<void>
}): Promise<'sent' | 'missing' | 'pruned'> {
  const { delivery } = input
  const subscription = await input.store.find({ tenantId: delivery.tenantId, userId: delivery.userId, subscriptionId: delivery.subscriptionId })
  if (!subscription) return 'missing'
  let validated
  try {
    validated = validateWebPushSubscription({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } })
  } catch {
    await input.store.remove({ tenantId: delivery.tenantId, userId: delivery.userId, subscriptionId: delivery.subscriptionId })
    return 'pruned'
  }
  try {
    await (input.send ?? sendWebPushNotification)({
      subscription: validated,
      payload: { title: delivery.title, body: delivery.body, linkPath: delivery.linkPath },
      vapid: input.vapid,
    })
    return 'sent'
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await input.store.remove({ tenantId: delivery.tenantId, userId: delivery.userId, subscriptionId: delivery.subscriptionId })
      return 'pruned'
    }
    throw error
  }
}
