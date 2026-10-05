import { useCallback, useState } from 'react'
import {
  ApiError,
  clearSession,
  fetchProfile,
  loadSession,
  type PatientProfile,
} from './api'
import { AuditView } from './components/AuditView'
import { EmergencyFlashcard } from './components/EmergencyFlashcard'
import { LoginView } from './components/LoginView'
import { PatientList } from './components/PatientList'
import { Empty, ErrorNote } from './components/Primitives'
import { ProfileView } from './components/ProfileView'
import { SafetyView } from './components/SafetyView'
import { TimelineView } from './components/TimelineView'
import { UploadPanel } from './components/UploadPanel'

type Tab = 'profile' | 'timeline' | 'safety' | 'flashcard' | 'audit'

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'safety', label: 'Safety' },
  { key: 'flashcard', label: 'Flashcard' },
  { key: 'audit', label: 'Audit' },
]

interface Doctor {
  doctor_id: string
  display_name: string
  role: string
}

export function App() {
  const [doctor, setDoctor] = useState<Doctor | null>(() => loadSession())
  const [patientCode, setPatientCode] = useState<string | null>(null)
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [tab, setTab] = useState<Tab>('profile')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProfile = useCallback(async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      setProfile(await fetchProfile(code))
    } catch (caught) {
      setProfile(null)
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession()
        setDoctor(null)
        return
      }
      setError(caught instanceof ApiError ? caught.message : 'Failed to load patient profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSelect(code: string) {
    setPatientCode(code)
    void loadProfile(code)
  }

  function handleSignIn() {
    setDoctor(loadSession())
  }

  function handleSignOut() {
    clearSession()
    setDoctor(null)
    setPatientCode(null)
    setProfile(null)
  }

  if (!doctor) {
    return <LoginView onSignedIn={handleSignIn} />
  }

  const criticalCount = profile?.safety_alerts.filter((alert) => alert.severity === 'critical').length ?? 0

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight">SynapseHealth</span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Clinical record console
            </span>
          </div>
          <div className="flex items-center gap-3">
            {profile ? (
              <span className="hidden text-xs text-slate-500 sm:inline">
                {profile.patient.full_name}
                <span className="ml-1.5 font-mono text-slate-600">
                  {profile.patient.patient_code}
                </span>
              </span>
            ) : null}
            <div className="text-right leading-tight">
              <div className="text-xs font-medium text-slate-200">{doctor.display_name}</div>
              <div className="font-mono text-[10px] text-slate-500 uppercase">{doctor.role}</div>
            </div>
            <button onClick={handleSignOut} className="btn-ghost">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 px-5 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <UploadPanel
            onProcessed={(code) => {
              handleSelect(code)
            }}
          />
          <PatientList selected={patientCode} onSelect={handleSelect} />
        </aside>

        <section className="min-w-0">
          {error ? (
            <div className="mb-4">
              <ErrorNote message={error} />
            </div>
          ) : null}

          {!patientCode ? (
            <div className="panel p-10 text-center">
              <Empty>
                Select a patient to review their longitudinal record, or ingest a new document
                to build one.
              </Empty>
            </div>
          ) : loading && !profile ? (
            <div className="panel p-10 text-center text-sm text-slate-500">
              Loading patient record…
            </div>
          ) : profile ? (
            <>
              <nav className="mb-4 flex flex-wrap gap-1.5" role="tablist">
                {TABS.map((entry) => {
                  const isActive = entry.key === tab
                  const badge =
                    entry.key === 'safety' && criticalCount > 0 ? criticalCount : null
                  return (
                    <button
                      key={entry.key}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setTab(entry.key)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-cyan-500 text-slate-950'
                          : 'border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      {entry.label}
                      {badge ? (
                        <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </nav>

              {tab === 'profile' ? <ProfileView profile={profile} /> : null}
              {tab === 'timeline' ? <TimelineView profile={profile} /> : null}
              {tab === 'safety' ? <SafetyView profile={profile} /> : null}
              {tab === 'flashcard' ? <EmergencyFlashcard patientCode={profile.patient.patient_code} /> : null}
              {tab === 'audit' ? <AuditView patientCode={profile.patient.patient_code} /> : null}
            </>
          ) : null}
        </section>
      </main>

      <footer className="mx-auto max-w-[1600px] px-5 pb-8 text-xs text-slate-600">
        Prototype. Safety findings are deterministic decision-support output for clinician
        review, not clinical decisions.
      </footer>
    </div>
  )
}

export default App
