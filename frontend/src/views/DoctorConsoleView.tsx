import { useEffect, useState } from 'react'
import {
  fetchReceptionQueue,
  type AppointmentItem,
  type BreakGlassResponse,
  type PatientProfile,
} from '../api'
import { BreakGlassModal } from '../components/BreakGlassModal'
import { FhirExportButton } from '../components/FhirExportButton'
import { TopSafetyBanner } from '../components/TopSafetyBanner'
import { UploadPanel } from '../components/UploadPanel'
import { AuditView } from '../components/AuditView'
import { EmergencyFlashcard } from '../components/EmergencyFlashcard'
import { ProfileView } from '../components/ProfileView'
import { SafetyView } from '../components/SafetyView'
import { TimelineView } from '../components/TimelineView'
import { ClinicalGraphView } from '../components/ClinicalGraphView'
import { RagAssistantView } from '../components/RagAssistantView'


interface DoctorConsoleViewProps {
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
  persona: 'reception' | 'doctor' | 'patient'
  onSwitchPersona: (persona: 'reception' | 'doctor' | 'patient') => void
}

type DoctorSidebarNav =
  | 'dashboard'
  | 'appointments'
  | 'search'
  | 'summary'
  | 'timeline'
  | 'prescriptions'
  | 'safety'
  | 'consultations'

type ClinicalTab = 'profile' | 'rag' | 'flashcard' | 'safety' | 'timeline' | 'graph' | 'audit'

const CLINICAL_TABS: { key: ClinicalTab; label: string; icon: string }[] = [
  { key: 'profile', label: 'Clinical Profile & Citations', icon: '📋' },
  { key: 'rag', label: 'AI Assistant & Grounded QA', icon: '🤖' },
  { key: 'flashcard', label: 'Emergency Flashcard', icon: '⚡' },
  { key: 'safety', label: 'Safety Contraindications', icon: '🛡️' },
  { key: 'timeline', label: 'Longitudinal Timeline', icon: '📅' },
  { key: 'graph', label: 'Knowledge Graph', icon: '🕸️' },
  { key: 'audit', label: 'Cryptographic Audit Chain', icon: '🔒' },
]


