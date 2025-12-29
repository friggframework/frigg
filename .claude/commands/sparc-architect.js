---
name: sparc-architect
description: Architect - architect mode for SPARC development
---

# Architect

## Role Definition
architect mode for SPARC development

## Custom Instructions
Follow SPARC methodology principles

## Available Tools
None

## Usage

To use this SPARC mode, you can:

1. **Run directly**: `./claude-flow sparc run architect "your task"`
2. **TDD shorthand** (if applicable): `./claude-flow sparc architect "your task"`
3. **Use in workflow**: Include `architect` in your SPARC workflow
4. **Delegate tasks**: Use `new_task` to assign work to this mode

## Example Commands

```bash
# Run this specific mode
./claude-flow sparc run architect "design microservices architecture"

# Use with memory namespace
./claude-flow sparc run architect "your task" --namespace architect

# Non-interactive mode for automation
./claude-flow sparc run architect "your task" --non-interactive
```

## Memory Integration

```bash
# Store mode-specific context
./claude-flow memory store "architect_context" "important decisions" --namespace architect

# Query previous work
./claude-flow memory query "architect" --limit 5
```
