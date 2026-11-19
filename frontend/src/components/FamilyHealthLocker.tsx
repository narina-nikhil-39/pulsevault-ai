import React, { useEffect, useState } from 'react'
import { QrMatrixSvg } from './QrMatrixSvg'

export interface FamilyMember {
  id: string
  fullName: string
  relationship: 'Spouse' | 'Child' | 'Parent' | 'Sibling' | 'Dependent'
  age: number
  sex: 'Male' | 'Female' | 'Other'
  bloodGroup: string
  contact?: string
  emergencyContact?: string
  allergies: string[]
  chronicConditions: string[]
  vaccinations?: string[]
  implants?: string[]
  activeMeds?: string[]
}

interface FamilyHealthLockerProps {
  primaryPatient: {
    patient_code: string
    full_name: string
    age?: number | null
    sex?: string | null
    blood_group?: string | null
    contact?: string | null
    emergency_contact?: string | null
  }
}

export function FamilyHealthLocker({ primaryPatient }: FamilyHealthLockerProps) {
  const storageKey = `synapsehealth.family_${primaryPatient.patient_code}`

  // Default authentic family members seeded for Arjun Sharma / demo patient
  const defaultFamily: FamilyMember[] = [
    {
      id: `${primaryPatient.patient_code}-FAM-01`,
      fullName: 'Sunita Sharma',
      relationship: 'Spouse',
      age: 45,
      sex: 'Female',
      bloodGroup: 'O+',
      contact: '+91 98765 43210',
      emergencyContact: `${primaryPatient.full_name} (Spouse)`,
      allergies: ['Penicillin (Severe Urticaria / Rash)'],
      chronicConditions: ['Bronchial Asthma (Intermittent)'],
      activeMeds: ['Salbutamol Inhaler 100mcg SOS / PRN'],
    },
    {
      id: `${primaryPatient.patient_code}-FAM-02`,
      fullName: 'Aarav Sharma',
      relationship: 'Child',
      age: 12,
      sex: 'Male',
      bloodGroup: 'B+',
      contact: primaryPatient.contact || '+91 98765 43211',
      emergencyContact: `${primaryPatient.full_name} (Father)`,
      allergies: ['No known drug allergies (NKDA)'],
      chronicConditions: [],
      vaccinations: ['MMR Booster (2023)', 'Tdap (2024)', 'Annual Influenza (2024)'],
    },
    {
      id: `${primaryPatient.patient_code}-FAM-03`,
      fullName: 'Ramesh Sharma',
      relationship: 'Parent',
      age: 74,
      sex: 'Male',
      bloodGroup: 'A+',
      contact: '+91 98765 43212',
      emergencyContact: `${primaryPatient.full_name} (Son)`,
      allergies: ['Sulfonamides / Sulfa drugs'],
      chronicConditions: ['Essential Hypertension', 'Ischemic Heart Disease'],
      implants: ['Drug-Eluting Cardiac Stent (DES in situ, 2021)'],
      activeMeds: ['Amlodipine 5mg daily', 'Atorvastatin 20mg daily'],
    },
  ]

  const [members, setMembers] = useState<FamilyMember[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved)
    } catch {
      // Fallback
    }
    return defaultFamily
  })

  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedQrMember, setSelectedQrMember] = useState<FamilyMember | null>(null)

  // Form State
  const [newName, setNewName] = useState('')
  const [newRel, setNewRel] = useState<FamilyMember['relationship']>('Child')
  const [newAge, setNewAge] = useState<number>(10)
  const [newSex, setNewSex] = useState<'Male' | 'Female' | 'Other'>('Female')
  const [newBlood, setNewBlood] = useState('O+')
  const [newContact, setNewContact] = useState('')
  const [newAllergies, setNewAllergies] = useState('')
  const [newConditions, setNewConditions] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(members))
    } catch {
      // Ignore
    }
  }, [members, storageKey])

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    const newMember: FamilyMember = {
      id: `${primaryPatient.patient_code}-FAM-${String(members.length + 1).padStart(2, '0')}`,
      fullName: newName.trim(),
      relationship: newRel,
      age: newAge,
      sex: newSex,
      bloodGroup: newBlood,
      contact: newContact.trim() || primaryPatient.contact || undefined,
      emergencyContact: `${primaryPatient.full_name} (Primary Caregiver)`,
      allergies: newAllergies.trim() ? newAllergies.split(',').map((s) => s.trim()) : ['None recorded'],
      chronicConditions: newConditions.trim() ? newConditions.split(',').map((s) => s.trim()) : [],
    }

    setMembers([...members, newMember])
    setShowAddModal(false)
    setNewName('')
    setNewAllergies('')
    setNewConditions('')
  }

  function handleRemoveMember(id: string) {
    setMembers(members.filter((m) => m.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-indigo-50/40 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white text-2xl shadow-sm">
              👨‍👩‍👧‍👦
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                Family Health Locker &amp; Linked Dependents
                <span className="rounded-full bg-sky-100 text-sky-800 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase">
                  ABDM Family Group
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized health records, emergency QR passes, pediatric immunization schedules, and allergy cards for your immediate family.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900">
                Primary Guardian: {primaryPatient.full_name}
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                ID: {primaryPatient.patient_code} • {members.length} Dependents Linked
              </div>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2.5 text-xs font-bold text-white transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span>
              <span>Link Family Member</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Account Holder Card */}
      <div className="rounded-2xl border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-black text-sm">
              👑
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">{primaryPatient.full_name}</span>
                <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                  Self (Primary Account Holder)
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {primaryPatient.patient_code}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Primary subscriber managing all family clinical handovers, emergency consents, and vaccination passes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {primaryPatient.blood_group && (
              <span className="rounded-lg bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 text-xs font-bold">
                🩸 {primaryPatient.blood_group}
              </span>
            )}
            <span className="rounded-lg bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-semibold">
              {primaryPatient.age} yrs • {primaryPatient.sex}
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 pt-3 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">Primary Phone:</span>
            <span className="font-semibold text-slate-800">{primaryPatient.contact || 'Registered in portal'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Emergency Contact:</span>
            <span className="font-semibold text-slate-800">{primaryPatient.emergency_contact || 'None registered'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">Health ID Type:</span>
            <span className="font-mono font-semibold text-emerald-700">ABHA National ID Verified</span>
          </div>
        </div>
      </div>

      {/* Linked Dependents Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">👨‍👩‍👧</span>
            <h3 className="text-sm font-bold text-slate-900">
              Linked Family Members &amp; Dependents ({members.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Click any member's Emergency QR Pass for triage scanning
          </span>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {members.map((member) => (
            <div
              key={member.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-sky-300 transition"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900">{member.fullName}</span>
                      <span className="rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold px-2 py-0.5">
                        {member.relationship}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                      ID: {member.id}
                    </span>
                  </div>

                  <span className="rounded-lg bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-xs font-bold shrink-0">
                    🩸 {member.bloodGroup}
                  </span>
                </div>

                {/* Vitals & Demographics */}
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2.5">
                  <span>{member.age} years old</span>
                  <span>•</span>
                  <span>{member.sex}</span>
                  <span>•</span>
                  <span>📞 {member.contact || 'Parent contact'}</span>
                </div>

                {/* Clinical Flags */}
                <div className="space-y-2 pt-1 text-xs">
                  {/* Allergies */}
                  {member.allergies.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-rose-700 block mb-0.5">
                        ⚠️ Allergies:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {member.allergies.map((a, i) => (
                          <span
                            key={i}
                            className="rounded bg-rose-50 text-rose-800 border border-rose-100 text-[10px] px-1.5 py-0.5"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chronic Conditions */}
                  {member.chronicConditions.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-amber-700 block mb-0.5">
                        🩺 Chronic Conditions:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {member.chronicConditions.map((c, i) => (
                          <span
                            key={i}
                            className="rounded bg-amber-50 text-amber-800 border border-amber-100 text-[10px] px-1.5 py-0.5"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vaccinations (if any) */}
                  {member.vaccinations && member.vaccinations.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-emerald-700 block mb-0.5">
                        💉 Immunizations:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {member.vaccinations.map((v, i) => (
                          <span
                            key={i}
                            className="rounded bg-emerald-50 text-emerald-800 border border-emerald-100 text-[10px] px-1.5 py-0.5"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Implants (if any) */}
                  {member.implants && member.implants.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-purple-700 block mb-0.5">
                        ⚙️ Implants / Devices:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {member.implants.map((imp, i) => (
                          <span
                            key={i}
                            className="rounded bg-purple-50 text-purple-800 border border-purple-100 text-[10px] px-1.5 py-0.5"
                          >
                            {imp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedQrMember(member)}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span>🪪</span>
                  <span>Emergency Pass</span>
                </button>

                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="text-[11px] text-slate-400 hover:text-rose-600 transition cursor-pointer"
                  title="Unlink dependent"
                >
                  Unlink
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL 1: ADD FAMILY MEMBER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                Link New Dependent / Family Member
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Ananya Sharma"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Relationship</label>
                  <select
                    value={newRel}
                    onChange={(e) => setNewRel(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child / Dependent</option>
                    <option value="Parent">Parent (Elderly)</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Dependent">Other Dependent</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={newBlood}
                    onChange={(e) => setNewBlood(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Age (Years)</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={newAge}
                    onChange={(e) => setNewAge(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sex</label>
                  <select
                    value={newSex}
                    onChange={(e) => setNewSex(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Phone (Optional)</label>
                <input
                  type="text"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full rounded-xl border border-slate-300 p-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Known Drug Allergies (comma-separated)</label>
                <input
                  type="text"
                  value={newAllergies}
                  onChange={(e) => setNewAllergies(e.target.value)}
                  placeholder="e.g., Penicillin, Ibuprofen, Sulfa drugs"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chronic Diagnoses / Key Notes (comma-separated)</label>
                <input
                  type="text"
                  value={newConditions}
                  onChange={(e) => setNewConditions(e.target.value)}
                  placeholder="e.g., Asthma, Type 1 Diabetes, Epilepsy"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-sky-600 hover:bg-sky-700 py-2.5 font-bold text-white transition cursor-pointer shadow-xs"
                >
                  Confirm &amp; Link Family Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DEPENDENT EMERGENCY QR PASS */}
      {selectedQrMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 text-white p-6 shadow-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🪪</span>
                <span className="font-bold text-sm">Emergency Dependent Pass</span>
              </div>
              <button
                onClick={() => setSelectedQrMember(null)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-center space-y-1">
              <div className="text-lg font-black">{selectedQrMember.fullName}</div>
              <div className="text-xs text-sky-400 font-mono">
                {selectedQrMember.relationship} of {primaryPatient.full_name}
              </div>
              <div className="text-xs text-slate-400">
                {selectedQrMember.age} yrs • {selectedQrMember.sex} • Blood Group:{' '}
                <strong className="text-rose-400">{selectedQrMember.bloodGroup}</strong>
              </div>
            </div>

            {/* Offline Vector QR Code */}
            <div className="bg-white p-3 rounded-2xl shadow-xl border-2 border-sky-400 text-center flex flex-col items-center mx-auto max-w-[200px]">
              <QrMatrixSvg value={selectedQrMember.id} size={150} />
              <div className="text-[10px] font-mono font-black text-slate-900 mt-2">
                {selectedQrMember.id}
              </div>
              <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                OFFLINE TRIAGE PASS
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 border border-slate-700">
              <div className="text-[11px] text-amber-300">
                🚨 Emergency Contact: <strong>{selectedQrMember.emergencyContact}</strong>
              </div>
              {selectedQrMember.allergies.length > 0 && (
                <div className="text-[11px] text-rose-300">
                  ⚠️ Allergies: <strong>{selectedQrMember.allergies.join(', ')}</strong>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedQrMember(null)}
              className="w-full rounded-xl bg-sky-600 hover:bg-sky-700 py-2.5 text-xs font-bold text-white transition cursor-pointer"
            >
              Close Emergency Pass
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
