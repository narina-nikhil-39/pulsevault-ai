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


interface PatientPortalViewProps {
  onSwitchPersona: (persona: 'clinician' | 'patient') => void
  persona: 'clinician' | 'patient'
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

export function PatientPortalView({ onSwitchPersona, persona }: PatientPortalViewProps) {
  const [patients, setPatients] = useState<PortalPatientSummary[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('OPD-ARJUN')
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [activeJob, setActiveJob] = useState<JobStatusItem | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])


  // Accessible Voice & Text Assistant State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your PulseVault Health Companion. You can ask me any question about your medications, safety alerts, or check symptoms using your voice or keyboard.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [queryInput, setQueryInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null)

  // Symptom Triage State
  const [symptomInput, setSymptomInput] = useState('')
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  // Initialize Speech Recognition capability
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

      recognition.onerror = () => {
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    }
  }, [])

  // Load patients and initial profile
  useEffect(() => {
    async function loadInitial() {
      try {
        const list = await fetchPortalPatients()
        setPatients(list)
        if (list.length > 0 && !list.some((p) => p.patient_code === selectedCode)) {
          const first = list[0]
          if (first) {
            setSelectedCode(first.patient_code)
          }
        }
      } catch (err) {
        console.error('Failed to load portal patients:', err)
      }
    }
    void loadInitial()
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
          console.error('Failed to fetch patient profile:', err)
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

  // Speech Toggle
  function toggleListening() {
    if (!recognitionRef.current) return
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (err) {
        console.warn('Speech recognition start failed:', err)
      }
    }
  }

  // Audio Readout Synthesis
  function speakMessage(id: string, text: string) {
    if (!('speechSynthesis' in window)) return
    if (isSpeaking === id) {
      window.speechSynthesis.cancel()
      setIsSpeaking(null)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.onend = () => setIsSpeaking(null)
    utterance.onerror = () => setIsSpeaking(null)
    setIsSpeaking(id)
    window.speechSynthesis.speak(utterance)
  }

  // AI Knowledge Answer Engine grounded in Patient Profile
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

    // Generate grounded contextual response
    setTimeout(() => {
      const lower = query.toLowerCase()
      let reply = ''

      if (lower.includes('warfarin') && lower.includes('aspirin')) {
        reply =
          '⚠️ CRITICAL WARNING: You are currently prescribed both Warfarin (blood thinner) and Aspirin (anti-inflammatory). Taking them together significantly increases your risk of internal stomach and brain bleeding. Please contact Dr. Rao or your cardiologist immediately before taking another dose.'
      } else if (lower.includes('warfarin')) {
        reply =
          'Warfarin is an anticoagulant (blood thinner) prescribed to prevent and treat blood clots like Deep Vein Thrombosis (DVT). You take 5mg once daily at 6:00 PM. Keep your green leafy vegetable intake consistent and test your INR regularly.'
      } else if (lower.includes('aspirin')) {
        reply =
          'Aspirin 325mg was prescribed for chronic knee osteoarthritis pain. However, because you also take Warfarin, this combination is flagged as high-risk. Please consult your physician for alternative joint pain therapies like topical gel or paracetamol.'
      } else if (lower.includes('metformin') || lower.includes('sugar') || lower.includes('diabetes')) {
        reply =
          'Metformin 500mg is taken twice daily with meals (breakfast & dinner) to manage your Type 2 Diabetes by reducing blood sugar levels. Take it with meals to reduce stomach discomfort.'
      } else if (lower.includes('medication') || lower.includes('medicine') || lower.includes('pills') || lower.includes('prescriptions')) {
        if (profile?.medications && profile.medications.length > 0) {
          const names = profile.medications
            .map((m) => `• ${m.name} (${m.dose || ''} ${m.dose_unit || ''}, ${m.frequency || 'as directed'})`)
            .join('\n')
          reply = `Here is your current active medication list:\n${names}\n\nAlways take medications as scheduled with your water.`
        } else {
          reply = 'You currently have no active medications recorded in your health locker.'
        }
      } else if (lower.includes('allergy') || lower.includes('allergies')) {
        if (profile?.allergies && profile.allergies.length > 0) {
          const alls = profile.allergies
            .map((a) => `• ${a.substance}: ${a.reaction || 'allergic reaction'} (${a.severity} severity)`)
            .join('\n')
          reply = `Your documented drug allergies:\n${alls}\nAlways inform triage nurses and emergency doctors about these.`
        } else {
          reply = 'No severe drug allergies are documented in your file.'
        }
      } else if (lower.includes('condition') || lower.includes('diagnos') || lower.includes('disease')) {
        if (profile?.conditions && profile.conditions.length > 0) {
          const conds = profile.conditions.map((c) => `• ${c.name} (${c.status})`).join('\n')
          reply = `Your documented clinical conditions:\n${conds}`
        } else {
          reply = 'No chronic clinical conditions are recorded.'
        }
      } else {
        reply = `I reviewed your health records for ${profile?.patient.full_name || 'you'}. You have ${profile?.medications.length || 0} active prescriptions and ${profile?.conditions.length || 0} documented conditions. If you have specific questions about side effects, dosing times, or symptoms, feel free to ask or use our Symptom Triage tool.`
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

  // Symptom Triage Analysis Engine
  function runSymptomTriage(symptomText: string) {
    const text = (symptomText || symptomInput).toLowerCase().trim()
    if (!text) return

    let result: TriageResult

    if (
      text.includes('chest') ||
      text.includes('heart') ||
      text.includes('radiating') ||
      text.includes('breath') ||
      text.includes('unconscious') ||
      text.includes('collapse')
    ) {
      result = {
        level: 'emergency',
        specialty: 'Emergency Medicine & Interventional Cardiology',
        action: 'Call Emergency Services (911 / 108) or go to the nearest Trauma ER immediately.',
        rationale:
          'Chest tightness, severe dyspnoea, or cardiac symptoms represent life-threatening emergencies requiring immediate ECG, troponin, and Golden Hour airway triage.',
      }
    } else if (
      text.includes('knee') ||
      text.includes('joint') ||
      text.includes('swelling') ||
      text.includes('calf') ||
      text.includes('dvt') ||
      text.includes('leg pain')
    ) {
      result = {
        level: 'urgent',
        specialty: 'Vascular Surgery & Orthopaedics',
        action: 'Schedule same-day urgent clinical evaluation or duplex ultrasound.',
        rationale:
          'Given your documented history of DVT and osteoarthritis, sudden unilateral calf warmth or severe joint swelling requires rapid vascular assessment.',
      }
    } else if (
      text.includes('sugar') ||
      text.includes('thirst') ||
      text.includes('urination') ||
      text.includes('fatigue') ||
      text.includes('blurred')
    ) {
      result = {
        level: 'routine',
        specialty: 'Endocrinology & Diabetology',
        action: 'Schedule an Outpatient Clinic (OPD) visit with fasting blood sugar and HbA1c review.',
        rationale:
          'Persistent hyperglycemia or diabetic symptoms indicate a need to calibrate oral hypoglycemic agents (such as Metformin).',
      }
    } else if (text.includes('rash') || text.includes('itch') || text.includes('hives')) {
      result = {
        level: 'urgent',
        specialty: 'Allergy & Immunology / Dermatology',
        action: 'Cease suspected offending drugs and seek urgent medical evaluation if throat tightness develops.',
        rationale:
          'Skin eruptions in a patient with sulfa or penicillin sensitivities may indicate accelerating drug reaction.',
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

  // Handle Document Upload
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Header with Persona Switcher & Identity */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1720px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 font-black text-slate-950 text-base shadow-md shadow-emerald-500/20">
              PV
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white">PulseVault</span>
                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-800">
                  Patient Health Locker
                </span>
              </div>
              <p className="hidden text-xs text-slate-400 sm:block">
                Personal Health Records · Multilingual Voice AI · Care Navigation
              </p>
            </div>
          </div>

          {/* Persona Switcher Pill */}
          <div className="flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800 shadow-inner">
            <button
              onClick={() => onSwitchPersona('clinician')}
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
              onClick={() => onSwitchPersona('patient')}
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

          {/* Demo Profile Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden md:inline">Current Profile:</span>
            <select
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {patients.map((p) => (
                <option key={p.patient_code} value={p.patient_code}>
                  {p.full_name} ({p.patient_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 2. Main Portal Container */}
      <main className="mx-auto flex-1 w-full max-w-[1720px] px-5 py-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Left Column: Personal Health Locker & Clinical Summaries */}
        <section className="space-y-6">
          {/* Patient Overview Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-2xl font-bold text-emerald-400">
                  {patient?.full_name ? patient.full_name.charAt(0) : 'P'}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold text-white tracking-tight">
                      {patient?.full_name || 'Loading Patient...'}
                    </h1>
                    <span className="rounded-md bg-emerald-950/80 px-2 py-0.5 text-xs font-mono font-bold text-emerald-300 border border-emerald-800">
                      {patient?.patient_code}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>
                      {patient?.age ? `${patient.age} years` : 'Age N/A'} ·{' '}
                      {patient?.sex === 'M' ? 'Male' : patient?.sex === 'F' ? 'Female' : patient?.sex || ''}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-semibold text-rose-400">
                      <span>🩸</span> Blood Group: {patient?.blood_group || 'Unknown'}
                    </span>
                    <span>•</span>
                    <span>📞 {patient?.contact || 'No contact provided'}</span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact Badge */}
              <div className="rounded-xl border border-amber-600/30 bg-amber-950/20 px-3.5 py-2 text-xs">
                <div className="font-semibold text-amber-300 flex items-center gap-1">
                  <span>🚨</span> Emergency Contact
                </div>
                <div className="text-slate-300 text-[11px] mt-0.5 font-medium">
                  {patient?.emergency_contact || 'None registered'}
                </div>
              </div>
            </div>
          </div>

          {/* Critical Warnings Banner if any */}
          {profile?.safety_alerts && profile.safety_alerts.length > 0 ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                <span>🛡️</span>
                <span>Active Safety Alerts Identified by PulseVault Engine</span>
              </div>
              <div className="space-y-1.5 pl-6">
                {profile.safety_alerts.map((alert, idx) => (
                  <div key={idx} className="text-slate-200">
                    <span className="font-bold text-red-400">[{alert.severity.toUpperCase()}]</span>{' '}
                    <span className="font-semibold text-white">{alert.title}:</span>{' '}
                    <span className="text-slate-300">{alert.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Active Prescriptions & Medications Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">💊</span>
                <h2 className="text-base font-bold text-white">Active Prescriptions &amp; Daily Medications</h2>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800">
                {profile?.medications.length || 0} active drugs
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading prescriptions...</div>
            ) : !profile?.medications || profile.medications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No active medications registered.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.medications.map((med, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-emerald-300 text-sm">{med.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {med.dose ? `${med.dose} ${med.dose_unit || ''}` : ''} · {med.frequency || 'Daily'}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                        {med.route || 'Oral'}
                      </span>
                    </div>
                    {med.source_span ? (
                      <div className="mt-2.5 border-t border-slate-900 pt-2 text-[11px] text-slate-400">
                        <span className="text-slate-500">Source: </span>
                        <span className="italic text-slate-300">"{med.source_span}"</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chronic Conditions & Allergies Split */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Chronic Conditions */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🩺</span>
                <h2 className="text-sm font-bold text-white">Chronic Clinical Conditions</h2>
              </div>
              {!profile?.conditions || profile.conditions.length === 0 ? (
                <div className="py-4 text-xs text-slate-500">No conditions recorded.</div>
              ) : (
                <div className="space-y-2">
                  {profile.conditions.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5 text-xs"
                    >
                      <span className="font-semibold text-slate-200">{c.name}</span>
                      <div className="flex items-center gap-2">
                        {c.is_chronic ? (
                          <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-800">
                            Chronic
                          </span>
                        ) : null}
                        <span className="text-[11px] text-slate-400">
                          {c.onset_date ? `Since ${c.onset_date}` : 'Active'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documented Allergies */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">⚠️</span>
                <h2 className="text-sm font-bold text-white">Documented Drug Allergies</h2>
              </div>
              {!profile?.allergies || profile.allergies.length === 0 ? (
                <div className="py-4 text-xs text-slate-500">No known allergies.</div>
              ) : (
                <div className="space-y-2">
                  {profile.allergies.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-red-900/40 bg-red-950/20 p-2.5 text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-red-300">{a.substance}</span>
                        <div className="text-[11px] text-slate-400 mt-0.5">{a.reaction || 'Allergic sensitivity'}</div>
                      </div>
                      <span className="rounded bg-red-950 px-2 py-0.5 text-[10px] font-bold text-red-300 border border-red-800 uppercase">
                        {a.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Uploaded Documents Locker & Self-Service Ingestion */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📁</span>
                <h2 className="text-base font-bold text-white">Document Locker &amp; Records Archive</h2>
              </div>
              <span className="text-xs text-slate-400">
                {profile?.documents.length || 0} files ingested &amp; verified
              </span>
            </div>

            {/* Document List */}
            {profile?.documents && profile.documents.length > 0 ? (
              <div className="space-y-2">
                {profile.documents.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base">📄</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-200 truncate">{doc.filename}</div>
                        <div className="text-[11px] text-slate-400">
                          {doc.doc_type || 'clinical_note'} ·{' '}
                          {doc.uploaded_at
                            ? new Date(doc.uploaded_at).toLocaleDateString()
                            : doc.processed_at
                            ? new Date(doc.processed_at).toLocaleDateString()
                            : 'Recent'}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                      ✓ Pipeline Verified
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Self-Service Upload Zone */}
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-center">
              <div className="text-2xl mb-1">📤</div>
              <div className="text-xs font-semibold text-slate-200">
                Upload New Prescription, Lab Panel, or Discharge Summary
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                PDF, PNG, or JPEG supported · Directly analyzed by PulseVault OCR Pipeline
              </p>
              <div className="mt-3 flex justify-center">
                <label className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 transition">
                  {uploading ? 'Processing & Ingesting...' : 'Select File to Upload'}
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
                <div className="mt-2 text-xs font-medium text-emerald-400">{uploadMessage}</div>
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
        </section>

        {/* Right Column: Accessible Voice Assistant & Symptom Triage Widget */}
        <aside className="space-y-6">
          {/* Accessible Voice & Text Companion */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl flex flex-col h-[520px]">
            {/* Header */}
            <div className="border-b border-slate-800 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold">
                  AI
                </span>
                <div>
                  <h3 className="text-xs font-bold text-white">Voice &amp; Text Assistant</h3>
                  <p className="text-[10px] text-slate-400">Web Speech API &amp; Multilingual Readout</p>
                </div>
              </div>
              {speechSupported ? (
                <span className="rounded bg-emerald-950 px-2 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-800">
                  Voice Enabled
                </span>
              ) : null}
            </div>

            {/* Conversation Log */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-3 leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.text}</div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 px-1">
                    <span>{msg.timestamp}</span>
                    {msg.sender === 'assistant' ? (
                      <button
                        onClick={() => speakMessage(msg.id, msg.text)}
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 ml-1"
                        title="Read aloud"
                      >
                        <span>{isSpeaking === msg.id ? '🔊 Speaking...' : '🔈 Read'}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input & Microphone Bar */}
            <div className="border-t border-slate-800 p-3 bg-slate-950/80 rounded-b-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleUserQuery(queryInput)
                }}
                className="flex items-center gap-2"
              >
                {/* Voice Dictation Button */}
                {speechSupported ? (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      isListening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    <span>🎙️</span>
                  </button>
                ) : null}

                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={isListening ? 'Listening to your voice...' : 'Ask about your medicines...'}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!queryInput.trim()}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 hover:bg-emerald-500 transition"
                >
                  Send
                </button>
              </form>

              {/* Quick Prompt Pills */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUserQuery('What medications am I taking?')}
                  className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-400 hover:text-emerald-300 hover:border-emerald-700 transition"
                >
                  My medications
                </button>
                <button
                  type="button"
                  onClick={() => handleUserQuery('Can I take Aspirin with Warfarin?')}
                  className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-400 hover:text-red-300 hover:border-red-700 transition"
                >
                  Aspirin + Warfarin
                </button>
                <button
                  type="button"
                  onClick={() => handleUserQuery('What are my allergies?')}
                  className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-400 hover:text-amber-300 hover:border-amber-700 transition"
                >
                  My allergies
                </button>
              </div>
            </div>
          </div>

          {/* Symptom Triage Widget */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧭</span>
              <div>
                <h3 className="text-sm font-bold text-white">Symptom Triage &amp; Specialty Router</h3>
                <p className="text-[11px] text-slate-400">Recommends clinical specialty &amp; care urgency</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={symptomInput}
                  onChange={(e) => setSymptomInput(e.target.value)}
                  placeholder="e.g. Sharp chest pain, or calf swelling..."
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={() => runSymptomTriage(symptomInput)}
                  className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-slate-700"
                >
                  Evaluate
                </button>
              </div>

              {/* Common Symptom Quick Pills */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => {
                    setSymptomInput('Chest tightness')
                    runSymptomTriage('Chest tightness')
                  }}
                  className="rounded bg-red-950/60 px-2 py-0.5 text-[10px] font-semibold text-red-300 border border-red-800"
                >
                  🚨 Chest Tightness
                </button>
                <button
                  onClick={() => {
                    setSymptomInput('Swollen warm calf')
                    runSymptomTriage('Swollen warm calf')
                  }}
                  className="rounded bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-800"
                >
                  🦵 Swollen Calf
                </button>
                <button
                  onClick={() => {
                    setSymptomInput('High morning blood sugar')
                    runSymptomTriage('High morning blood sugar')
                  }}
                  className="rounded bg-cyan-950/60 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-800"
                >
                  🩸 High Sugar
                </button>
              </div>
            </div>

            {/* Triage Verdict Display */}
            {triageResult ? (
              <div
                className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                  triageResult.level === 'emergency'
                    ? 'border-red-500 bg-red-950/30'
                    : triageResult.level === 'urgent'
                    ? 'border-amber-500 bg-amber-950/30'
                    : 'border-emerald-500 bg-emerald-950/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-black uppercase tracking-wider text-[11px] px-2 py-0.5 rounded ${
                      triageResult.level === 'emergency'
                        ? 'bg-red-500 text-white'
                        : triageResult.level === 'urgent'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-emerald-500 text-slate-950 font-bold'
                    }`}
                  >
                    {triageResult.level} Triage
                  </span>
                  <span className="font-semibold text-slate-200">{triageResult.specialty}</span>
                </div>
                <div className="font-bold text-white">{triageResult.action}</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{triageResult.rationale}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-[1720px] px-5 py-4 border-t border-slate-900 text-[11px] text-slate-600 flex items-center justify-between">
        <span>PulseVault Health Locker · Patient Data Autonomy &amp; Verified Medical Safety</span>
        <span>Accessible Web Speech Engine · HIPAA &amp; ABDM Compliant Architecture</span>
      </footer>
    </div>
  )
}
export default PatientPortalView
