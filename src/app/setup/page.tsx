'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Server, Key, CheckCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [instanceUrl, setInstanceUrl] = useState('');
  const [relaySecret, setRelaySecret] = useState('');
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setStatus('testing');
    setErrorMsg('');

    try {
      const res = await fetch('/api/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceUrl, relaySecret, label }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Connection failed.');
        return;
      }

      setStatus('success');
      setTimeout(() => router.push('/'), 1200);
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Try again.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded bg-emerald-500/20 flex items-center justify-center">
              <Server className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-sm text-neutral-400 font-mono">ClawPanel</span>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-1">Connect your instance</h1>
          <p className="text-neutral-400 text-sm">
            Enter the URL and relay secret for your OpenClaw server.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleConnect} className="space-y-4">
          {/* Instance URL */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
              Instance URL
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="url"
                value={instanceUrl}
                onChange={e => setInstanceUrl(e.target.value)}
                placeholder="http://your-server:3001"
                required
                className="w-full pl-9 pr-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              />
            </div>
          </div>

          {/* Relay Secret */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
              Relay Secret
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="password"
                value={relaySecret}
                onChange={e => setRelaySecret(e.target.value)}
                placeholder="Your relay secret key"
                required
                className="w-full pl-9 pr-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-500 font-mono"
              />
            </div>
          </div>

          {/* Optional label */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
              Label <span className="text-neutral-600 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Home server, AWS us-west"
              className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-800/50 rounded text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/50 border border-emerald-800/50 rounded text-sm text-emerald-300">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Connected — taking you to your dashboard…</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'testing' || status === 'success'}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-neutral-900 rounded font-medium text-sm hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'testing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing connection…
              </>
            ) : (
              <>
                Connect instance
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Help */}
        <div className="mt-6 p-4 bg-neutral-800/50 border border-neutral-700/50 rounded text-xs text-neutral-500 space-y-2">
          <p className="font-medium text-neutral-400">Setup checklist</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>OpenClaw is installed and running on your server</li>
            <li>ClawPanel dev server running on port 3001 (<code className="text-neutral-400">pm2 start clawpanel-dev</code>)</li>
            <li>Port 3001 is accessible from the internet, or a Cloudflare Tunnel is configured</li>
            <li>Your <code className="text-neutral-400">RELAY_SECRET</code> is set in <code className="text-neutral-400">.env.local</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
