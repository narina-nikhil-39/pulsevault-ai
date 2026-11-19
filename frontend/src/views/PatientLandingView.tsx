import React, { useEffect, useRef, useState } from 'react'
import {
  fetchPortalPatients,
  fetchPortalProfile,
  uploadPortalRecordAsync,
  getJobStatus,
  loginPatientPortal,
  requestPatientOtp,
  verifyPatientOtp,
  logoutPatientPortal,
  getStoredPatientToken,
  getStoredPatientUser,
  type JobStatusItem,
  type PatientProfile,
  type PortalPatientSummary,
  type PatientOtpResponse,
} from '../api'
import { AsyncProgressTracker } from '../components/AsyncProgressTracker'
import { PatientRegisterWizard } from '../components/PatientRegisterWizard'
import { WalletQrCard } from '../components/WalletQrCard'
import { FamilyHealthLocker } from '../components/FamilyHealthLocker'
import {
  DoctorTeamLeftIllustration,
  DoctorTeamRightIllustration,
  CardiacVectorIcon,
  DiabetesVectorIcon,
  StomachVectorIcon,
  PainReliefVectorIcon,
  RespiratoryVectorIcon,
  NeurologyVectorIcon,
  ElderlyCareVectorIcon,
  ColdImmunityVectorIcon,
} from '../components/FlatVectorHealthcareIllustrations'


