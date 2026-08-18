/**
 * The typed desk event stream and the ports a consumer supplies.
 *
 * AppKit owns the mechanism of running a desk; the consumer owns the record.
 * Every governed thing that happens on a desk is delivered to `onEvent` as one
 * member of a closed union so the consumer's append-only ledger can persist it
 * without inventing its own taxonomy. Handover boundaries additionally reach
 * the `audit` port — and, while a handover is active, they are the *only*
 * thing that reaches any port. See the masking contract on `DeskPorts`.
 */

export type DeskPointerButton = 'left' | 'middle' | 'right'

export interface DeskPoint {
  x: number
  y: number
}

export interface WindowInfo {
  id: string
  title: string
  appId: string | null
}

/**
 * One node of the focused application's AT-SPI accessibility tree, when the
 * application exposes one. Perception is pixels-primary; the tree is
 * opportunistic and may be `null` at any time.
 */
export interface A11yNode {
  id: string
  role: string
  name: string | null
  actions: readonly string[]
  bounds: { x: number; y: number; width: number; height: number } | null
  children: readonly A11yNode[]
}

/**
 * How the pixels of a live frame are encoded on the wire.
 *
 * Two jobs, two formats. `observe()` is always lossless PNG because it feeds a
 * model's vision and anchors coordinates, and it is asked for rarely. The
 * `frames()` stream feeds a human driving the screen: there the scarce
 * resource is bytes on the transport, not fidelity, so a lossy `jpeg` is
 * roughly an order of magnitude smaller per frame and is what makes a live
 * view feel like a remote desktop rather than a slideshow.
 */
export type DeskFrameFormat = 'png' | 'jpeg'

/**
 * The two kinds of unit a video stream is made of.
 *
 * `init` is the header a decoder needs before it can make sense of anything —
 * for fragmented MP4, `ftyp` plus `moov`. It arrives once per encoder start and
 * a consumer that never receives it decodes nothing at all, silently. `media`
 * is one fragment of pictures. Ordering is load-bearing: init first, then media
 * from a keyframe onwards.
 */
export type DeskVideoChunkKind = 'init' | 'media'

export type DeskHandoverScope = 'view' | 'control'

export type DeskHandoverEndReason = 'ended' | 'expired' | 'revoked'

/**
 * The closed union of recordable desk activity. The consumer's ledger stores
 * these rows; the union is defined here so the mechanism and the record agree
 * on the taxonomy without the package ever touching a database.
 */
export type DeskEventDetail =
  | {
      kind: 'shell_command'
      command: string
      args: readonly string[]
      cwd: string | null
      exitCode: number | null
      signal: string | null
    }
  | { kind: 'app_launch'; appId: string; args: readonly string[] }
  | { kind: 'click'; x: number; y: number; button: DeskPointerButton; clicks: 1 | 2 }
  | { kind: 'type'; text: string }
  | { kind: 'key'; combo: string }
  | { kind: 'scroll'; x: number; y: number; dx: number; dy: number }
  | { kind: 'drag'; from: DeskPoint; to: DeskPoint }
  | { kind: 'window_focus'; window: WindowInfo }
  | { kind: 'screen_open'; width: number; height: number }
  | { kind: 'screen_close' }
  | { kind: 'handover_begin'; actor: string | null; scope: DeskHandoverScope }
  | { kind: 'handover_end'; actor: string | null; durationMs: number }
  | { kind: 'job_start'; jobId: string; command: string; args: readonly string[] }
  | { kind: 'job_exit'; jobId: string; exitCode: number | null; signal: string | null }

export type DeskEventKind = DeskEventDetail['kind']

export type DeskEvent = DeskEventDetail & { deskId: string; at: string }

/**
 * Handover boundaries as the audit port sees them: who took over, under what
 * scope, and for how long — never what they typed.
 */
export type DeskAuditEntry =
  | {
      kind: 'handover_begin'
      deskId: string
      actor: string | null
      scope: DeskHandoverScope
      ttlMs: number
      at: string
    }
  | {
      kind: 'handover_end'
      deskId: string
      actor: string | null
      durationMs: number
      reason: DeskHandoverEndReason
      at: string
    }

/**
 * Consumer-supplied policy. Absent hooks allow: the package is mechanism, and
 * a deployment that wants governance supplies it here. A hook returning
 * `false` makes the corresponding call throw before anything reaches the
 * guest.
 */
export interface DeskPolicyPort {
  allowExec?(request: {
    deskId: string
    command: string
    args: readonly string[]
    keepAlive: boolean
  }): boolean
  allowScreen?(request: { deskId: string; width: number; height: number }): boolean
  allowHandover?(request: {
    deskId: string
    scope: DeskHandoverScope
    ttlMs: number
  }): boolean
}

/**
 * The ports a consumer supplies to `createDeskHost`.
 *
 * Masking contract (load-bearing): while a handover is active, input events —
 * `click`, `type`, `key`, `scroll`, `drag` — and the screen-derived events
 * `window_focus` and `app_launch` never reach `onEvent`, and frames are never
 * emitted to `frames()` consumers. Only `handover_begin` and `handover_end`
 * cross the boundary, carrying actor and duration. Getting this wrong leaks
 * credentials into an append-only record.
 */
export interface DeskPorts {
  policy?: DeskPolicyPort
  onEvent: (event: DeskEvent) => void
  audit: (entry: DeskAuditEntry) => void
}
