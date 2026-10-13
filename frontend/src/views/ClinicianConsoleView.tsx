import { useEffect, useState } from 'react'
import type { BreakGlassResponse, PatientProfile } from '../api'
import { BreakGlassModal } from '../components/BreakGlassModal'
import { FhirExportButton } from '../components/FhirExportButton'
import { PatientList } from '../components/PatientList'
import { Empty } from '../components/Primitives'
import { TopSafetyBanner } from '../components/TopSafetyBanner'
import { UploadPanel } from '../components/UploadPanel'
import { AuditView } from '../components/AuditView'
import { EmergencyFlashcard } from '../components/EmergencyFlashcard'
import { ProfileView } from '../components/ProfileView'
import { SafetyView } from '../components/SafetyView'
import { TimelineView } from '../components/TimelineView'

type Tab = 'profile' | 'flashcard' | 'safety' | 'timeline' | 'audit'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'profile', label: 'Clinical Profile', icon: '📋' },
  { key: 'flashcard', label: 'Emergency Flashcard', icon: '⚡' },
  { key: 'safety', label: 'Safety Rules', icon: '🛡️' },
  { key: 'timeline', label: 'Health Timeline', icon: '📅' },
  { key: 'audit', label: 'Audit Ledger', icon: '🔒' },
]

interface ClinicianConsoleViewProps {
  doctor: {
    doctor_id: string
    display_name: string
    role: string
  }
  patientCode: string | null
  profile: PatientProfile | null
  loading: boolean
  onSelectPatient: (code: string) => void
  onSignOut: () => void
  persona?: 'clinician' | 'patient'
  onSwitchPersona?: (persona: 'clinician' | 'patient') => void
}

