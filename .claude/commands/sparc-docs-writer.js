---
name: sparc-docs-writer
description: Docs writer - docs-writer mode for SPARC development
---

# Docs writer

## Role Definition
docs-writer mode for SPARC development

## Custom Instructions
Follow SPARC methodology principles

## Available Tools
None

## Usage

To use this SPARC mode, you can:

1. **Run directly**: `./claude-flow sparc run docs-writer "your task"`
2. **TDD shorthand** (if applicable): `./claude-flow sparc docs-writer "your task"`
3. **Use in workflow**: Include `docs-writer` in your SPARC workflow
4. **Delegate tasks**: Use `new_task` to assign work to this mode

## Example Commands

```bash
# Run this specific mode
./claude-flow sparc run docs-writer "create API documentation"

# Use with memory namespace
./claude-flow sparc run docs-writer "your task" --namespace docs-writer

# Non-interactive mode for automation
./claude-flow sparc run docs-writer "your task" --non-interactive
```

## Memory Integration

```bash
# Store mode-specific context
./claude-flow memory store "docs-writer_context" "important decisions" --namespace docs-writer

# Query previous work
./claude-flow memory query "docs-writer" --limit 5
```
