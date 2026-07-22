import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from 'react'

const COPY: Record<string, string> = {
  "m_0027988a09362c": "Location is not available on this device",
  "m_0079038e85c06d": "Remove marker",
  "m_00cfcb628bc131": "Submitting…",
  "m_00ded356f0f424": "s",
  "m_00e704d1194796": "of",
  "m_011434db59926f": "↳ auto-fills",
  "m_013e7516f5d2ac": "severity. Select the cell again to clear.",
  "m_01711e3b6ef4b1": "No concerns",
  "m_01f47383f19f8c": "I",
  "m_020146dd3d3d5a": "Site",
  "m_0289ca8aa7b891": "flags missing PPE + hazards",
  "m_02961df16c552c": "Tap the photo to drop a numbered marker on a hazard.",
  "m_02c65c639b006d": "No matching records.",
  "m_0301e90977d549": "Base",
  "m_030778daefe8eb": "Computed value — recomputed automatically",
  "m_031b307596badd": "Row {value0}",
  "m_033fc0f555f2d1": "likelihood ×",
  "m_03a7728b77e19a": "Add a comment (required on No)",
  "m_03d716fddcdd92": "B",
  "m_03e83706cf8b10": "Analyzing…",
  "m_04b7380779afc4": "Example repeating sections",
  "m_04c0e447e102e8": "This tab has no sections.",
  "m_04f68a7a34cfe6": "No PPE issues or hazards detected.",
  "m_051735b7305b06": "Fix {value0} issue{value1} before continuing",
  "m_051fb158550e48": "Submit failed",
  "m_0535300396f0de": "Re-analyze",
  "m_05829ac350a185": "This entry is {value0}. You don't have permission to edit it.",
  "m_05a0e2d38bded7": "sign here",
  "m_05b9318155a4da": "Decimal places",
  "m_05f4e3346f9aec": "AI-generated — verify before acting.",
  "m_068bf7c4eb45a2": "Add operand",
  "m_071d6ce8114c46": "Select the previous field first…",
  "m_0731204fbd1b17": "Save failed",
  "m_07c67e89962d16": "Preview ·",
  "m_07cd022cc38d60": "Capture location",
  "m_0839e554b28c58": "Loading canvas…",
  "m_08824e0636c702": "Configure a data source…",
  "m_0889ad146e26ca": "Stop",
  "m_08b5fa148b2af7": "Next",
  "m_08ff35b4e882af": "Add rows and a scale to this grid in the element settings.",
  "m_099ccdb4b80d5d": "Type your full name",
  "m_09a3fb77851262": "Separator",
  "m_09ee2ce911f04f": "Submit",
  "m_09f3fc442fedaf": "State / region",
  "m_0a3bcf685192f1": "Saved ✓",
  "m_0a43fb83c91fdf": "Scan or type a code",
  "m_0a8b09bc1dafbb": "Select risk rating",
  "m_0addbe9f7bc1a1": "Back to assessment",
  "m_0b3f2e42d2d097": "Add person…",
  "m_0b4d2076c64fbb": "Replace photo",
  "m_0b628e024bdff1": "Previous",
  "m_0b842b664b4f3b": "Search people…",
  "m_0bae7689763970": "Draft restored — pick up where you left off",
  "m_0bcab596e5288c": "Update location",
  "m_0be39d3a196b5b": "Select a person…",
  "m_0c388e73463aaf": "High-contrast field mode",
  "m_0c726da8b78d42": "No results",
  "m_0c75ca758719d2": "When (condition)",
  "m_0ca96ade46371f": "Add options to rank (Element → Options).",
  "m_0cd6abb2df6fc8": "View only",
  "m_0d0facbd71aa6a": "Type your name to attest",
  "m_0d4127eb7af91b": "Right",
  "m_0d90d1eceb566b": "table",
  "m_0e315ebf127b18": "Review",
  "m_0e65697ec32c03": "Loading…",
  "m_0e6eb1d4f48e48": "Remove element",
  "m_0e814cfafd9944": "· {value0} rows",
  "m_0e96f06e9f8960": "This table has no columns configured.",
  "m_0f20f0bc8118a7": "Save failed — retry",
  "m_0f8706f757eeb9": "City",
  "m_0fe28938af7e45": "Annotate hazards",
  "m_0fec93e95858fc": "Analyze for hazards",
  "m_101f98a70352fa": "Remove {value0}",
  "m_106811f2aac664": "Saving…",
  "m_10e50435ff2693": "+ upload",
  "m_10f4f461b6e849": "Degree (2 = √, 3 = ∛)",
  "m_1129f239fbb89a": "Select…",
  "m_114202332342ab": "{value0} risk",
  "m_119e08753a396f": "No rows yet.",
  "m_1217fe2f6bac7c": "At least {value0} required.",
  "m_126f736e7419f7": "No rows.",
  "m_1287c1049195af": "• List",
  "m_12a3f895c3506c": "Increase",
  "m_12b310a027b08a": "Remove row",
  "m_13a874065f07f8": "Search {value0}s…",
  "m_13b78c61dbb517": "Not saved — retry",
  "m_13c9eb2e75e0da": "Address line 1",
  "m_13e61f4185333d": "Not rated",
  "m_146f7d831bfd96": "Left",
  "m_1480a378beafd1": "v{value0}",
  "m_14ab8cefda3cf9": "Move down",
  "m_14c3dfbc8a08e9": "{value0} · v{value1}",
  "m_14dac40a7e102a": "row {value0} {value1}",
  "m_15ca343c0669d7": "No compatible picker fields in this template. Add a person, customer, project, site, or area picker first.",
  "m_15f748343d3956": "count",
  "m_168fba897c5202": "Hazards",
  "m_16a715c725d406": "S",
  "m_16bca608598e31": "Where this is being recorded",
  "m_16c009976e0b86": "Drag elements here from the left panel",
  "m_16fb1210fc864b": "Marker {value0} — note",
  "m_170bba2afbd664": "· ±{value0}m",
  "m_171450f953a653": "You don't have permission to edit this entry.",
  "m_178de0c94da150": "Search an address…",
  "m_17cb3d26a75938": "Drag to move",
  "m_18010438ac7907": "+ photo",
  "m_182296d9886284": "Submit failed — see field errors",
  "m_182c889ab6dd96": "L",
  "m_18391e161b9ed6": "PPE",
  "m_18c006b02858b9": "tap photo to mark hazards",
  "m_195a8468f60956": "{value0} row {value1}",
  "m_196f872aa354d3": "Else",
  "m_1979ef2713c627": "Exponent",
  "m_197fef09772e0d": "Link",
  "m_1989eb71707ad3": "(no formula)",
  "m_198b8dba5a829c": "Scan",
  "m_19dc719a9038ec": "Use an HTTPS, email, phone, /path, or #anchor link.",
  "m_19e342351d140c": "Postal code",
  "m_19f38a950f87b6": "rows",
  "m_1a1dcc7d0b9e8a": "pick many",
  "m_1a4be3846f6837": "Select the cell where likelihood meets severity.",
  "m_1a66e46e2f8f21": "Could not get your location — check permissions",
  "m_1a7cefe5a9894e": "Back",
  "m_1a9d8d971b1edb": "Remove",
  "m_1abf555859c0a8": "draw / diagram here",
  "m_1aea6765cbbb07": "Then",
  "m_1b781270c0d2f5": "name@example.com",
  "m_1bbb2531ada8ce": "Decrease",
  "m_1bcca98c4d6c29": "Country",
  "m_1c34ceb10770ab": "Select the previous field first.",
  "m_1c693e59d64fb2": "v",
  "m_1cc0e5e7b5f442": "Value",
  "m_1cee12b0954a84": "No rows. Add one below.",
  "m_1d213acef86dbc": "Search records…",
  "m_1d33f094c621dc": "pick one",
  "m_1d3baabf618cbd": "Select {value0} {value1}…",
  "m_1d6aa8702d3fac": "field",
  "m_1d8a295c4b1d4b": "Could not save before navigation — will retry",
  "m_1de0dacba80c75": "Form submitted",
  "m_1e3a16a7c41097": "Example top-level values",
  "m_1e4d427e74e767": "Clear",
  "m_1e62e6d69a0d11": "Bold",
  "m_1eabd71bbc0199": "Add row",
  "m_1eba1a694e67d0": "Bulleted list",
  "m_1ec1460770eaa0": "Move up",
  "m_1ee96b6856cb45": "Italic",
  "m_1f07a454b7b05b": "Page",
  "m_1f2236b17eb1ef": "Showing {value0}–{value1} of {value2}",
  "m_1fa0b63118d05f": "No sections bound to this step. Submit to finalise.",
  "m_1fa9ced82f8b16": "Could not load records. Try again."
}

