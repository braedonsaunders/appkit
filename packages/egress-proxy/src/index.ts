export {
  EgressHostPolicyError,
  isPublicHostname,
  isPublicIpAddress,
  normalizeOutboundHostname,
  resolvePublicUpstream,
  splitHostPort,
  type HostPort,
  type UpstreamAddress,
} from './host-policy'

export {
  headerValue,
  readClientHelloSni,
  readHttpRequestHead,
  type HttpRequestHead,
  type SniffOutcome,
} from './sniff'

export {
  createEgressProxy,
  type CreateEgressProxyOptions,
  type EgressAuditEntry,
  type EgressAuditEvent,
  type EgressDecision,
  type EgressPolicy,
  type EgressPolicyRequest,
  type EgressProtocol,
  type EgressProxyHandle,
  type EgressProxyStats,
} from './proxy'
