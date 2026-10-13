import React, { useEffect, useRef, useState } from 'react'
import {
  fetchPortalPatients,
  fetchPortalProfile,
  uploadPortalRecordAsync,
  getJobStatus,
  type JobStatusItem,
  type PatientProfile,
  type PortalPatientSummary,
} from '../api'
import { AsyncProgressTracker } from '../components/AsyncProgressTracker'


interface PatientLandingViewProps {
  onSwitchPersona: (persona: 'reception' | 'doctor' | 'patient') => void
  persona: 'reception' | 'doctor' | 'patient'
  onBookAppointmentRedirect?: () => void
}

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
}

interface TriageResult {
  level: 'emergency' | 'urgent' | 'routine'
  specialty: string
  action: string
  rationale: string
}

export function PatientLandingView({
  onSwitchPersona,
  persona,
  onBookAppointmentRedirect,
}: PatientLandingViewProps) {
  const [patients, setPatients] = useState<PortalPatientSummary[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('SYN123456')
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'locker' | 'voice' | 'triage'>('locker')

  // Document Upload State
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [activeJob, setActiveJob] = useState<JobStatusItem | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])


  // Voice & Text Assistant State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your PulseVault Medical Companion. You can ask me questions about your prescribed medications, dosage times, or drug contraindications using your voice or keyboard.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [queryInput, setQueryInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null)
  const [micError, setMicError] = useState<string | null>(null)

  // Symptom Triage State
  const [symptomInput, setSymptomInput] = useState('')
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  // Initialize Speech Recognition
  useEffect(() => {
    const win = window as any
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSpeechSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        setQueryInput(transcript)
        setIsListening(false)
        handleUserQuery(transcript)
      }

      recognition.onerror = (event: any) => {
        setIsListening(false)
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicError('Microphone permission was denied. Please allow microphone access in your browser settings to dictate.')
        } else if (event.error && event.error !== 'no-speech') {
          setMicError(`Microphone error: ${event.error}`)
        }
      }
      recognition.onend = () => setIsListening(false)
      recognitionRef.current = recognition
    }
  }, [])

  // Load patient list and profile
  useEffect(() => {
    async function loadPatients() {
      try {
        const list = await fetchPortalPatients()
        setPatients(list)
        if (list.length > 0) {
          const defaultPatient =
            list.find((p) => p.patient_code === 'SYN123456') || list[0]
          if (defaultPatient) {
            setSelectedCode(defaultPatient.patient_code)
          }
        }
      } catch (err) {
        console.error('Failed to load portal patients:', err)
      }
    }
    void loadPatients()
  }, [])

  useEffect(() => {
    if (!selectedCode) return
    let active = true
    setLoading(true)
    fetchPortalProfile(selectedCode)
      .then((data) => {
        if (active) {
          setProfile(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load profile:', err)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [selectedCode])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function toggleListening() {
    setMicError(null)
    if (!recognitionRef.current) return
    if (isListening) {
      try {
        recognitionRef.current.stop()
      } catch {}
      setIsListening(false)
    } else {
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (err) {
        console.warn('Speech start error:', err)
        setMicError('Could not start microphone. Please check browser microphone permissions.')
      }
    }
  }

  function speakMessage(id: string, text: string) {
    if (!('speechSynthesis' in window)) return
    
    // Always clear the audio queue first
    window.speechSynthesis.cancel()

    if (isSpeaking === id) {
      setIsSpeaking(null)
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.onend = () => setIsSpeaking(null)
    utterance.onerror = () => setIsSpeaking(null)
    setIsSpeaking(id)
    window.speechSynthesis.speak(utterance)
  }

  function handleUserQuery(query: string) {
    if (!query.trim()) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setChatMessages((prev) => [...prev, userMsg])
    setQueryInput('')

    setTimeout(() => {
      const lower = query.toLowerCase()
      let reply = ''

      if (lower.includes('warfarin') && lower.includes('aspirin')) {
        reply =
          '⚠️ CRITICAL WARNING: You are currently prescribed both Warfarin (blood thinner) and Aspirin (anti-inflammatory). Taking them together significantly increases your risk of internal stomach and brain bleeding. Please contact Dr. Rao or your cardiologist immediately before taking another dose.'
      } else if (lower.includes('albuterol') || lower.includes('inhaler') || lower.includes('asthma')) {
        reply =
          'Albuterol Inhaler (90mcg) is a fast-acting bronchodilator used as-needed for asthma wheezing or exercise prevention. Keep it accessible and rinse your mouth with water after use.'
      } else if (lower.includes('warfarin')) {
        reply =
          'Warfarin is an anticoagulant prescribed to prevent blood clots. You take 5mg once daily at 6:00 PM. Keep your green leafy vegetable intake consistent and test your INR regularly.'
      } else if (lower.includes('aspirin')) {
        reply =
          'Aspirin 325mg was prescribed for joint pain. However, if taken alongside Warfarin, this combination is flagged as high-risk by the safety engine.'
      } else if (lower.includes('medication') || lower.includes('medicine')) {
        if (profile?.medications && profile.medications.length > 0) {
          const names = profile.medications
            .map((m) => `• ${m.name} (${m.dose || ''} ${m.dose_unit || ''}, ${m.frequency || 'as directed'})`)
            .join('\n')
          reply = `Here is your active medication list:\n${names}`
        } else {
          reply = 'You currently have no active medications recorded in your health locker.'
        }
      } else if (lower.includes('allergy') || lower.includes('allergies')) {
        if (profile?.allergies && profile.allergies.length > 0) {
          const alls = profile.allergies
            .map((a) => `• ${a.substance}: ${a.reaction || 'allergic reaction'} (${a.severity} severity)`)
            .join('\n')
          reply = `Your documented drug allergies:\n${alls}`
        } else {
          reply = 'No severe drug allergies are documented in your file.'
        }
      } else {
        reply = `I reviewed the records for ${profile?.patient.full_name || 'you'}. You have ${profile?.medications.length || 0} active prescriptions. Feel free to ask about dosage instructions, precautions, or check any symptoms.`
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setChatMessages((prev) => [...prev, botMsg])
      speakMessage(botMsg.id, reply)
    }, 400)
  }

  function runSymptomTriage(symptomText: string) {
    const text = (symptomText || symptomInput).toLowerCase().trim()
    if (!text) return

    let result: TriageResult
    if (
      text.includes('chest') ||
      text.includes('heart') ||
      text.includes('breath') ||
      text.includes('collapse')
    ) {
      result = {
        level: 'emergency',
        specialty: 'Emergency Medicine & Interventional Cardiology',
        action: 'Call Emergency Services (911 / 108) or go to the nearest Trauma ER immediately.',
        rationale:
          'Chest tightness, severe dyspnoea, or cardiac symptoms represent acute life-threatening emergencies requiring immediate ECG and airway triage.',
      }
    } else if (
      text.includes('knee') ||
      text.includes('joint') ||
      text.includes('calf') ||
      text.includes('swelling') ||
      text.includes('dvt')
    ) {
      result = {
        level: 'urgent',
        specialty: 'Vascular Surgery & Orthopaedics',
        action: 'Schedule same-day urgent clinical evaluation or duplex ultrasound.',
        rationale:
          'Given your history of DVT and joint inflammation, sudden calf warmth or severe joint swelling requires rapid vascular assessment.',
      }
    } else if (text.includes('sugar') || text.includes('thirst') || text.includes('urination')) {
      result = {
        level: 'routine',
        specialty: 'Endocrinology & Diabetology',
        action: 'Schedule an Outpatient Clinic (OPD) visit with fasting blood sugar and HbA1c review.',
        rationale:
          'Persistent hyperglycemia indicates a need to calibrate oral hypoglycemic agents.',
      }
    } else {
      result = {
        level: 'routine',
        specialty: 'General Internal Medicine',
        action: 'Book a routine outpatient appointment for physical examination.',
        rationale:
          'General systemic symptoms should be reviewed by an internal medicine specialist in conjunction with routine bloodwork.',
      }
    }
    setTriageResult(result)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedCode) return

    setUploading(true)
    setUploadMessage(null)
    setActiveJob(null)

    try {
      const res = await uploadPortalRecordAsync(file, selectedCode)
      setActiveJob({
        job_id: res.job_id,
        patient_code: selectedCode,
        patient_name: profile?.patient.full_name || selectedCode,
        filename: file.name,
        document_id: res.document_id,
        status: 'queued',
        progress: 10,
        current_step: 'document_uploaded',
        steps: [],
        result: null,
        error: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      })

      const poll = async () => {
        try {
          const status = await getJobStatus(res.job_id)
          setActiveJob(status)

          if (status.status === 'completed') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current)
              pollTimerRef.current = null
            }
            setUploading(false)
            setUploadMessage('Success: Medical record ingested and verified into your health locker.')
            const updated = await fetchPortalProfile(selectedCode)
            setProfile(updated)
          } else if (status.status === 'failed') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current)
              pollTimerRef.current = null
            }
            setUploading(false)
            setUploadMessage(`Upload failed: ${status.error || 'Pipeline processing failed'}`)
          }
        } catch (pollErr) {
          console.warn('Poll error:', pollErr)
        }
      }

      await poll()
      pollTimerRef.current = window.setInterval(poll, 500)
    } catch (err: unknown) {
      setUploading(false)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setUploadMessage(`Upload failed: ${msg}`)
    } finally {
      if (e.target) e.target.value = ''
    }
  }


  const patient = profile?.patient

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      {/* 1. Header matching Image 1 MediCare Pro */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 px-7 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
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
              <span className="text-lg font-black text-slate-900 tracking-tight">MediCare Pro</span>
              <span className="text-[10px] text-slate-400 font-medium ml-2 hidden sm:inline">
                by SynapseHealth
              </span>
            </div>
          </div>

          {/* Center Persona Switcher Pill */}
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

          {/* Right Header Navigation & Actions */}
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-5 text-xs font-semibold text-slate-600">
              <span className="text-emerald-600 font-bold cursor-pointer">Home</span>
              <span className="hover:text-slate-900 cursor-pointer">About</span>
              <span className="hover:text-slate-900 cursor-pointer">Services</span>
              <span className="hover:text-slate-900 cursor-pointer">Contact</span>
            </div>

            <button
              onClick={() => {
                if (onBookAppointmentRedirect) {
                  onBookAppointmentRedirect()
                } else {
                  onSwitchPersona('reception')
                }
              }}
              className="rounded-full bg-emerald-500 hover:bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-500/20 transition"
            >
              Book an Appointment
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section matching Image 1 */}
      <section className="bg-gradient-to-b from-sky-50/60 via-[#F8FAFC] to-white py-12 px-7 border-b border-slate-100">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          {/* Left Side: Healthcare Consultation Illustration Card */}
          <div className="relative rounded-3xl overflow-hidden shadow-xl border border-slate-100 bg-gradient-to-br from-blue-600 via-teal-600 to-emerald-600 p-1">
            <div className="rounded-[22px] bg-white p-8 flex flex-col justify-between min-h-[380px] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100/40 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />

              <div className="flex items-center justify-between relative z-10">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                  ✓ Accredited Hospital Care
                </span>
                <span className="text-xs font-mono text-slate-400">24/7 Digital Intake</span>
              </div>

              <div className="py-8 relative z-10 text-center">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 text-5xl shadow-sm mb-4">
                  👩‍⚕️
                </div>
                <h3 className="text-xl font-bold text-slate-900">Dr. Priya Mehta &amp; Team</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Connected to verified SynapseHealth clinical exchange and national ABHA registries.
                </p>
              </div>

              <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-4 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-700">Online Triage Ready</span>
                </div>
                <span className="text-slate-400">Average wait time: &lt; 15 mins</span>
              </div>
            </div>
          </div>

          {/* Right Side: Elevated Welcome Card matching Screenshot 1 */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-8 lg:p-10 shadow-xl space-y-6">
            <div className="inline-block rounded-full bg-sky-50 px-3.5 py-1 text-[11px] font-bold text-sky-700 border border-sky-200 tracking-wide">
              WELCOME TO MEDICARE PRO
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Convenient Healthcare at Your Fingertips
            </h1>

            <p className="text-sm text-slate-600 leading-relaxed">
              Experience top-tier medical care from our state-of-the-art facility or from the comfort
              of your home. We prioritize your well-being with personalized, compassionate care
              tailored to your unique needs.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onSwitchPersona('reception')}
                className="rounded-full bg-emerald-500 hover:bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-md shadow-emerald-500/25 transition"
              >
                Book an Appointment
              </button>

              <button
                onClick={() => setActiveTab('locker')}
                className="rounded-full border border-slate-300 bg-white hover:bg-slate-50 px-6 py-3 text-xs font-bold text-slate-700 transition"
              >
                Access Health Locker
              </button>
            </div>

            {/* Quick Demo Selector */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">Active Patient Profile:</span>
              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                {patients.map((p) => (
                  <option key={p.patient_code} value={p.patient_code}>
                    {p.full_name} ({p.patient_code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Patient Workspace Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-7 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('locker')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'locker'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              📁 Personal Health Locker
            </button>
            <button
              onClick={() => setActiveTab('voice')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'voice'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🎙️ Voice &amp; Text Assistant
            </button>
            <button
              onClick={() => setActiveTab('triage')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'triage'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              🧭 Symptom Triage Router
            </button>
          </div>

          <div className="text-xs text-slate-500 hidden sm:block">
            Patient: <span className="font-bold text-slate-900">{patient?.full_name}</span> · ID:{' '}
            <span className="font-mono font-semibold text-blue-600">{patient?.patient_code}</span>
          </div>
        </div>
      </div>

      {/* 4. Active Tab Content Container */}
      <main className="p-7 max-w-7xl w-full mx-auto flex-1 space-y-6">
        {/* TAB 1: PERSONAL HEALTH LOCKER */}
        {activeTab === 'locker' ? (
          <div className="space-y-6">
            {/* Demographic Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 text-2xl font-bold">
                  {patient?.full_name ? patient.full_name.charAt(0) : 'P'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{patient?.full_name}</h2>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-mono font-bold text-emerald-700 border border-emerald-200">
                      {patient?.patient_code}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{patient?.age} years · {patient?.sex}</span>
                    <span>•</span>
                    <span className="font-semibold text-rose-600">
                      🩸 Blood Group: {patient?.blood_group || 'Unknown'}
                    </span>
                    <span>•</span>
                    <span>📞 {patient?.contact || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs">
                <div className="font-bold text-amber-800">🚨 Emergency Contact</div>
                <div className="text-slate-700 font-medium mt-0.5">
                  {patient?.emergency_contact || 'None registered'}
                </div>
              </div>
            </div>

            {/* Active Prescriptions & Medications Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">💊</span>
                  <h3 className="text-base font-bold text-slate-900">
                    Active Prescriptions &amp; Daily Medications
                  </h3>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600 border border-emerald-200">
                  {profile?.medications.length || 0} active drugs
                </span>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading prescriptions...</div>
              ) : !profile?.medications || profile.medications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active medications on file.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {profile.medications.map((med, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 hover:border-blue-200 hover:bg-white transition"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{med.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {med.dose ? `${med.dose} ${med.dose_unit || ''}` : ''} ·{' '}
                            {med.frequency || 'Daily'}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono uppercase bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600">
                          {med.route || 'Oral'}
                        </span>
                      </div>
                      {med.source_span ? (
                        <div className="mt-2.5 border-t border-slate-200/80 pt-2 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-600">Source: </span>
                          <span className="italic text-slate-700">"{med.source_span}"</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document Locker & Ingestion Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📁</span>
                  <h3 className="text-base font-bold text-slate-900">
                    Document Locker &amp; Records Archive
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  {profile?.documents.length || 0} files ingested &amp; verified
                </span>
              </div>

              {profile?.documents && profile.documents.length > 0 ? (
                <div className="space-y-2">
                  {profile.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">📄</span>
                        <div>
                          <div className="font-bold text-slate-800">{doc.filename}</div>
                          <div className="text-[11px] text-slate-400">
                            {doc.doc_type || 'clinical_note'}
                          </div>
                        </div>
                      </div>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-200">
                        ✓ Pipeline Verified
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Upload Box */}
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
                <span className="text-2xl">📤</span>
                <p className="text-xs font-bold text-slate-800 mt-2">
                  Upload New Prescription or Lab Panel
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  PDF, PNG, or JPEG · Processed by OCR Extraction Pipeline
                </p>
                <div className="mt-3 flex justify-center">
                  <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition">
                    {uploading ? 'Processing File...' : 'Choose File to Upload'}
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      disabled={uploading}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {uploadMessage ? (
                  <div className="mt-2 text-xs font-semibold text-emerald-600">{uploadMessage}</div>
                ) : null}

                {/* Live Async Ingestion Progress Tracker */}
                {activeJob && (uploading || activeJob.status !== 'completed') && (
                  <div className="mt-4 text-left">
                    <AsyncProgressTracker
                      progress={activeJob.progress}
                      currentStep={activeJob.current_step}
                      status={activeJob.status}
                      error={activeJob.error}
                      filename={activeJob.filename}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB 2: ACCESSIBLE VOICE & TEXT ASSISTANT */}
        {activeTab === 'voice' ? (
          <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden flex flex-col h-[520px]">
            <div className="border-b border-slate-100 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold text-sm">
                  AI
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Voice &amp; Text Companion</h3>
                  <p className="text-[10px] text-slate-400">
                    Web Speech API &amp; Multilingual Synthesis
                  </p>
                </div>
              </div>
              {speechSupported ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-200">
                  Voice Enabled
                </span>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.text}</div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 px-1">
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'assistant' ? (
                      <button
                        onClick={() => speakMessage(msg.id, msg.text)}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold ml-1 flex items-center gap-0.5"
                      >
                        <span>{isSpeaking === msg.id ? '🔊 Speaking…' : '🔈 Read Aloud'}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 p-3.5 bg-slate-50/70">
              {micError ? (
                <div className="mb-2 p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>{micError}</span>
                  </div>
                  <button
                    onClick={() => setMicError(null)}
                    className="text-rose-400 hover:text-rose-600 font-bold ml-2 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleUserQuery(queryInput)
                }}
                className="flex items-center gap-2"
              >
                {speechSupported ? (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                    title={isListening ? 'Stop recording' : 'Dictate with voice'}
                  >
                    🎙️
                  </button>
                ) : null}

                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={
                    isListening ? 'Listening to speech...' : 'Ask about your medications...'
                  }
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs focus:border-emerald-600 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!queryInput.trim()}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  Send
                </button>
              </form>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUserQuery('What medications am I taking?')}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:text-emerald-600"
                >
                  My medications
                </button>
                <button
                  type="button"
                  onClick={() => handleUserQuery('How do I take Albuterol?')}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:text-emerald-600"
                >
                  Albuterol instructions
                </button>
                <button
                  type="button"
                  onClick={() => handleUserQuery('Can I take Aspirin with Warfarin?')}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:text-rose-600"
                >
                  Aspirin + Warfarin
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB 3: SYMPTOM TRIAGE ROUTER */}
        {activeTab === 'triage' ? (
          <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xs space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Symptom Triage &amp; Specialty Care Router
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Describe current physical symptoms to identify clinical urgency level and recommended
                hospital department.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={symptomInput}
                onChange={(e) => setSymptomInput(e.target.value)}
                placeholder="e.g. Chest pain, sharp knee swelling, high blood sugar..."
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-purple-600 focus:outline-none"
              />
              <button
                onClick={() => runSymptomTriage(symptomInput)}
                className="rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-700"
              >
                Evaluate
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => {
                  setSymptomInput('Chest tightness')
                  runSymptomTriage('Chest tightness')
                }}
                className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200"
              >
                🚨 Chest Tightness
              </button>
              <button
                onClick={() => {
                  setSymptomInput('Swollen warm calf')
                  runSymptomTriage('Swollen warm calf')
                }}
                className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 border border-amber-200"
              >
                🦵 Swollen Calf
              </button>
              <button
                onClick={() => {
                  setSymptomInput('High morning blood sugar')
                  runSymptomTriage('High morning blood sugar')
                }}
                className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200"
              >
                🩸 High Blood Sugar
              </button>
            </div>

            {triageResult ? (
              <div
                className={`rounded-2xl border p-5 text-xs space-y-2.5 ${
                  triageResult.level === 'emergency'
                    ? 'border-rose-200 bg-rose-50/70'
                    : triageResult.level === 'urgent'
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-emerald-200 bg-emerald-50/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-black uppercase tracking-wider text-[10px] px-2.5 py-1 rounded-full ${
                      triageResult.level === 'emergency'
                        ? 'bg-rose-600 text-white'
                        : triageResult.level === 'urgent'
                        ? 'bg-amber-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {triageResult.level} Acuity
                  </span>
                  <span className="font-bold text-slate-800">{triageResult.specialty}</span>
                </div>
                <div className="font-bold text-slate-900 text-sm">{triageResult.action}</div>
                <p className="text-slate-600 leading-relaxed">{triageResult.rationale}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-7 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>MediCare Pro &amp; SynapseHealth · Certified HL7 FHIR Exchange</span>
        <span>ABDM &amp; HIPAA Compliant Patient Portal</span>
      </footer>
    </div>
  )
}
export default PatientLandingView
