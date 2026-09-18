'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Youtube, Instagram, Link2, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Platform = 'youtube' | 'instagram'

interface SocialAccountRow {
  platform: Platform
  externalId: string
  displayName: string
  profileImageUrl: string | null
  status: 'pending' | 'connected' | 'error'
  expiresAt: string | null
  lastVerifiedAt: string | null
  lastErrorAt: string | null
  lastErrorMessage: string | null
  scopes: string[]
  createdAt: string
}

interface SocialConnectionsProps {
  /** The ChannelConfig this panel binds accounts to */
  channelConfigId: string
  /** Optional config status passed from the parent (so we show a hint if not yet created) */
  configured: boolean
}

/**
 * Social Connections panel — embeddable in any settings page.
 *
 * Shows YouTube + Instagram connection cards. Each card has:
 *   - Status badge (Connected / Error / Not connected)
 *   - Account display name + avatar
 *   - Connect button → kicks off the OAuth flow at /api/oauth/[platform]/start
 *   - Verify button → actively probes the platform API
 *   - Disconnect button → revokes and removes the row
 */
export function SocialConnections({ channelConfigId, configured }: SocialConnectionsProps) {
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/social/accounts?channelConfigId=${channelConfigId}`)
      const data = await res.json()
      if (res.ok) setAccounts(data.accounts || [])
      else setFlash({ type: 'error', message: data.error || 'Failed to load accounts' })
    } catch (e: any) {
      setFlash({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [channelConfigId])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  // Pick up flash from the OAuth callback (hash params like
  // #social_flash=success&social_platform=youtube&social_message=...)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const params = new URLSearchParams(hash)
    const type = params.get('social_flash')
    const message = params.get('social_message')
    if (type === 'success' || type === 'error') {
      setFlash({ type, message: message || '' })
      // Refresh the account list so the new connection shows up
      fetchAccounts()
      // Clear the hash so it doesn't reappear on navigation
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [fetchAccounts])

  async function startOAuth(platform: Platform) {
    setBusyKey(`connect-${platform}`)
    try {
      // Redirect the browser — server kicks off the OAuth dance
      window.location.href = `/api/oauth/${platform}/start?channelConfigId=${channelConfigId}`
    } finally {
      setBusyKey(null)
    }
  }

  async function verify(platform: Platform, externalId: string) {
    setBusyKey(`verify-${platform}-${externalId}`)
    try {
      const res = await fetch('/api/social/accounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalId }),
      })
      const data = await res.json()
      if (data.ok) {
        setFlash({ type: 'success', message: `${data.displayName} verified successfully.` })
      } else {
        setFlash({ type: 'error', message: data.error || 'Verification failed.' })
      }
      fetchAccounts()
    } finally {
      setBusyKey(null)
    }
  }

  async function disconnect(platform: Platform, externalId: string) {
    if (!confirm(`Disconnect ${platform}? You'll need to reconnect to publish videos.`)) return
    setBusyKey(`disconnect-${platform}-${externalId}`)
    try {
      const res = await fetch('/api/social/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalId, channelConfigId }),
      })
      if (res.ok) {
        setFlash({ type: 'success', message: `Disconnected ${platform}.` })
        fetchAccounts()
      } else {
        const data = await res.json()
        setFlash({ type: 'error', message: data.error || 'Disconnect failed.' })
      }
    } finally {
      setBusyKey(null)
    }
  }

  function getAccount(platform: Platform): SocialAccountRow | undefined {
    return accounts.find((a) => a.platform === platform)
  }

  if (!configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Social Connections</CardTitle>
          <CardDescription>Connect your YouTube channel and Instagram page to publish videos directly.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Save the niche settings first to enable social connections.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Social Connections</CardTitle>
        <CardDescription>
          Sign in with your YouTube channel and Instagram Business page. Tokens are stored encrypted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flash && (
          <div
            className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
              flash.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {flash.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{flash.message}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading connections...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <PlatformCard
              platform="youtube"
              icon={<Youtube className="w-5 h-5 text-red-500" />}
              label="YouTube Channel"
              account={getAccount('youtube')}
              onConnect={() => startOAuth('youtube')}
              onVerify={(ext) => verify('youtube', ext)}
              onDisconnect={(ext) => disconnect('youtube', ext)}
              busyKey={busyKey}
            />
            <PlatformCard
              platform="instagram"
              icon={<Instagram className="w-5 h-5 text-pink-500" />}
              label="Instagram Business"
              account={getAccount('instagram')}
              onConnect={() => startOAuth('instagram')}
              onVerify={(ext) => verify('instagram', ext)}
              onDisconnect={(ext) => disconnect('instagram', ext)}
              busyKey={busyKey}
            />
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3">
          <strong>Setup:</strong> add <code className="bg-muted px-1 rounded">YOUTUBE_OAUTH_CLIENT_ID</code>,
          <code className="bg-muted px-1 rounded">YOUTUBE_OAUTH_CLIENT_SECRET</code>,
          <code className="bg-muted px-1 rounded">INSTAGRAM_OAUTH_APP_ID</code>, and
          <code className="bg-muted px-1 rounded">INSTAGRAM_OAUTH_APP_SECRET</code> to your <code>.env</code>,
          then create the matching OAuth app on{' '}
          <a className="text-blue-600 underline inline-flex items-center gap-1" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
            Google Cloud <ExternalLink className="w-3 h-3" />
          </a>{' '}
          and{' '}
          <a className="text-blue-600 underline inline-flex items-center gap-1" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
            Meta for Developers <ExternalLink className="w-3 h-3" />
          </a>.
        </div>
      </CardContent>
    </Card>
  )
}

interface PlatformCardProps {
  platform: Platform
  icon: React.ReactNode
  label: string
  account: SocialAccountRow | undefined
  onConnect: () => void
  onVerify: (externalId: string) => void
  onDisconnect: (externalId: string) => void
  busyKey: string | null
}

function PlatformCard({ platform, icon, label, account, onConnect, onVerify, onDisconnect, busyKey }: PlatformCardProps) {
  const connecting = busyKey === `connect-${platform}`
  const verifying = account && busyKey === `verify-${platform}-${account.externalId}`
  const disconnecting = account && busyKey === `disconnect-${platform}-${account.externalId}`

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-medium">{label}</h3>
        </div>
        {account && (
          <StatusBadge status={account.status} />
        )}
      </div>

      {account ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {account.profileImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.profileImageUrl}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            )}
            <div className="min-w-0">
              <div className="font-medium truncate">{account.displayName}</div>
              <div className="text-xs text-muted-foreground truncate">
                ID: {account.externalId}
              </div>
            </div>
          </div>

          {account.lastErrorMessage && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <strong>Last error:</strong> {account.lastErrorMessage}
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-0.5">
            {account.expiresAt && (
              <div>Token expires: {new Date(account.expiresAt).toLocaleDateString()}</div>
            )}
            {account.lastVerifiedAt && (
              <div>Last verified: {new Date(account.lastVerifiedAt).toLocaleString()}</div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onVerify(account.externalId)}
              disabled={verifying || disconnecting}
            >
              {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Verify
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDisconnect(account.externalId)}
              disabled={verifying || disconnecting}
            >
              {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Not connected. Sign in to {platform === 'youtube' ? 'YouTube' : 'Facebook'} and choose a{' '}
            {platform === 'youtube' ? 'channel' : 'page'} to publish to.
          </p>
          <Button size="sm" onClick={onConnect} disabled={connecting}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Connect {platform === 'youtube' ? 'YouTube' : 'Instagram'}
          </Button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'connected' | 'error' }) {
  if (status === 'connected') {
    return <Badge variant="outline" className="gap-1 text-green-600 border-green-300"><CheckCircle2 className="w-3 h-3" /> Connected</Badge>
  }
  if (status === 'error') {
    return <Badge variant="outline" className="gap-1 text-red-600 border-red-300"><AlertCircle className="w-3 h-3" /> Error</Badge>
  }
  return <Badge variant="outline" className="gap-1">Pending</Badge>
}
