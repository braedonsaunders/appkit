'use client'

import * as React from 'react'

export type WorkflowMessages = Record<string, string>

const DEFAULT_MESSAGES: WorkflowMessages = {
  "m_00021f60b601ff": "Build a one-off email with the drag-and-drop editor.",
  "m_002d59b20693c5": "Could not compile the design",
  "m_006e893d66b28d": "If…",
  "m_01066829ab2176": "Confirmation prompt",
  "m_01725f4d4cbece": "No email templates are available.",
  "m_01a3b7ba2ed936": "Leave empty to always show the button. Internal id:",
  "m_01a6df8deac3ad": "Quick-start templates",
  "m_01e855ecae74db": "e.g. When an amount exceeds the review threshold, request approval and notify the responsible team.",
  "m_0245cf85678788": "Could not rename the flow",
  "m_028d6ce274ccaa": "Create a flow on the left to start building automations for this record type.",
  "m_02c65a444f151a": "Save a valid flow before enabling it",
  "m_02ffe91f500dc8": "Signature required",
  "m_03a66f9d34ac7b": "Edit",
  "m_03a92a8bba62c3": "Email content",
  "m_03c918fe3c11b7": "Flow saved",
  "m_03cf3a97d03fef": "Style",
  "m_04c18d4965cadc": "PDF attachment",
  "m_0569fdc1833cbf": "Creates one draft from the current record.",
  "m_057778f7de97cd": "Published target application",
  "m_05928758fdadda": "Include only when (optional)",
  "m_059b9458e92a71": "Check-in interval (min)",
  "m_05b63ccf241fff": "a@x.com, b@y.com",
  "m_06251479eec41c": "After submit, this response becomes a live monitored session with a recurring check-in timer. Escalation fires through the “A monitored session goes overdue” trigger. Set each timing as a fixed value, or bind it to a submitted number field.",
  "m_06e04a2aa58e1f": "Replaces the selected flow with the AI draft.",
  "m_07105e19c7e789": "Flow created",
  "m_0728ad8d6726a2": "PDF document",
  "m_0776dc4696267a": "Create or select a flow first",
  "m_079594be6652a8": "Channel",
  "m_091185429bbc1c": "Spreadsheet attachments",
  "m_09417c94b44711": "Add recipient",
  "m_09838d30eb3121": "Delete node",
  "m_0984e05d5d435f": "Method",
  "m_09b3b5bd8c347d": "No flows.",
  "m_09bfd82959f8d2": "Built-in",
  "m_0a19e6387037d4": "Templates",
  "m_0a2bad9c653946": "Could not generate the flow",
  "m_0a302f85a5260b": "Choose a person",
  "m_0a45a3f047a285": "Edit {value0}",
  "m_0a88689556c4a0": "Subject override (optional)",
  "m_0abb67c4c65a36": "Approve / reject",
  "m_0ac24b7d0c1efa": "Minimum severity",
  "m_0ac2f784b6e43b": "Flow deleted",
  "m_0acdcecd1c4f9c": "This flow runs when someone clicks a button on a record. The button shows on the record action bar.",
  "m_0b5f0bfe110fb9": "New status",
  "m_0b6591278bf814": "Choose a person group",
  "m_0b8592c90b3997": "Due in (days)",
  "m_0bad495a7046e9": "Action",
  "m_0bb985b1bd9e88": "Photo field",
  "m_0be1be4daf3028": "Loading a template replaces the current flow's nodes.",
  "m_0c0c6c7a4b5bf5": "Enabled — click to disable",
  "m_0c24b0e0c8e0fa": "Generate a Flow with AI",
  "m_0c33471afd0f99": "Condition",
  "m_0c4753241b87b2": "New flow",
  "m_0d4729dfb8d8fa": "Describe the automation. The AI drafts the node graph for review.",
  "m_0d5b3e3dbea5a7": "XLSX template",
  "m_0d99b2b56f8b5d": "Recipients",
  "m_0d9b2e08c28452": "Remove recipient",
  "m_0d9d758963404e": "Expected duration (min)",
  "m_0decefd558c355": "Title",
  "m_0e0bbc9cd7e263": "or",
  "m_0e4ff640f8e7d6": "Message",
  "m_0e58c2382f9cda": "Template loaded — fill in the blanks, then Save",
  "m_0e6e22a9a495b0": "Choose a recipient",
  "m_0ea7ffe3f671e7": "Disabled",
  "m_0ecfd22a8fb573": "Choose a person group",
  "m_0ef7e5f0c544da": "Show button only when",
  "m_0f137cab523375": "Position in the bar (lower shows first)",
  "m_0f7bb45f90ba7e": "Approval",
  "m_106811f2aac664": "Saving…",
  "m_108b4cbe4ba75e": "Write summary to (optional)",
  "m_1099c1fe8b6614": "Role",
  "m_112e2e8ecda428": "Cancel",
  "m_114fd68aa28e60": "Add XLSX",
  "m_11beb293de9d2d": "Generating…",
  "m_11bf1bf8c148ff": "Disabled — click to enable",
  "m_11eec81d216014": "Could not create the flow",
  "m_120d9d75eb5980": "e.g. Close out",
  "m_12449ce6dd3e47": "Message content",
  "m_126e942baf656b": "Order",
  "m_127e5a438a4764": "Load a common automation into this flow, then fill in the blanks.",
  "m_1300a5099634f1": "Remove spreadsheet attachment",
  "m_13704e4d90cde4": "Template",
  "m_139d4c0c9f7be0": "Pick a common automation, or build from scratch with the toolbar.",
  "m_13cc128f69897c": "When",
  "m_141dec99716e82": "Could not save the flow",
  "m_1498caf65a85c4": "lucide, e.g. check",
  "m_14dfc66e74338e": "Report.xlsx",
  "m_15593bf256f963": "Choose a location contact",
  "m_1566168cfca5cb": "Output filename (optional)",
  "m_15741a97c1becc": "Delete flow",
  "m_158279b74f9a6e": "Icon",
  "m_162609b68a9ac6": "Flow drafted — review and save",
  "m_165a381fa8ae74": "URL",
  "m_168b365cc671bf": "Severity",
  "m_16a46bc46302d1": "Rule (true → then, else → else)",
  "m_16eed28e441ee2": "Fill uploaded XLSX templates with this record and attach the results.",
  "m_18651428376053": "Cron schedule",
  "m_18b7c648c39e28": "Button label",
  "m_18d98590ba5c28": "Body (supports '{{token}}')",
  "m_1928431de4aaf1": "Subject",
  "m_19a03337702a01": "Rename",
  "m_19a82ebc42ebe3": "Field condition",
  "m_19bca60b6c1661": "+ New flow",
  "m_19e6bff894c3c7": "Save",
  "m_1a12949487d961": "Design saved — Save the flow to keep it.",
  "m_1a4786daa752b1": "Flows",
  "m_1a73ab43e2b5d2": "Choose a department",
  "m_1abfbb4f0b4f36": "No flow selected",
  "m_1afb19e2a3fd62": "Attach a PDF of the record",
  "m_1b31092e597972": "Title (supports '{{field_id}}')",
  "m_1bc3a7ded730b8": "Grace period (min)",
  "m_1bf56760eea2b5": "PDF templates (paper-size documents)",
  "m_1c97926a04b9c7": "Optional — shown before the action runs",
  "m_1cc0e5e7b5f442": "Value",
  "m_1cc7bc088003bc": "Choose an application",
  "m_1cd0901d5dfe1a": "Reason",
  "m_1d088977412efb": "Label",
  "m_1d75b79556863c": "Require GPS on each check-in",
  "m_1d8534a5e92ce6": "Email design",
  "m_1db1e5c9ca41ce": "Trigger",
  "m_1dbb9f90b1c6f2": "Generate",
  "m_1df84b29521519": "Start with a template",
  "m_1dfe960eaa6224": "Field",
  "m_1e0a86199c09df": "AI",
  "m_1e52dceb23405d": "Flow name cannot exceed {value0} characters",
  "m_1e6f44ac3a3238": "Could not disable the flow",
  "m_1ed36573238d1d": "Upload an XLSX document before configuring a spreadsheet attachment.",
  "m_1ed448916bb007": "Edit design",
  "m_1f0e1a82c4aae4": "Save design",
  "m_1f114a74597cfb": "role key",
  "m_1f13f5c3b87576": "Open visual builder",
  "m_1f1c58a54a4d66": "Choose a compliance assignment",
  "m_1f4ba956f2ba0f": "Who approves",
  "m_1fb66407994e0c": "Create a CAPA when hazards are found",
}

const WorkflowMessagesContext = React.createContext<WorkflowMessages>(DEFAULT_MESSAGES)

export function WorkflowMessagesProvider({
  messages,
  children,
}: {
  messages: WorkflowMessages
  children: React.ReactNode
}) {
  return (
    <WorkflowMessagesContext.Provider value={{ ...DEFAULT_MESSAGES, ...messages }}>
      {children}
    </WorkflowMessagesContext.Provider>
  )
}

function interpolate(template: string, values?: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? key))
}

export function useGeneratedTranslations() {
  const messages = React.useContext(WorkflowMessagesContext)
  return React.useCallback(
    (id: string, values?: Record<string, unknown>) => interpolate(messages[id] ?? id, values),
    [messages],
  )
}

export function useGeneratedValueTranslations() {
  return React.useCallback(<T,>(value: T): T => value, [])
}

export function GeneratedText({ id, values }: { id: string; values?: Record<string, unknown> }) {
  const translate = useGeneratedTranslations()
  return <>{translate(id, values)}</>
}

export function GeneratedValue({ value }: { value: React.ReactNode }) {
  return <>{value}</>
}
