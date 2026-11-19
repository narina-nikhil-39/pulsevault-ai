import { useEffect, useState } from 'react'
import { fetchDoctors, type DoctorItem } from '../api'
import { PatientRegisterWizard } from '../components/PatientRegisterWizard'
import {
  DoctorTeamLeftIllustration,
  DoctorTeamRightIllustration,
} from '../components/FlatVectorHealthcareIllustrations'

interface PortalDirectoryViewProps {
  onNavigate: (route: 'reception' | 'doctor' | 'patient', patientCode?: string) => void
}

export function PortalDirectoryView({ onNavigate }: PortalDirectoryViewProps) {
  const [doctors, setDoctors] = useState<DoctorItem[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [showRegisterModal, setShowRegisterModal] = useState(false)

  useEffect(() => {
    fetchDoctors()
      .then((data) => setDoctors(data))
      .catch((err) => console.error('Failed to load doctor directory:', err))
      .finally(() => setLoadingDocs(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      {/* Top Banner / System Navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/90 px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#064e3b] text-white shadow-md shadow-emerald-950/20">
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
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-[#064e3b] tracking-tight">SynapseHealth</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-[#064e3b] border border-emerald-200">
                  PulseVault AI Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Decoupled Tri-Party Clinical Operating Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRegisterModal(true)}
              className="rounded-xl bg-[#064e3b] hover:bg-[#053b2e] px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-950/20 transition flex items-center gap-2 cursor-pointer"
            >
              <span>+</span>
              <span>New Patient Intake</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto px-8 py-8 flex-1 space-y-10">
        {/* Hero Section with Custom Flat Vector Doctor Illustrations (Dark Green & White) */}
        <div className="rounded-3xl bg-gradient-to-r from-[#06382f] via-[#09483c] to-[#06382f] p-8 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
            {/* Left Vector Doctor Illustration */}
            <div className="hidden lg:flex lg:col-span-3 justify-center items-center">
              <DoctorTeamLeftIllustration className="w-full max-h-52 object-contain drop-shadow" />
            </div>

            {/* Center Content */}
            <div className="lg:col-span-6 space-y-4 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-950/70 border border-emerald-700/60 px-3 py-1 text-xs font-semibold text-emerald-200">
                <span>⚡</span>
                <span>Autonomous Clinical Graph &amp; Patient Safety Protocol</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-white">
                Hospital Operating System &amp; Decoupled Portals
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed font-medium">
                Seamlessly unify fragmented records, detect lethal drug-drug interactions with deterministic safety interlocks,
                and empower frontline clinicians with real-time vector RAG and dual-authorized break-glass emergency overrides.
              </p>

              {/* Health Indicators */}
              <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-100">
                <span className="rounded-lg bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  PostgreSQL Cloud DB: Active
                </span>
                <span className="rounded-lg bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Neo4j Graph: Synchronized
                </span>
                <span className="rounded-lg bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-400" />
                  Qdrant Vector Store: Armed
                </span>
                <span className="rounded-lg bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Break-Glass: Dual-Key Verified
                </span>
              </div>
            </div>

            {/* Right Vector Doctor Illustration */}
            <div className="hidden lg:flex lg:col-span-3 justify-center items-center">
              <DoctorTeamRightIllustration className="w-full max-h-52 object-contain drop-shadow" />
            </div>
          </div>
        </div>

        {/* 3 Dedicated Role Portal Cards */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Dedicated Clinical Portals</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a role workstation to access dedicated hospital tools</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">Independent Portals</span>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* PORTAL 1: Reception Desk */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 text-2xl font-bold group-hover:scale-105 transition">
                    🏨
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                    Front Desk
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">Reception Desk &amp; Triage</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Fast patient registration, QR pass scanning, OPD token generation, and real-time appointment booking.
                  </p>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Instant SynapseHealth ID Lookup &amp; QR Scan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Dynamic Doctor Consultation Assignment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Live Outpatient Queue Tracker</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => onNavigate('reception')}
                  className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                  <span>Launch Reception Desk</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* PORTAL 2: Doctor Console */}
            <div className="rounded-3xl border border-indigo-200/80 bg-white p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wider">
                Physician Only
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 text-2xl font-bold group-hover:scale-105 transition">
                    🩺
                  </div>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">
                    Clinical Console
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">Doctor Consultation Console</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Multi-document synthesis, interactive knowledge graph, Qdrant vector search, and dual-authorized break-glass.
                  </p>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-500 font-bold">✓</span>
                    <span>Deterministic Drug Conflict Warning Interlocks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-500 font-bold">✓</span>
                    <span>Interactive SVG Knowledge Graph &amp; Cypher Export</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-500 font-bold">✓</span>
                    <span>Coordinate-Grounded Clinical RAG Assistant</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => onNavigate('doctor')}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  <span>Launch Doctor Console</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* PORTAL 3: Patient Portal */}
            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 text-2xl font-bold group-hover:scale-105 transition">
                    👤
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                    Patient Vault
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">Patient Health Locker</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Personal health records, instant Emergency Flashcard, AI medical companion voice/text assistant, and triage.
                  </p>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Precomputed Emergency Flashcard &amp; QR Pass</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Live Asynchronous Ingestion Tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Voice-Powered Medical Explanation Assistant</span>
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => onNavigate('patient')}
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                >
                  <span>Launch Patient Portal</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Real Doctor Directory & Faculty Catalog */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Verified Medical Faculty &amp; Specialist Directory
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic credentialed clinicians registered with National and State Medical Councils
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {doctors.length} Credentialed Doctors
            </div>
          </div>

          {loadingDocs ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading verified doctors…</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {doctors.map((doc) => (
                <div
                  key={doc.doctor_id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-blue-200 transition flex items-start gap-3.5"
                >
                  <img
                    src={doc.avatar_url || 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150'}
                    alt={doc.name}
                    className="h-12 w-12 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{doc.name}</h4>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                        Active
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-blue-600 truncate mt-0.5">
                      {doc.specialization}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {doc.qualifications}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px]">
                      <span className="font-mono text-slate-500">{doc.reg_number}</span>
                      <button
                        onClick={() => onNavigate('reception')}
                        className="font-bold text-blue-600 hover:text-blue-700"
                      >
                        Book Visit →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white px-8 py-5 text-center text-xs text-slate-400">
        <p>SynapseHealth (PulseVault AI) • Multimodal Clinical Ingestion &amp; Safety Platform • HIPAA &amp; NDHM Compliant</p>
      </footer>

      {/* Modal for Patient Onboarding */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <PatientRegisterWizard
            onClose={() => setShowRegisterModal(false)}
            onOpenPatientPortal={(code) => {
              setShowRegisterModal(false)
              onNavigate('patient', code)
            }}
            onOpenDoctorConsole={(code) => {
              setShowRegisterModal(false)
              onNavigate('doctor', code)
            }}
          />
        </div>
      )}
    </div>
  )
}