interface PatientLandingViewProps {
  onSwitchPersona?: (persona: 'reception' | 'doctor' | 'patient') => void
  persona?: 'reception' | 'doctor' | 'patient'
  onBookAppointmentRedirect?: () => void
  onNavigateHome?: () => void
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
  persona: _persona = 'patient',
  onBookAppointmentRedirect,
  onNavigateHome,
}: PatientLandingViewProps) {
  const [_patients, setPatients] = useState<PortalPatientSummary[]>([])
  const [selectedCode, setSelectedCode] = useState<string>(() => {
    return localStorage.getItem('synapsehealth.current_patient_code') || 'OPD-ARJUN'
  })
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'locker' | 'family' | 'voice' | 'triage'>('locker')
  const [showRegisterWizard, setShowRegisterWizard] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [switchInputCode, setSwitchInputCode] = useState('')
  const [switchPinInput, setSwitchPinInput] = useState('1234')

  const [heroSearchQuery, setHeroSearchQuery] = useState('')
  const heroFileInputRef = useRef<HTMLInputElement>(null)

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(getStoredPatientToken())
  })
  const [authUser, setAuthUser] = useState<{ patient_code: string; full_name: string } | null>(() => {
    return getStoredPatientUser()
  })
  const [authTab, setAuthTab] = useState<'pin' | 'otp'>('pin')
  const [loginCode, setLoginCode] = useState('OPD-ARJUN')
  const [loginPin, setLoginPin] = useState('1234')
  const [otpContact, setOtpContact] = useState('')
  const [candidateOtp, setCandidateOtp] = useState('')
  const [otpResponse, setOtpResponse] = useState<PatientOtpResponse | null>(null)
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const session = await loginPatientPortal(loginCode.trim(), loginPin.trim())
      setSelectedCode(session.patient_code)
      setAuthUser({ patient_code: session.patient_code, full_name: session.full_name })
      setIsAuthenticated(true)
      localStorage.setItem('synapsehealth.current_patient_code', session.patient_code)
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Invalid credentials or PIN')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const res = await requestPatientOtp(otpContact.trim())
      setOtpResponse(res)
      setOtpStep('verify')
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Unable to request verification code')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const target = otpResponse?.patient_code || otpContact.trim()
      const session = await verifyPatientOtp(target, candidateOtp.trim())
      setSelectedCode(session.patient_code)
      setAuthUser({ patient_code: session.patient_code, full_name: session.full_name })
      setIsAuthenticated(true)
      localStorage.setItem('synapsehealth.current_patient_code', session.patient_code)
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Invalid verification code')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    logoutPatientPortal()
    setIsAuthenticated(false)
    setAuthUser(null)
    setProfile(null)
  }

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
        const storedUser = getStoredPatientUser()
        if (storedUser?.patient_code) {
          setSelectedCode(storedUser.patient_code)
        }
      } catch (err) {
        console.error('Failed to load portal patients:', err)
      }
    }
    void loadPatients()
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !selectedCode) {
      if (!isAuthenticated) {
        setProfile(null)
        setLoading(false)
      }
      return
    }
    localStorage.setItem('synapsehealth.current_patient_code', selectedCode)
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
  }, [selectedCode, isAuthenticated])

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
      {/* Hidden File Input for Direct Hero Upload */}
      <input
        ref={heroFileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept=".pdf,image/*"
      />

      {/* 1. Top Navbar (Apollo Pharmacy / MediCare Pro Style - Clean White + Dark Green Brand) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/90 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand Logo & Location */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#064e3b] text-white shadow-md shadow-emerald-950/20">
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
                <span className="text-lg font-black text-[#064e3b] tracking-tight">MediCare Pro</span>
                <span className="text-[10px] text-slate-400 font-semibold ml-1.5 hidden sm:inline">
                  Pharmacy &amp; Health Locker
                </span>
              </div>
            </div>

            {/* Care Location Selector */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 border-l border-slate-200 pl-5">
              <span className="text-slate-400">📍 Care Site:</span>
              <button
                type="button"
                className="font-bold text-slate-800 hover:text-[#064e3b] flex items-center gap-1 cursor-pointer"
              >
                <span>Central Hospital • Metro Wing</span>
                <span className="text-[10px] text-slate-400">▾</span>
              </button>
            </div>
          </div>

          {/* Center Category Navigation */}
          <div className="hidden lg:flex items-center gap-6 text-xs font-bold text-slate-600">
            <button
              onClick={() => setActiveTab('locker')}
              className={`pb-1 border-b-2 transition cursor-pointer ${
                activeTab === 'locker'
                  ? 'border-[#064e3b] text-[#064e3b]'
                  : 'border-transparent hover:text-[#064e3b]'
              }`}
            >
              Buy Medicines &amp; Records
            </button>
            <button
              onClick={() => {
                if (onSwitchPersona) onSwitchPersona('doctor')
              }}
              className="pb-1 border-b-2 border-transparent hover:border-[#064e3b] hover:text-[#064e3b] transition cursor-pointer"
            >
              Find Doctors
            </button>
            <button
              onClick={() => setActiveTab('locker')}
              className="pb-1 border-b-2 border-transparent hover:border-[#064e3b] hover:text-[#064e3b] transition cursor-pointer"
            >
              Lab Tests
            </button>
            <button
              onClick={() => setActiveTab('family')}
              className={`pb-1 border-b-2 transition cursor-pointer ${
                activeTab === 'family'
                  ? 'border-[#064e3b] text-[#064e3b]'
                  : 'border-transparent hover:text-[#064e3b]'
              }`}
            >
              Family Health <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold ml-1">New</span>
            </button>
            <button
              onClick={() => setActiveTab('triage')}
              className={`pb-1 border-b-2 transition cursor-pointer ${
                activeTab === 'triage'
                  ? 'border-[#064e3b] text-[#064e3b]'
                  : 'border-transparent hover:text-[#064e3b]'
              }`}
            >
              Symptom Triage
            </button>
          </div>

          {/* Right Header Navigation & Actions */}
          <div className="flex items-center gap-3">
            {onNavigateHome && (
              <button
                onClick={onNavigateHome}
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              >
                <span>←</span>
                <span>Hospital OS</span>
              </button>
            )}

            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
              >
                <span>🔒</span>
                <span>Sign Out ({patient?.patient_code || authUser?.patient_code})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  const el = document.getElementById('patient-auth-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="flex items-center gap-1.5 rounded-xl border border-[#064e3b] bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-[#064e3b] hover:bg-emerald-100 transition cursor-pointer"
              >
                <span>👤</span>
                <span>Login / Unlock</span>
              </button>
            )}

            <button
              onClick={() => {
                if (onBookAppointmentRedirect) {
                  onBookAppointmentRedirect()
                } else if (onSwitchPersona) {
                  onSwitchPersona('reception')
                }
              }}
              className="rounded-full bg-[#064e3b] hover:bg-[#053b2e] px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-950/20 transition cursor-pointer"
            >
              Book Appointment
            </button>
          </div>
        </div>
      </header>

      {/* 2. Dark Green Sub-Header Navigation Strip (Apollo Pharmacy Style) */}
      <div className="bg-[#072e26] text-slate-200 px-6 py-2 border-b border-[#041f1a] text-xs font-semibold overflow-x-auto">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 whitespace-nowrap">
          <div className="flex items-center gap-6">
            <span className="text-emerald-400 font-bold cursor-pointer">MediCare Products</span>
            <span className="hover:text-white transition cursor-pointer" onClick={() => setActiveTab('locker')}>Prescriptions &amp; Ingestion</span>
            <span className="hover:text-white transition cursor-pointer" onClick={() => setActiveTab('locker')}>Cardiology &amp; Anticoagulants</span>
            <span className="hover:text-white transition cursor-pointer" onClick={() => setActiveTab('locker')}>Diabetes &amp; Metabolic Care</span>
            <span className="hover:text-white transition cursor-pointer" onClick={() => setActiveTab('family')}>Family Dependent Profiles</span>
            <span className="hover:text-white transition cursor-pointer" onClick={() => setActiveTab('triage')}>Emergency Triage 24/7</span>
            <span className="hover:text-white transition cursor-pointer" onClick={() => setActiveTab('voice')}>AI Medical Companion</span>
          </div>
          <span className="text-[11px] text-emerald-300 font-mono hidden md:inline">
            ✓ 100% Zero-Hallucination Verified
          </span>
        </div>
      </div>

      {/* 3. Hero Section with Custom Flat Vector Healthcare Illustrations (Dark Green & White Combo) */}
      <section className="bg-gradient-to-r from-[#06382f] via-[#09483c] to-[#06382f] text-white pt-8 pb-10 px-6 shadow-xl relative overflow-hidden">
        {/* Ambient background glow dots */}
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
          {/* Left Column: Flat Vector Doctor Team Illustration */}
          <div className="hidden lg:flex lg:col-span-3 justify-center items-center">
            <DoctorTeamLeftIllustration className="w-full max-h-56 object-contain drop-shadow-md" />
          </div>

          {/* Center Column: Clean White Title, Search Bar & Quick Tags */}
          <div className="lg:col-span-6 text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Buy Medicines and Health Essentials
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100 max-w-lg mx-auto font-medium">
              Consult board-certified clinicians, ingest medical records with OCR, and access your encrypted personal health locker.
            </p>

            {/* Clean White Rounded Search Bar Pill */}
            <div className="max-w-xl mx-auto pt-1">
              <div className="relative flex items-center rounded-2xl bg-white shadow-xl shadow-emerald-950/30 p-1.5 border border-white">
                <div className="pl-3.5 pr-2 text-slate-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.4}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={heroSearchQuery}
                  onChange={(e) => setHeroSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && heroSearchQuery.trim()) {
                      handleUserQuery(heroSearchQuery)
                      setActiveTab('voice')
                    }
                  }}
                  placeholder="Search Medicines, Prescriptions, Lab Reports or Health Records..."
                  className="w-full bg-transparent py-2.5 px-2 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                {heroSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setHeroSearchQuery('')}
                    className="p-1.5 text-slate-400 hover:text-slate-600 font-bold text-xs mr-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (heroSearchQuery.trim()) {
                      handleUserQuery(heroSearchQuery)
                      setActiveTab('voice')
                    } else {
                      setActiveTab('locker')
                    }
                  }}
                  className="rounded-xl bg-[#064e3b] hover:bg-[#053b2e] px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-sm"
                >
                  Search
                </button>
              </div>

              {/* Popular Search Suggestions */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-emerald-200">
                <span className="font-semibold text-white">Popular:</span>
                <button
                  type="button"
                  onClick={() => {
                    setHeroSearchQuery('Warfarin')
                    handleUserQuery('Warfarin')
                    setActiveTab('voice')
                  }}
                  className="rounded-full bg-emerald-900/60 hover:bg-emerald-800 px-2.5 py-0.5 text-emerald-100 border border-emerald-700/60 transition cursor-pointer"
                >
                  Warfarin 5mg
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeroSearchQuery('Aspirin')
                    handleUserQuery('Aspirin')
                    setActiveTab('voice')
                  }}
                  className="rounded-full bg-emerald-900/60 hover:bg-emerald-800 px-2.5 py-0.5 text-emerald-100 border border-emerald-700/60 transition cursor-pointer"
                >
                  Aspirin 325mg
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeroSearchQuery('Albuterol')
                    handleUserQuery('Albuterol')
                    setActiveTab('voice')
                  }}
                  className="rounded-full bg-emerald-900/60 hover:bg-emerald-800 px-2.5 py-0.5 text-emerald-100 border border-emerald-700/60 transition cursor-pointer"
                >
                  Albuterol 90mcg
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeroSearchQuery('Metformin')
                    handleUserQuery('Metformin')
                    setActiveTab('voice')
                  }}
                  className="rounded-full bg-emerald-900/60 hover:bg-emerald-800 px-2.5 py-0.5 text-emerald-100 border border-emerald-700/60 transition cursor-pointer"
                >
                  Metformin 500mg
                </button>
              </div>
            </div>

            {/* Authenticated Patient Session Strip inside Hero */}
            <div className="pt-3 max-w-xl mx-auto">
              {isAuthenticated ? (
                <div className="rounded-2xl bg-emerald-950/80 border border-emerald-800/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 text-left">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-xs">
                      👤
                    </span>
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{patient?.full_name || authUser?.full_name || 'Authenticated Patient'}</span>
                        <span className="rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 border border-emerald-500/30">
                          {patient?.patient_code || authUser?.patient_code}
                        </span>
                        <span className="rounded-full bg-emerald-400 text-[#064e3b] text-[10px] font-extrabold px-2 py-0.5">
                          🟢 24h Session
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-300/80 font-mono">
                        ABHA ID Verified • Private Health Sandbox
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSwitchModal(true)}
                      className="rounded-xl border border-emerald-700 bg-emerald-900/70 hover:bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition cursor-pointer"
                    >
                      Switch ID
                    </button>
                    <button
                      onClick={handleLogout}
                      className="rounded-xl border border-rose-800/80 bg-rose-950/70 hover:bg-rose-900 px-3 py-1.5 text-xs font-bold text-rose-200 transition cursor-pointer"
                    >
                      🔒 Lock
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-amber-950/60 border border-amber-800/60 p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
                  <div className="flex items-center gap-2 text-left">
                    <span className="text-base">🔒</span>
                    <div>
                      <span className="font-bold text-white">Locker Locked (HIPAA Protected)</span>
                      <p className="text-[11px] text-amber-300">
                        Sign in with registered PIN or mobile OTP to unlock private records.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById('patient-auth-section')
                      if (el) el.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className="rounded-xl bg-amber-500 hover:bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition cursor-pointer shadow-xs"
                  >
                    Unlock Locker
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Flat Vector Doctor Right Illustration */}
          <div className="hidden lg:flex lg:col-span-3 justify-center items-center">
            <DoctorTeamRightIllustration className="w-full max-h-56 object-contain drop-shadow-md" />
          </div>
        </div>
      </section>

      {/* 4. Four Quick Action Cards matching Apollo Pharmacy Screenshot */}
      <section className="max-w-7xl mx-auto w-full px-6 -mt-5 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Prescription Ingestion (Mint Tint) */}
          <div
            onClick={() => heroFileInputRef.current?.click()}
            className="rounded-2xl border border-emerald-200 bg-[#ECFDF5] p-4 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white border border-emerald-200 text-xl shadow-2xs">
                📄
              </div>
              <div>
                <div className="text-xs font-black text-slate-900 group-hover:text-emerald-800">
                  Upload Prescriptions
                </div>
                <div className="text-[10px] text-emerald-700 font-bold tracking-wider mt-0.5">
                  OCR &amp; INGEST NOW →
                </div>
              </div>
            </div>
            <span className="text-slate-400 group-hover:text-emerald-700 font-bold">›</span>
          </div>

          {/* Card 2: Doctor Appointment (Lavender Tint) */}
          <div
            onClick={() => {
              if (onBookAppointmentRedirect) {
                onBookAppointmentRedirect()
              } else if (onSwitchPersona) {
                onSwitchPersona('doctor')
              }
            }}
            className="rounded-2xl border border-indigo-200 bg-[#EEF2FF] p-4 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white border border-indigo-200 text-xl shadow-2xs">
                🩺
              </div>
              <div>
                <div className="text-xs font-black text-slate-900 group-hover:text-indigo-800">
                  Doctor Appointment
                </div>
                <div className="text-[10px] text-indigo-700 font-bold tracking-wider mt-0.5">
                  BOOK NOW →
                </div>
              </div>
            </div>
            <span className="text-slate-400 group-hover:text-indigo-700 font-bold">›</span>
          </div>

          {/* Card 3: Family Health & QR Pass (Warm Peach Tint) */}
          <div
            onClick={() => setActiveTab('family')}
            className="rounded-2xl border border-amber-200 bg-[#FEF3C7] p-4 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white border border-amber-200 text-xl shadow-2xs">
                👨‍👩‍👧‍👦
              </div>
              <div>
                <div className="text-xs font-black text-slate-900 group-hover:text-amber-800">
                  Family Health Locker
                </div>
                <div className="text-[10px] text-amber-700 font-bold tracking-wider mt-0.5">
                  EXPLORE PROFILES →
                </div>
              </div>
            </div>
            <span className="text-slate-400 group-hover:text-amber-700 font-bold">›</span>
          </div>

          {/* Card 4: Lab Diagnostics & Safety (Rose Tint) */}
          <div
            onClick={() => setActiveTab('locker')}
            className="rounded-2xl border border-rose-200 bg-[#FFE4E6] p-4 shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-between group"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white border border-rose-200 text-xl shadow-2xs">
                🔬
              </div>
              <div>
                <div className="text-xs font-black text-slate-900 group-hover:text-rose-800">
                  Lab Tests &amp; Safety
                </div>
                <div className="text-[10px] text-rose-700 font-bold tracking-wider mt-0.5">
                  AT HOME &amp; VERIFIED →
                </div>
              </div>
            </div>
            <span className="text-slate-400 group-hover:text-rose-700 font-bold">›</span>
          </div>
        </div>
      </section>

      {/* 5. Browse by Health Conditions Section (Custom Flat Vector Icons) */}
      <section className="max-w-7xl mx-auto w-full px-6 pt-10 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Browse by Health Conditions &amp; Clinical Care
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Explore specialized disease protocols, active prescriptions, and drug-drug safety engines.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('triage')}
            className="text-xs font-bold text-[#064e3b] hover:underline cursor-pointer"
          >
            View All Specialties →
          </button>
        </div>

        {/* 8 Condition Cards Grid with Custom Flat Vector SVGs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* 1. Diabetes Care */}
          <div
            onClick={() => {
              setHeroSearchQuery('Metformin')
              handleUserQuery('Metformin')
              setActiveTab('voice')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-sky-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <DiabetesVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-sky-700">Diabetes Care</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">HbA1c &amp; Insulin</div>
          </div>

          {/* 2. Cardiac Care */}
          <div
            onClick={() => {
              setHeroSearchQuery('Warfarin')
              handleUserQuery('Warfarin')
              setActiveTab('voice')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-rose-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <CardiacVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-rose-700">Cardiac Care</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Warfarin Safety</div>
          </div>

          {/* 3. Stomach & GI */}
          <div
            onClick={() => {
              setSymptomInput('Stomach acid and nausea')
              runSymptomTriage('Stomach acid and nausea')
              setActiveTab('triage')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-amber-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <StomachVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-amber-700">Stomach Care</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">GI &amp; Antacids</div>
          </div>

          {/* 4. Pain Relief */}
          <div
            onClick={() => {
              setHeroSearchQuery('Aspirin')
              handleUserQuery('Aspirin')
              setActiveTab('voice')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-purple-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <PainReliefVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-purple-700">Pain Relief</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Joints &amp; NSAIDs</div>
          </div>

          {/* 5. Respiratory */}
          <div
            onClick={() => {
              setHeroSearchQuery('Albuterol')
              handleUserQuery('Albuterol')
              setActiveTab('voice')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-cyan-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <RespiratoryVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-cyan-700">Respiratory</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Asthma Inhaler</div>
          </div>

          {/* 6. Neurology */}
          <div
            onClick={() => {
              setSymptomInput('Headache and dizziness')
              runSymptomTriage('Headache and dizziness')
              setActiveTab('triage')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-pink-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <NeurologyVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-pink-700">Neurology</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Brain &amp; Nerves</div>
          </div>

          {/* 7. Elderly Care */}
          <div
            onClick={() => setActiveTab('family')}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-emerald-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <ElderlyCareVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">Elderly Care</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Family Senior</div>
          </div>

          {/* 8. Cold & Immunity */}
          <div
            onClick={() => {
              setSymptomInput('Fever and dry cough')
              runSymptomTriage('Fever and dry cough')
              setActiveTab('triage')
            }}
            className="rounded-2xl border border-slate-200/90 bg-white p-3 text-center shadow-2xs hover:shadow-md hover:border-emerald-300 transition cursor-pointer group"
          >
            <div className="mx-auto mb-2 flex justify-center">
              <ColdImmunityVectorIcon className="w-11 h-11 group-hover:scale-105 transition-transform" />
            </div>
            <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">Cold &amp; Immunity</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Immune Shield</div>
          </div>
        </div>
      </section>

      {/* Floating Medical AI Companion Button (Apollo WhatsApp Style) */}
      <button
        type="button"
        onClick={() => setActiveTab('voice')}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#064e3b] text-white px-4 py-3 shadow-2xl hover:bg-[#053b2e] hover:scale-105 transition-all cursor-pointer border-2 border-emerald-400/40"
        aria-label="Ask PulseVault AI Medical Companion"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
        </span>
        <span className="text-sm">🎙️</span>
        <span className="text-xs font-black tracking-tight hidden sm:inline">AI Medical Companion</span>
      </button>

      {/* 3. Patient Workspace Navigation Bar / Security Header */}
      {isAuthenticated ? (
        <div className="bg-white border-b border-slate-200 px-7 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('locker')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'locker'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                📁 Personal Health Locker
              </button>
              <button
                onClick={() => setActiveTab('family')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'family'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                👨‍👩‍👧‍👦 Family Health Details
              </button>
              <button
                onClick={() => setActiveTab('voice')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'voice'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                🎙️ Voice &amp; Text Assistant
              </button>
              <button
                onClick={() => setActiveTab('triage')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
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
      ) : (
        <div className="bg-amber-50/70 border-b border-amber-200/60 px-7 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-amber-900 font-medium">
            <div className="flex items-center gap-2">
              <span>🔒</span>
              <span>Confidential Health Locker · Enter PIN or Request Mobile OTP to View Records</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-amber-700 font-mono">
              <span>Demo PIN: 1234</span>
              <span>•</span>
              <span>Demo OTP: 123456</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Active Tab Content Container */}
      <main className="p-7 max-w-7xl w-full mx-auto flex-1 space-y-6">
        {!isAuthenticated ? (
          <div id="patient-auth-section" className="max-w-xl mx-auto py-8">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl space-y-6">
              <div className="text-center space-y-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white text-2xl shadow-md shadow-emerald-500/20">
                  🛡️
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Patient Health Locker</h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  End-to-End Encrypted Personal Health Record (PHR). Please authenticate to view your prescriptions, lab reports, and linked family dependents.
                </p>
              </div>

              {/* Auth Method Tabs */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('pin')
                    setAuthError(null)
                  }}
                  className={`py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
                    authTab === 'pin' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  <span>🔑</span>
                  <span>4-Digit Security PIN</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('otp')
                    setAuthError(null)
                  }}
                  className={`py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
                    authTab === 'otp' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  <span>📲</span>
                  <span>Mobile / ABHA OTP</span>
                </button>
              </div>

              {authError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <div className="flex-1 font-medium">{authError}</div>
                </div>
              )}

              {/* PIN Auth Form */}
              {authTab === 'pin' && (
                <form onSubmit={handlePinLogin} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">ABHA ID or Patient Code</label>
                    <input
                      type="text"
                      required
                      value={loginCode}
                      onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
                      placeholder="e.g. OPD-ARJUN or SYN123456"
                      className="w-full rounded-xl border border-slate-300 p-3 font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none uppercase"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-slate-700">4-Digit Security PIN</label>
                      <span className="text-[11px] text-slate-400 font-mono">Demo PIN: 1234</span>
                    </div>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value)}
                      placeholder="••••"
                      className="w-full rounded-xl border border-slate-300 p-3 font-mono text-center tracking-[0.5em] text-lg font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {authLoading ? 'Verifying PIN...' : '🔓 Unlock Health Locker'}
                  </button>

                  {/* Demo Fast Fill Buttons */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 block text-center">
                      One-Click Evaluator Demo Sign-In
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLoginCode('OPD-ARJUN')
                          setLoginPin('1234')
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-2 text-left transition cursor-pointer"
                      >
                        <div className="font-bold text-slate-900 text-[11px]">Arjun Rao</div>
                        <div className="text-[10px] text-slate-500 font-mono">OPD-ARJUN (A+)</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginCode('ER-TRAUMA-01')
                          setLoginPin('1234')
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-2 text-left transition cursor-pointer"
                      >
                        <div className="font-bold text-slate-900 text-[11px]">Trauma ER</div>
                        <div className="text-[10px] text-slate-500 font-mono">ER-TRAUMA-01 (O-)</div>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* OTP Auth Form */}
              {authTab === 'otp' && (
                <div className="space-y-4 text-xs">
                  {otpStep === 'request' ? (
                    <form onSubmit={handleRequestOtp} className="space-y-4">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1.5">
                          Registered Mobile Number or Patient Code
                        </label>
                        <input
                          type="text"
                          required
                          value={otpContact}
                          onChange={(e) => setOtpContact(e.target.value)}
                          placeholder="e.g. OPD-ARJUN or +91 98765 43210"
                          className="w-full rounded-xl border border-slate-300 p-3 font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Enter your registered mobile number or ABHA ID to receive an OTP.
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full rounded-xl bg-sky-600 hover:bg-sky-700 py-3 text-xs font-bold text-white shadow-md shadow-sky-500/20 transition cursor-pointer disabled:opacity-50"
                      >
                        {authLoading ? 'Dispatching OTP...' : '📲 Send 6-Digit Verification Code'}
                      </button>

                      {/* Quick Demo Pre-fills */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 block text-center">
                          Quick Demo Selection
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setOtpContact('OPD-ARJUN')}
                            className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-2 text-left transition cursor-pointer"
                          >
                            <div className="font-bold text-slate-900 text-[11px]">Arjun Rao</div>
                            <div className="text-[10px] text-slate-500 font-mono">OPD-ARJUN</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setOtpContact('ER-TRAUMA-01')}
                            className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 p-2 text-left transition cursor-pointer"
                          >
                            <div className="font-bold text-slate-900 text-[11px]">Trauma ER</div>
                            <div className="text-[10px] text-slate-500 font-mono">ER-TRAUMA-01</div>
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-slate-700 space-y-1">
                        <div className="font-bold text-sky-900">Code Dispatched!</div>
                        <div className="text-[11px]">
                          Sent to: <span className="font-mono font-bold">{otpResponse?.masked_contact}</span>
                        </div>
                        {otpResponse?.simulated_otp && (
                          <div className="text-[11px] text-emerald-700 font-medium">
                            🔑 Simulated SMS code:{' '}
                            <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-300">
                              {otpResponse.simulated_otp}
                            </span>{' '}
                            (or demo <span className="font-mono font-bold">123456</span>)
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1.5">
                          Enter 6-Digit Verification Code
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          required
                          value={candidateOtp}
                          onChange={(e) => setCandidateOtp(e.target.value)}
                          placeholder="123456"
                          className="w-full rounded-xl border border-slate-300 p-3 font-mono text-center tracking-[0.5em] text-lg font-bold text-slate-900 focus:border-sky-600 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOtpStep('request')}
                          className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        >
                          ← Back
                        </button>
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="flex-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 font-bold text-white shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                        >
                          {authLoading ? 'Verifying...' : '✅ Verify & Unlock'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Security Assurance Badges */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-500">🔒</span>
                  <span>PBKDF2-HMAC-SHA256 Encrypted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-500">✓</span>
                  <span>ABDM &amp; HIPAA Compliant</span>
                </div>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-600" />
            <div className="text-xs font-semibold text-slate-600">Loading your private health records...</div>
          </div>
        ) : (
          <>
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

            {/* Emergency Smart Wallet Card with QR Download */}
            {patient && <WalletQrCard patient={patient} />}

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

        {/* TAB 2: FAMILY HEALTH DETAILS */}
        {activeTab === 'family' ? (
          patient ? (
            <FamilyHealthLocker primaryPatient={patient} />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
              Loading family health profile...
            </div>
          )
        ) : null}

        {/* TAB 3: ACCESSIBLE VOICE & TEXT ASSISTANT */}
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
        </>
      )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-7 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>MediCare Pro &amp; SynapseHealth · Certified HL7 FHIR Exchange</span>
        <span>ABDM &amp; HIPAA Compliant Patient Portal</span>
      </footer>

      {/* Patient Registration Wizard Modal */}
      {showRegisterWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <PatientRegisterWizard
            onClose={() => setShowRegisterWizard(false)}
            onSuccess={(code) => {
              setSelectedCode(code)
              fetchPortalPatients().then(setPatients).catch(console.error)
            }}
            onOpenPatientPortal={async (code) => {
              try {
                const session = await loginPatientPortal(code, '1234')
                setSelectedCode(session.patient_code)
                setAuthUser({ patient_code: session.patient_code, full_name: session.full_name })
                setIsAuthenticated(true)
              } catch {
                setSelectedCode(code)
              }
              setShowRegisterWizard(false)
              fetchPortalPatients().then(setPatients).catch(console.error)
            }}
            onOpenDoctorConsole={(_code) => {
              setShowRegisterWizard(false)
              if (onSwitchPersona) onSwitchPersona('doctor')
            }}
          />
        </div>
      )}

      {/* Switch Patient Health ID Modal */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔐</span>
                <h3 className="text-sm font-black text-slate-900">Switch Patient Health Locker</h3>
              </div>
              <button
                onClick={() => setShowSwitchModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Enter your ABHA Health ID and Security PIN to switch active patient session.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const code = switchInputCode.trim().toUpperCase()
                if (code) {
                  try {
                    const session = await loginPatientPortal(code, switchPinInput.trim() || '1234')
                    setSelectedCode(session.patient_code)
                    setAuthUser({ patient_code: session.patient_code, full_name: session.full_name })
                    setIsAuthenticated(true)
                    setShowSwitchModal(false)
                    setSwitchInputCode('')
                    setSwitchPinInput('1234')
                  } catch (err: unknown) {
                    alert(err instanceof Error ? err.message : 'Invalid patient ID or PIN')
                  }
                }
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Health ID / Patient Code</label>
                <input
                  type="text"
                  required
                  value={switchInputCode}
                  onChange={(e) => setSwitchInputCode(e.target.value)}
                  placeholder="e.g. OPD-ARJUN, SYN123456"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono uppercase font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Security PIN</label>
                  <span className="text-[10px] text-slate-400 font-mono">Demo: 1234</span>
                </div>
                <input
                  type="password"
                  required
                  value={switchPinInput}
                  onChange={(e) => setSwitchPinInput(e.target.value)}
                  placeholder="••••"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-center tracking-widest font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSwitchModal(false)}
                  className="flex-1 rounded-xl border border-slate-300 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 font-bold text-white transition cursor-pointer shadow-xs"
                >
                  Verify &amp; Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default PatientLandingView