export function DoctorConsoleView({
  doctor,
  patientCode,
  profile,
  loading,
  onSelectPatient,
  onSignOut,
  persona,
  onSwitchPersona,
}: DoctorConsoleViewProps) {
  const [sidebarNav, setSidebarNav] = useState<DoctorSidebarNav>('dashboard')
  const [clinicalTab, setClinicalTab] = useState<ClinicalTab>('profile')
  const [inConsultationMode, setInConsultationMode] = useState<boolean>(false)

  // Break Glass Emergency Override State
  const [showBreakGlass, setShowBreakGlass] = useState(false)
  const [breakGlassActive, setBreakGlassActive] = useState<BreakGlassResponse | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0)
  const [expiryAlert, setExpiryAlert] = useState(false)

  // Live Queue & Appointment Data
  const [queueItems, setQueueItems] = useState<AppointmentItem[]>([])

  // Search Dialog State
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchReceptionQueue()
      .then(setQueueItems)
      .catch((err) => console.error('Failed to load appointments:', err))
  }, [])

  useEffect(() => {
    if (countdownSeconds <= 0) return
    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          setBreakGlassActive(null)
          setClinicalTab('profile')
          setExpiryAlert(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdownSeconds])

  function handleBreakGlassSuccess(res: BreakGlassResponse) {
    setBreakGlassActive(res)
    setCountdownSeconds(res.expires_in || 3600)
    setShowBreakGlass(false)
    setClinicalTab('flashcard')
  }

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`
  }

  function startConsultationFor(code: string) {
    onSelectPatient(code)
    setInConsultationMode(true)
    setSidebarNav('summary')
  }

  const criticalCount =
    profile?.safety_alerts.filter((alert) => alert.severity === 'critical').length ?? 0

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex font-sans">
      {/* 1. Left Sidebar Navigation matching Image 3 */}
      <aside className="w-64 border-r border-slate-200/90 bg-white flex flex-col shrink-0 z-20">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.4}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <div>
            <span className="text-base font-bold text-slate-900 tracking-tight">SynapseHealth</span>
            <p className="text-[10px] text-slate-400 font-medium">Physician Workstation</p>
          </div>
        </div>

        {/* Nav Items Stack */}
        <nav className="p-3.5 space-y-1 flex-1 text-xs font-medium overflow-y-auto">
          <button
            onClick={() => {
              setSidebarNav('dashboard')
              setInConsultationMode(false)
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'dashboard' && !inConsultationMode
                ? 'bg-blue-50 text-blue-600 font-bold shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">🏠</span>
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setSidebarNav('appointments')
              setInConsultationMode(false)
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'appointments'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">📅</span>
            <span>Appointments</span>
          </button>

          <button
            onClick={() => setSearchModalOpen(true)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'search'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">🔍</span>
            <span>Patient Search</span>
          </button>

          <button
            onClick={() => {
              if (patientCode) setInConsultationMode(true)
              setSidebarNav('summary')
              setClinicalTab('profile')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'summary' || inConsultationMode
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">📋</span>
            <span>Clinical Summary</span>
          </button>

          <button
            onClick={() => {
              if (patientCode) setInConsultationMode(true)
              setSidebarNav('timeline')
              setClinicalTab('timeline')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'timeline'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">🔀</span>
            <span>Medical Timeline</span>
          </button>

          <button
            onClick={() => {
              if (patientCode) setInConsultationMode(true)
              setSidebarNav('prescriptions')
              setClinicalTab('profile')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'prescriptions'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">💊</span>
            <span>Prescriptions</span>
          </button>

          <button
            onClick={() => {
              if (patientCode) setInConsultationMode(true)
              setSidebarNav('safety')
              setClinicalTab('safety')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'safety'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">🛡️</span>
            <span>Safety Alerts</span>
            {criticalCount > 0 ? (
              <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
                {criticalCount}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => {
              setSidebarNav('consultations')
              setInConsultationMode(false)
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarNav === 'consultations'
                ? 'bg-blue-50 text-blue-600 font-bold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">🩺</span>
            <span>Consultations</span>
          </button>

          <div className="pt-3 pb-1 border-t border-slate-100" />

          <button
            onClick={() => setInConsultationMode(false)}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <span>👤</span>
            <span>Profile</span>
          </button>

          <button
            onClick={() => setInConsultationMode(false)}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </nav>

        {/* Sidebar Help & Support */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold">
              ?
            </span>
            <span>Help &amp; Support</span>
          </div>
          <button onClick={onSignOut} className="text-slate-400 hover:text-rose-600 text-[11px]">
            Sign Out
          </button>
        </div>
      </aside>

      {/* 2. Main Workstation Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 px-7 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xs font-bold text-slate-700">Outpatient Consultation Console</span>
          </div>

          {/* Persona Switcher Pill */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shadow-inner">
            <button
              onClick={() => onSwitchPersona('reception')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                persona === 'reception'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏨</span>
              <span>Reception Desk</span>
            </button>
            <button
              onClick={() => onSwitchPersona('doctor')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                persona === 'doctor'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🩺</span>
              <span>Doctor Console</span>
            </button>
            <button
              onClick={() => onSwitchPersona('patient')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                persona === 'patient'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👤</span>
              <span>Patient Portal</span>
            </button>
          </div>

          {/* Right Doctor Pill & Notifications */}
          <div className="flex items-center gap-3">
            <button
              aria-label="Notifications"
              className="relative p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                3
              </span>
            </button>

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs">
                {doctor?.display_name ? doctor.display_name.split(' ').map((n) => n[0]).join('').slice(0, 2) : 'DM'}
              </div>
              <div className="text-left text-xs leading-tight">
                <div className="font-bold text-slate-800">{doctor?.display_name || 'Dr. Meera Thomas'}</div>
                <div className="text-[10px] text-slate-400">{doctor?.role || 'General Physician'} ▾</div>
              </div>
            </div>
          </div>
        </header>

        {/* 3. Main Body */}
        <main className="p-7 max-w-7xl w-full mx-auto flex-1 space-y-6">
          {!inConsultationMode ? (
            /* =========================================================================
               VIEW 2A: DOCTOR DASHBOARD & SCHEDULE VIEW (Image 3)
               ========================================================================= */
            <>
              {/* Header Greeting + Date Widget */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Welcome, {doctor?.display_name || 'Dr. Meera Thomas'}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Here's your schedule and important updates for today.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs shadow-xs">
                  <span className="text-blue-600 text-base">📅</span>
                  <div>
                    <div className="font-bold text-slate-800">12 Aug 2026</div>
                    <div className="text-[10px] text-slate-400">Tuesday · OPD Shift A</div>
                  </div>
                </div>
              </div>

              {/* 4 Pastel Top Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Today's Appointments */}
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4.5 flex items-center gap-3.5 shadow-xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 text-xl shadow-xs">
                    📅
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">
                      {queueItems.length > 0 ? queueItems.length : 6}
                    </div>
                    <div className="text-xs font-medium text-slate-600">Today's Appointments</div>
                  </div>
                </div>

                {/* 2. Awaiting Consultation */}
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4.5 flex items-center gap-3.5 shadow-xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-600 text-xl shadow-xs">
                    👤
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">
                      {queueItems.filter((i) => {
                        const s = i.status.toLowerCase()
                        return s === 'waiting' || s === 'checked_in'
                      }).length}
                    </div>
                    <div className="text-xs font-medium text-slate-600">Awaiting Consultation</div>
                  </div>
                </div>

                {/* 3. Documents Shared */}
                <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4.5 flex items-center gap-3.5 shadow-xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-purple-600 text-xl shadow-xs">
                    📄
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">
                      {profile?.documents.length ?? 4}
                    </div>
                    <div className="text-xs font-medium text-slate-600">Documents Shared</div>
                  </div>
                </div>

                {/* 4. Consultations to Finalize */}
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4.5 flex items-center gap-3.5 shadow-xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 text-xl shadow-xs">
                    💊
                  </div>
                  <div>
                    <div className="text-2xl font-black text-slate-900">
                      {queueItems.filter((i) => i.status.toLowerCase() === 'waiting').length}
                    </div>
                    <div className="text-xs font-medium text-slate-600">
                      Consultations to Finalize
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-Column Layout (2/3 Left, 1/3 Right) */}
              <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
                {/* Left 2/3 Column: Appointments Table & AI Clinical Assistant */}
                <div className="space-y-6">
                  {/* Today's Appointments Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 text-base">📅</span>
                        <h2 className="text-base font-bold text-slate-900">Today's Appointments</h2>
                      </div>
                      <button
                        onClick={() => startConsultationFor('SYN123456')}
                        className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <span>View Full Schedule</span>
                        <span>→</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-400 font-semibold border-b border-slate-100 text-[11px]">
                            <th className="py-2.5 px-3">Time</th>
                            <th className="py-2.5 px-3">Patient</th>
                            <th className="py-2.5 px-3">Department</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(queueItems.length > 0 ? queueItems : [
                            {
                              id: 1,
                              token_number: '001',
                              patient_name: 'Aarav Sharma',
                              patient_code: 'SYN123456',
                              department: 'General Medicine',
                              doctor_name: 'Dr. Meera Thomas',
                              scheduled_time: '10:00 AM',
                              status: 'checked_in',
                            },
                            {
                              id: 2,
                              token_number: '002',
                              patient_name: 'Arjun Rao',
                              patient_code: 'OPD-ARJUN',
                              department: 'Cardiology',
                              doctor_name: 'Dr. Meera Thomas',
                              scheduled_time: '10:30 AM',
                              status: 'waiting',
                            },
                            {
                              id: 5,
                              token_number: '005',
                              patient_name: 'Trauma ER Patient',
                              patient_code: 'ER-TRAUMA-01',
                              department: 'Emergency / Trauma',
                              doctor_name: 'Dr. Vikram Menon',
                              scheduled_time: '09:30 AM',
                              status: 'in_consultation',
                            },
                          ]).map((item) => {
                            const statusLower = item.status.toLowerCase()
                            const isReady = statusLower === 'checked_in'
                            const initials = item.patient_name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/70 transition">
                                <td className="py-3 px-3 font-semibold text-slate-700">{item.scheduled_time}</td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                                      {initials}
                                    </div>
                                    <div>
                                      <div className="font-bold text-slate-900">{item.patient_name}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">{item.patient_code}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-slate-600 font-medium">{item.department}</td>
                                <td className="py-3 px-3">
                                  {isReady ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-200">
                                      Ready
                                    </span>
                                  ) : statusLower === 'in_consultation' ? (
                                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600 border border-purple-200">
                                      In Consult
                                    </span>
                                  ) : statusLower === 'consulted' ? (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 border border-blue-200">
                                      Completed
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 border border-amber-200">
                                      Waiting
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <button
                                    onClick={() => startConsultationFor(item.patient_code)}
                                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                                      isReady
                                        ? 'bg-blue-600 text-white font-bold shadow-xs hover:bg-blue-700'
                                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {isReady ? 'Start Consultation' : 'View Details'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* AI Clinical Assistant Widget */}
                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/40 via-white to-sky-50/30 p-6 shadow-xs space-y-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 text-base">✨</span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">AI Clinical Assistant</h3>
                        <p className="text-[11px] text-slate-500">
                          Get structured summaries and insights from patient documents.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-lg">
                          📄
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">
                            Documents for Today's Patients
                          </div>
                          <div className="text-[11px] text-slate-500">
                            4 new documents shared by administration
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          startConsultationFor('OPD-ARJUN')
                          setClinicalTab('rag')
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-600 hover:text-white transition shadow-2xs cursor-pointer"
                      >
                        <span>Analyze with AI</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right 1/3 Column: Next Appointment Spotlight & Quick Actions */}
                <div className="space-y-6">
                  {/* Next Appointment Spotlight Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Next Appointment
                      </h3>
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-200 animate-pulse">
                        In 15 mins
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 text-lg font-bold">
                        AS
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">Aarav Sharma</div>
                        <div className="text-xs text-slate-400">23 years | Male</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                      <div className="flex items-center gap-2">
                        <span>📅</span>
                        <span>Today, 10:00 AM</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>📄</span>
                        <span>Follow-up Consultation</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>📁</span>
                        <span>3 documents available</span>
                      </div>
                    </div>

                    <button
                      onClick={() => startConsultationFor('SYN123456')}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition"
                    >
                      <span>Start Consultation</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Quick Actions Stack */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Quick Actions
                    </h3>

                    <button
                      onClick={() => setSearchModalOpen(true)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/40 text-left transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          🔍
                        </span>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">Patient Search</div>
                          <div className="text-[10px] text-slate-400">Search by ID or name</div>
                        </div>
                      </div>
                      <span className="text-slate-300 font-bold">›</span>
                    </button>

                    <button
                      onClick={() => startConsultationFor('OPD-ARJUN')}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 text-left transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          💊
                        </span>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">
                            Create Prescription
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Add medicines and instructions
                          </div>
                        </div>
                      </div>
                      <span className="text-slate-300 font-bold">›</span>
                    </button>

                    <button
                      onClick={() => startConsultationFor('ER-TRAUMA-01')}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-purple-200 hover:bg-purple-50/40 text-left transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                          📄
                        </span>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">
                            View Assigned Patients
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Scheduled &amp; trauma ER intake
                          </div>
                        </div>
                      </div>
                      <span className="text-slate-300 font-bold">›</span>
                    </button>

                    <button
                      onClick={() => setSidebarNav('appointments')}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50/40 text-left transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                          🕒
                        </span>
                        <div>
                          <div className="font-bold text-slate-800 text-xs">
                            Consultation History
                          </div>
                          <div className="text-[10px] text-slate-400">View past consultations</div>
                        </div>
                      </div>
                      <span className="text-slate-300 font-bold">›</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* =========================================================================
               VIEW 2B: ACTIVE CONSULTATION & CLINICAL WORKSPACE
               ========================================================================= */
            <div className="space-y-6">
              {/* Back to Schedule Bar & Patient Banner */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setInConsultationMode(false)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <span>←</span>
                    <span>Back to Schedule</span>
                  </button>

                  <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 font-bold text-sm">
                      {profile?.patient.full_name ? profile.patient.full_name.charAt(0) : 'P'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {profile?.patient.full_name || patientCode}
                        </span>
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-mono font-bold text-blue-600 border border-blue-200">
                          {profile?.patient.patient_code || patientCode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {profile?.patient.age} yrs · {profile?.patient.sex} · Blood Group:{' '}
                        <span className="font-bold text-rose-600">
                          {profile?.patient.blood_group || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency & Export Action Buttons */}
                <div className="flex items-center gap-2.5">
                  {/* Break Glass Button */}
                  <button
                    onClick={() => setShowBreakGlass(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition shadow-2xs"
                  >
                    <span>🚨</span>
                    <span>Break-Glass Protocol</span>
                  </button>

                  {/* Active Countdown Timer */}
                  {countdownSeconds > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-xl border border-red-400 bg-red-100 px-3 py-1.5 text-xs text-red-700 font-mono font-bold animate-pulse">
                      <span>⏱️</span>
                      <span>TTL: {formatCountdown(countdownSeconds)}</span>
                    </div>
                  ) : null}

                  {/* HL7 FHIR Export Button */}
                  {patientCode && profile ? (
                    <FhirExportButton patientCode={profile.patient.patient_code} />
                  ) : null}
                </div>
              </div>

              {breakGlassActive ? (
                <div className="rounded-2xl border border-red-300 bg-red-50 p-3.5 text-xs text-red-900 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-600 text-white font-bold text-[10px]">
                      🚨
                    </span>
                    <div>
                      <span className="font-bold">Active Ephemeral Emergency Override:</span>{' '}
                      <span>{breakGlassActive.clinical_reason_code}</span> · Co-signing Nurse:{' '}
                      <span className="font-semibold">{breakGlassActive.nurse_cosigner_id}</span>
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-red-700 bg-white/70 px-2 py-0.5 rounded border border-red-200">
                    Seal: {breakGlassActive.audit_block_hash.slice(0, 16)}…
                  </div>
                </div>
              ) : null}

              {/* Ingestion & Document Upload Accordion */}
              <div className="grid md:grid-cols-[320px_1fr] gap-6 items-start">
                <div className="space-y-4">
                  <UploadPanel onProcessed={(code) => onSelectPatient(code)} />

                  {/* Quick Patient Switcher */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-xs space-y-2">
                    <span className="font-bold text-slate-700 block">Switch Active Patient:</span>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => onSelectPatient('SYN123456')}
                        className={`text-left px-3 py-1.5 rounded-lg font-medium transition ${
                          patientCode === 'SYN123456'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Aarav Sharma (SYN123456)
                      </button>
                      <button
                        onClick={() => onSelectPatient('OPD-ARJUN')}
                        className={`text-left px-3 py-1.5 rounded-lg font-medium transition ${
                          patientCode === 'OPD-ARJUN'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Arjun Rao (OPD-ARJUN)
                      </button>
                      <button
                        onClick={() => onSelectPatient('ER-TRAUMA-01')}
                        className={`text-left px-3 py-1.5 rounded-lg font-medium transition ${
                          patientCode === 'ER-TRAUMA-01'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Trauma ER Patient (ER-TRAUMA-01)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Clinical Content Tabs */}
                <div className="space-y-4 min-w-0">
                  {loading && !profile ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-xs text-slate-400">
                      Loading patient records &amp; multi-hospital synthesis…
                    </div>
                  ) : profile ? (
                    <>
                      {/* Top Safety Banner */}
                      <TopSafetyBanner
                        alerts={profile.safety_alerts}
                        allergies={profile.allergies}
                        onViewAlerts={() => setClinicalTab('safety')}
                      />

                      {/* Clinical Workspace Navigation Tabs */}
                      <nav className="flex flex-wrap gap-2" role="tablist">
                        {CLINICAL_TABS.map((entry) => {
                          const isActive = entry.key === clinicalTab
                          const badge =
                            entry.key === 'safety' && criticalCount > 0 ? criticalCount : null
                          return (
                            <button
                              key={entry.key}
                              role="tab"
                              aria-selected={isActive}
                              onClick={() => setClinicalTab(entry.key)}
                              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                                isActive
                                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                            >
                              <span>{entry.icon}</span>
                              <span>{entry.label}</span>
                              {badge ? (
                                <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                                  {badge}
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </nav>

                      {/* Tab Contents */}
                      <div className="mt-4">
                        {clinicalTab === 'profile' ? <ProfileView profile={profile} /> : null}
                        {clinicalTab === 'rag' ? (
                          <RagAssistantView patientCode={profile.patient.patient_code} />
                        ) : null}
                        {clinicalTab === 'flashcard' ? (
                          <EmergencyFlashcard patientCode={profile.patient.patient_code} />
                        ) : null}
                        {clinicalTab === 'safety' ? <SafetyView profile={profile} /> : null}
                        {clinicalTab === 'timeline' ? <TimelineView profile={profile} /> : null}
                        {clinicalTab === 'graph' ? (
                          <ClinicalGraphView patientCode={profile.patient.patient_code} />
                        ) : null}
                        {clinicalTab === 'audit' ? (
                          <AuditView patientCode={profile.patient.patient_code} />
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
                      Select an active patient to begin review.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Break-Glass Modal */}
      {showBreakGlass && patientCode ? (
        <BreakGlassModal
          patientCode={patientCode}
          onSuccess={handleBreakGlassSuccess}
          onClose={() => setShowBreakGlass(false)}
        />
      ) : null}

      {/* Quick Search Modal */}
      {searchModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Search Patient Database</h3>
              <button
                onClick={() => setSearchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter Patient ID (e.g. SYN123456, OPD-ARJUN)"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-none"
            />
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="text-[11px] text-slate-400 font-semibold uppercase">
                Quick Cohorts:
              </div>
              <button
                onClick={() => {
                  startConsultationFor('SYN123456')
                  setSearchModalOpen(false)
                }}
                className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-blue-50 font-medium text-slate-800"
              >
                Aarav Sharma · SYN123456 (Asthma, B+)
              </button>
              <button
                onClick={() => {
                  startConsultationFor('OPD-ARJUN')
                  setSearchModalOpen(false)
                }}
                className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-blue-50 font-medium text-slate-800"
              >
                Arjun Rao · OPD-ARJUN (Warfarin + Aspirin Contraindication)
              </button>
              <button
                onClick={() => {
                  startConsultationFor('ER-TRAUMA-01')
                  setSearchModalOpen(false)
                }}
                className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-blue-50 font-medium text-slate-800"
              >
                Trauma ER Patient · ER-TRAUMA-01 (O-, Penicillin Anaphylaxis)
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Emergency Session Expiry Lockdown Modal */}
      {expiryAlert ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 text-2xl font-bold border-2 border-rose-200 shadow-sm">
                🔒
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Emergency Session Expired
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Emergency session has expired. Re-authentication with dual signatures is required. The emergency flashcard and override permissions have been locked to maintain compliance and clinical audit integrity.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => setExpiryAlert(false)}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
              >
                Acknowledge & Return to Standard Console
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
export default DoctorConsoleView
