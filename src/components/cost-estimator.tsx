'use client'

import { useState, useEffect } from 'react'
import { Calculator, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { 
  estimateWorkflow, 
  formatCostRange, 
  formatCost,
  WORKFLOW_TEMPLATES,
  type WorkflowEstimate 
} from '@/lib/token-estimator'

interface CostEstimatorProps {
  workflowName?: string
  steps?: Array<{
    name: string
    prompt: string
    expectedOutputTokens: number
    model: string
  }>
  onConfirm?: () => void
  onCancel?: () => void
}

export function CostEstimator({ 
  workflowName = 'Custom Workflow',
  steps,
  onConfirm,
  onCancel 
}: CostEstimatorProps) {
  const [expanded, setExpanded] = useState(false)
  const [estimate, setEstimate] = useState<WorkflowEstimate | null>(null)
  const [loading, setLoading] = useState(false)

  // Auto-calculate on mount if steps provided
  useEffect(() => {
    if (steps) {
      setLoading(true)
      // Simulate async calculation
      setTimeout(() => {
        setEstimate(estimateWorkflow(steps))
        setLoading(false)
      }, 100)
    }
  }, [steps])

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="animate-pulse" style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-dim)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Calculating cost estimate...
          </span>
        </div>
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b' }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: '0.85rem' }}>
            Unable to calculate estimate. Please check workflow configuration.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ 
      padding: '16px 20px',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      background: 'rgba(59, 130, 246, 0.05)'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: 12 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(59, 130, 246, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Calculator size={16} style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {workflowName}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              Estimated cost before run
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right' }}>
          <div style={{ 
            fontSize: '1.4rem', 
            fontWeight: 700, 
            color: '#3b82f6',
            fontFamily: 'var(--font-space-grotesk)'
          }}>
            {formatCost(estimate.totalExpected)}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
            Range: {formatCostRange(estimate.totalMin, estimate.totalMax)}
          </div>
        </div>
      </div>

      {/* Info note */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        background: 'rgba(245, 158, 11, 0.08)',
        borderRadius: 8,
        marginBottom: 12
      }}>
        <Info size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Includes {Math.round((estimate.safetyMargin - 1) * 100)}% safety margin for output variability. 
          ClawPanel markup: {Math.round((1.3 - 1) * 100)}%.
        </span>
      </div>

      {/* Expandable breakdown */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.78rem',
          cursor: 'pointer',
          borderTop: '1px solid var(--separator)'
        }}
      >
        <span>View breakdown ({estimate.steps.length} steps)</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {estimate.steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < estimate.steps.length - 1 ? '1px solid var(--separator)' : 'none'
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                  {step.name}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>
                  {step.estimate.inputTokens.toLocaleString()} → ~{step.estimate.outputTokens.toLocaleString()} tokens · {step.estimate.model}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {formatCost(step.estimate.expectedCost)}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>
                  {formatCostRange(step.estimate.minCost, step.estimate.maxCost)}
                </div>
              </div>
            </div>
          ))}
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0 0',
            marginTop: 8,
            borderTop: '1px dashed var(--separator)'
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              ClawPanel platform fee
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              +{formatCost(estimate.clawpanelFee)}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {(onConfirm || onCancel) && (
        <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--separator)'
        }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 8,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--separator)',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          )}
          {onConfirm && (
            <button
              onClick={onConfirm}
              style={{
                flex: 2,
                padding: '10px 16px',
                borderRadius: 8,
                background: '#3b82f6',
                border: 'none',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Run Workflow ({formatCost(estimate.totalExpected)})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Quick estimate display for inline use
export function CostBadge({ 
  cost, 
  size = 'sm' 
}: { 
  cost: number
  size?: 'sm' | 'md' 
}) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 6,
      background: 'rgba(59, 130, 246, 0.12)',
      color: '#3b82f6',
      fontSize: size === 'sm' ? '0.7rem' : '0.78rem',
      fontWeight: 600,
      fontFamily: 'var(--font-space-grotesk)'
    }}>
      <Calculator size={size === 'sm' ? 10 : 12} />
      {formatCost(cost)}
    </span>
  )
}
