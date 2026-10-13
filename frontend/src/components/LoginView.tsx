import { useState } from 'react'
import { ApiError, login, saveSession } from '../api'

export function LoginView({ onSignedIn }: { onSignedIn: () => void }) {
  const [doctorId, setDoctorId] = useState('DR-001')
  const [password, setPassword] = useState('demo1234')
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
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.4}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            SynapseHealth Workstation
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Hospital Clinical Console · Authenticated Clinician Sign-In
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">Doctor ID / License</label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">Security Password</label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        {error ? (
          <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-medium">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition"
          disabled={busy}
        >
          {busy ? 'Authenticating…' : 'Sign In to Console'}
        </button>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Demo Clinician: DR-001</span>
          <span className="font-mono text-slate-500">Pass: demo1234</span>
        </div>
      </form>
    </div>
  )
}
export default LoginView
