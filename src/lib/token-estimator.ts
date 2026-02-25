/**
 * Token Cost Estimator for ClawPanel
 * 
 * Provides pre-run cost estimates for workflows to prevent surprise bills
 * and build trust with users before they execute expensive operations.
 */

// Model pricing per 1M tokens (as of Feb 2026)
const MODEL_PRICING: Record<string, { input: number; output: number; context: number }> = {
  // OpenAI
  'gpt-5.2': { input: 2.50, output: 10.00, context: 128000 },
  'gpt-4o': { input: 2.50, output: 10.00, context: 128000 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, context: 128000 },
  'o3-mini': { input: 1.10, output: 4.40, context: 200000 },
  'o1': { input: 15.00, output: 60.00, context: 200000 },
  
  // Anthropic
  'claude-opus-4-6': { input: 15.00, output: 75.00, context: 200000 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00, context: 200000 },
  'claude-haiku-3-5': { input: 0.80, output: 4.00, context: 200000 },
  
  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10.00, context: 1000000 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40, context: 1000000 },
  
  // MiniMax
  'minimax-m2.5': { input: 0.50, output: 2.00, context: 100000 },
  
  // xAI
  'grok-2': { input: 2.00, output: 10.00, context: 128000 },
  'grok-2-vision': { input: 2.00, output: 10.00, context: 32000 },
}

// Default safety margin for estimation uncertainty
const DEFAULT_SAFETY_MARGIN = 1.3

// ClawPanel markup for token resale (30%)
const CLAWPANEL_MARKUP = 1.3

export interface CostEstimate {
  minCost: number
  maxCost: number
  expectedCost: number
  inputTokens: number
  outputTokens: number
  model: string
  withMarkup: boolean
}

export interface WorkflowEstimate {
  totalMin: number
  totalMax: number
  totalExpected: number
  steps: Array<{
    name: string
    estimate: CostEstimate
  }>
  safetyMargin: number
  clawpanelFee: number
}

/**
 * Estimate tokens from text (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Get pricing for a model (handles aliases)
 */
export function getModelPricing(modelId: string): { input: number; output: number; context: number } | null {
  // Direct match
  if (MODEL_PRICING[modelId]) {
    return MODEL_PRICING[modelId]
  }
  
  // Check aliases/partial matches
  const normalized = modelId.toLowerCase()
  
  // OpenAI aliases
  if (normalized.includes('gpt-5')) return MODEL_PRICING['gpt-5.2']
  if (normalized.includes('gpt-4o-mini')) return MODEL_PRICING['gpt-4o-mini']
  if (normalized.includes('gpt-4o')) return MODEL_PRICING['gpt-4o']
  if (normalized.includes('o3-mini')) return MODEL_PRICING['o3-mini']
  if (normalized.includes('o1-') || normalized === 'o1') return MODEL_PRICING['o1']
  
  // Anthropic aliases
  if (normalized.includes('opus') || normalized.includes('claude-opus')) return MODEL_PRICING['claude-opus-4-6']
  if (normalized.includes('sonnet') || normalized.includes('claude-sonnet')) return MODEL_PRICING['claude-sonnet-4-5']
  if (normalized.includes('haiku') || normalized.includes('claude-haiku')) return MODEL_PRICING['claude-haiku-3-5']
  
  // MiniMax aliases
  if (normalized.includes('minimax')) return MODEL_PRICING['minimax-m2.5']
  
  // xAI aliases
  if (normalized.includes('grok-2-vision')) return MODEL_PRICING['grok-2-vision']
  if (normalized.includes('grok')) return MODEL_PRICING['grok-2']
  
  // Gemini aliases
  if (normalized.includes('gemini-2.5')) return MODEL_PRICING['gemini-2.5-pro']
  if (normalized.includes('gemini')) return MODEL_PRICING['gemini-2.0-flash']
  
  return null
}

/**
 * Calculate cost for a single LLM call
 */
