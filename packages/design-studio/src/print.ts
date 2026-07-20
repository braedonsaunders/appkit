import type { DesignDocument, PrintProfile, PrintProvider } from './schema'

export const PRINT_PROVIDERS: { id: PrintProvider; label: string; requiresLocalBridge: boolean }[] = [
  { id: 'browser-pdf', label: 'System print dialog', requiresLocalBridge: false },
  { id: 'cardpresso-wps', label: 'cardPresso Web Print Server', requiresLocalBridge: true },
  { id: 'zebra-browser-print', label: 'Zebra Browser Print', requiresLocalBridge: true },
  { id: 'evolis-sdk', label: 'Evolis SDK', requiresLocalBridge: true },
  { id: 'hid-fargo-sdk', label: 'HID FARGO SDK', requiresLocalBridge: true },
]

export function defaultPrintProfile(media: PrintProfile['media']): PrintProfile { return { provider: 'browser-pdf', media, duplex: media === 'cr80', edgeToEdge: true, orientation: 'landscape' } }
export function directPrintProvider(document: DesignDocument): PrintProvider | null { return document.artboards.find((artboard) => artboard.printProfile?.provider !== 'browser-pdf')?.printProfile?.provider ?? null }
