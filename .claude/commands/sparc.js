---
name: sparc
description: Execute SPARC methodology workflows
---

# SPARC Development Methodology

SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) is a systematic approach to Test-Driven Development.

## Quick Usage
```bash
./claude-flow sparc modes              # List available modes
./claude-flow sparc tdd "feature"      # Run TDD workflow
./claude-flow sparc run architect "task"  # Run specific mode
```

## Available Modes
- **architect** - System design and architecture
- **code** - Clean code implementation
- **tdd** - Test-driven development
- **debug** - Systematic debugging
- **security-review** - Security analysis
- **spec-pseudocode** - Requirements planning
- **integration** - System integration

## TDD Workflow
1. **Red**: Write failing tests first
2. **Green**: Implement minimal code to pass
3. **Refactor**: Optimize and clean up
4. **Repeat**: Continue until complete

Run: `./claude-flow sparc tdd "your feature description"`
