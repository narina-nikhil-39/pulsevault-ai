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
import { PortalDirectoryView } from './views/PortalDirectoryView'
import { UniversalAppHeader } from './components/UniversalAppHeader'
import { BenchmarkDashboardView } from './views/BenchmarkDashboardView'

interface Doctor {
  doctor_id: string
  display_name: string
  role: string
}

export type AppRoute = 'directory' | 'reception' | 'doctor' | 'patient' | 'benchmarks'

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'directory'
  const path = window.location.pathname.toLowerCase()
  if (path.startsWith('/reception')) return 'reception'
  if (path.startsWith('/doctor')) return 'doctor'
  if (path.startsWith('/patient')) return 'patient'
  if (path.startsWith('/benchmarks')) return 'benchmarks'
  return 'directory'
}

function ClinicalWorkspace() {
  const [route, setRoute] = useState<AppRoute>(getInitialRoute)
  const [doctor, setDoctor] = useState<Doctor | null>(() => loadSession())
  const [patientCode, setPatientCode] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('patient') || 'SYN123456'
    }
    return 'SYN123456'
  })
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

  function navigate(nextRoute: AppRoute, code?: string) {
    setRoute(nextRoute)
    let url = '/'
    if (nextRoute === 'reception') {
      url = '/reception'
    } else if (nextRoute === 'doctor') {
      url = code ? `/doctor?patient=${encodeURIComponent(code)}` : '/doctor'
    } else if (nextRoute === 'patient') {
      url = code ? `/patient?patient=${encodeURIComponent(code)}` : '/patient'
    } else if (nextRoute === 'benchmarks') {
      url = '/benchmarks'
    }

    if (code) {
      setPatientCode(code)
      void loadProfile(code)
    }

    if (typeof window !== 'undefined' && window.location.pathname !== url) {
      window.history.pushState(null, '', url)
    }
  }

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getInitialRoute())
      const params = new URLSearchParams(window.location.search)
      const pCode = params.get('patient')
      if (pCode) {
        setPatientCode(pCode)
        void loadProfile(pCode)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [loadProfile])

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
    navigate('directory')
  }

  // Pre-load initial patient profile on start if doctor is logged in
  useEffect(() => {
    if (doctor && patientCode && !profile) {
      void loadProfile(patientCode)
    }
  }, [doctor, patientCode, profile, loadProfile])

  // ROUTE 4: Live Benchmark & Metrics Dashboard (/benchmarks)
  if (route === 'benchmarks') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
        <UniversalAppHeader
          currentRoute={route}
          onNavigate={(dest, code) => navigate(dest, code)}
          currentPatientCode={patientCode}
        />
        <main className="flex-1">
          <BenchmarkDashboardView />
        </main>
      </div>
    )
  }

  // ROUTE 0: Central Hospital Gateway & Directory (/)
  if (route === 'directory') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
        <UniversalAppHeader
          currentRoute={route}
          onNavigate={(dest, code) => navigate(dest, code)}
          currentPatientCode={patientCode}
        />
        <PortalDirectoryView
          onNavigate={(dest, code) => navigate(dest, code)}
        />
      </div>
    )
  }

  // ROUTE 1: Reception Desk & Triage (/reception)
  if (route === 'reception') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
        <UniversalAppHeader
          currentRoute={route}
          onNavigate={(dest, code) => navigate(dest, code)}
          currentPatientCode={patientCode}
        />
        <ReceptionDeskView
          persona="reception"
          onSwitchPersona={(p) => navigate(p)}
          onNavigateHome={() => navigate('directory')}
          onSelectPatientForDoctor={(code) => navigate('doctor', code)}
          onOpenPatientPortal={(code) => navigate('patient', code)}
        />
      </div>
    )
  }

  // ROUTE 3: Patient Health Locker (/patient)
  if (route === 'patient') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
        <UniversalAppHeader
          currentRoute={route}
          onNavigate={(dest, code) => navigate(dest, code)}
          currentPatientCode={patientCode}
        />
        <PatientLandingView
          persona="patient"
          onSwitchPersona={(p) => navigate(p)}
          onNavigateHome={() => navigate('directory')}
          onBookAppointmentRedirect={() => navigate('reception')}
        />
      </div>
    )
  }

  // ROUTE 2: Doctor Consultation Console (/doctor)
  if (!doctor) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
        {/* Top Header Bar */}
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur px-7 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('directory')}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <span>←</span>
              <span>Hospital Directory</span>
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 tracking-tight">SynapseHealth</span>
              <span className="text-[10px] text-slate-400 font-medium">Physician Authentication</span>
            </div>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <LoginView onSignedIn={handleSignIn} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      <UniversalAppHeader
        currentRoute={route}
        onNavigate={(dest, code) => navigate(dest, code)}
        currentPatientCode={patientCode}
      />
      <DoctorConsoleView
        doctor={doctor}
        patientCode={patientCode}
        profile={profile}
        loading={loading}
        onSelectPatient={handleSelect}
        onSignOut={handleSignOut}
        persona="doctor"
        onSwitchPersona={(p) => navigate(p)}
        onNavigateHome={() => navigate('directory')}
      />
    </div>
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
