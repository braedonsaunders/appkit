# @braedonsaunders/appkit-viewspec

## 0.2.0

### Minor Changes

- 50998f0: A closed, declarative page-composition language, so a page can be data an application stores rather than code it ships.

  A template language given to tenants or agents becomes an execution surface, and everything after that is damage control: sandboxes, allow-lists, escaping rules, a review queue. This language is closed instead. A spec names blocks and binds fields that the page's loader has **already resolved** — it holds no conditionals, no arithmetic, no string building, no function values, no component references and no capability objects. A field reference is a dot path and nothing else, guarded against `__proto__`, `constructor` and `prototype`. The result is that storing a layout somebody else wrote and rendering it is an ordinary thing to do: the worst a bad one can express is a rearrangement of data its reader was already entitled to see.

  The shape of that constraint decides how pages get written. `when` omits a block; it cannot choose between two, so a conditional pair is a component and two mutually exclusive bodies are two complementary loader flags. Anything needing a bound action, an identity, a tenant id or rendered children is a host slot that re-derives them from the session, never a prop threaded through the document.

  `validateSpec` parses an untrusted document and hands back the typed `PageSpec` on success rather than a bare `{ ok, errors }` — the point of validating is to stop holding `unknown`, and a shape that makes callers check and then cast the same raw value is how a validated-then-ignored document gets through. It fails closed, reports every error with a path, and walks raw nesting depth **before** parsing, because a deeply nested document takes a recursive Zod union exponential time to reject (a twelve-deep spec cost 8 seconds; the pre-parse walk made it 0.04ms).

  A field path is refused at BOTH ends. `resolvePath` has always rejected `__proto__`, `constructor` and `prototype`, and that guard is the one that must never be removed — it holds for callers that skip validation, which a compiled spec does. The schema now rejects them as well, because catching a poisoned path only at resolution means it can be stored and then throws for every reader who opens that page; refusing it at the edge tells whoever wrote it, once, while they are still looking at it.

  The renderer is the host's. This package is the language, the schema, the typed builders and the resolver: zod is its only dependency.
