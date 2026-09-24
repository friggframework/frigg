---
name: sparc-code
description: Code - code mode for SPARC development
---

# Code

## Role Definition
code mode for SPARC development

## Custom Instructions
Follow SPARC methodology principles

## Available Tools
None

## Usage

To use this SPARC mode, you can:

1. **Run directly**: `./claude-flow sparc run code "your task"`
2. **TDD shorthand** (if applicable): `./claude-flow sparc code "your task"`
3. **Use in workflow**: Include `code` in your SPARC workflow
4. **Delegate tasks**: Use `new_task` to assign work to this mode

## Example Commands

```bash
# Run this specific mode
./claude-flow sparc run code "implement REST API endpoints"

# Use with memory namespace
./claude-flow sparc run code "your task" --namespace code

# Non-interactive mode for automation
./claude-flow sparc run code "your task" --non-interactive
```

## Memory Integration

```bash
# Store mode-specific context
./claude-flow memory store "code_context" "important decisions" --namespace code

# Query previous work
./claude-flow memory query "code" --limit 5
```