const KEY_BY_VALUE = new Map(Object.entries(COPY).map(([key, value]) => [value, key]))

export type GeneratedCopyTranslator = (
  key: string,
  defaultValue: string,
  values?: Record<string, unknown>,
) => string

const GeneratedCopyContext = createContext<GeneratedCopyTranslator | null>(null)

export function resolveGeneratedCopy(key: string, values?: Record<string, unknown>): string {
  return interpolate(COPY[key] ?? key, values)
}

export function GeneratedCopyProvider({
  translate,
  children,
}: {
  translate?: GeneratedCopyTranslator
  children: ReactNode
}) {
  return <GeneratedCopyContext.Provider value={translate ?? null}>{children}</GeneratedCopyContext.Provider>
}

export function useGeneratedTranslations() {
  const translate = useContext(GeneratedCopyContext)
  return useCallback((key: string, values?: Record<string, unknown>) => {
    const fallback = COPY[key] ?? key
    return translate?.(key, fallback, values) ?? resolveGeneratedCopy(key, values)
  }, [translate])
}

export function useGeneratedValueTranslations() {
  const translate = useGeneratedTranslations()
  return useCallback(<Value,>(value: Value): Value => {
    if (typeof value !== 'string') return value
    const key = KEY_BY_VALUE.get(value)
    return (key ? translate(key) : value) as Value
  }, [translate])
}

export function GeneratedText({ id, values }: { id: string; values?: Record<string, unknown> }) {
  const translate = useGeneratedTranslations()
  return <>{translate(id, values)}</>
}

export function GeneratedValue({ value }: { value: ReactNode }) {
  return typeof value === 'string' ? <TranslatedGeneratedValue value={value} /> : <>{value}</>
}

function TranslatedGeneratedValue({ value }: { value: string }) {
  const translate = useGeneratedValueTranslations()
  return <>{translate(value)}</>
}

function interpolate(value: string, values?: Record<string, unknown>): string {
  let result = value
  for (const [key, replacement] of Object.entries(values ?? {})) {
    result = result.replaceAll('{' + key + '}', String(replacement ?? ''))
  }
  return result
}
