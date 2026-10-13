import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  clearSession,
  fetchProfile,
  loadSession,
  type PatientProfile,
} from './api'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoginView } from './components/LoginView'
import { ToastProvider } from './context/ToastContext'
import { DoctorConsoleView } from './views/DoctorConsoleView'
import { PatientLandingView } from './views/PatientLandingView'
import { ReceptionDeskView } from './views/ReceptionDeskView'

interface Doctor {
  doctor_id: string
  display_name: string
  role: string
}

export type PersonaType = 'reception' | 'doctor' | 'patient'

function ClinicalWorkspace() {
  const [persona, setPersona] = useState<PersonaType>('doctor')
  const [doctor, setDoctor] = useState<Doctor | null>(() => loadSession())
  const [patientCode, setPatientCode] = useState<string | null>('SYN123456')
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProfile = useCallback(async (code: string) => {
    setLoading(true)
    try {
      setProfile(await fetchProfile(code))
    } catch (caught) {
      setProfile(null)
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession()
        setDoctor(null)
      }
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

  // Pre-load initial patient profile on start if doctor is logged in
  useEffect(() => {
    if (doctor && patientCode && !profile) {
      void loadProfile(patientCode)
    }
  }, [doctor, patientCode, profile, loadProfile])

  // VIEW 1: Reception Desk Experience (Image 2)
  if (persona === 'reception') {
    return (
      <ReceptionDeskView
        persona={persona}
        onSwitchPersona={setPersona}
        onSelectPatientForDoctor={(code) => handleSelect(code)}
      />
    )
  }

  // VIEW 3: Patient Portal Experience (Image 1 MediCare Pro)
  if (persona === 'patient') {
    return (
      <PatientLandingView
        persona={persona}
        onSwitchPersona={setPersona}
        onBookAppointmentRedirect={() => setPersona('reception')}
      />
    )
  }

  // VIEW 2: Doctor Consultation Console (Image 3)
  if (!doctor) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
        {/* Top Header Bar with Persona Switcher */}
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur px-7 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/20">
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
              <span className="text-sm font-bold text-slate-900 tracking-tight">SynapseHealth</span>
              <span className="text-[10px] text-slate-400 font-medium ml-2">Hospital Network</span>
            </div>
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shadow-inner">
            <button
              onClick={() => setPersona('reception')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition text-slate-600 hover:text-slate-900"
            >
              <span>🏨</span>
              <span>Reception Desk</span>
            </button>
            <button
              onClick={() => setPersona('doctor')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition bg-blue-600 text-white shadow-xs"
            >
              <span>🩺</span>
              <span>Doctor Console</span>
            </button>
            <button
              onClick={() => setPersona('patient')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition text-slate-600 hover:text-slate-900"
            >
              <span>👤</span>
              <span>Patient Portal</span>
            </button>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <LoginView onSignedIn={handleSignIn} />
        </div>
      </div>
    )
  }

  return (
    <DoctorConsoleView
      doctor={doctor}
      patientCode={patientCode}
      profile={profile}
      loading={loading}
      onSelectPatient={handleSelect}
      onSignOut={handleSignOut}
      persona={persona}
      onSwitchPersona={setPersona}
    />
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ErrorBoundary>
          <ClinicalWorkspace />
        </ErrorBoundary>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
