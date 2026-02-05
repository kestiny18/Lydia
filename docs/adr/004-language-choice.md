# ADR-004: Technology Stack Language Choice

## Status

**Decided** - 2025-02-05

## Context

Lydia needs to determine its core technology stack. Considering:
- Python is richer in AI/ML ecosystem (LangChain, HuggingFace, etc.)
- Python is stronger in data processing (pandas, numpy)
- Lower barrier for community contribution

We discussed whether to introduce Python in the core or plugin layer.

## Decision

**Adopt a pure TypeScript stack for now, introducing Python later as needed.**

### Current Phase
```
Core Engine    → TypeScript
CLI            → TypeScript
Web Service    → TypeScript
Plugin System  → TypeScript
```

### Future Expansion Path (If needed)
```
Phase 1: Pure TS (Current)
    ↓
Phase 2: Support Python Plugins (Subprocess + JSON-RPC)
    ↓
Phase 3: Python Microservices (If heavy ML capabilities are needed)
```

## Rationale

1. **Reduce Initial Complexity**: Single language stack is easier to maintain and debug.
2. **Validate Core Value Quickly**: Prove strategy system works before considering ecosystem expansion.
3. **Preserve Expansion Space**: Architecture designed with `PluginBridge` interface for future smooth integration.
4. **TypeScript Ecosystem Improving**: LangChain.js, Vercel AI SDK, etc., are maturing.

## Consequences

### Positive
- High development efficiency, no cross-language debugging.
- Simple deployment, only Node.js environment needed.
- Type safety throughout the full stack.

### Negative
- Cannot directly use Python ML libraries.
- Some AI capabilities might need workarounds.

### Mitigation
- Use mature TS AI libraries (e.g., Vercel AI SDK, LangChain.js).
- Reserve `PluginBridge` interface in design.
- Use HTTP API to call external services for scenarios requiring Python.

## Triggers for Re-evaluation

- Critical features found impossible to implement in TS ecosystem.
- Strong community demand for Python plugin support.
- Need to integrate ML models available only in Python.

---

**Deciders**: Project Lead
**Consulted**: Claude (AI Assistant)
