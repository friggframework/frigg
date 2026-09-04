// GENERATED — vendored Freya runtime. Do not edit by hand.
// Regenerate via website/tools/freya-vendor/build.mjs.

// ../freya/packages/core/dist/domain/model/Agent.js
function createAgent(config, deploymentId) {
  return {
    id: config.id,
    config,
    deploymentId,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
}

// ../freya/packages/core/dist/domain/model/Session.js
function createSession(id, agentId, userId, transportId) {
  return {
    id,
    agentId,
    userId,
    transportId,
    messages: [],
    status: "active",
    turnCount: 0,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date(),
    metadata: {}
  };
}
function addMessage(session, message) {
  return {
    ...session,
    messages: [...session.messages, message],
    turnCount: message.role === "assistant" ? session.turnCount + 1 : session.turnCount,
    updatedAt: /* @__PURE__ */ new Date()
  };
}

// ../freya/packages/core/dist/domain/model/Message.js
function createUserMessage(id, content, transportOrigin) {
  return {
    id,
    role: "user",
    content,
    timestamp: /* @__PURE__ */ new Date(),
    transportOrigin,
    metadata: {}
  };
}
function createAssistantMessage(id, content, toolInvocations) {
  return {
    id,
    role: "assistant",
    content,
    timestamp: /* @__PURE__ */ new Date(),
    transportOrigin: "agent",
    toolInvocations,
    metadata: {}
  };
}

// ../freya/packages/core/dist/domain/events/DomainEvent.js
function createEvent(id, type, agentId, payload, sessionId) {
  return { id, type, timestamp: /* @__PURE__ */ new Date(), agentId, sessionId, payload };
}

// ../freya/packages/core/dist/domain/services/ContextBuilderService.js
function buildContext(params) {
  const { config, ontology, memories, messages, tools, ontologyRenderer, transport } = params;
  const parts = [];
  parts.push(config.systemPrompt);
  if (transport) {
    parts.push(`

[Channel: ${transport}]`);
  }
  const ontologyText = ontologyRenderer.render(ontology);
  if (ontologyText && ontology.entityTypes.length > 0) {
    parts.push("\n---\n");
    parts.push(ontologyText);
  }
  if (memories.length > 0) {
    parts.push("\n---\n# Relevant Context from Memory\n");
    for (const memory of memories) {
      parts.push(`[${memory.entityType}] ${memory.content}`);
    }
  }
  const systemPrompt = parts.join("\n");
  const systemTokens = Math.ceil(systemPrompt.length / 4);
  const messageTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const toolTokens = tools.reduce((sum, t) => sum + Math.ceil(JSON.stringify(t.inputSchema).length / 4), 0);
  return {
    systemPrompt,
    messages,
    tools,
    tokenEstimate: systemTokens + messageTokens + toolTokens
  };
}

// ../freya/packages/core/dist/domain/services/ModelPricingService.js
var MODEL_PRICING_PER_1M_TOKENS = {
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-6": [15, 75],
  "claude-haiku-4-5-20251001": [0.25, 1.25],
  // Bedrock-prefixed deployment-surface ids. Real Bedrock model-id
  // strings vary by AWS region and may carry different date suffixes —
  // callers should normalize before calling, or unknown ids will return
  // 0 (callers can detect via `isKnownPricedModel`).
  "anthropic.claude-sonnet-4-6-20251022-v1:0": [3, 15],
  "anthropic.claude-opus-4-6-20251022-v1:0": [15, 75],
  "anthropic.claude-haiku-4-5-20251001-v1:0": [0.25, 1.25]
};
var CACHE_WRITE_MULTIPLIER = 1.25;
var CACHE_READ_MULTIPLIER = 0.1;
function estimateCostUSD(modelId, usageOrInputTokens, outputTokens) {
  const usage = typeof usageOrInputTokens === "number" ? { inputTokens: usageOrInputTokens, outputTokens: outputTokens ?? 0 } : usageOrInputTokens;
  const rates = MODEL_PRICING_PER_1M_TOKENS[modelId];
  if (!rates)
    return 0;
  const [inputRate, outputRate] = rates;
  const safe = (v) => Math.max(0, Number.isFinite(v) ? v : 0);
  const safeInput = safe(usage.inputTokens);
  const safeOutput = safe(usage.outputTokens);
  const safeCacheRead = safe(usage.cacheReadTokens);
  const safeCacheWrite = safe(usage.cacheWriteTokens);
  const totalUsdPer1M = safeInput * inputRate + safeOutput * outputRate + safeCacheRead * inputRate * CACHE_READ_MULTIPLIER + safeCacheWrite * inputRate * CACHE_WRITE_MULTIPLIER;
  return totalUsdPer1M / 1e6;
}

// ../freya/packages/core/dist/domain/services/TurnBudgetService.js
var LEGACY_INPUT_RATE_PER_1K = 3e-3;
var LEGACY_OUTPUT_RATE_PER_1K = 0.015;
function createBudgetTracker(budget, optionsOrClock = {}) {
  const options = "now" in optionsOrClock && typeof optionsOrClock.now === "function" ? { clock: optionsOrClock } : optionsOrClock;
  const clock = options.clock ?? { now: () => Date.now() };
  const modelId = options.modelId;
  let calls = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  const startTime = clock.now();
  const sanitize = (v) => Math.max(0, Number.isFinite(v) ? v : 0);
  return {
    recordCall(usage) {
      calls++;
      const inputTokens = sanitize(usage.inputTokens);
      const outputTokens = sanitize(usage.outputTokens);
      const cacheReadTokens = sanitize(usage.cacheReadTokens);
      const cacheWriteTokens = sanitize(usage.cacheWriteTokens);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCacheReadTokens += cacheReadTokens;
      totalCacheWriteTokens += cacheWriteTokens;
      totalTokens += inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
    },
    isExhausted() {
      return this.getStatus().exhausted;
    },
    getStatus() {
      const elapsedMs = clock.now() - startTime;
      const estimatedCostUsd = modelId !== void 0 ? estimateCostUSD(modelId, {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens
      }) : totalInputTokens * LEGACY_INPUT_RATE_PER_1K / 1e3 + totalOutputTokens * LEGACY_OUTPUT_RATE_PER_1K / 1e3;
      let exhausted = false;
      let exhaustedReason;
      if (budget.maxCalls !== void 0 && calls >= budget.maxCalls) {
        exhausted = true;
        exhaustedReason = `LLM call limit reached (${calls}/${budget.maxCalls})`;
      } else if (budget.maxTokens !== void 0 && totalTokens >= budget.maxTokens) {
        exhausted = true;
        exhaustedReason = `Token limit reached (${totalTokens}/${budget.maxTokens})`;
      } else if (budget.maxTimeMs !== void 0 && elapsedMs >= budget.maxTimeMs) {
        exhausted = true;
        exhaustedReason = `Time limit reached (${elapsedMs}ms/${budget.maxTimeMs}ms)`;
      } else if (budget.maxCostUsd !== void 0 && estimatedCostUsd >= budget.maxCostUsd) {
        exhausted = true;
        exhaustedReason = `Cost limit reached ($${estimatedCostUsd.toFixed(4)}/$${budget.maxCostUsd})`;
      }
      return {
        calls,
        tokens: totalTokens,
        timeMs: elapsedMs,
        estimatedCostUsd,
        exhausted,
        ...exhaustedReason ? { exhaustedReason } : {}
      };
    }
  };
}
function budgetFromMaxTurns(maxTurns) {
  return { maxCalls: maxTurns };
}

// ../freya/packages/core/dist/domain/services/HooksService.js
var DEFAULT_PRIORITY = 100;
var InMemoryHookRegistry = class {
  byPhase = /* @__PURE__ */ new Map();
  register(hook) {
    const list = this.byPhase.get(hook.phase) ?? [];
    if (list.some((h) => h.name === hook.name)) {
      throw new Error(`Hook with name "${hook.name}" is already registered for phase "${hook.phase}"`);
    }
    list.push(hook);
    this.byPhase.set(hook.phase, list);
  }
  unregister(name) {
    for (const [phase, list] of this.byPhase) {
      const filtered = list.filter((h) => h.name !== name);
      if (filtered.length !== list.length) {
        this.byPhase.set(phase, filtered);
      }
    }
  }
  hooksFor(phase) {
    const list = this.byPhase.get(phase) ?? [];
    const sorted = [...list].sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
    return sorted;
  }
};
var HookExecutionError = class extends Error {
  hookName;
  phase;
  cause;
  constructor(hookName, phase, cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Hook "${hookName}" failed in phase "${phase}": ${message}`);
    this.hookName = hookName;
    this.phase = phase;
    this.cause = cause;
    this.name = "HookExecutionError";
  }
};
function makeFireHook(deps) {
  const annotate = deps.onAnnotation ?? (() => {
  });
  return async function fire(phase, initialPayload) {
    const hooks = deps.registry.hooksFor(phase);
    let payload = initialPayload;
    for (const hook of hooks) {
      const ctx = {
        phase,
        agent: deps.agent,
        sessionId: deps.sessionId,
        turnId: deps.turnId,
        userContext: deps.userContext,
        payload,
        emit: deps.onEvent,
        annotate
      };
      let outcome;
      try {
        outcome = await hook.run(ctx);
      } catch (err) {
        throw new HookExecutionError(hook.name, phase, err);
      }
      if (outcome.kind === "short_circuit") {
        deps.onEvent(createEvent(crypto.randomUUID(), "turn.short_circuited", deps.agent.id, { hookName: hook.name, phase, reason: outcome.reason }, deps.sessionId));
        return {
          payload,
          shortCircuited: true,
          correctionRequested: false,
          reason: outcome.reason,
          finalResponse: outcome.finalResponse,
          hookName: hook.name
        };
      }
      if (outcome.kind === "request_correction") {
        if (phase !== "pre_capture") {
          throw new HookExecutionError(hook.name, phase, new Error(`request_correction outcome is only valid from "pre_capture", got "${phase}"`));
        }
        return {
          payload,
          shortCircuited: false,
          correctionRequested: true,
          correctionPrompt: outcome.correctionPrompt,
          hookName: hook.name
        };
      }
      if (outcome.payload) {
        payload = { ...payload, ...outcome.payload };
      }
    }
    return {
      payload,
      shortCircuited: false,
      correctionRequested: false
    };
  };
}

// ../freya/packages/core/dist/domain/services/OntologyValidationService.js
function parseResponseForClaims(content, ontology) {
  if (ontology.entityTypes.length === 0)
    return [];
  const claims = [];
  for (const entityType of ontology.entityTypes) {
    const entityName = entityType.name;
    const pattern = new RegExp(`\\b${escapeRegex(entityName)}\\b`, "gi");
    const matches2 = [...content.matchAll(pattern)];
    if (matches2.length === 0)
      continue;
    for (const match of matches2) {
      const matchIndex = match.index;
      const windowStart = Math.max(0, matchIndex - 20);
      const windowEnd = Math.min(content.length, matchIndex + entityName.length + 200);
      const window = content.slice(windowStart, windowEnd);
      const properties = extractProperties(window, entityType);
      claims.push({
        text: window.trim(),
        entityType: entityName,
        properties: Object.keys(properties).length > 0 ? properties : void 0
      });
    }
  }
  return claims;
}
function extractProperties(text, entityType) {
  const properties = {};
  for (const prop of entityType.properties) {
    const patterns = [
      new RegExp(`\\b${escapeRegex(prop.name)}\\s+(?:is|:|=)\\s+(\\S+)`, "i"),
      new RegExp(`\\b${escapeRegex(prop.name)}\\s+(\\S+)`, "i")
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = match[1].replace(/[.,;!?)]+$/, "");
        if (value) {
          properties[prop.name] = value;
          break;
        }
      }
    }
  }
  return properties;
}
function validateClaims(claims, ontology) {
  const result = {
    valid: [],
    fixable: [],
    friction: []
  };
  for (const claim of claims) {
    validateSingleClaim(claim, ontology, result);
  }
  return result;
}
function validateSingleClaim(claim, ontology, result) {
  const entityResolution = resolveEntityType(claim.entityType, ontology);
  if (entityResolution.status === "unknown") {
    result.friction.push({
      claim,
      frictionType: "unknown_entity",
      context: `Entity type "${claim.entityType}" is not defined in the ontology. Known types: ${ontology.entityTypes.map((e) => e.name).join(", ")}`
    });
    return;
  }
  if (entityResolution.status === "fixable") {
    result.fixable.push({
      claim,
      suggestion: `Use "${entityResolution.resolved.name}" instead of "${claim.entityType}"`
    });
    return;
  }
  const resolvedEntity = entityResolution.resolved;
  if (!claim.properties || Object.keys(claim.properties).length === 0) {
    result.valid.push(claim);
    return;
  }
  let hasIssue = false;
  for (const [propName, propValue] of Object.entries(claim.properties)) {
    const propResolution = resolveProperty(propName, propValue, resolvedEntity);
    if (propResolution.status === "fixable") {
      result.fixable.push({
        claim,
        suggestion: propResolution.suggestion
      });
      hasIssue = true;
      break;
    }
    if (propResolution.status === "unknown_property") {
      result.friction.push({
        claim,
        frictionType: "unknown_property",
        context: `Property "${propName}" does not exist on entity type "${resolvedEntity.name}". Known properties: ${resolvedEntity.properties.map((p) => p.name).join(", ")}`,
        propertyName: propName,
        availableProperties: resolvedEntity.properties.map((p) => p.name)
      });
      hasIssue = true;
      continue;
    }
    if (propResolution.status === "invalid_value") {
      const matchedProp = resolvedEntity.properties.find((p) => p.name === propName) ?? resolvedEntity.properties.find((p) => p.name.toLowerCase() === propName.toLowerCase());
      result.friction.push({
        claim,
        frictionType: "invalid_value",
        context: propResolution.context,
        propertyName: propName,
        allowedValues: matchedProp?.enumValues ?? []
      });
      hasIssue = true;
      continue;
    }
  }
  if (!hasIssue) {
    result.valid.push(claim);
  }
}
function resolveEntityType(claimedType, ontology) {
  if (!claimedType)
    return { status: "exact" };
  const exact = ontology.entityTypes.find((e) => e.name === claimedType);
  if (exact)
    return { status: "exact", resolved: exact };
  const caseMatch = ontology.entityTypes.find((e) => e.name.toLowerCase() === claimedType.toLowerCase());
  if (caseMatch)
    return { status: "exact", resolved: caseMatch };
  for (const entity of ontology.entityTypes) {
    const claimedLower = claimedType.toLowerCase();
    const entityLower = entity.name.toLowerCase();
    if (claimedLower.includes(entityLower) || entityLower.includes(claimedLower)) {
      return { status: "fixable", resolved: entity };
    }
  }
  for (const entity of ontology.entityTypes) {
    if (editDistance(claimedType.toLowerCase(), entity.name.toLowerCase()) <= 2) {
      return { status: "fixable", resolved: entity };
    }
  }
  return { status: "unknown" };
}
function resolveProperty(propName, propValue, entityType) {
  const exact = entityType.properties.find((p) => p.name === propName);
  if (exact) {
    return validatePropertyValue(exact, propValue, entityType);
  }
  const caseMatch = entityType.properties.find((p) => p.name.toLowerCase() === propName.toLowerCase());
  if (caseMatch) {
    return validatePropertyValue(caseMatch, propValue, entityType);
  }
  for (const prop of entityType.properties) {
    if (editDistance(propName.toLowerCase(), prop.name.toLowerCase()) <= 2) {
      return {
        status: "fixable",
        suggestion: `Use property "${prop.name}" instead of "${propName}" on entity type "${entityType.name}"`
      };
    }
  }
  return { status: "unknown_property" };
}
function validatePropertyValue(prop, value, entityType) {
  if (prop.type === "enum" && prop.enumValues) {
    const lowerValue = value.toLowerCase();
    const match = prop.enumValues.find((v) => v.toLowerCase() === lowerValue);
    if (!match) {
      return {
        status: "invalid_value",
        context: `Property "${prop.name}" on "${entityType.name}" only allows: ${prop.enumValues.join(", ")}. Got: "${value}"`
      };
    }
  }
  return { status: "valid" };
}
function editDistance(a, b) {
  if (a.length === 0)
    return b.length;
  if (b.length === 0)
    return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          // substitution
          matrix[i][j - 1] + 1,
          // insertion
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ../freya/packages/core/dist/domain/services/MemoryCaptureService.js
var DEFAULT_CAPTURE_CONFIDENCE_THRESHOLD = 0.7;
var HEDGE_PATTERN = new RegExp([
  "\\bmight\\b",
  "\\bmaybe\\b",
  "\\bperhaps\\b",
  "\\bpossibly\\b",
  "\\bI\\s+think\\b",
  "\\bI\\s+believe\\b",
  "\\bnot\\s+sure\\b",
  "\\bnot\\s+certain\\b",
  "\\bprobably\\b",
  "\\bunlikely\\b",
  "\\bsomewhat\\b",
  "\\bsort\\s+of\\b",
  "\\bkind\\s+of\\b",
  "\\bappears\\s+to\\b",
  "\\bseems\\s+to\\b",
  "\\bcould\\s+be\\b"
].join("|"), "gi");
var HEDGE_PENALTY_PER_MATCH = 0.15;
var MAX_HEDGE_PENALTY_MATCHES = 3;
var CONFIDENCE_FLOOR = 0.1;
function countHedgeMarkers(text) {
  if (!text)
    return 0;
  const matches2 = text.match(HEDGE_PATTERN);
  if (!matches2)
    return 0;
  return Math.min(matches2.length, MAX_HEDGE_PENALTY_MATCHES);
}
function scoreClaimConfidence(claim) {
  const propCount = claim.properties ? Object.keys(claim.properties).length : 0;
  const propertyScore = 0.5 + 0.1 * Math.min(propCount, 5);
  const hedgeCount = countHedgeMarkers(claim.text);
  const hedgePenalty = HEDGE_PENALTY_PER_MATCH * hedgeCount;
  const raw = propertyScore - hedgePenalty;
  return Math.min(1, Math.max(CONFIDENCE_FLOOR, raw));
}
function coerceStructured(claim, entityType) {
  const structured = {};
  if (!claim.properties)
    return structured;
  for (const [k, v] of Object.entries(claim.properties)) {
    const prop = entityType.properties.find((p) => p.name === k || p.name.toLowerCase() === k.toLowerCase());
    if (!prop) {
      structured[k] = v;
      continue;
    }
    if (prop.type === "number") {
      const n = Number(v);
      structured[prop.name] = Number.isFinite(n) ? n : v;
    } else if (prop.type === "boolean") {
      const lv = v.toLowerCase();
      if (lv === "true")
        structured[prop.name] = true;
      else if (lv === "false")
        structured[prop.name] = false;
      else
        structured[prop.name] = v;
    } else {
      structured[prop.name] = v;
    }
  }
  return structured;
}
function extractMemoriesFromResponse(params) {
  const { response, ontology, agent, sessionId, turnId } = params;
  if (ontology.entityTypes.length === 0 || response.length === 0) {
    return { toCapture: [], dropped: [] };
  }
  const threshold = agent.config.captureConfidenceThreshold ?? DEFAULT_CAPTURE_CONFIDENCE_THRESHOLD;
  const claims = parseResponseForClaims(response, ontology);
  if (claims.length === 0) {
    return { toCapture: [], dropped: [] };
  }
  const { valid } = validateClaims(claims, ontology);
  const toCapture = [];
  const dropped = [];
  const dedupKeys = /* @__PURE__ */ new Set();
  for (const claim of valid) {
    if (!claim.entityType)
      continue;
    const entity = ontology.entityTypes.find((e) => e.name === claim.entityType);
    if (!entity)
      continue;
    const confidence = scoreClaimConfidence(claim);
    const structured = coerceStructured(claim, entity);
    const content = claim.text;
    const lookup = pickPredecessorLookup(structured, entity);
    const dedupKey = lookup ? `${entity.name}::${lookup.key}::${stringifyLookupValue(lookup.value)}` : `${entity.name}::__no_key__::${content}`;
    if (dedupKeys.has(dedupKey))
      continue;
    dedupKeys.add(dedupKey);
    if (confidence < threshold) {
      dropped.push({
        entityType: entity.name,
        content,
        confidence,
        threshold,
        reason: "low_confidence",
        ...Object.keys(structured).length > 0 ? { structured } : {}
      });
      continue;
    }
    const missingRequired = entity.properties.find((p) => p.required && !(p.name in structured));
    if (missingRequired) {
      dropped.push({
        entityType: entity.name,
        content,
        confidence,
        threshold,
        reason: "missing_required_property",
        ...Object.keys(structured).length > 0 ? { structured } : {}
      });
      continue;
    }
    const source = {
      type: "auto_capture",
      sessionId,
      turnId,
      // Auditing handle: include the agent's id so "who captured this"
      // is recoverable from `source.author` without joining via agentId.
      author: `memory-capture-service:${agent.id}`
    };
    toCapture.push({
      id: crypto.randomUUID(),
      agentId: agent.id,
      scope: "namespace",
      scopeId: agent.config.memoryNamespaces[0] ?? "default",
      entityType: entity.name,
      content,
      structured,
      confidence,
      source,
      status: "active",
      portable: false,
      createdAt: /* @__PURE__ */ new Date(),
      version: 1
    });
  }
  return { toCapture, dropped };
}
function pickPredecessorLookup(structured, entityType) {
  const candidates = predecessorLookupCandidates(structured, entityType);
  return candidates[0] ?? null;
}
function predecessorLookupCandidates(structured, entityType) {
  const out = [];
  if ("id" in structured && isPrimitive(structured.id)) {
    out.push({ key: "id", value: structured.id });
  }
  const keys = Object.keys(structured).sort();
  for (const k of keys) {
    if (k === "id")
      continue;
    const v = structured[k];
    if (!isPrimitive(v))
      continue;
    if (entityType) {
      const prop = entityType.properties.find((p) => p.name === k || p.name.toLowerCase() === k.toLowerCase());
      if (prop && prop.type === "enum")
        continue;
    }
    out.push({ key: k, value: v });
  }
  return out;
}
function isPrimitive(v) {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}
function stringifyLookupValue(v) {
  if (typeof v === "string")
    return v.toLowerCase();
  return String(v);
}
async function findPredecessor(candidate, memory, ontology) {
  const entityType = ontology?.entityTypes.find((e) => e.name === candidate.entityType);
  const lookups = predecessorLookupCandidates(candidate.structured, entityType);
  if (lookups.length === 0)
    return { kind: "none" };
  let entries;
  try {
    entries = await memory.getByEntityType(candidate.agentId, candidate.entityType);
  } catch {
    return { kind: "none" };
  }
  const sameScope = entries.filter((e) => e.scope === candidate.scope && e.scopeId === candidate.scopeId);
  const candidateId = candidate.structured.id;
  const candidateHasPrimitiveId = isPrimitive(candidateId);
  for (const lookup of lookups) {
    const target = stringifyLookupValue(lookup.value);
    const matches2 = sameScope.filter((e) => {
      if (e.id === candidate.id)
        return false;
      if (e.status !== "active")
        return false;
      const v = e.structured[lookup.key];
      if (v === void 0 || !isPrimitive(v) || stringifyLookupValue(v) !== target)
        return false;
      if (lookup.key !== "id" && candidateHasPrimitiveId) {
        const eId = e.structured.id;
        if (isPrimitive(eId) && stringifyLookupValue(eId) !== stringifyLookupValue(candidateId)) {
          return false;
        }
      }
      return true;
    });
    if (matches2.length === 0)
      continue;
    const sorted = [...matches2].sort((a, b) => {
      const dt = b.createdAt.getTime() - a.createdAt.getTime();
      if (dt !== 0)
        return dt;
      const dv = (b.version ?? 0) - (a.version ?? 0);
      if (dv !== 0)
        return dv;
      return a.id.localeCompare(b.id);
    });
    if (sorted.length >= 2) {
      return { kind: "ambiguous", entries: sorted };
    }
    return { kind: "one", entry: sorted[0] };
  }
  return { kind: "none" };
}
async function captureFromResponse(params) {
  const { memory, ...rest } = params;
  const { toCapture, dropped } = extractMemoriesFromResponse(rest);
  const captured = [];
  const errors = [];
  const frictionEvents = [];
  const availableEntityTypes = rest.ontology.entityTypes.map((e) => e.name);
  for (const candidate of toCapture) {
    try {
      const predecessor = await findPredecessor(candidate, memory, rest.ontology);
      await memory.store(candidate);
      captured.push(candidate);
      switch (predecessor.kind) {
        case "none":
          break;
        case "one": {
          try {
            await memory.supersede(predecessor.entry.id, candidate.id);
          } catch (err) {
            errors.push(`supersede(${predecessor.entry.id} \u2192 ${candidate.id}) failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        }
        case "ambiguous": {
          const conflictIds = predecessor.entries.map((e) => e.id).sort();
          const eventId = `conflicting_facts:${rest.sessionId}:${rest.agent.id}:${candidate.entityType}:${conflictIds.join(",")}`;
          let claimText;
          try {
            claimText = JSON.stringify({
              entityType: candidate.entityType,
              candidate: candidate.structured,
              conflictingEntryIds: conflictIds
            });
          } catch {
            claimText = "";
          }
          frictionEvents.push(createEvent(eventId, "ontology.friction", rest.agent.id, {
            claim: claimText,
            attemptedEntityType: candidate.entityType,
            availableEntityTypes,
            frictionType: "conflicting_facts",
            count: predecessor.entries.length,
            // First-class field — consumers shouldn't have to parse
            // `claim` (JSON-encoded) to get the conflict set. This
            // is what a human reviewer needs to act: WHICH entries
            // conflict, not just how many.
            conflictingEntryIds: conflictIds
          }, rest.sessionId));
          break;
        }
      }
    } catch (err) {
      errors.push(`store(${candidate.id}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { captured, dropped, errors, frictionEvents };
}

// ../freya/packages/core/dist/domain/services/AgentSessionService.js
var MAX_CORRECTION_RETRIES_PER_TURN = 2;
async function executeTurn(agent, sessionId, userMessage, deps, budget) {
  const events = [];
  const allToolResults = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let llmCalls = 0;
  const tracing = deps.trace === true;
  const trace = [];
  const turnId = crypto.randomUUID();
  const annotationsBuf = [];
  let currentPhase = "init";
  const rawFire = makeFireHook({
    registry: deps.hooks ?? new InMemoryHookRegistry(),
    agent,
    sessionId,
    turnId,
    onEvent: (e) => events.push(e),
    onAnnotation: (key, value) => annotationsBuf.push({ phase: currentPhase, key, value })
  });
  const fire = async (phase, payload) => {
    currentPhase = phase;
    try {
      return await rawFire(phase, payload);
    } catch (err) {
      if (!(err instanceof HookExecutionError))
        throw err;
      const message = err.message;
      annotationsBuf.push({
        phase,
        key: "blocking.hook_exception",
        value: message
      });
      events.push({
        id: crypto.randomUUID(),
        type: "turn.annotated",
        agentId: agent.id,
        sessionId,
        timestamp: /* @__PURE__ */ new Date(),
        payload: {
          key: "blocking.hook_exception",
          phase,
          error: message
        }
      });
      return {
        payload,
        shortCircuited: false,
        correctionRequested: false
      };
    }
  };
  let session = await deps.sessions.get(sessionId);
  if (!session) {
    session = createSession(sessionId, agent.id, userMessage.metadata.userId ?? "unknown", userMessage.transportOrigin);
  }
  session = addMessage(session, userMessage);
  events.push(createEvent(crypto.randomUUID(), "message.received", agent.id, { messageId: userMessage.id }, sessionId));
  let ontology = await deps.ontologyService.compose(agent.id);
  const recallResult = await deps.memory.recall({
    agentId: agent.id,
    query: userMessage.content,
    limit: 20
  });
  let memories = recallResult.entries;
  const effectiveBudget = budget ?? budgetFromMaxTurns(agent.config.maxTurns || 10);
  const tracker = createBudgetTracker(effectiveBudget, { modelId: agent.config.modelId });
  const hardCap = Math.max(effectiveBudget.maxCalls != null ? effectiveBudget.maxCalls * 2 : 100, 1);
  let totalLLMCalls = 0;
  let finalResponse = null;
  let budgetExhaustedDuringLoop = false;
  let earlyExit = null;
  try {
    const preTurn = await fire("pre_turn", { userMessage, ontology, memories, session });
    if (preTurn.shortCircuited) {
      earlyExit = { finalResponse: preTurn.finalResponse ?? null, reason: preTurn.reason };
    } else {
      ontology = preTurn.payload.ontology;
      memories = preTurn.payload.memories;
    }
    const toolDefs = [];
    if (!earlyExit) {
      for (const scope of agent.config.toolScopes) {
        const discovered = await deps.tools.discoverTools(scope);
        toolDefs.push(...discovered);
      }
    }
    const MAX_CONTEXT_MESSAGES = 20;
    const windowedMessages = session.messages.length > MAX_CONTEXT_MESSAGES ? session.messages.slice(-MAX_CONTEXT_MESSAGES) : session.messages;
    let context = !earlyExit ? buildContext({
      config: agent.config,
      ontology,
      memories,
      messages: windowedMessages,
      tools: toolDefs,
      ontologyRenderer: deps.ontologyRenderer,
      transport: userMessage.transportOrigin
    }) : { systemPrompt: "", messages: [], tools: [], tokenEstimate: 0 };
    if (!earlyExit) {
      const preContext = await fire("pre_context", {
        context,
        recall: recallResult,
        recallQuery: userMessage.content,
        availableEntityTypes: ontology.entityTypes.map((e) => e.name)
      });
      if (preContext.shortCircuited) {
        earlyExit = { finalResponse: preContext.finalResponse ?? null, reason: preContext.reason };
      } else {
        context = preContext.payload.context;
      }
    }
    let turnMessages = [...windowedMessages];
    if (tracing) {
      trace.push({ step: "start", timestamp: Date.now(), data: { sessionMessages: session.messages.length, windowedMessages: windowedMessages.length, hardCap, budget: effectiveBudget } });
    }
    let correctionsUsed = 0;
    correctionLoop: while (!earlyExit) {
      finalResponse = null;
      llmLoop: while (totalLLMCalls < hardCap) {
        const preLlm = await fire("pre_llm", {
          messages: turnMessages,
          systemPrompt: context.systemPrompt,
          tools: toolDefs,
          callNumber: totalLLMCalls + 1
        });
        if (preLlm.shortCircuited) {
          earlyExit = { finalResponse: preLlm.finalResponse ?? null, reason: preLlm.reason };
          break llmLoop;
        }
        if (tracing) {
          trace.push({ step: "llm_call", timestamp: Date.now(), data: { turnMessages: preLlm.payload.messages.length, toolDefs: preLlm.payload.tools.length, callNumber: totalLLMCalls + 1 } });
        }
        const llmResponse = await deps.llm.complete({
          model: agent.config.modelId,
          systemPrompt: preLlm.payload.systemPrompt,
          messages: preLlm.payload.messages,
          tools: preLlm.payload.tools
        });
        totalLLMCalls++;
        llmCalls++;
        totalInputTokens += llmResponse.usage.inputTokens;
        totalOutputTokens += llmResponse.usage.outputTokens;
        totalCacheReadTokens += llmResponse.usage.cacheReadTokens ?? 0;
        totalCacheWriteTokens += llmResponse.usage.cacheWriteTokens ?? 0;
        tracker.recordCall(llmResponse.usage);
        if (tracing) {
          trace.push({ step: "llm_response", timestamp: Date.now(), data: { contentLength: llmResponse.content.length, toolCalls: llmResponse.toolCalls.length, stopReason: llmResponse.stopReason, usage: llmResponse.usage } });
        }
        const postLlm = await fire("post_llm", { response: llmResponse, callNumber: totalLLMCalls });
        const effectiveResponse = postLlm.payload.response;
        if (postLlm.shortCircuited) {
          earlyExit = { finalResponse: postLlm.finalResponse ?? null, reason: postLlm.reason };
          finalResponse = effectiveResponse;
          break llmLoop;
        }
        if (effectiveResponse.stopReason === "tool_use" && effectiveResponse.toolCalls.length > 0) {
          let toolLoopShortCircuit = false;
          for (const call of effectiveResponse.toolCalls) {
            const preTool = await fire("pre_tool", { call });
            if (preTool.shortCircuited) {
              earlyExit = { finalResponse: preTool.finalResponse ?? null, reason: preTool.reason };
              finalResponse = effectiveResponse;
              toolLoopShortCircuit = true;
              break;
            }
            const effectiveCall = preTool.payload.call;
            events.push(createEvent(crypto.randomUUID(), "tool.invoked", agent.id, { tool: effectiveCall.toolName }, sessionId));
            const rawResult = await deps.tools.execute(effectiveCall);
            const availableEntityTypes = ontology.entityTypes.map((e) => e.name);
            const postTool = await fire("post_tool", {
              call: effectiveCall,
              result: rawResult,
              availableEntityTypes
            });
            const result2 = postTool.payload.result;
            allToolResults.push(result2);
            events.push(createEvent(crypto.randomUUID(), "tool.completed", agent.id, { tool: effectiveCall.toolName, status: result2.status }, sessionId));
            const toolUseId = effectiveCall.id;
            turnMessages = [
              ...turnMessages,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: effectiveResponse.content,
                timestamp: /* @__PURE__ */ new Date(),
                transportOrigin: "agent",
                toolInvocations: [{ toolName: effectiveCall.toolName, input: effectiveCall.input, output: result2.output, durationMs: result2.durationMs, status: result2.status }],
                metadata: { toolUseId }
              },
              {
                id: crypto.randomUUID(),
                role: "tool",
                content: typeof result2.output === "string" ? result2.output : JSON.stringify(result2.output),
                timestamp: /* @__PURE__ */ new Date(),
                transportOrigin: "tool",
                metadata: { toolName: effectiveCall.toolName, callId: toolUseId }
              }
            ];
            if (postTool.shortCircuited) {
              earlyExit = { finalResponse: postTool.finalResponse ?? null, reason: postTool.reason };
              finalResponse = effectiveResponse;
              toolLoopShortCircuit = true;
              break;
            }
          }
          if (toolLoopShortCircuit)
            break llmLoop;
          if (tracker.isExhausted()) {
            if (tracing) {
              trace.push({ step: "budget_check", timestamp: Date.now(), data: { exhausted: true, status: tracker.getStatus() } });
            }
            finalResponse = effectiveResponse;
            budgetExhaustedDuringLoop = true;
            break llmLoop;
          }
          if (tracing) {
            trace.push({ step: "budget_check", timestamp: Date.now(), data: { exhausted: false, status: tracker.getStatus() } });
          }
        } else {
          finalResponse = effectiveResponse;
          break llmLoop;
        }
      }
      if (earlyExit)
        break correctionLoop;
      const candidateContent = finalResponse?.content ?? (tracker.getStatus().exhausted || budgetExhaustedDuringLoop ? "[Agent budget exhausted]" : "[Agent reached max turns without completing]");
      const candidateMessage = createAssistantMessage(crypto.randomUUID(), candidateContent, allToolResults.map((r) => ({
        toolName: r.toolName,
        input: {},
        output: r.output,
        durationMs: r.durationMs,
        status: r.status
      })));
      const preCapture = await fire("pre_capture", {
        response: candidateMessage,
        toolResults: allToolResults,
        ontology
      });
      if (preCapture.correctionRequested) {
        if (correctionsUsed < MAX_CORRECTION_RETRIES_PER_TURN) {
          correctionsUsed++;
          turnMessages = [
            ...turnMessages,
            candidateMessage,
            createUserMessage(crypto.randomUUID(), preCapture.correctionPrompt ?? "Please correct your response.", "system")
          ];
          continue correctionLoop;
        }
        events.push(createEvent(crypto.randomUUID(), "turn.correction_cap_exceeded", agent.id, {
          hookName: preCapture.hookName,
          correctionsUsed,
          cap: MAX_CORRECTION_RETRIES_PER_TURN
        }, sessionId));
      }
      if (preCapture.shortCircuited) {
        earlyExit = { finalResponse: preCapture.finalResponse ?? candidateMessage, reason: preCapture.reason };
      }
      break correctionLoop;
    }
    const budgetStatus = tracker.getStatus();
    const budgetExhausted = budgetExhaustedDuringLoop || budgetStatus.exhausted;
    const fallbackContent = budgetExhausted ? "[Agent budget exhausted]" : earlyExit ? `[Agent short-circuited${earlyExit.reason ? `: ${earlyExit.reason}` : ""}]` : "[Agent reached max turns without completing]";
    const builtContent = earlyExit ? fallbackContent : finalResponse?.content ?? fallbackContent;
    const responseMessage = earlyExit?.finalResponse ?? createAssistantMessage(crypto.randomUUID(), builtContent, allToolResults.map((r) => ({
      toolName: r.toolName,
      input: {},
      output: r.output,
      durationMs: r.durationMs,
      status: r.status
    })));
    session = addMessage(session, responseMessage);
    await deps.sessions.save(session);
    events.push(createEvent(crypto.randomUUID(), "message.sent", agent.id, { messageId: responseMessage.id }, sessionId));
    let memoriesCaptured = [];
    let droppedCandidates = [];
    try {
      const captureResult = await captureFromResponse({
        response: responseMessage.content,
        ontology,
        agent,
        sessionId,
        turnId,
        memory: deps.memory
      });
      memoriesCaptured = captureResult.captured;
      droppedCandidates = captureResult.dropped;
      for (const errMsg of captureResult.errors) {
        annotationsBuf.push({
          phase: "post_capture",
          key: "memory.capture_error",
          value: errMsg
        });
      }
      for (const fe of captureResult.frictionEvents) {
        events.push(fe);
      }
    } catch (err) {
      annotationsBuf.push({
        phase: "post_capture",
        key: "memory.capture_error",
        value: err instanceof Error ? err.message : String(err)
      });
    }
    const availableEntityTypesAtCapture = ontology.entityTypes.map((e) => e.name);
    let recentlyCaptured;
    if (memoriesCaptured.length > 0) {
      for (const entry of memoriesCaptured) {
        try {
          const chain = await deps.memory.getSupersedeChain(entry.id);
          if (chain.length === 0)
            continue;
          const propertyNames = Object.keys(entry.structured).sort();
          const nonIdKeys = propertyNames.filter((p) => p !== "id");
          const propertyName = nonIdKeys[0] ?? propertyNames[0];
          if (!propertyName)
            continue;
          const coverage = chain.filter((p) => propertyName in p.structured).length;
          if (coverage < Math.ceil(chain.length / 2))
            continue;
          const priorValues = [...chain].reverse().map((prior) => prior.structured[propertyName]);
          recentlyCaptured = {
            chainAnchor: entry.id,
            entityType: entry.entityType,
            propertyName,
            currentValue: entry.structured[propertyName],
            priorValues
          };
          break;
        } catch {
          continue;
        }
      }
    }
    const postCapture = await fire("post_capture", {
      captured: memoriesCaptured,
      availableEntityTypes: availableEntityTypesAtCapture,
      droppedCandidates,
      ...recentlyCaptured ? { recentlyCaptured } : {}
    });
    if (postCapture.shortCircuited && !earlyExit) {
      earlyExit = { finalResponse: postCapture.finalResponse ?? null, reason: postCapture.reason };
    }
    const estimatedCostUSD = estimateCostUSD(agent.config.modelId, {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheWriteTokens: totalCacheWriteTokens
    });
    if (tracing) {
      trace.push({ step: "complete", timestamp: Date.now(), data: { budgetExhausted, responseLength: responseMessage.content.length, totalLLMCalls, hardCap } });
    }
    const result = {
      response: responseMessage,
      session,
      memoriesCaptured,
      events,
      toolResults: allToolResults,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        llmCalls,
        estimatedCostUSD
      },
      budgetExhausted,
      budgetStatus: {
        calls: budgetStatus.calls,
        tokens: budgetStatus.tokens,
        timeMs: budgetStatus.timeMs,
        ...budgetStatus.exhaustedReason ? { reason: budgetStatus.exhaustedReason } : {}
      },
      ...tracing ? { trace } : {}
    };
    await fire("post_turn", {
      result,
      availableEntityTypes: availableEntityTypesAtCapture
    });
    return result;
  } catch (err) {
    const partialResult = {
      response: createAssistantMessage(crypto.randomUUID(), `[Agent error: ${err instanceof Error ? err.message : String(err)}]`, []),
      session,
      memoriesCaptured: [],
      events,
      toolResults: allToolResults,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        llmCalls,
        // Even on the error path, surface real cost when tokens were
        // consumed before the throw — billing observers/cost trackers
        // running at post_turn should see the spend that already happened.
        estimatedCostUSD: estimateCostUSD(agent.config.modelId, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheWriteTokens: totalCacheWriteTokens
        })
      }
    };
    try {
      await fire("post_turn", {
        result: partialResult,
        availableEntityTypes: ontology.entityTypes.map((e) => e.name)
      });
    } catch {
    }
    throw err;
  }
}

// ../freya/packages/core/dist/domain/services/IdentifierRedactionService.js
var OPAQUE_ID_DEFAULT_MIN = 32;
var OPAQUE_ID_DEFAULT_PATTERN = new RegExp(`\\b[A-Za-z0-9]{${OPAQUE_ID_DEFAULT_MIN},}\\b`, "g");

// ../freya/packages/runtime/dist/streaming.js
async function* executeStreamingTurn(agent, sessionId, userMessage, deps, budget, signal) {
  const events = [];
  const allToolResults = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let llmCalls = 0;
  const effectiveBudget = budget ?? budgetFromMaxTurns(agent.config.maxTurns || 10);
  const tracker = createBudgetTracker(effectiveBudget, { modelId: agent.config.modelId });
  const hardCap = Math.max(effectiveBudget.maxCalls != null ? effectiveBudget.maxCalls * 2 : 100, 1);
  let budgetExhaustedDuringLoop = false;
  const turnId = crypto.randomUUID();
  const annotations = [];
  let currentPhase = "init";
  const rawFire = makeFireHook({
    registry: deps.hooks ?? new InMemoryHookRegistry(),
    agent,
    sessionId,
    turnId,
    onEvent: (e) => events.push(e),
    // Wire annotations through to a local buffer so callers / tests can see
    // them; without this they were silently dropped (the default is a no-op).
    onAnnotation: (key, value) => annotations.push({ phase: currentPhase, key, value })
  });
  const fire = async (phase, payload) => {
    currentPhase = phase;
    try {
      return await rawFire(phase, payload);
    } catch (err) {
      if (!(err instanceof HookExecutionError))
        throw err;
      const message = err.message;
      annotations.push({
        phase,
        key: "streaming.hook_exception",
        value: message
      });
      events.push(annotationEvent(agent.id, sessionId, "streaming.hook_exception", {
        phase,
        error: message
      }));
      return {
        payload,
        shortCircuited: false,
        correctionRequested: false
      };
    }
  };
  const userId = userMessage.metadata?.userId ?? "unknown";
  let session = await deps.sessions.get(sessionId);
  if (!session) {
    session = createSession(sessionId, agent.id, userId, userMessage.transportOrigin);
  }
  session = addMessage(session, userMessage);
  events.push(createEvent(crypto.randomUUID(), "message.received", agent.id, { messageId: userMessage.id }, sessionId));
  let ontology = await deps.ontologyService.compose(agent.id);
  const recallResult = await deps.memory.recall({
    agentId: agent.id,
    query: userMessage.content,
    limit: 20
  });
  let memories = recallResult.entries;
  let streamingStarted = false;
  let earlyExitReason;
  let earlyExitResponse = null;
  let earlyShortCircuit = false;
  try {
    const preTurn = await fire("pre_turn", {
      userMessage,
      ontology,
      memories,
      session
    });
    if (preTurn.shortCircuited) {
      earlyExitReason = preTurn.reason;
      earlyExitResponse = preTurn.finalResponse ?? null;
      yield systemMessage("pre_turn", preTurn.reason, preTurn.finalResponse);
      earlyShortCircuit = true;
    } else {
      ontology = preTurn.payload.ontology;
      memories = preTurn.payload.memories;
    }
    const toolDefs = [];
    if (!earlyShortCircuit) {
      for (const scope of agent.config.toolScopes) {
        const discovered = await deps.tools.discoverTools(scope);
        toolDefs.push(...discovered);
      }
    }
    const MAX_CONTEXT_MESSAGES = 20;
    const windowedMessages = session.messages.length > MAX_CONTEXT_MESSAGES ? session.messages.slice(-MAX_CONTEXT_MESSAGES) : session.messages;
    let context = !earlyShortCircuit ? buildContext({
      config: agent.config,
      ontology,
      memories,
      messages: windowedMessages,
      tools: toolDefs,
      ontologyRenderer: deps.ontologyRenderer,
      transport: userMessage.transportOrigin
    }) : { systemPrompt: "", messages: [], tools: [], tokenEstimate: 0 };
    if (!earlyShortCircuit) {
      const preContext = await fire("pre_context", {
        context,
        recall: recallResult,
        recallQuery: userMessage.content,
        availableEntityTypes: ontology.entityTypes.map((e) => e.name)
      });
      if (preContext.shortCircuited) {
        earlyExitReason = preContext.reason;
        earlyExitResponse = preContext.finalResponse ?? null;
        yield systemMessage("pre_context", preContext.reason, preContext.finalResponse);
        earlyShortCircuit = true;
      } else {
        context = preContext.payload.context;
      }
    }
    let currentMessages = [...windowedMessages];
    let lastAssistantContent = "";
    while (!earlyShortCircuit && llmCalls < hardCap) {
      const preLlm = await fire("pre_llm", {
        messages: currentMessages,
        systemPrompt: context.systemPrompt,
        tools: toolDefs,
        callNumber: llmCalls + 1
      });
      if (preLlm.shortCircuited) {
        if (!streamingStarted) {
          earlyExitReason = preLlm.reason;
          earlyExitResponse = preLlm.finalResponse ?? null;
          yield systemMessage("pre_llm", preLlm.reason, preLlm.finalResponse);
          earlyShortCircuit = true;
          break;
        }
        events.push(annotationEvent(agent.id, sessionId, "streaming.short_circuit_after_emit", {
          phase: "pre_llm",
          reason: preLlm.reason
        }));
        break;
      }
      let fullContent = "";
      const toolCalls = [];
      let chunkUsage = {
        inputTokens: 0,
        outputTokens: 0
      };
      for await (const chunk of deps.llm.stream({
        model: agent.config.modelId,
        systemPrompt: preLlm.payload.systemPrompt,
        messages: preLlm.payload.messages,
        tools: preLlm.payload.tools,
        signal
      })) {
        if (chunk.type === "text" && chunk.content) {
          fullContent += chunk.content;
          streamingStarted = true;
          yield chunk.content;
        } else if (chunk.type === "tool_call" && chunk.toolCall) {
          toolCalls.push(chunk.toolCall);
        } else if (chunk.type === "done") {
          if (chunk.usage) {
            chunkUsage = {
              inputTokens: chunk.usage.inputTokens,
              outputTokens: chunk.usage.outputTokens,
              ...chunk.usage.cacheReadTokens !== void 0 && { cacheReadTokens: chunk.usage.cacheReadTokens },
              ...chunk.usage.cacheWriteTokens !== void 0 && { cacheWriteTokens: chunk.usage.cacheWriteTokens }
            };
          }
          break;
        }
      }
      llmCalls++;
      lastAssistantContent = fullContent;
      const llmResponse = {
        content: fullContent,
        toolCalls,
        usage: chunkUsage,
        stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn"
      };
      tracker.recordCall(llmResponse.usage);
      const postLlm = await fire("post_llm", {
        response: llmResponse,
        callNumber: llmCalls
      });
      totalInputTokens += llmResponse.usage.inputTokens;
      totalOutputTokens += llmResponse.usage.outputTokens;
      totalCacheReadTokens += llmResponse.usage.cacheReadTokens ?? 0;
      totalCacheWriteTokens += llmResponse.usage.cacheWriteTokens ?? 0;
      const effectiveResponse = postLlm.payload.response;
      if (postLlm.shortCircuited) {
        events.push(annotationEvent(agent.id, sessionId, "streaming.short_circuit_after_emit", {
          phase: "post_llm",
          reason: postLlm.reason
        }));
        break;
      }
      if (effectiveResponse.toolCalls.length === 0)
        break;
      const availableEntityTypes = ontology.entityTypes.map((e) => e.name);
      let toolLoopBreak = false;
      for (const call of effectiveResponse.toolCalls) {
        const preTool = await fire("pre_tool", { call });
        if (preTool.shortCircuited) {
          events.push(annotationEvent(agent.id, sessionId, "streaming.short_circuit_after_emit", {
            phase: "pre_tool",
            reason: preTool.reason
          }));
          toolLoopBreak = true;
          break;
        }
        const effectiveCall = preTool.payload.call;
        events.push(createEvent(crypto.randomUUID(), "tool.invoked", agent.id, { tool: effectiveCall.toolName }, sessionId));
        const result2 = await deps.tools.execute(effectiveCall);
        const postTool = await fire("post_tool", {
          call: effectiveCall,
          result: result2,
          availableEntityTypes
        });
        const effectiveResult = postTool.payload.result;
        allToolResults.push(effectiveResult);
        events.push(createEvent(crypto.randomUUID(), "tool.completed", agent.id, { tool: effectiveCall.toolName, status: effectiveResult.status }, sessionId));
        currentMessages = [
          ...currentMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullContent,
            timestamp: /* @__PURE__ */ new Date(),
            transportOrigin: "agent",
            toolInvocations: [
              {
                toolName: effectiveCall.toolName,
                input: effectiveCall.input,
                output: effectiveResult.output,
                durationMs: effectiveResult.durationMs,
                status: effectiveResult.status
              }
            ],
            // Thread the original tool-call id so the LLM adapter can emit a
            // `tool_use` block whose id matches the `tool_result` below. Without
            // this, the Anthropic adapter synthesises two *independent* ids
            // (random vs Date.now()) and the provider rejects the continuation
            // call with "tool_result ... has no corresponding tool_use block".
            // Mirrors the blocking codepath (executeTurn) which sets the same.
            metadata: { toolUseId: effectiveCall.id }
          },
          {
            id: crypto.randomUUID(),
            role: "tool",
            content: typeof effectiveResult.output === "string" ? effectiveResult.output : JSON.stringify(effectiveResult.output),
            timestamp: /* @__PURE__ */ new Date(),
            transportOrigin: "tool",
            metadata: { toolName: effectiveCall.toolName, callId: effectiveCall.id }
          }
        ];
        if (postTool.shortCircuited) {
          events.push(annotationEvent(agent.id, sessionId, "streaming.short_circuit_after_emit", {
            phase: "post_tool",
            reason: postTool.reason
          }));
          toolLoopBreak = true;
          break;
        }
      }
      if (toolLoopBreak)
        break;
      if (tracker.isExhausted()) {
        budgetExhaustedDuringLoop = true;
        const status = tracker.getStatus();
        events.push(annotationEvent(agent.id, sessionId, "streaming.budget_exhausted", {
          reason: status.exhaustedReason,
          calls: status.calls
        }));
        yield `
[Agent budget exhausted${status.exhaustedReason ? `: ${status.exhaustedReason}` : ""}]`;
        break;
      }
    }
    const candidateMessage = earlyShortCircuit ? earlyExitResponse ?? createAssistantMessage(crypto.randomUUID(), `[Agent short-circuited${earlyExitReason ? `: ${earlyExitReason}` : ""}]`, []) : createAssistantMessage(crypto.randomUUID(), budgetExhaustedDuringLoop && lastAssistantContent.trim().length === 0 ? "[Agent budget exhausted]" : lastAssistantContent, allToolResults.map((r) => ({
      toolName: r.toolName,
      input: {},
      output: r.output,
      durationMs: r.durationMs,
      status: r.status
    })));
    let responseMessage = candidateMessage;
    let memoriesCaptured = [];
    let droppedCandidates = [];
    if (!earlyShortCircuit) {
      const preCapture = await fire("pre_capture", {
        response: candidateMessage,
        toolResults: allToolResults,
        ontology
      });
      if (preCapture.correctionRequested) {
        events.push(annotationEvent(agent.id, sessionId, "streaming.correction_requested", {
          hookName: preCapture.hookName,
          correctionPrompt: preCapture.correctionPrompt
        }));
      } else if (preCapture.shortCircuited) {
        events.push(annotationEvent(agent.id, sessionId, "streaming.short_circuit_after_emit", {
          phase: "pre_capture",
          reason: preCapture.reason
        }));
      }
      responseMessage = preCapture.shortCircuited && preCapture.finalResponse ? preCapture.finalResponse : candidateMessage;
      try {
        const captureResult = await captureFromResponse({
          response: responseMessage.content,
          ontology,
          agent,
          sessionId,
          turnId,
          memory: deps.memory
        });
        memoriesCaptured = captureResult.captured;
        droppedCandidates = captureResult.dropped;
        for (const errMsg of captureResult.errors) {
          events.push(annotationEvent(agent.id, sessionId, "streaming.memory_capture_error", {
            error: errMsg
          }));
        }
        for (const fe of captureResult.frictionEvents) {
          events.push(fe);
        }
      } catch (err) {
        events.push(annotationEvent(agent.id, sessionId, "streaming.memory_capture_error", {
          error: err instanceof Error ? err.message : String(err)
        }));
      }
      const availableEntityTypesAtCapture = ontology.entityTypes.map((e) => e.name);
      let recentlyCaptured;
      if (memoriesCaptured.length > 0) {
        for (const entry of memoriesCaptured) {
          try {
            const chain = await deps.memory.getSupersedeChain(entry.id);
            if (chain.length === 0)
              continue;
            const propertyNames = Object.keys(entry.structured).sort();
            const nonIdKeys = propertyNames.filter((p) => p !== "id");
            const propertyName = nonIdKeys[0] ?? propertyNames[0];
            if (!propertyName)
              continue;
            const coverage = chain.filter((p) => propertyName in p.structured).length;
            if (coverage < Math.ceil(chain.length / 2))
              continue;
            const priorValues = [...chain].reverse().map((prior) => prior.structured[propertyName]);
            recentlyCaptured = {
              chainAnchor: entry.id,
              entityType: entry.entityType,
              propertyName,
              currentValue: entry.structured[propertyName],
              priorValues
            };
            break;
          } catch {
            continue;
          }
        }
      }
      const postCapture = await fire("post_capture", {
        captured: memoriesCaptured,
        availableEntityTypes: availableEntityTypesAtCapture,
        droppedCandidates,
        ...recentlyCaptured ? { recentlyCaptured } : {}
      });
      if (postCapture.shortCircuited) {
        events.push(annotationEvent(agent.id, sessionId, "streaming.short_circuit_after_emit", {
          phase: "post_capture",
          reason: postCapture.reason
        }));
      }
    }
    session = addMessage(session, responseMessage);
    await deps.sessions.save(session);
    events.push(createEvent(crypto.randomUUID(), "message.sent", agent.id, { messageId: responseMessage.id }, sessionId));
    const finalBudgetStatus = tracker.getStatus();
    const budgetExhausted = budgetExhaustedDuringLoop || finalBudgetStatus.exhausted;
    const result = {
      response: responseMessage,
      session,
      memoriesCaptured,
      events,
      toolResults: allToolResults,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        llmCalls,
        // Compute via the shared `estimateCostUSD` helper so blocking +
        // streaming produce identical numbers for the same model + tokens.
        // Cache tokens flow through the optional usage fields so cached
        // agents get accurate cost (cache_read at 0.1× input rate, cache_write
        // at 1.25×).
        estimatedCostUSD: estimateCostUSD(agent.config.modelId, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheWriteTokens: totalCacheWriteTokens
        })
      },
      budgetExhausted,
      budgetStatus: {
        calls: finalBudgetStatus.calls,
        tokens: finalBudgetStatus.tokens,
        timeMs: finalBudgetStatus.timeMs,
        ...finalBudgetStatus.exhaustedReason ? { reason: finalBudgetStatus.exhaustedReason } : {}
      }
    };
    try {
      await fire("post_turn", {
        result,
        availableEntityTypes: ontology.entityTypes.map((e) => e.name)
      });
    } catch {
    }
  } catch (err) {
    const partialBudgetStatus = tracker.getStatus();
    const partialResult = {
      response: createAssistantMessage(crypto.randomUUID(), `[Agent error: ${err instanceof Error ? err.message : String(err)}]`, []),
      session,
      memoriesCaptured: [],
      events,
      toolResults: allToolResults,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        llmCalls,
        // Even on the error path, attribute real cost for tokens already
        // consumed before the throw — billing observers / cost-trackers
        // at post_turn should see the spend that already happened.
        estimatedCostUSD: estimateCostUSD(agent.config.modelId, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheWriteTokens: totalCacheWriteTokens
        })
      },
      budgetExhausted: budgetExhaustedDuringLoop || partialBudgetStatus.exhausted,
      budgetStatus: {
        calls: partialBudgetStatus.calls,
        tokens: partialBudgetStatus.tokens,
        timeMs: partialBudgetStatus.timeMs,
        ...partialBudgetStatus.exhaustedReason ? { reason: partialBudgetStatus.exhaustedReason } : {}
      }
    };
    try {
      await fire("post_turn", {
        result: partialResult,
        availableEntityTypes: ontology.entityTypes.map((e) => e.name)
      });
    } catch {
    }
    throw err;
  }
}
function systemMessage(phase, reason, finalResponse) {
  if (finalResponse?.content)
    return finalResponse.content;
  return `[Agent short-circuited at ${phase}${reason ? `: ${reason}` : ""}]`;
}
function annotationEvent(agentId, sessionId, key, data) {
  return {
    id: crypto.randomUUID(),
    type: "turn.annotated",
    agentId,
    sessionId,
    timestamp: /* @__PURE__ */ new Date(),
    payload: { key, ...data }
  };
}

// ../freya/packages/runtime/dist/create-agent-runtime.js
function createAgentRuntime(adapters, agents = /* @__PURE__ */ new Map()) {
  const agentMap = new Map(agents);
  const ontologyService = {
    async compose(agentId) {
      const agent = agentMap.get(agentId);
      if (!agent)
        throw new Error(`Agent not found: ${agentId}`);
      const scopes = agent.config.ontologyScopes;
      return adapters.ontologyRepo.compose(scopes);
    },
    render(ontology) {
      return renderOntologySimple(ontology);
    },
    async validate(entityType, data) {
      const firstAgent = agentMap.values().next().value;
      if (!firstAgent)
        return true;
      const ontology = await adapters.ontologyRepo.compose(firstAgent.config.ontologyScopes);
      const result = adapters.ontologyRepo.validateEntry(entityType, data, ontology);
      return result.valid;
    }
  };
  const ontologyRenderer = {
    render: renderOntologySimple
  };
  const registry = {
    async getAgent(agentId) {
      return agentMap.get(agentId) ?? null;
    },
    async listAgents() {
      return Array.from(agentMap.values());
    },
    async registerAgent(config, deploymentId) {
      const agent = createAgent(config, deploymentId);
      agentMap.set(agent.id, agent);
      return agent;
    }
  };
  return {
    async handleMessage({ agentId, sessionId, message, budget }) {
      const agent = agentMap.get(agentId);
      if (!agent)
        throw new Error(`Agent not found: ${agentId}`);
      const result = await executeTurn(agent, sessionId, message, {
        llm: adapters.llm,
        tools: adapters.toolExecutor,
        memory: adapters.memory,
        sessions: adapters.sessions,
        ontologyService,
        ontologyRenderer,
        transport: adapters.transport ?? noopTransport,
        embedding: adapters.embedding
      }, budget);
      return {
        message: result.response,
        session: result.session,
        memoriesCaptured: result.memoriesCaptured,
        delegations: [],
        usage: result.usage
      };
    },
    handleMessageStream({ agentId, sessionId, message, budget, hooks, signal }) {
      const agent = agentMap.get(agentId);
      if (!agent)
        throw new Error(`Agent not found: ${agentId}`);
      return executeStreamingTurn(agent, sessionId, message, {
        llm: adapters.llm,
        tools: adapters.toolExecutor,
        memory: adapters.memory,
        sessions: adapters.sessions,
        ontologyService,
        ontologyRenderer,
        embedding: adapters.embedding,
        ...hooks ? { hooks } : {}
      }, budget, signal);
    },
    async startSession({ agentId, userId, transportId }) {
      const session = createSession(crypto.randomUUID(), agentId, userId, transportId);
      await adapters.sessions.save(session);
      return session;
    },
    async getAgent(agentId) {
      return agentMap.get(agentId) ?? null;
    },
    registry
  };
}
function renderOntologySimple(ontology) {
  if (ontology.entityTypes.length === 0)
    return "";
  const lines = ["# Domain Ontology"];
  for (const entity of ontology.entityTypes) {
    const props = entity.properties.map((p) => p.name).join(", ");
    const rels = ontology.relationships.filter((r) => r.fromType === entity.name).map((r) => `${r.name}\u2192${r.toType}`).join(", ");
    let line = `## ${entity.name}: [${props}]`;
    if (rels)
      line += ` | ${rels}`;
    if (entity.description && entity.description !== entity.name) {
      line += `
${entity.description}`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}
var noopTransport = {
  async send() {
  },
  async stream() {
  }
};

// ../freya/packages/llm/dist/adapters/anthropic.js
function toAnthropicMessages(messages) {
  const result = [];
  for (const m of messages) {
    if (m.role === "user") {
      result.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.toolInvocations && m.toolInvocations.length > 0) {
        const contentBlocks = [];
        if (m.content) {
          contentBlocks.push({ type: "text", text: m.content });
        }
        const toolUseId = m.metadata?.toolUseId || m.toolInvocations[0].toolName + "_" + Math.random().toString(36).slice(2);
        for (const tool of m.toolInvocations) {
          contentBlocks.push({
            type: "tool_use",
            id: toolUseId,
            name: tool.toolName,
            input: tool.input
          });
        }
        result.push({ role: "assistant", content: contentBlocks });
      } else {
        result.push({ role: "assistant", content: m.content });
      }
    } else if (m.role === "tool") {
      const toolName = m.metadata?.toolName || "unknown";
      const callId = m.metadata?.callId || toolName + "_" + Date.now();
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: callId,
            content: m.content
          }
        ]
      });
    }
  }
  return result;
}
function toAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  }));
}
var AnthropicLLM = class {
  config;
  constructor(config) {
    this.config = config;
  }
  async complete(params) {
    const body = {
      model: params.model || this.config.defaultModel || "claude-sonnet-4-6",
      max_tokens: params.maxTokens || this.config.maxTokens || 4096,
      system: params.systemPrompt,
      messages: toAnthropicMessages(params.messages)
    };
    if (params.temperature !== void 0) {
      body.temperature = params.temperature;
    }
    if (params.tools && params.tools.length > 0) {
      body.tools = toAnthropicTools(params.tools);
    }
    const baseUrl = this.config.baseUrl || "https://api.anthropic.com";
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    }
    const data = await response.json();
    let content = "";
    const toolCalls = [];
    for (const block of data.content || []) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          toolName: block.name,
          input: block.input,
          timestamp: /* @__PURE__ */ new Date()
        });
      }
    }
    return {
      content,
      toolCalls,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0
      },
      stopReason: data.stop_reason === "tool_use" ? "tool_use" : data.stop_reason === "max_tokens" ? "max_tokens" : "end_turn"
    };
  }
  async *stream(params) {
    const body = {
      model: params.model || this.config.defaultModel || "claude-sonnet-4-6",
      max_tokens: params.maxTokens || this.config.maxTokens || 4096,
      system: params.systemPrompt,
      messages: toAnthropicMessages(params.messages),
      stream: true
    };
    if (params.temperature !== void 0) {
      body.temperature = params.temperature;
    }
    if (params.tools && params.tools.length > 0) {
      body.tools = toAnthropicTools(params.tools);
    }
    const baseUrl = this.config.baseUrl || "https://api.anthropic.com";
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body),
      // Aborting this signal tears down the HTTP request to Anthropic, which
      // stops token generation server-side — true cancellation, not just
      // closing the consumer's reader.
      signal: params.signal
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic streaming error: ${response.status} ${errorBody}`);
    }
    const reader = response.body?.getReader();
    if (!reader)
      throw new Error("No response body for streaming");
    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let sawUsage = false;
    const pendingToolBlocks = /* @__PURE__ */ new Map();
    const sanitizeTokens = (v) => {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        return null;
      return v;
    };
    const doneChunk = () => {
      if (!sawUsage)
        return { type: "done" };
      const usage = {
        inputTokens,
        outputTokens
      };
      if (cacheReadTokens > 0)
        usage.cacheReadTokens = cacheReadTokens;
      if (cacheWriteTokens > 0)
        usage.cacheWriteTokens = cacheWriteTokens;
      return { type: "done", usage };
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: "))
          continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          yield doneChunk();
          return;
        }
        try {
          const event = JSON.parse(data);
          if (event.type === "message_start") {
            const u = event.message?.usage;
            if (u) {
              const inp = sanitizeTokens(u.input_tokens);
              const out = sanitizeTokens(u.output_tokens);
              const cr = sanitizeTokens(u.cache_read_input_tokens);
              const cw = sanitizeTokens(u.cache_creation_input_tokens);
              if (inp !== null || out !== null || cr !== null || cw !== null) {
                sawUsage = true;
                if (inp !== null)
                  inputTokens = inp;
                if (out !== null)
                  outputTokens = out;
                if (cr !== null)
                  cacheReadTokens = cr;
                if (cw !== null)
                  cacheWriteTokens = cw;
              }
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta") {
              yield { type: "text", content: event.delta.text };
            } else if (event.delta?.type === "input_json_delta") {
              const idx = event.index;
              const pending = idx !== void 0 ? pendingToolBlocks.get(idx) : void 0;
              if (pending && typeof event.delta.partial_json === "string") {
                pending.jsonBuffer += event.delta.partial_json;
              }
            }
          } else if (event.type === "content_block_start") {
            if (event.content_block?.type === "tool_use") {
              const idx = event.index;
              if (idx !== void 0) {
                pendingToolBlocks.set(idx, {
                  id: event.content_block.id,
                  toolName: event.content_block.name,
                  jsonBuffer: ""
                });
              }
            }
          } else if (event.type === "content_block_stop") {
            const idx = event.index;
            const pending = idx !== void 0 ? pendingToolBlocks.get(idx) : void 0;
            if (pending) {
              let input = {};
              if (pending.jsonBuffer.trim().length > 0) {
                try {
                  const parsed = JSON.parse(pending.jsonBuffer);
                  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                    input = parsed;
                  }
                } catch {
                }
              }
              yield {
                type: "tool_call",
                toolCall: {
                  id: pending.id,
                  toolName: pending.toolName,
                  input,
                  timestamp: /* @__PURE__ */ new Date()
                }
              };
              pendingToolBlocks.delete(idx);
            }
          } else if (event.type === "message_delta") {
            const u = event.usage;
            if (u) {
              const out = sanitizeTokens(u.output_tokens);
              if (out !== null) {
                sawUsage = true;
                outputTokens = out;
              }
            }
          } else if (event.type === "message_stop") {
            yield doneChunk();
            return;
          }
        } catch {
        }
      }
    }
    if (buffer.length > 0) {
      for (const line of buffer.split("\n")) {
        if (!line.startsWith("data: "))
          continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]" || data.length === 0)
          continue;
        try {
          const event = JSON.parse(data);
          if (event.type === "message_delta") {
            const u = event.usage;
            if (u) {
              const out = sanitizeTokens(u.output_tokens);
              if (out !== null) {
                sawUsage = true;
                outputTokens = out;
              }
            }
          }
        } catch {
        }
      }
    }
    yield doneChunk();
  }
};

// ../freya/packages/llm/dist/adapters/fake-embedding.js
var FakeEmbedding = class {
  callCount = 0;
  async embed(text) {
    this.callCount++;
    const vec = new Array(8).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % vec.length] += text.charCodeAt(i) / 1e3;
    }
    const magnitude = Math.sqrt(vec.reduce((s2, v) => s2 + v * v, 0));
    return magnitude > 0 ? vec.map((v) => v / magnitude) : vec;
  }
  async embedBatch(texts) {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
  getCallCount() {
    return this.callCount;
  }
};

// ../freya/packages/memory/dist/adapters/in-memory-repo.js
var InMemoryMemoryRepository = class {
  entries = [];
  events = [];
  async store(entry) {
    this.entries.push(entry);
    this.events.push({
      id: crypto.randomUUID(),
      entryId: entry.id,
      action: "created",
      newValue: entry.content,
      author: entry.source.author,
      timestamp: /* @__PURE__ */ new Date()
    });
  }
  async recall(params) {
    const limit = params.limit ?? 10;
    const queryLower = params.query.toLowerCase();
    const entries = this.entries.filter((e) => {
      if (e.agentId !== params.agentId)
        return false;
      if (e.status !== "active")
        return false;
      if (params.scope && e.scope !== params.scope)
        return false;
      if (params.scopeId && e.scopeId !== params.scopeId)
        return false;
      if (params.entityType && e.entityType !== params.entityType)
        return false;
      return e.content.toLowerCase().includes(queryLower);
    }).slice(0, limit);
    const textMatchCount = entries.length;
    return {
      entries,
      source: textMatchCount > 0 ? "text" : "none",
      vectorCapable: false,
      vectorMatchCount: 0,
      textMatchCount
    };
  }
  async supersede(entryId, newEntryId) {
    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      const idx = this.entries.indexOf(entry);
      this.entries[idx] = {
        ...entry,
        status: "superseded",
        supersededBy: newEntryId
      };
      this.events.push({
        id: crypto.randomUUID(),
        entryId,
        action: "superseded",
        previousValue: entry.content,
        author: "system",
        timestamp: /* @__PURE__ */ new Date()
      });
    }
  }
  async getEventLog(entryId) {
    return this.events.filter((e) => e.entryId === entryId);
  }
  async getByEntityType(agentId, entityType) {
    return this.entries.filter((e) => e.agentId === agentId && e.entityType === entityType && e.status === "active");
  }
  /**
   * Walk the supersede chain backward from `entryId`.
   *
   * At each step we find entries whose `supersededBy` points at the current
   * node, take the most recent one (by `createdAt` desc — handles the
   * unusual case of multiple predecessors pointing at the same successor),
   * and continue from there. A visited-set protects against pathological
   * cycles (a node whose `supersededBy` ultimately loops back to itself or
   * to an ancestor in the walk).
   *
   * Capped at 50 versions — long-lived facts can rack up a lot of versions,
   * and the detector use case only needs "what shapes have we seen recently".
   */
  async getSupersedeChain(entryId) {
    const CAP = 50;
    const chain = [];
    const visited = /* @__PURE__ */ new Set();
    let cursor = entryId;
    visited.add(cursor);
    const anchor = this.entries.find((e) => e.id === entryId);
    if (anchor === void 0)
      return [];
    while (chain.length < CAP) {
      const predecessors = this.entries.filter((e) => e.supersededBy === cursor && e.agentId === anchor.agentId && e.scope === anchor.scope && e.scopeId === anchor.scopeId && e.status === "superseded").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (predecessors.length === 0)
        break;
      const prior = predecessors[0];
      if (visited.has(prior.id)) {
        break;
      }
      visited.add(prior.id);
      chain.push(prior);
      cursor = prior.id;
    }
    return chain;
  }
  // Test helpers
  getAll() {
    return [...this.entries];
  }
  getAllEvents() {
    return [...this.events];
  }
  clear() {
    this.entries = [];
    this.events = [];
  }
};

// ../freya/packages/memory/dist/adapters/in-memory-session-repo.js
var InMemorySessionRepository = class {
  sessions = /* @__PURE__ */ new Map();
  async get(id) {
    return this.sessions.get(id) ?? null;
  }
  async save(session) {
    this.sessions.set(session.id, session);
  }
  async findByUser(userId, agentId, limit) {
    const matches2 = Array.from(this.sessions.values()).filter((s2) => s2.userId === userId && s2.agentId === agentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return limit ? matches2.slice(0, limit) : matches2;
  }
  async findByUserLightweight(userId, agentId, limit) {
    const matches2 = Array.from(this.sessions.values()).filter((s2) => s2.userId === userId && s2.agentId === agentId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const limited = limit ? matches2.slice(0, limit) : matches2;
    return limited.map((s2) => {
      const firstUserMsg = s2.messages.find((m) => m.role === "user");
      const lastMsg = s2.messages.length > 0 ? s2.messages[s2.messages.length - 1] : void 0;
      return {
        id: s2.id,
        agentId: s2.agentId,
        userId: s2.userId,
        status: s2.status,
        turnCount: s2.turnCount,
        messageCount: s2.messages.length,
        createdAt: s2.createdAt,
        updatedAt: s2.updatedAt,
        firstMessage: firstUserMsg ? firstUserMsg.content.substring(0, 100) : void 0,
        lastMessage: lastMsg ? lastMsg.content.substring(0, 100) : void 0
      };
    });
  }
  // Test helpers
  clear() {
    this.sessions.clear();
  }
  getAll() {
    return Array.from(this.sessions.values());
  }
};

// ../freya/packages/ontology/dist/composer/composer.js
function composeLayers(layers) {
  const entityMap = /* @__PURE__ */ new Map();
  const allRelationships = [];
  for (const layer of layers) {
    for (const entity of layer.entityTypes) {
      const existing = entityMap.get(entity.name);
      if (existing) {
        const existingPropNames = new Set(existing.properties.map((p) => p.name));
        const newProps = entity.properties.filter((p) => !existingPropNames.has(p.name));
        entityMap.set(entity.name, {
          ...existing,
          properties: [...existing.properties, ...newProps],
          description: entity.description || existing.description
        });
      } else {
        entityMap.set(entity.name, entity);
      }
    }
    allRelationships.push(...layer.relationships);
  }
  const relationshipMap = /* @__PURE__ */ new Map();
  for (const rel of allRelationships) {
    relationshipMap.set(rel.id, rel);
  }
  return {
    layers,
    entityTypes: Array.from(entityMap.values()),
    relationships: Array.from(relationshipMap.values()),
    version: layers.map((l) => `${l.name}@${l.version}`).join("+")
  };
}

// ../freya/packages/ontology/dist/validator/validator.js
function validateAgainstOntology(entityType, data, ontology) {
  const errors = [];
  const warnings = [];
  const entity = ontology.entityTypes.find((e) => e.name === entityType);
  if (!entity) {
    return {
      valid: false,
      errors: [{ field: "entityType", message: `Unknown entity type: ${entityType}`, code: "unknown_entity" }],
      warnings: []
    };
  }
  for (const prop of entity.properties) {
    if (prop.required && !(prop.name in data)) {
      errors.push({
        field: prop.name,
        message: `Required property missing: ${prop.name}`,
        code: "missing_required"
      });
    }
  }
  for (const [key, value] of Object.entries(data)) {
    const prop = entity.properties.find((p) => p.name === key);
    if (!prop) {
      warnings.push(`Property "${key}" not defined in ontology for ${entityType}`);
      continue;
    }
    if (prop.type === "enum" && prop.enumValues && value !== void 0) {
      if (!prop.enumValues.includes(String(value))) {
        errors.push({
          field: key,
          message: `Invalid value "${value}" for enum ${key}. Expected one of: ${prop.enumValues.join(", ")}`,
          code: "invalid_enum"
        });
      }
    }
    if (value !== void 0 && value !== null) {
      const typeValid = checkType(value, prop.type);
      if (!typeValid) {
        errors.push({
          field: key,
          message: `Expected ${prop.type} for ${key}, got ${typeof value}`,
          code: "invalid_type"
        });
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
function checkType(value, expectedType) {
  switch (expectedType) {
    case "string":
    case "enum":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" || value instanceof Date;
    case "reference":
      return typeof value === "string";
    default:
      return true;
  }
}

// ../freya/packages/ontology/dist/adapters/in-memory-ontology-repo.js
var InMemoryOntologyRepository = class {
  layers = /* @__PURE__ */ new Map();
  async getLayer(id) {
    return this.layers.get(id) ?? null;
  }
  async getLayersByScope(scope) {
    return Array.from(this.layers.values()).filter((l) => l.scope === scope);
  }
  async compose(layerIds) {
    const layers = layerIds.map((id) => this.layers.get(id)).filter((l) => l != null);
    return composeLayers(layers);
  }
  validateEntry(entityType, data, ontology) {
    const result = validateAgainstOntology(entityType, data, ontology);
    return { valid: result.valid, errors: result.errors.map((e) => e.message) };
  }
  // Test helpers
  addLayer(layer) {
    this.layers.set(layer.id, layer);
  }
  clear() {
    this.layers.clear();
  }
};

// ../freya/packages/ontology/dist/seed/loader.js
function parseOntologyYaml(id, raw) {
  const entityTypes = [];
  const relationships = [];
  for (const [entityName, entityDef] of Object.entries(raw.entities || {})) {
    const properties = [];
    if (entityDef.properties) {
      for (const prop of entityDef.properties) {
        properties.push({
          name: prop,
          type: "string",
          required: false,
          description: ""
        });
      }
    }
    for (const [key, value] of Object.entries(entityDef)) {
      if (Array.isArray(value) && key !== "properties" && key !== "belongs_to" && key !== "has_many" && key !== "connects" && value.every((v) => typeof v === "string")) {
        properties.push({
          name: key,
          type: "enum",
          enumValues: value,
          required: false,
          description: `${key} for ${entityName}`
        });
      }
    }
    entityTypes.push({
      id: `${id}:${entityName}`,
      layerId: id,
      name: entityName,
      properties,
      description: entityDef.description || entityName
    });
    const belongsTo = entityDef.belongs_to ? Array.isArray(entityDef.belongs_to) ? entityDef.belongs_to : [entityDef.belongs_to] : [];
    for (const target of belongsTo) {
      relationships.push({
        id: `${id}:${entityName}:belongs_to:${target}`,
        layerId: id,
        name: "belongs_to",
        fromType: entityName,
        toType: target,
        cardinality: "many_to_many",
        description: `${entityName} belongs to ${target}`
      });
    }
    for (const target of entityDef.has_many || []) {
      relationships.push({
        id: `${id}:${entityName}:has_many:${target}`,
        layerId: id,
        name: "has_many",
        fromType: entityName,
        toType: target,
        cardinality: "one_to_many",
        description: `${entityName} has many ${target}`
      });
    }
    for (const target of entityDef.connects || []) {
      relationships.push({
        id: `${id}:${entityName}:connects:${target}`,
        layerId: id,
        name: "connects",
        fromType: entityName,
        toType: target,
        cardinality: "many_to_many",
        description: `${entityName} connects to ${target}`
      });
    }
  }
  return {
    id,
    name: raw.name,
    scope: raw.scope,
    version: 1,
    entityTypes,
    relationships,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
}

// website/tools/freya-vendor/entry.mjs
var AGENT_ID = "frigg-web";
var TRANSPORT = "netlify-web";
var FRIGG_ONTOLOGY = {
  name: "frigg",
  scope: "domain",
  entities: {
    Platform: {
      description: "A third-party software product Frigg integrates with (e.g. HubSpot, Salesforce, Attio).",
      properties: ["name", "vendor"]
    },
    ApiModule: {
      description: "A prebuilt Frigg connector for a platform API, installed with `frigg install <name>` and drawn from the api-module-library.",
      properties: ["name", "provider", "authType"],
      category: [
        "ai",
        "analytics",
        "commerce",
        "communication",
        "crm",
        "devtools",
        "finance",
        "hr",
        "marketing",
        "other",
        "productivity",
        "storage",
        "support"
      ],
      complexity: ["Low", "Medium", "High"],
      status: ["Active", "Beta", "Planned"],
      belongs_to: "Platform"
    },
    Integration: {
      description: "A running integration a developer builds by extending IntegrationBase, wiring API modules to events (USER_ACTION, CRON, QUEUE, WEBHOOK).",
      properties: ["name", "useCase"],
      connects: ["ApiModule", "Primitive"]
    },
    Primitive: {
      description: "A Frigg building block exposed to developers and their agents: an Endpoint, a Queue, a Provider-native backend, or a Fenestra in-app UI experience.",
      properties: ["name"],
      kind: ["Endpoint", "Queue", "ProviderNative", "Fenestra"]
    },
    Capability: {
      description: "A typed declaration of what a module or integration can do, pointing at a spec and its implementation (the mcp-tool / agent-tooling surface).",
      properties: ["name", "spec"],
      belongs_to: "ApiModule"
    },
    Adr: {
      description: 'A Frigg architecture decision record shaping the roadmap, tracked on the "next" branch and surfaced at /roadmap/.',
      properties: ["num", "title", "theme"],
      status: ["Accepted", "Proposed", "Superseded", "Draft"]
    },
    Visitor: {
      description: "A person chatting with the assistant on the site.",
      properties: ["name", "stack", "interest"]
    }
  }
};
var activeData = { adrs: [], apis: [], categories: [], builtCount: 0 };
var s = (v) => typeof v === "string" ? v.toLowerCase() : "";
var matches = (hay, q) => !q || s(hay).includes(s(q));
var RoadmapTools = class {
  async discoverTools(scope) {
    if (scope !== "roadmap") return [];
    return [
      {
        name: "catalog_stats",
        description: 'Frigg roadmap catalog summary: number of ADRs, number of API modules, how many are already built, and the list of API categories. Call this first for any "how many / what categories" question.',
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        source: "roadmap",
        requiresApproval: false,
        permissionScope: "roadmap:read"
      },
      {
        name: "search_adrs",
        description: "Search Frigg architecture decision records (ADRs). Filter by free-text query (matches title/summary/theme) and/or status (e.g. Accepted, Proposed). Returns matching ADRs with number, title, status, theme, one-line summary, and URL.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Free-text filter over title/summary/theme" },
            status: { type: "string", description: 'Exact status filter, e.g. "Accepted"' }
          },
          additionalProperties: false
        },
        source: "roadmap",
        requiresApproval: false,
        permissionScope: "roadmap:read"
      },
      {
        name: "search_apis",
        description: "Search the Frigg API module catalog (224 integrations). Filter by free-text query (matches name/provider/description/tags), category, or built=true to only return modules that already exist in api-module-library. Returns a capped list plus the total match count so you can point people to /roadmap/ for the full set.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            category: { type: "string", description: "One of the catalog categories" },
            built: { type: "boolean", description: "If true, only modules already built" }
          },
          additionalProperties: false
        },
        source: "roadmap",
        requiresApproval: false,
        permissionScope: "roadmap:read"
      }
    ];
  }
  async execute(call) {
    const start = Date.now();
    const done = (output, status = "success", error) => ({
      callId: call.id,
      toolName: call.toolName,
      output,
      status,
      error,
      durationMs: Date.now() - start,
      timestamp: /* @__PURE__ */ new Date()
    });
    try {
      const input = call.input || {};
      if (call.toolName === "catalog_stats") {
        return done({
          adrCount: activeData.adrs.length,
          apiCount: activeData.apis.length,
          builtCount: activeData.builtCount,
          categories: activeData.categories
        });
      }
      if (call.toolName === "search_adrs") {
        const hits = activeData.adrs.filter(
          (a) => (matches(a.title, input.query) || matches(a.summary, input.query) || matches(a.theme, input.query)) && (!input.status || s(a.status) === s(input.status))
        );
        return done({
          total: hits.length,
          adrs: hits.slice(0, 12).map((a) => ({
            num: a.num,
            title: a.title,
            status: a.status,
            theme: a.theme,
            summary: a.summary,
            url: a.url
          }))
        });
      }
      if (call.toolName === "search_apis") {
        const hits = activeData.apis.filter(
          (a) => (matches(a.name, input.query) || matches(a.provider, input.query) || matches(a.description, input.query) || Array.isArray(a.tags) && a.tags.some((t) => matches(t, input.query))) && (!input.category || s(a.category) === s(input.category)) && (input.built === void 0 || Boolean(a.built) === Boolean(input.built))
        );
        return done({
          total: hits.length,
          showing: Math.min(hits.length, 15),
          apis: hits.slice(0, 15).map((a) => ({
            slug: a.slug,
            name: a.name,
            provider: a.provider,
            category: a.category,
            status: a.status,
            complexity: a.complexity,
            built: !!a.built,
            library: a.library
          }))
        });
      }
      return done(null, "error", `unknown tool: ${call.toolName}`);
    } catch (e) {
      return done(null, "error", e && e.message ? e.message : String(e));
    }
  }
};
var runtime = null;
var sessionsRepo = null;
var registered = false;
function getRuntime() {
  if (runtime) return runtime;
  sessionsRepo = new InMemorySessionRepository();
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  const baseUrl = process.env.ANTHROPIC_BASE_URL || void 0;
  runtime = createAgentRuntime({
    llm: new AnthropicLLM({
      apiKey,
      baseUrl,
      defaultModel: process.env.ASSISTANT_MODEL || "claude-opus-4-8",
      maxTokens: 900
    }),
    toolExecutor: new RoadmapTools(),
    memory: new InMemoryMemoryRepository(),
    ontologyRepo: (() => {
      const repo = new InMemoryOntologyRepository();
      repo.addLayer(parseOntologyYaml("frigg", FRIGG_ONTOLOGY));
      return repo;
    })(),
    sessions: sessionsRepo,
    embedding: new FakeEmbedding()
  });
  return runtime;
}
async function ensureAgent(rt, systemPrompt, model) {
  if (registered) return;
  await rt.registry.registerAgent(
    {
      id: AGENT_ID,
      name: "Freya",
      type: "shared",
      systemPrompt,
      ontologyScopes: ["frigg"],
      memoryNamespaces: ["default"],
      toolScopes: ["roadmap"],
      routines: [],
      delegationTargets: [],
      modelId: model || process.env.ASSISTANT_MODEL || "claude-opus-4-8",
      maxTurns: 6
    },
    "friggframework-org"
  );
  registered = true;
}
async function runTurn({ systemPrompt, model, messages, data }) {
  if (data) {
    const apis = data.apis || {};
    activeData = {
      adrs: data.adrs && data.adrs.adrs || data.adrs || [],
      apis: apis.apis || (Array.isArray(apis) ? apis : []),
      categories: apis.categories || [],
      builtCount: apis.builtCount || 0
    };
  }
  const rt = getRuntime();
  await ensureAgent(rt, systemPrompt, model);
  const history = messages.slice(0, -1);
  const last = messages[messages.length - 1];
  const sessionId = crypto.randomUUID();
  let session = createSession(sessionId, AGENT_ID, "web-visitor", TRANSPORT);
  for (const m of history) {
    const msg = m.role === "assistant" ? createAssistantMessage(crypto.randomUUID(), m.content) : createUserMessage(crypto.randomUUID(), m.content, TRANSPORT);
    session = addMessage(session, msg);
  }
  await sessionsRepo.save(session);
  const result = await rt.handleMessage({
    agentId: AGENT_ID,
    sessionId,
    message: createUserMessage(crypto.randomUUID(), last.content, TRANSPORT)
  });
  return result && result.message && result.message.content || "";
}
export {
  runTurn
};
