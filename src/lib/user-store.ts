/**
 * user-store.ts
 * Per-user instance config stored in Upstash Redis (Vercel KV).
 * Edge-runtime compatible — uses REST API only.
 */

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export interface InstanceConfig {
  instanceUrl: string
  relaySecret: string
  connectedAt: string
  label?: string
}

const instanceKey = (sub: string) => `user:${sub}:instance`

export async function getInstanceConfig(sub: string): Promise<InstanceConfig | null> {
  try {
    return await redis.get<InstanceConfig>(instanceKey(sub))
  } catch {
    return null
  }
}

export async function setInstanceConfig(sub: string, config: InstanceConfig): Promise<void> {
  await redis.set(instanceKey(sub), config)
}

export async function deleteInstanceConfig(sub: string): Promise<void> {
  await redis.del(instanceKey(sub))
}

export async function testInstanceConnection(instanceUrl: string, relaySecret: string): Promise<boolean> {
  try {
    const url = instanceUrl.replace(/\/+$/, '')
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      headers: { 'x-relay-secret': relaySecret },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok || res.status === 401 // 401 means it's alive but wrong secret
  } catch {
    return false
  }
}
