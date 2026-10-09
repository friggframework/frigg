---
name: claude-flow-help
description: Show Claude-Flow commands and usage
---

# Claude-Flow Commands

## 🌊 Claude-Flow: Agent Orchestration Platform

Claude-Flow is the ultimate multi-terminal orchestration platform that revolutionizes how you work with Claude Code.

## Quick Start
```bash
./claude-flow --help
./claude-flow sparc modes
./claude-flow sparc tdd "your feature"
```

## Core Commands

### 🧠 Memory Operations
- `./claude-flow memory store "key" "value"` - Store data
- `./claude-flow memory query "search"` - Search memory
- `./claude-flow memory stats` - Memory statistics

### ⚡ SPARC Development
- `./claude-flow sparc modes` - List all SPARC modes
- `./claude-flow sparc run <mode> "task"` - Run specific mode
- `./claude-flow sparc tdd "feature"` - TDD workflow
- `./claude-flow sparc info <mode>` - Mode details

### 🐝 Swarm Coordination
- `./claude-flow swarm "task"` - Start swarm with auto strategy
- `./claude-flow swarm "task" --strategy <type>` - Use specific strategy

For detailed help: `./claude-flow help <command>`
