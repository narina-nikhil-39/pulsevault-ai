import { useEffect, useState } from 'react'
import { downloadFhirBundle } from '../api'
import { type AppRoute } from '../App'

interface CommandPaletteModalProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (route: AppRoute, patientCode?: string) => void
  onTriggerBreakGlass?: () => void
  currentPatientCode?: string | null
}

interface CommandItem {
  id: string
  category: 'Patient Navigation' | 'Clinical Actions' | 'Portal Views' | 'Documentation'
  title: string
  subtitle: string
  icon: string
  shortcut?: string
  action: () => void
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onNavigate,
  onTriggerBreakGlass,
  currentPatientCode,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const activePatient = currentPatientCode || 'OPD-ARJUN'

  const commands: CommandItem[] = [
    // Patients
    {
      id: 'patient-arjun',
      category: 'Patient Navigation',
      title: 'Arjun Verma (OPD-ARJUN)',
      subtitle: 'Type 2 Diabetes, Diabetic Nephropathy, Metformin / CKD triage',
      icon: '👤',
      action: () => {
        onNavigate('doctor', 'OPD-ARJUN')
        onClose()
      },
    },
    {
      id: 'patient-sarah',
      category: 'Patient Navigation',
      title: 'Sarah Jenkins (SYN123456)',
      subtitle: 'Atrial Fibrillation, Warfarin + Aspirin DDI conflict',
      icon: '👤',
      action: () => {
        onNavigate('doctor', 'SYN123456')
        onClose()
      },
    },
    {
      id: 'patient-elena',
      category: 'Patient Navigation',
      title: 'Elena Rostova (SYN-998811)',
      subtitle: 'Severe Penicillin anaphylaxis hypersensitivity record',
      icon: '👤',
      action: () => {
        onNavigate('doctor', 'SYN-998811')
        onClose()
      },
    },
    // Clinical Actions
    {
      id: 'action-breakglass',
      category: 'Clinical Actions',
      title: 'Trigger Break-Glass Emergency Access',
      subtitle: 'Dual-signature physician/nurse override & SHA-256 block ledger',
      icon: '🚨',
      shortcut: 'B',
      action: () => {
        onClose()
        if (onTriggerBreakGlass) {
          onTriggerBreakGlass()
        } else {
          onNavigate('reception')
        }
      },
    },
    {
      id: 'action-fhir',
      category: 'Clinical Actions',
      title: `Export HL7 FHIR R4 Bundle (${activePatient})`,
      subtitle: 'Download complete interoperable Patient, Condition, and MedicationStatement bundle',
      icon: '⚡',
      shortcut: 'F',
      action: () => {
        void downloadFhirBundle(activePatient)
        onClose()
      },
    },
    // Portals
    {
      id: 'nav-doctor',
      category: 'Portal Views',
      title: 'Go to Doctor Consultation Console',
      subtitle: 'Longitudinal timeline, clinical graph, and safety auditor',
      icon: '🩺',
      shortcut: '1',
      action: () => {
        onNavigate('doctor', activePatient)
        onClose()
      },
    },
    {
      id: 'nav-reception',
      category: 'Portal Views',
      title: 'Go to Emergency / Reception Desk',
      subtitle: 'Real-time outpatient queue and hardware camera QR scanner',
      icon: '🚨',
      shortcut: '2',
      action: () => {
        onNavigate('reception')
        onClose()
      },
    },
    {
      id: 'nav-patient',
      category: 'Portal Views',
      title: 'Go to Patient Health Locker',
      subtitle: 'Self-service registration wizard and digital QR wallet pass',
      icon: '📱',
      shortcut: '3',
      action: () => {
        onNavigate('patient', activePatient)
        onClose()
      },
    },
    {
      id: 'nav-benchmarks',
      category: 'Portal Views',
      title: 'Go to Benchmark & Invariant Explorer',
      subtitle: 'Real-time DDI sensitivity, latency gauges, and live test runner',
      icon: '📊',
      shortcut: '4',
      action: () => {
        onNavigate('benchmarks')
        onClose()
      },
    },
    // Documentation & Architecture
    {
      id: 'doc-arch',
      category: 'Documentation',
      title: 'Open Interactive Architecture Visualizer',
      subtitle: 'Interactive multi-agent system flowchart & component inspector',
      icon: '🗺️',
      action: () => {
        window.open('/synapsehealth-architecture.html', '_blank')
        onClose()
      },
    },
    {
      id: 'doc-paper',
      category: 'Documentation',
      title: 'Download Camera-Ready IEEE JBHI Paper (PDF)',
      subtitle: 'Full academic manuscript with empirical evaluation and bibliography',
      icon: '📄',
      action: () => {
        const a = document.createElement('a')
        a.href = '/paper/pulsevault_ai_ieee_jbhi.pdf'
        a.download = 'PulseVault_AI_IEEE_JBHI.pdf'
        a.click()
        onClose()
      },
    },
  ]

  const filtered = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, filtered, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-950/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Command Search Bar */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <span className="text-slate-400 text-lg">🔍</span>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a clinical command or search patient (e.g., OPD-ARJUN, Break-Glass, FHIR)..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-700">
            ESC to close
          </kbd>
        </div>

        {/* Command Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching clinical commands or patients found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition cursor-pointer ${
                    isSelected ? 'bg-blue-600 text-white' : 'hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{item.title}</div>
                      <div
                        className={`text-[11px] truncate ${
                          isSelected ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-blue-700 text-blue-200'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd className="hidden sm:inline-block rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-2.5 text-[11px] text-slate-500 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>Active Patient: <strong className="font-mono text-slate-300">{activePatient}</strong></span>
        </div>
      </div>
    </div>
  )
}
