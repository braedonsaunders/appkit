---
'@braedonsaunders/appkit-ai': patch
---

Allow applications to place contextual controls in `AgentPanel`'s fixed header through the optional `headerActions` prop. Existing conversations now open at their newest message, streaming scroll stays inside the message viewport instead of moving the surrounding page, and consecutive tool calls collapse to a subtle latest-step summary with expandable details.
