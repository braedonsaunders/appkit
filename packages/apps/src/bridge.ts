export const BRIDGE_MARKER = '__appkit' as const
export const BRIDGE_METHODS = ['callBackend', 'records.list', 'records.get'] as const
export type BridgeMethod = (typeof BRIDGE_METHODS)[number]

export interface BridgeContext {
  app: { id: string; key: string; name: string; version: string }
  user: { id: string; name: string; role?: string } | null
  tenant?: { id: string; name: string }
}

export interface BridgeRequest {
  [BRIDGE_MARKER]: true
  type: 'call'
  id: string
  method: string
  payload: unknown
}

export interface BridgeResult {
  [BRIDGE_MARKER]: true
  type: 'result'
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

export const APP_CSP = "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"

export function parseBridgeRequest(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  if (value[BRIDGE_MARKER] !== true || value.type !== 'call' || typeof value.id !== 'string' || typeof value.method !== 'string') return null
  return { [BRIDGE_MARKER]: true, type: 'call', id: value.id, method: value.method, payload: value.payload }
}

export function makeBridgeResult(id: string, ok: boolean, value: unknown): BridgeResult {
  return ok
    ? { [BRIDGE_MARKER]: true, type: 'result', id, ok, result: value }
    : { [BRIDGE_MARKER]: true, type: 'result', id, ok, error: String(value) }
}

export function isBridgeMethod(method: string): method is BridgeMethod {
  return (BRIDGE_METHODS as readonly string[]).includes(method)
}

/** Source for the promise-based SDK injected into the opaque-origin iframe. */
export function bridgeClientSource(context: BridgeContext, globalName = 'appkit'): string {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(globalName)) throw new Error('bridge global name must be an identifier')
  return `(function(){
  var CTX=${safeJson(context)}, pending={}, seq=0;
  window.addEventListener('message',function(e){
    if(e.source!==window.parent)return;
    var d=e.data;if(!d||d['${BRIDGE_MARKER}']!==true||d.type!=='result')return;
    var p=pending[d.id];if(!p)return;delete pending[d.id];
    if(d.ok)p.resolve(d.result);else p.reject(new Error(d.error||'bridge error'));
  });
  function call(method,payload){return new Promise(function(resolve,reject){
    var id='c'+(++seq);pending[id]={resolve:resolve,reject:reject};
    window.parent.postMessage({'${BRIDGE_MARKER}':true,type:'call',id:id,method:method,payload:payload},'*');
  });}
  window.${globalName}={
    context:CTX,getContext:function(){return Promise.resolve(CTX);},
    callBackend:function(endpoint,payload){return call('callBackend',{endpoint:endpoint,payload:payload});},
    records:{
      list:function(typeKey,filters){return call('records.list',{typeKey:typeKey,filters:filters||{}});},
      get:function(typeKey,id){return call('records.get',{typeKey:typeKey,id:id});}
    }
  };
  window.parent.postMessage({'${BRIDGE_MARKER}':true,type:'ready'},'*');
})();`
}

export function inlineDocument(entryHtml: string, replacements: Record<string, string>, headHtml: string): string {
  let html = entryHtml
  for (const [path, url] of Object.entries(replacements)) {
    for (const variant of [path, `./${path}`, `/${path}`]) {
      html = html.split(`"${variant}"`).join(`"${url}"`)
      html = html.split(`'${variant}'`).join(`'${url}'`)
    }
  }
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => match + headHtml)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${headHtml}</head>`)
  return headHtml + html
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
}
