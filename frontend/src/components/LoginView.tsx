import { useState } from 'react'
import { ApiError, login, saveSession } from '../api'

/**
 * Clinician sign-in gate. Nothing behind it is reachable without a valid bearer token,
 * because every data endpoint in the gateway enforces authentication server-side.
 */
export function LoginView({ onSignedIn }: { onSignedIn: () => void }) {
  const [doctorId, setDoctorId] = useState('DR-001')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await login(doctorId.trim(), password)
      saveSession(session)
      onSignedIn()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to reach the API. Is it running?',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" aria-hidden="true" />
            <span className="text-lg font-semibold tracking-tight text-slate-100">
              SynapseHealth
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Clinical record console. Authenticated access is required.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Doctor ID</span>
            <input
              className="field"
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Password</span>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-xs text-slate-600">
          Demo credentials are pre-seeded in <code className="font-mono">app/auth.py</code>.
        </p>
      </form>
    </div>
  )
}
