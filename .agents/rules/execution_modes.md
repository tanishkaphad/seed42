---
description: Execution & Mode Rules including default read-only safety and mode-specific behavior (/ask, /plan, /debug, /chat)
globs:
alwaysApply: true
---

# Global Custom Rules: Execution & Mode Rules

- **Default Read-Only Safety**: Never modify project files when answering questions or doing analysis unless the user explicitly uses keywords like "edit", "fix", or "update".
- **/ask Mode**: Read-only Q&A mode. The agent MUST NOT modify any workspace files under /ask mode until the user explicitly commands a file modification or switches mode (e.g. /chat mode).
- **/plan Mode**: Planning-only mode. Create and present the implementation plan, but DO NOT execute or modify project files until explicit confirmation to execute is given.
- **/debug Mode**: Diagnostic & bug-hunting mode. Search logs, trace code, and identify root causes for bugs, but DO NOT edit code files until instructed.
- **Mode Acknowledgment**: When the user invokes a custom mode (/ask, /plan, /debug, /chat mode), state the active mode clearly at the beginning of the response.
