import { useEffect, useState } from 'react'
import {
  fetchReceptionQueue,
  checkinReceptionQueue,
  searchPatientDatabase,
  type AppointmentItem,
} from '../api'
import { QRCameraScanner } from '../components/QRCameraScanner'


interface ReceptionDeskViewProps {
  onSwitchPersona: (persona: 'reception' | 'doctor' | 'patient') => void
  persona: 'reception' | 'doctor' | 'patient'
  onSelectPatientForDoctor?: (patientCode: string) => void
}

type DeskTab = 'search' | 'details' | 'confirmed' | 'queue'
type QueueFilter = 'all' | 'checked_in' | 'waiting' | 'consulted' | 'cancelled'

export function ReceptionDeskView({
  onSwitchPersona,
  persona,
  onSelectPatientForDoctor,
}: ReceptionDeskViewProps) {
  const [activeStep, setActiveStep] = useState<DeskTab>('search')
  const [sidebarItem, setSidebarItem] = useState<'register' | 'appointments' | 'records' | 'print'>(
    'register',
  )
  const [searchId, setSearchId] = useState('SYN123456')
  const [searchMode, setSearchMode] = useState<'id' | 'qr'>('id')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [queueSearch, setQueueSearch] = useState('')
  const [showSlipModal, setShowSlipModal] = useState(false)

  // Booking Form State
  const [selectedDept, setSelectedDept] = useState('General Medicine')
  const [selectedDoc, setSelectedDoc] = useState('Dr. Meera Thomas')
  const [selectedDate, setSelectedDate] = useState('12 Aug 2026')
  const [selectedSlot, setSelectedSlot] = useState('10:30 AM')

  // Live Queue State
  const [queue, setQueue] = useState<AppointmentItem[]>([])

  // Verified Patient Info
  const [patientData, setPatientData] = useState({
    name: 'Aarav Sharma',
    code: 'SYN123456',
    dob: '14 Mar 2002 (22 years)',
    gender: 'Male',
    phone: '+91 98765 43210',
    email: 'aarav.sharma@example.com',
    address: 'Hyderabad, Telangana',
    bloodGroup: 'B+',
    allergies: 'Penicillin',
    conditions: 'Asthma (since 2018)',
    activeMeds: 2,
    visitId: 'HOSP987654',
  })

  useEffect(() => {
    loadLiveQueue()
  }, [])

  async function loadLiveQueue() {
    try {
      const data = await fetchReceptionQueue()
      setQueue(data)
    } catch (err) {
      console.error('Failed to load queue from API:', err)
    }
  }

  async function performPatientLookup(code: string) {
    const cleanCode = code.trim().toUpperCase()
    setSearchId(cleanCode)

    try {
      const results = await searchPatientDatabase(cleanCode)
      if (results && results.length > 0 && results[0]) {
        const match = results[0]
        setPatientData({
          name: match.full_name,
          code: match.patient_code,
          dob: match.age ? `${match.age} years` : 'Age unknown',
          gender: match.sex || 'Unknown',
          phone: match.contact || '+91 98765 43210',
          email: `${match.patient_code.toLowerCase()}@hospital.org`,
          address: 'Medical Campus / Inpatient Ward',
          bloodGroup: match.blood_group || 'O+',
          allergies: match.allergies.length > 0 ? match.allergies.join(', ') : 'No known allergies',
          conditions:
            match.chronic_conditions.length > 0
              ? match.chronic_conditions.join(', ')
              : 'None recorded',
          activeMeds: match.active_medications_count,
          visitId: 'HOSP' + Math.floor(100000 + Math.random() * 900000),
        })
        setActiveStep('details')
      } else {
        // Fallback for demo codes or new walk-in patient registration
        setPatientData({
          name: cleanCode === 'OPD-ARJUN' ? 'Arjun Rao' : cleanCode,
          code: cleanCode,
          dob: '45 years',
          gender: 'Male',
          phone: '+91 98765 43210',
          email: `${cleanCode.toLowerCase()}@hospital.org`,
          address: 'Main Clinic',
          bloodGroup: 'A+',
          allergies: 'None recorded',
          conditions: 'General OPD follow-up',
          activeMeds: 1,
          visitId: 'HOSP' + Math.floor(100000 + Math.random() * 900000),
        })
        setActiveStep('details')
      }
    } catch (err) {
      console.error('Search failed:', err)
      setActiveStep('details')
    }
  }

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!searchId.trim()) return
    await performPatientLookup(searchId)
  }


  async function handleConfirmAppointment() {
    try {
      const res = await checkinReceptionQueue({
        patient_code: patientData.code,
        patient_name: patientData.name,
        department: selectedDept,
        doctor_name: selectedDoc,
        scheduled_time: selectedSlot,
      })
      setPatientData((prev) => ({
        ...prev,
        visitId: res.visit_id,
      }))
      await loadLiveQueue()
    } catch (err) {
      console.error('Failed to register appointment:', err)
    }
    setActiveStep('confirmed')
  }

  const filteredQueue = queue.filter((item) => {
    const statusLower = item.status.toLowerCase()
    const matchFilter =
      queueFilter === 'all'
        ? true
        : queueFilter === 'checked_in'
        ? statusLower === 'checked_in'
        : queueFilter === 'waiting'
        ? statusLower === 'waiting'
        : queueFilter === 'consulted'
        ? statusLower === 'consulted'
        : statusLower === 'cancelled'

    const matchSearch =
      queueSearch === '' ||
      item.patient_name.toLowerCase().includes(queueSearch.toLowerCase()) ||
      item.patient_code.toLowerCase().includes(queueSearch.toLowerCase())

    return matchFilter && matchSearch
  })

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex font-sans">
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200/90 bg-white flex flex-col shrink-0 z-20">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            {/* Heartbeat pulse SVG */}
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
            <p className="text-[10px] text-slate-400 font-medium">Front Desk Portal</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3.5 space-y-1.5 flex-1 text-sm font-medium">
          <button
            onClick={() => {
              setSidebarItem('register')
              setActiveStep('search')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarItem === 'register' && activeStep !== 'queue'
                ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-base">👤</span>
            <span>Patient Registration</span>
          </button>

          <button
            onClick={() => {
              setSidebarItem('appointments')
              setActiveStep('queue')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarItem === 'appointments' || activeStep === 'queue'
                ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-base">📅</span>
            <span>Appointments</span>
          </button>

          <button
            onClick={() => {
              setSidebarItem('records')
              setActiveStep('details')
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarItem === 'records'
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-base">📁</span>
            <span>Patient Records</span>
          </button>

          <button
            onClick={() => {
              setSidebarItem('print')
              setShowSlipModal(true)
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
              sidebarItem === 'print'
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-base">🖨️</span>
            <span>Print Documents</span>
          </button>
        </nav>

        {/* Sidebar Footer Help */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
              ?
            </span>
            <span>Help &amp; Support</span>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 px-7 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">City Care Hospital</span>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-700">Patient Intake &amp; Triage</span>
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

          {/* User Profile Pill */}
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
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-red-500" />
            </button>

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                RC
              </div>
              <div className="text-left text-xs leading-tight">
                <div className="font-bold text-slate-800">Receptionist</div>
                <div className="text-[10px] text-slate-400">City Care Hospital</div>
              </div>
            </div>
          </div>
        </header>

        {/* Sub-Header Breadcrumb Steps Bar */}
        <div className="bg-white border-b border-slate-100 px-7 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveStep('search')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeStep === 'search'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              1. Search Patient
            </button>
            <span className="text-slate-300">→</span>
            <button
              onClick={() => setActiveStep('details')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeStep === 'details'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              2. Patient Details &amp; Booking
            </button>
            <span className="text-slate-300">→</span>
            <button
              onClick={() => setActiveStep('confirmed')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeStep === 'confirmed'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              3. Confirmation Slip
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActiveStep('queue')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                activeStep === 'queue'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              4. Today's Appointments Queue
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Demo Quick Fill:</span>
            <button
              onClick={() => {
                setSearchId('SYN123456')
                setActiveStep('search')
              }}
              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-blue-100 hover:text-blue-700"
            >
              Aarav (SYN123456)
            </button>
            <button
              onClick={() => {
                setSearchId('OPD-ARJUN')
                setActiveStep('search')
              }}
              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-blue-100 hover:text-blue-700"
            >
              Arjun Rao (OPD)
            </button>
          </div>
        </div>

        {/* 3. Panel Switcher Area */}
        <main className="p-7 max-w-6xl w-full mx-auto flex-1">
          {/* PANEL 1: Search Patient by SynapseHealth ID */}
          {activeStep === 'search' ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Welcome to SynapseHealth
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Quick and secure patient registration for seamless care.
                </p>
              </div>

              {/* Main Search Card with Card Graphic Illustration */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xs grid md:grid-cols-[1fr_300px] gap-8 items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Retrieve Patient Details</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter the patient's SynapseHealth ID or scan their QR code to fetch their details.
                  </p>

                  {/* Tabs: Search by ID vs Scan QR */}
                  <div className="mt-5 flex gap-2 border-b border-slate-100 pb-3">
                    <button
                      onClick={() => setSearchMode('id')}
                      className={`text-xs font-bold pb-1 transition border-b-2 ${
                        searchMode === 'id'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Search by ID
                    </button>
                    <button
                      onClick={() => setSearchMode('qr')}
                      className={`text-xs font-bold pb-1 transition border-b-2 ml-4 ${
                        searchMode === 'qr'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Scan QR Code
                    </button>
                  </div>

                  {searchMode === 'id' ? (
                    <form onSubmit={handleSearchSubmit} className="mt-5 space-y-4 max-w-md">
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-slate-400">👤</span>
                        <input
                          type="text"
                          value={searchId}
                          onChange={(e) => setSearchId(e.target.value)}
                          placeholder="Enter SynapseHealth ID (e.g. SYN123456)"
                          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.4}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <span>Search Patient</span>
                      </button>
                    </form>
                  ) : (
                    <div className="mt-5 max-w-lg">
                      <QRCameraScanner
                        onScanSuccess={(code) => {
                          performPatientLookup(code)
                        }}
                      />
                    </div>
                  )}

                </div>

                {/* Right Card Illustration (from Screenshot 2 Panel 1) */}
                <div className="rounded-2xl bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50 border border-blue-100 p-5 flex flex-col items-center text-center shadow-xs">
                  <div className="w-44 h-28 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-3 text-white shadow-md flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold tracking-wider opacity-90">
                        SYNAPSEHEALTH ID
                      </span>
                      <span className="text-[9px] font-mono">2026</span>
                    </div>
                    <div className="text-left">
                      <div className="font-mono text-xs font-bold tracking-widest">{searchId}</div>
                      <div className="text-[9px] opacity-80 mt-0.5">Aarav Sharma</div>
                    </div>
                    <div className="flex items-center justify-between text-[8px] opacity-75 font-mono">
                      <span>VERIFIED PROFILE</span>
                      <span>[ QR CHIP ]</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 mt-4">
                    Universal Smart Health ID
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    ABHA-compatible digital health card with encrypted offline QR
                  </p>
                </div>
              </div>

              {/* Secondary Option: Create New Patient */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Don't have a SynapseHealth ID?
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    You can create a new profile for the patient.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchId('NEW-PATIENT')
                    setActiveStep('details')
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Create New Patient
                </button>
              </div>
            </div>
          ) : null}

          {/* PANEL 2: Patient Details appear after entering ID & Appointment Booking */}
          {activeStep === 'details' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Patient Details</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Verify the patient information retrieved from SynapseHealth.
                  </p>
                </div>
                <button
                  onClick={() => setActiveStep('search')}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  ← Search Another ID
                </button>
              </div>

              {/* Patient Details + Quick Medical Info Two-Card Row */}
              <div className="grid md:grid-cols-[1fr_340px] gap-6">
                {/* Left Card: Verified Patient Info */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 text-xl font-bold">
                        {patientData.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-slate-900">{patientData.name}</h2>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-200">
                            ✓ Verified Patient
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          SynapseHealth ID: {patientData.code}
                        </p>
                      </div>
                    </div>

                    {onSelectPatientForDoctor ? (
                      <button
                        onClick={() => {
                          onSelectPatientForDoctor(patientData.code)
                          onSwitchPersona('doctor')
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <span>Open in Doctor Console</span>
                        <span>→</span>
                      </button>
                    ) : null}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs border-t border-slate-100 pt-4">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Date of Birth</span>
                      <span className="font-semibold text-slate-800">{patientData.dob}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Gender</span>
                      <span className="font-semibold text-slate-800">{patientData.gender}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Phone Number</span>
                      <span className="font-semibold text-slate-800">{patientData.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Email</span>
                      <span className="font-semibold text-slate-800">{patientData.email}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block text-[11px]">Address</span>
                      <span className="font-semibold text-slate-800">{patientData.address}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => {
                        if (onSelectPatientForDoctor) {
                          onSelectPatientForDoctor(patientData.code)
                        }
                        onSwitchPersona('doctor')
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <span>View Full Medical Profile</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* Right Card: Quick Medical Info (for reference) */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                      Quick Medical Info (for reference)
                    </h3>
                    <div className="space-y-3.5 text-xs">
                      {/* Blood Group */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                            🩸
                          </span>
                          <span className="text-slate-500 font-medium">Blood Group</span>
                        </div>
                        <span className="font-bold text-rose-600 text-sm">
                          {patientData.bloodGroup}
                        </span>
                      </div>

                      {/* Known Allergies */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            ⚠️
                          </span>
                          <span className="text-slate-500 font-medium">Known Allergies</span>
                        </div>
                        <span className="font-bold text-amber-600">{patientData.allergies}</span>
                      </div>

                      {/* Chronic Conditions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
                            ❤️
                          </span>
                          <span className="text-slate-500 font-medium">Chronic Conditions</span>
                        </div>
                        <span className="font-bold text-slate-800 text-right">
                          {patientData.conditions}
                        </span>
                      </div>

                      {/* Active Meds */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            💊
                          </span>
                          <span className="text-slate-500 font-medium">Current Medications</span>
                        </div>
                        <span className="font-bold text-blue-600">
                          {patientData.activeMeds} active medications
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
                    Source: SynapseHealth Longitudinal Engine
                  </div>
                </div>
              </div>

              {/* Bottom Card: Book Appointment Form */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
                <h2 className="text-base font-bold text-slate-900">Book Appointment</h2>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1.5">Department</label>
                    <select
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="General Medicine">General Medicine</option>
                      <option value="Cardiology">Cardiology</option>
                      <option value="Dermatology">Dermatology</option>
                      <option value="Orthopedics">Orthopedics</option>
                      <option value="Endocrinology">Endocrinology</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1.5">Doctor</label>
                    <select
                      value={selectedDoc}
                      onChange={(e) => setSelectedDoc(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="Dr. Priya Mehta">Dr. Priya Mehta</option>
                      <option value="Dr. Meera Thomas">Dr. Meera Thomas</option>
                      <option value="Dr. Vikram Menon">Dr. Vikram Menon</option>
                      <option value="Dr. Rohit Kumar">Dr. Rohit Kumar</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1.5">Date</label>
                    <input
                      type="text"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1.5">Time Slot</label>
                    <select
                      value={selectedSlot}
                      onChange={(e) => setSelectedSlot(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="10:00 AM">10:00 AM</option>
                      <option value="10:30 AM">10:30 AM</option>
                      <option value="11:00 AM">11:00 AM</option>
                      <option value="11:30 AM">11:30 AM</option>
                      <option value="12:00 PM">12:00 PM</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleConfirmAppointment}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition"
                  >
                    <span>✓</span>
                    <span>Confirm Appointment</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* PANEL 3: Appointment Confirmation Slip */}
          {activeStep === 'confirmed' ? (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xs text-center space-y-6">
                {/* Big Green Success Checkmark */}
                <div className="flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-3xl font-bold border-2 border-emerald-200 shadow-sm">
                    ✓
                  </div>
                </div>

                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    Appointment Booked Successfully!
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    The patient has been registered for the appointment.
                  </p>
                </div>

                {/* Summary Breakdown Box */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-5 text-left text-xs space-y-3">
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 border-b border-slate-200 pb-2">
                    Appointment Details
                  </h2>

                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Patient Name:</span>
                    <span className="font-bold text-slate-900">{patientData.name}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">SynapseHealth ID:</span>
                    <span className="font-mono font-bold text-blue-600">{patientData.code}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Department:</span>
                    <span className="font-semibold text-slate-800">{selectedDept}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Doctor:</span>
                    <span className="font-semibold text-slate-800">{selectedDoc}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Date &amp; Time:</span>
                    <span className="font-bold text-slate-900">
                      {selectedDate}, {selectedSlot}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 items-center">
                    <span className="text-slate-500">Visit ID (This Hospital):</span>
                    <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {patientData.visitId} 📋
                    </span>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 transition"
                  >
                    <span>🖨️</span>
                    <span>Print Appointment Slip</span>
                  </button>

                  <button
                    onClick={() => setActiveStep('details')}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    View / Edit Appointment
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-4 text-xs">
                  <button
                    onClick={() => {
                      setSearchId('SYN123456')
                      setActiveStep('search')
                    }}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    + Book Another Appointment
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    onClick={() => setActiveStep('queue')}
                    className="text-slate-600 font-semibold hover:underline"
                  >
                    View Queue (6 waiting) →
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* PANEL 4: Today's Appointments Queue Table */}
          {activeStep === 'queue' ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Today's Appointments
                  </h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Live OPD and Emergency Triage patient queue.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                  <span>📅</span>
                  <span>12 Aug 2026</span>
                </div>
              </div>

              {/* Status Filter Tabs & Search Bar */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <button
                      onClick={() => setQueueFilter('all')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        queueFilter === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All ({queue.length})
                    </button>
                    <button
                      onClick={() => setQueueFilter('checked_in')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        queueFilter === 'checked_in'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Checked In ({queue.filter((i) => i.status.toLowerCase() === 'checked_in').length})
                    </button>
                    <button
                      onClick={() => setQueueFilter('waiting')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        queueFilter === 'waiting'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Waiting ({queue.filter((i) => i.status.toLowerCase() === 'waiting').length})
                    </button>
                    <button
                      onClick={() => setQueueFilter('consulted')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        queueFilter === 'consulted'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Consulted ({queue.filter((i) => i.status.toLowerCase() === 'consulted').length})
                    </button>
                    <button
                      onClick={() => setQueueFilter('cancelled')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        queueFilter === 'cancelled'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Cancelled ({queue.filter((i) => i.status.toLowerCase() === 'cancelled').length})
                    </button>
                  </div>

                  {/* Search within Queue */}
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-xs">🔍</span>
                    <input
                      type="text"
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      placeholder="Search by name or SynapseHealth ID"
                      className="rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Queue Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3">Token No.</th>
                        <th className="py-2.5 px-3">Patient Name</th>
                        <th className="py-2.5 px-3">SynapseHealth ID</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Doctor</th>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredQueue.map((item) => {
                        const statusLower = item.status.toLowerCase()
                        const statusBadge =
                          statusLower === 'checked_in' ? (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              Checked In
                            </span>
                          ) : statusLower === 'in_consultation' ? (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200">
                              In Consultation
                            </span>
                          ) : statusLower === 'waiting' ? (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                              Waiting
                            </span>
                          ) : statusLower === 'consulted' ? (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                              Consulted
                            </span>
                          ) : (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500">
                              Cancelled
                            </span>
                          )

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-3 font-mono font-bold text-slate-700">
                              {item.token_number}
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-900">
                              {item.patient_name}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-500">
                              {item.patient_code}
                            </td>
                            <td className="py-3 px-3 text-slate-600">{item.department}</td>
                            <td className="py-3 px-3 text-slate-700 font-medium">{item.doctor_name}</td>
                            <td className="py-3 px-3 text-slate-600">{item.scheduled_time}</td>
                            <td className="py-3 px-3">{statusBadge}</td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => {
                                  setSearchId(item.patient_code)
                                  setActiveStep('details')
                                }}
                                className="text-blue-600 font-bold hover:underline"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Printable Slip Modal */}
      {showSlipModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold">
                  PV
                </span>
                <span className="font-bold text-sm text-slate-900">
                  City Care Hospital Intake Slip
                </span>
              </div>
              <button
                onClick={() => setShowSlipModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="border border-dashed border-slate-200 p-4 rounded-xl text-xs space-y-2 font-mono">
              <div className="text-center font-bold text-slate-800 text-sm mb-2">
                TOKEN #001 · VISIT {patientData.visitId}
              </div>
              <div>PATIENT: {patientData.name.toUpperCase()}</div>
              <div>ID: {patientData.code}</div>
              <div>DEPT: {selectedDept.toUpperCase()}</div>
              <div>DOCTOR: {selectedDoc.toUpperCase()}</div>
              <div>SLOT: {selectedDate} @ {selectedSlot}</div>
              <div>BLOOD GRP: {patientData.bloodGroup} | ALLERGIES: {patientData.allergies}</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSlipModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print()
                  setShowSlipModal(false)
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                Print Slip Now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
export default ReceptionDeskView
