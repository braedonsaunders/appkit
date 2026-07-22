'use client'

// Production per-device Web Push enrollment surface. Browser/OS capability,
// iOS Home Screen requirements, permission state, subscription persistence,
// testing, expiry cleanup, and disable behavior are all retained. The host
// injects authenticated persistence and delivery actions.

import * as React from 'react'
import { BellOff, BellRing, Check, Loader2, RotateCw, Send, Share, Smartphone } from 'lucide-react'
import { Button, cn, toast } from '@appkit/ui'

export type PushDeviceAdapter = {
  save(input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }): Promise<void>
  remove(input: { endpoint: string }): Promise<void>
  test(): Promise<{ sent: number }>
}

export type PushDeviceCopy = {
  title: string
  enabled: string
  loading: string
  unsupported: string
  iosInstall: string
  blocked: string
  idle: string
  subscribed: string
  missingKey: string
  permissionDenied: string
  invalidSubscription: string
  subscribeFailed: string
  enabledMessage: string
  disabledMessage: string
  disableFailed: string
  testSent: (count: number) => string
  enable: string
  disable: string
  test: string
  retry: string
  iosSteps: [string, string, string]
}

const DEFAULT_COPY: PushDeviceCopy = {
  title: 'Push notifications on this device', enabled: 'Enabled', loading: 'Checking notification status on this device…', unsupported: "This browser doesn't support push notifications.", iosInstall: 'iOS delivers push notifications only to apps added to the Home Screen.', blocked: 'Notifications are blocked for this site. Enable them in your browser or system settings, then reload this page.', idle: 'Receive alerts on this device even when the application is not open.', subscribed: 'This device receives push notifications, routed by the category choices below.', missingKey: 'Push is not configured on this server.', permissionDenied: 'Notifications are blocked for this site.', invalidSubscription: 'The browser returned an incomplete push subscription.', subscribeFailed: 'Push notifications could not be enabled on this device.', enabledMessage: 'Push notifications enabled.', disabledMessage: 'Push notifications disabled.', disableFailed: 'Push notifications could not be disabled.', testSent: (count) => `Test notification sent to ${count} device${count === 1 ? '' : 's'}.`, enable: 'Enable push', disable: 'Disable', test: 'Send test', retry: 'Check again', iosSteps: ['Open the browser Share menu.', 'Choose Add to Home Screen.', 'Open the installed application and return to this page.'],
}

type Status = 'loading' | 'unsupported' | 'ios-install' | 'blocked' | 'idle' | 'subscribed'

export function PushDeviceNotifications({ vapidPublicKey, adapter, copy: copyOverride, className }: { vapidPublicKey: string | null; adapter: PushDeviceAdapter; copy?: Partial<PushDeviceCopy>; className?: string }) {
  const copy = { ...DEFAULT_COPY, ...copyOverride }
  const [status, setStatus] = React.useState<Status>('loading')
  const [busy, setBusy] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    async function detect() {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      if (!supported) { if (!cancelled) setStatus(isIos() && !isStandalone() ? 'ios-install' : 'unsupported'); return }
      if (Notification.permission === 'denied') { if (!cancelled) setStatus('blocked'); return }
      try { const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); if (!cancelled) setStatus(subscription ? 'subscribed' : 'idle') }
      catch { if (!cancelled) setStatus('idle') }
    }
    void detect()
    return () => { cancelled = true }
  }, [])
  async function enable() {
    if (!vapidPublicKey) { toast.error(copy.missingKey); return }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'blocked' : 'idle'); if (permission === 'denied') toast.error(copy.permissionDenied); return }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
      const value = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) { await subscription.unsubscribe().catch(() => undefined); toast.error(copy.invalidSubscription); return }
      try { await adapter.save({ endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth, userAgent: navigator.userAgent.slice(0, 512) }) }
      catch (error) { await subscription.unsubscribe().catch(() => undefined); throw error }
      setStatus('subscribed'); toast.success(copy.enabledMessage)
    } catch (error) { console.warn('[push] subscribe failed', error); toast.error(error instanceof Error ? error.message : copy.subscribeFailed) }
    finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true)
    try { const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); const endpoint = subscription?.endpoint; if (subscription) await subscription.unsubscribe().catch(() => undefined); if (endpoint) await adapter.remove({ endpoint }); setStatus('idle'); toast.success(copy.disabledMessage) }
    catch (error) { console.warn('[push] unsubscribe failed', error); toast.error(error instanceof Error ? error.message : copy.disableFailed) }
    finally { setBusy(false) }
  }
  async function test() {
    setTesting(true)
    try { const result = await adapter.test(); toast.success(copy.testSent(result.sent)) }
    catch (error) { toast.error(error instanceof Error ? error.message : copy.subscribeFailed) }
    finally { setTesting(false) }
  }
  const descriptions: Record<Status, string> = { loading: copy.loading, unsupported: copy.unsupported, 'ios-install': copy.iosInstall, blocked: copy.blocked, idle: copy.idle, subscribed: copy.subscribed }
  return <section className={cn('rounded-lg border border-border bg-surface p-4 shadow-sm', className)}><div className="flex items-start gap-3"><div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-fg-muted">{status === 'ios-install' ? <Smartphone size={18} /> : <BellRing size={18} />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-medium text-fg">{copy.title}</h3>{status === 'subscribed' ? <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium text-success"><Check size={11} />{copy.enabled}</span> : null}</div><p className="mt-0.5 text-sm text-fg-muted">{descriptions[status]}</p>{status === 'ios-install' ? <ol className="mt-3 space-y-1.5 text-sm text-fg-muted">{copy.iosSteps.map((step, index) => <li key={step} className="flex items-center gap-2"><span className="text-fg-subtle">{index + 1}.</span>{step}{index === 0 ? <Share size={15} className="text-fg-subtle" /> : null}</li>)}</ol> : null}{status === 'idle' ? <div className="mt-3"><Button type="button" onClick={() => void enable()} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}{copy.enable}</Button></div> : null}{status === 'subscribed' ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={() => void test()} disabled={testing || busy}>{testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{copy.test}</Button><Button type="button" variant="outline" onClick={() => void disable()} disabled={busy || testing}>{busy ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}{copy.disable}</Button></div> : null}{status === 'blocked' ? <div className="mt-3"><Button type="button" variant="outline" onClick={() => window.location.reload()}><RotateCw size={14} />{copy.retry}</Button></div> : null}</div></div></section>
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

function isIos(): boolean { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) }
function isStandalone(): boolean { return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true }
