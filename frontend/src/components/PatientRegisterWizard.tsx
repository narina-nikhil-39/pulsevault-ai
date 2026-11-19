import React, { useState, useRef, useEffect } from 'react'
import {
  registerPatient,
  getJobStatus,
  type PatientRegistrationPayload,
  type PatientRegistrationResponse,
  type JobStatusItem,
} from '../api'
import { AsyncProgressTracker } from './AsyncProgressTracker'

interface PatientRegisterWizardProps {
  onSuccess?: (patientCode: string) => void
  onOpenDoctorConsole?: (patientCode: string) => void
  onOpenPatientPortal?: (patientCode: string) => void
  onClose?: () => void
}

export function PatientRegisterWizard({
  onSuccess,
  onOpenDoctorConsole,
  onOpenPatientPortal,
  onClose,
}: PatientRegisterWizardProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Form Fields
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [age, setAge] = useState<number | ''>('')
  const [gender, setGender] = useState('Male')
  const [bloodGroup, setBloodGroup] = useState('O+')
  const [phone, setPhone] = useState('')

  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [relationship, setRelationship] = useState('Spouse')

  // Document Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Registration Outcome & Async Ingestion Job
  const [registrationResult, setRegistrationResult] = useState<PatientRegistrationResponse | null>(null)
  const [activeJob, setActiveJob] = useState<JobStatusItem | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // Auto-calculate age from DOB if DOB changes
  function handleDobChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setDob(val)
    if (val) {
      const parts = val.split('-')
      if (parts[0]) {
        const birthYear = parseInt(parts[0], 10)
        if (!isNaN(birthYear) && birthYear > 1900) {
          const calculated = Math.max(0, new Date().getFullYear() - birthYear)
          setAge(calculated)
        }
      }
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
    }
  }

  async function handleSubmitRegistration() {
    if (!fullName.trim()) {
      setErrorMessage('Full legal name is required.')
      setCurrentStep(1)
      return
    }

    setLoading(true)
    setErrorMessage(null)

    const payload: PatientRegistrationPayload = {
      full_name: fullName.trim(),
      dob: dob || undefined,
      age: typeof age === 'number' ? age : undefined,
      gender,
      blood_group: bloodGroup,
      phone: phone.trim() || undefined,
      emergency_contact_name: emergencyName.trim()
        ? `${emergencyName.trim()} (${relationship})`
        : undefined,
      emergency_contact_phone: emergencyPhone.trim() || undefined,
      file: selectedFile,
    }

    try {
      const res = await registerPatient(payload)
      setRegistrationResult(res)
      setCurrentStep(4) // Move to confirmation & processing view

      if (onSuccess) {
        onSuccess(res.patient_code)
      }

      // If document was uploaded, poll background ingestion job
      if (res.job_id) {
        const poll = async () => {
          try {
            const status = await getJobStatus(res.job_id!)
            setActiveJob(status)
            if (status.status === 'completed' || status.status === 'failed') {
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current)
                pollTimerRef.current = null
              }
            }
          } catch (pollErr) {
            console.error('Failed to poll intake document job:', pollErr)
          }
        }
        await poll()
        pollTimerRef.current = window.setInterval(poll, 600)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.'
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setFullName('')
    setDob('')
    setAge('')
    setGender('Male')
    setBloodGroup('O+')
    setPhone('')
    setEmergencyName('')
    setEmergencyPhone('')
    setSelectedFile(null)
    setRegistrationResult(null)
    setActiveJob(null)
    setCurrentStep(1)
    setErrorMessage(null)
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden max-w-2xl w-full mx-auto">
      {/* Wizard Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur text-white text-lg font-bold">
            🏥
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Patient Onboarding &amp; Intake</h2>
            <p className="text-xs text-blue-100">Zero-Mock Organic Hospital Registration Wizard</p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* Step Indicators */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-3">
        <div className="flex items-center justify-between text-xs font-semibold">
          <div
            className={`flex items-center gap-2 ${
              currentStep === 1
                ? 'text-blue-600 font-bold'
                : currentStep > 1
                ? 'text-emerald-600'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                currentStep === 1
                  ? 'bg-blue-600 text-white'
                  : currentStep > 1
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {currentStep > 1 ? '✓' : '1'}
            </span>
            <span>Personal Demographics</span>
          </div>

          <span className="text-slate-300">──</span>

          <div
            className={`flex items-center gap-2 ${
              currentStep === 2
                ? 'text-blue-600 font-bold'
                : currentStep > 2
                ? 'text-emerald-600'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                currentStep === 2
                  ? 'bg-blue-600 text-white'
                  : currentStep > 2
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {currentStep > 2 ? '✓' : '2'}
            </span>
            <span>Emergency Kin</span>
          </div>

          <span className="text-slate-300">──</span>

          <div
            className={`flex items-center gap-2 ${
              currentStep === 3
                ? 'text-blue-600 font-bold'
                : currentStep > 3
                ? 'text-emerald-600'
                : 'text-slate-400'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                currentStep === 3
                  ? 'bg-blue-600 text-white'
                  : currentStep > 3
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {currentStep > 3 ? '✓' : '3'}
            </span>
            <span>Clinical Records</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="p-6">
        {/* STEP 1: Personal Demographics */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Legal Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Chandra Verma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={handleDobChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Age (Years)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 45"
                  value={age}
                  onChange={(e) => setAge(e.target.value ? parseInt(e.target.value, 10) : '')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Biological Sex
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Undisclosed">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Blood Group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value="A+">A+ (A Positive)</option>
                  <option value="A-">A- (A Negative)</option>
                  <option value="B+">B+ (B Positive)</option>
                  <option value="B-">B- (B Negative)</option>
                  <option value="O+">O+ (O Positive)</option>
                  <option value="O-">O- (O Negative - Universal)</option>
                  <option value="AB+">AB+ (AB Positive)</option>
                  <option value="AB-">AB- (AB Negative)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Phone Number
              </label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!fullName.trim()) {
                    setErrorMessage('Please enter patient full legal name to proceed.')
                    return
                  }
                  setErrorMessage(null)
                  setCurrentStep(2)
                }}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition"
              >
                Next: Emergency Contacts →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Emergency Contact & Kin */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Emergency Contact Person Name
              </label>
              <input
                type="text"
                placeholder="e.g. Sunita Verma"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Relationship to Patient
                </label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value="Spouse">Spouse</option>
                  <option value="Parent">Parent</option>
                  <option value="Child">Child</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Friend">Friend / Colleague</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Emergency Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 91234 56789"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl bg-blue-50/70 border border-blue-200/80 p-3 text-xs text-blue-800 flex items-start gap-2">
              <span className="text-base">ℹ️</span>
              <p>
                In clinical emergencies or Break-Glass protocols, this contact is instantly exposed
                on the Emergency Flashcard for immediate notification.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition"
              >
                Next: Clinical Document (Optional) →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Prior Clinical Document Ingestion */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Attach Initial Medical Record (Optional)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload previous discharge summaries, lab reports, or prescription scans. The multimodal
                agent pipeline will asynchronously extract diagnoses, medications, and contraindications.
              </p>
            </div>

            {/* Dropzone Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50/50'
                  : selectedFile
                  ? 'border-emerald-400 bg-emerald-50/30'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              {selectedFile ? (
                <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-emerald-200 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📄</span>
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-800">{selectedFile.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Clinical Document'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-xs text-rose-500 font-bold hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl">📁</div>
                  <div className="text-xs font-semibold text-slate-700">
                    Drag and drop clinical report or prescription here
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Supports PDF, PNG, JPEG, TIFF (up to 20MB)
                  </div>
                  <div>
                    <label className="inline-block mt-2 cursor-pointer rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs">
                      <span>Browse Files</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setSelectedFile(e.target.files[0])
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                ← Back
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleSubmitRegistration}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⚙️</span>
                    <span>Registering Patient…</span>
                  </>
                ) : (
                  <>
                    <span>✓ Complete Registration</span>
                    {selectedFile && <span className="text-[10px] bg-emerald-700 px-1.5 py-0.5 rounded">+ Ingest</span>}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Success & Async Progress */}
        {currentStep === 4 && registrationResult && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 text-2xl font-bold mx-auto">
                ✓
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Patient Successfully Registered!
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Assigned SynapseHealth Identifier:
                </p>
                <div className="mt-2 inline-block rounded-xl bg-white border border-emerald-300 px-4 py-2 font-mono text-lg font-bold text-blue-700 shadow-xs">
                  {registrationResult.patient_code}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600 flex items-center justify-center gap-2">
                  <span>🔑 Default 4-Digit Locker PIN:</span>
                  <span className="font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">1234</span>
                  <span className="text-[11px] text-slate-400 font-normal">(or last 4 digits of phone)</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-emerald-200/60 max-w-md mx-auto text-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px]">Name</span>
                  <span className="font-semibold">{registrationResult.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Blood Group</span>
                  <span className="font-bold text-rose-600">{registrationResult.blood_group || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Age</span>
                  <span className="font-semibold">{registrationResult.age ? `${registrationResult.age} yrs` : 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* If Ingestion Job is Running */}
            {activeJob && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Asynchronous Clinical Extraction</span>
                  <span className="text-[10px] text-blue-600 font-mono">
                    Job ID: {activeJob.job_id}
                  </span>
                </div>
                <AsyncProgressTracker
                  progress={activeJob.progress}
                  currentStep={activeJob.current_step}
                  status={activeJob.status}
                  error={activeJob.error}
                  filename={activeJob.filename}
                />
              </div>
            )}

            {/* Quick Action Navigation Buttons */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                + Register Another Patient
              </button>

              <div className="flex items-center gap-2">
                {onOpenPatientPortal && (
                  <button
                    type="button"
                    onClick={() => onOpenPatientPortal(registrationResult.patient_code)}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                  >
                    Open in Patient Portal →
                  </button>
                )}

                {onOpenDoctorConsole && (
                  <button
                    type="button"
                    onClick={() => onOpenDoctorConsole(registrationResult.patient_code)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
                  >
                    Open in Doctor Console →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
