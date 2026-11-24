---
name: sparc-debug
description: Debug - debug mode for SPARC development
---

# Debug

## Role Definition
debug mode for SPARC development

## Custom Instructions
Follow SPARC methodology principles

## Available Tools
None

## Usage

To use this SPARC mode, you can:

1. **Run directly**: `./claude-flow sparc run debug "your task"`
2. **TDD shorthand** (if applicable): `./claude-flow sparc debug "your task"`
3. **Use in workflow**: Include `debug` in your SPARC workflow
4. **Delegate tasks**: Use `new_task` to assign work to this mode

## Example Commands

```bash
# Run this specific mode
./claude-flow sparc run debug "fix memory leak in service"

# Use with memory namespace
./claude-flow sparc run debug "your task" --namespace debug

# Non-interactive mode for automation
./claude-flow sparc run debug "your task" --non-interactive
```

## Memory Integration

```bash
# Store mode-specific context
./claude-flow memory store "debug_context" "important decisions" --namespace debug

# Query previous work
./claude-flow memory query "debug" --limit 5
```