export function ClinicianConsoleView({
  doctor,
  patientCode,
  profile,
  loading,
  onSelectPatient,
  onSignOut,
  persona = 'clinician',
  onSwitchPersona,
}: ClinicianConsoleViewProps) {
  const [tab, setTab] = useState<Tab>('profile')
  const [showBreakGlass, setShowBreakGlass] = useState(false)
  const [breakGlassActive, setBreakGlassActive] = useState<BreakGlassResponse | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0)

  // Countdown timer for 60-minute ephemeral emergency token
  useEffect(() => {
    if (countdownSeconds <= 0) return
    const timer = setInterval(() => {
      setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdownSeconds])

  function handleBreakGlassSuccess(res: BreakGlassResponse) {
    setBreakGlassActive(res)
    setCountdownSeconds(res.expires_in || 3600)
    setShowBreakGlass(false)
    setTab('flashcard') // Automatically route to emergency flashcard
  }

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`
  }

  const criticalCount =
    profile?.safety_alerts.filter((alert) => alert.severity === 'critical').length ?? 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 1. Clinician High-Density App Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4 px-5 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500 font-bold text-slate-950 text-sm">
              PV
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white">PulseVault AI</span>
                <span className="rounded bg-cyan-950 px-1.5 py-0.2 text-[10px] font-semibold text-cyan-300 border border-cyan-800">
                  Emergency ER
                </span>
              </div>
              <p className="hidden text-[10px] text-slate-500 sm:block">
                Intelligent Record Exchange &amp; Clinical Decision Support
              </p>
            </div>
          </div>

          {/* Persona Switcher Pill */}
          <div className="flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800 shadow-inner">
            <button
              onClick={() => onSwitchPersona?.('clinician')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                persona === 'clinician'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🏥</span>
              <span>Clinician Console (ER / OPD)</span>
            </button>
            <button
              onClick={() => onSwitchPersona?.('patient')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                persona === 'patient'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>👤</span>
              <span>Patient Health Locker</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Break-Glass Emergency Action Button */}
            {patientCode ? (
              <button
                onClick={() => setShowBreakGlass(true)}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-200 transition hover:bg-red-600/30 shadow-lg shadow-red-950/50"
              >
                <span>🚨</span>
                <span>Break-Glass Override</span>
              </button>
            ) : null}

            {/* Active Break-Glass Countdown Badge */}
            {countdownSeconds > 0 ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-red-500 bg-red-950 px-2.5 py-1 text-xs text-red-300 font-mono animate-pulse">
                <span>⏱️</span>
                <span>Emergency Token: {formatCountdown(countdownSeconds)}</span>
              </div>
            ) : null}

            {/* FHIR Export Action */}
            {patientCode && profile ? (
              <FhirExportButton patientCode={profile.patient.patient_code} />
            ) : null}

            {/* Doctor Profile and Signout */}
            <div className="h-4 w-px bg-slate-800" />
            <div className="text-right leading-tight">
              <div className="text-xs font-semibold text-slate-200">{doctor.display_name}</div>
              <div className="font-mono text-[10px] text-slate-500 uppercase">{doctor.role}</div>
            </div>
            <button
              onClick={onSignOut}
              className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-900 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main 2-Column Clinical Workspace */}
      <main className="mx-auto flex-1 w-full max-w-[1720px] px-5 py-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left Column: Patient Care Queue & Ingestion */}
        <aside className="space-y-4">
          <UploadPanel onProcessed={(code) => onSelectPatient(code)} />
          <PatientList selected={patientCode} onSelect={(code) => onSelectPatient(code)} />

          {breakGlassActive ? (
            <div className="rounded-xl border border-red-600/40 bg-red-950/20 p-3.5 text-xs">
              <div className="flex items-center justify-between text-red-300 font-bold">
                <span>⚡ Ephemeral Override Active</span>
                <span className="font-mono text-[10px]">TTL 60m</span>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                <div>
                  Reason:{' '}
                  <span className="text-slate-200 font-semibold">
                    {breakGlassActive.clinical_reason_code}
                  </span>
                </div>
                <div>
                  Co-signer:{' '}
                  <span className="text-slate-200 font-mono">
                    {breakGlassActive.nurse_cosigner_id}
                  </span>
                </div>
                <div className="truncate font-mono text-[9px] text-slate-500">
                  Block seal: {breakGlassActive.audit_block_hash}
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        {/* Right Column: High-Density Clinical Views & Top Safety Strip */}
        <section className="min-w-0">
          {!patientCode ? (
            <div className="panel p-16 text-center">
              <Empty>
                Select an active patient from the triage care queue, or ingest an unstructured
                clinical PDF to run the 7-stage multi-agent pipeline.
              </Empty>
            </div>
          ) : loading && !profile ? (
            <div className="panel p-16 text-center text-sm text-slate-500">
              Loading longitudinal patient record…
            </div>
          ) : profile ? (
            <>
              {/* Anchored High-Visibility Safety Strip */}
              <TopSafetyBanner
                alerts={profile.safety_alerts}
                allergies={profile.allergies}
                onViewAlerts={() => setTab('safety')}
              />

              {/* Workspace Navigation Tabs */}
              <nav className="mb-4 flex flex-wrap gap-2" role="tablist">
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
                      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                          : 'border border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span>{entry.icon}</span>
                      <span>{entry.label}</span>
                      {badge ? (
                        <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </nav>

              {/* Tab Views */}
              {tab === 'profile' ? <ProfileView profile={profile} /> : null}
              {tab === 'flashcard' ? (
                <EmergencyFlashcard patientCode={profile.patient.patient_code} />
              ) : null}
              {tab === 'safety' ? <SafetyView profile={profile} /> : null}
              {tab === 'timeline' ? <TimelineView profile={profile} /> : null}
              {tab === 'audit' ? <AuditView patientCode={profile.patient.patient_code} /> : null}
            </>
          ) : null}
        </section>
      </main>

      {/* Break-Glass Modal */}
      {showBreakGlass && patientCode ? (
        <BreakGlassModal
          patientCode={patientCode}
          onSuccess={handleBreakGlassSuccess}
          onClose={() => setShowBreakGlass(false)}
        />
      ) : null}

      <footer className="mx-auto w-full max-w-[1720px] px-5 py-4 border-t border-slate-900 text-[11px] text-slate-600 flex items-center justify-between">
        <span>
          PulseVault AI · Deterministic Clinical Decision Support &amp; Emergency Exchange
        </span>
        <span>HL7 FHIR R4 Compliant · SHA-256 Tamper-Evident Ledger</span>
      </footer>
    </div>
  )
}
