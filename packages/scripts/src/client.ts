'use client'

export interface DeliveredClientScript {
  id: string
  name: string
  source: string
}

export interface ClientScriptGate {
  ok: boolean
  reason?: string
  warnings: string[]
}

export interface ClientScriptEvaluation {
  id: string
  name: string
  result?: unknown
  error?: string
}

export interface ClientScriptRunner {
  run(subjectType: string, value: unknown): Promise<ClientScriptGate>
  invalidate(subjectType?: string): void
}

const MARKER = '__appkitClientScripts'
const DEFAULT_TIMEOUT_MS = 2_000

/**
 * Browser form hooks use a throwaway opaque-origin iframe. Failures fail open;
 * only an explicit `{ abort: string }` blocks the host save.
 */
export function createClientScriptRunner(options: {
  loadScripts: (subjectType: string) => Promise<DeliveredClientScript[]>
  timeoutMs?: number
  cacheMs?: number
  onError?: (message: string, error?: unknown) => void
}): ClientScriptRunner {
  const cache = new Map<string, { at: number; scripts: DeliveredClientScript[] }>()
  const cacheMs = options.cacheMs ?? 30_000
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return {
    async run(subjectType, value) {
      let scripts: DeliveredClientScript[]
      const cached = cache.get(subjectType)
      if (cached && Date.now() - cached.at < cacheMs) scripts = cached.scripts
      else {
        try {
          scripts = await options.loadScripts(subjectType)
          cache.set(subjectType, { at: Date.now(), scripts })
        } catch (error) {
          options.onError?.('client script delivery failed; save proceeds', error)
          return { ok: true, warnings: [] }
        }
      }
      if (!scripts.length) return { ok: true, warnings: [] }
      const results = await runInOpaqueFrame(scripts, { subjectType, value }, timeoutMs)
      if (!results) {
        options.onError?.('client script evaluator timed out; save proceeds')
        return { ok: true, warnings: [] }
      }
      return evaluateClientResults(results, options.onError)
    },
    invalidate(subjectType) {
      if (subjectType) cache.delete(subjectType)
      else cache.clear()
    },
  }
}

export function evaluateClientResults(results: ClientScriptEvaluation[], onError?: (message: string, error?: unknown) => void): ClientScriptGate {
  const warnings: string[] = []
  for (const evaluation of results) {
    if (evaluation.error) {
      onError?.(`client script "${evaluation.name}" failed`, evaluation.error)
      continue
    }
    const result = isRecord(evaluation.result) ? evaluation.result : null
    if (result && typeof result.abort === 'string' && result.abort) return { ok: false, reason: `${evaluation.name}: ${result.abort}`, warnings }
    if (result && Array.isArray(result.warnings)) {
      for (const warning of result.warnings) if (typeof warning === 'string') warnings.push(`${evaluation.name}: ${warning}`)
    }
  }
  return { ok: true, warnings }
}

function runInOpaqueFrame(scripts: DeliveredClientScript[], context: unknown, timeoutMs: number): Promise<ClientScriptEvaluation[] | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.hidden = true
    iframe.srcdoc = evaluatorDocument()
    let complete = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: ClientScriptEvaluation[] | null) => {
      if (complete) return
      complete = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('message', receive)
      iframe.remove()
      resolve(value)
    }
    function receive(event: MessageEvent) {
      if (event.source !== iframe.contentWindow || !isRecord(event.data) || event.data[MARKER] !== true) return
      if (event.data.ready === true) { iframe.contentWindow?.postMessage({ scripts, context }, '*'); return }
      if (Array.isArray(event.data.results)) finish(event.data.results as ClientScriptEvaluation[])
    }
    window.addEventListener('message', receive)
    document.body.appendChild(iframe)
    timer = setTimeout(() => finish(null), Math.max(100, Math.min(timeoutMs, 10_000)))
  })
}

function evaluatorDocument(): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'"></head><body><script>
window.addEventListener('message',function(e){
  if(e.source!==window.parent)return;
  var scripts=e.data&&e.data.scripts,context=e.data&&e.data.context,out=[];
  if(!Array.isArray(scripts))return;
  for(var i=0;i<scripts.length;i++){
    var script=scripts[i];
    try{
      var fn=new Function('ctx',script.source+'\\n;if(typeof main!=="function")throw new Error("script must define function main(ctx)");return main(ctx);');
      var value=fn(context);out.push({id:script.id,name:script.name,result:value===undefined?null:value});
    }catch(error){out.push({id:script.id,name:script.name,error:String(error&&error.message||error)});}
  }
  window.parent.postMessage({${MARKER}:true,results:out},'*');
});
window.parent.postMessage({${MARKER}:true,ready:true},'*');
</script></body></html>`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