export function estimateCallCost(
  prompt: string,
  expectedOutputTokens: number,
  model: string,
  options: {
    safetyMargin?: number
    withMarkup?: boolean
  } = {}
): CostEstimate {
  const { safetyMargin = DEFAULT_SAFETY_MARGIN, withMarkup = true } = options
  
  const pricing = getModelPricing(model)
  if (!pricing) {
    throw new Error(`Unknown model: ${model}`)
  }
  
  const inputTokens = estimateTokens(prompt)
  const outputTokens = expectedOutputTokens
  
  // Base cost calculation (per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  const baseCost = inputCost + outputCost
  
  // Apply safety margin for uncertainty
  const maxCost = baseCost * safetyMargin
  const minCost = baseCost * 0.7 // Best case (shorter output)
  
  // Apply ClawPanel markup for resale
  const finalMultiplier = withMarkup ? CLAWPANEL_MARKUP : 1
  
  return {
    minCost: roundCost(minCost * finalMultiplier),
    maxCost: roundCost(maxCost * finalMultiplier),
    expectedCost: roundCost(baseCost * finalMultiplier),
    inputTokens,
    outputTokens,
    model,
    withMarkup
  }
}

/**
 * Estimate full workflow cost
 */
export function estimateWorkflow(
  steps: Array<{
    name: string
    prompt: string
    expectedOutputTokens: number
    model: string
  }>,
  options: {
    safetyMargin?: number
    withMarkup?: boolean
  } = {}
): WorkflowEstimate {
  const { safetyMargin = DEFAULT_SAFETY_MARGIN, withMarkup = true } = options
  
  const stepEstimates = steps.map(step => ({
    name: step.name,
    estimate: estimateCallCost(
      step.prompt,
      step.expectedOutputTokens,
      step.model,
      { safetyMargin, withMarkup }
    )
  }))
  
  const totalMin = stepEstimates.reduce((sum, s) => sum + s.estimate.minCost, 0)
  const totalMax = stepEstimates.reduce((sum, s) => sum + s.estimate.maxCost, 0)
  const totalExpected = stepEstimates.reduce((sum, s) => sum + s.estimate.expectedCost, 0)
  
  // Calculate clawpanel fee separately (the markup amount)
  const baseExpected = totalExpected / CLAWPANEL_MARKUP
  const clawpanelFee = totalExpected - baseExpected
  
  return {
    totalMin: roundCost(totalMin),
    totalMax: roundCost(totalMax),
    totalExpected: roundCost(totalExpected),
    steps: stepEstimates,
    safetyMargin,
    clawpanelFee: roundCost(clawpanelFee)
  }
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `< $0.01`
  }
  return `$${cost.toFixed(2)}`
}

/**
 * Format cost range for display
 */
export function formatCostRange(min: number, max: number): string {
  if (max < 0.01) {
    return `< $0.01`
  }
  if (min === max) {
    return `$${min.toFixed(2)}`
  }
  return `$${min.toFixed(2)} - $${max.toFixed(2)}`
}

/**
 * Round cost to avoid false precision
 */
function roundCost(cost: number): number {
  if (cost < 0.01) return 0.01
  if (cost < 0.10) return Math.round(cost * 100) / 100
  return Math.round(cost * 10) / 10
}

// Example usage for common workflows
export const WORKFLOW_TEMPLATES = {
  'content-research': {
    name: 'Content Research',
    description: 'Research topic, analyze competitors, generate brief',
    estimate: () => estimateWorkflow([
      { name: 'Web search', prompt: 'Search query analysis', expectedOutputTokens: 500, model: 'gpt-4o-mini' },
      { name: 'Content analysis', prompt: 'Analyze 3 competitor articles', expectedOutputTokens: 2000, model: 'gpt-4o' },
      { name: 'Brief generation', prompt: 'Generate content brief', expectedOutputTokens: 1500, model: 'gpt-4o' },
    ])
  },
  
  'social-digest': {
    name: 'Social Media Digest',
    description: 'Daily Reddit/YouTube/X summary',
    estimate: () => estimateWorkflow([
      { name: 'Fetch posts', prompt: 'Fetch and filter posts', expectedOutputTokens: 1000, model: 'gpt-4o-mini' },
      { name: 'Summarize', prompt: 'Summarize top posts', expectedOutputTokens: 2000, model: 'gpt-4o' },
      { name: 'Format digest', prompt: 'Format for delivery', expectedOutputTokens: 800, model: 'gpt-4o-mini' },
    ])
  },
  
  'code-review': {
    name: 'AI Code Review',
    description: 'Review PR, suggest improvements',
    estimate: () => estimateWorkflow([
      { name: 'Analyze diff', prompt: 'Analyze code changes', expectedOutputTokens: 2000, model: 'claude-sonnet-4-5' },
      { name: 'Generate review', prompt: 'Generate review comments', expectedOutputTokens: 1500, model: 'claude-sonnet-4-5' },
    ])
  }
}
