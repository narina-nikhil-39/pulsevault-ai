import { type AppRoute } from '../App'

interface UniversalAppHeaderProps {
  currentRoute: AppRoute
  onNavigate: (route: AppRoute, patientCode?: string) => void
  currentPatientCode?: string | null
}

const DEMO_PATIENTS = [
  { code: 'OPD-ARJUN', label: 'Arjun Verma (OPD Active)' },
  { code: 'SYN123456', label: 'Sarah Jenkins (Cardiac)' },
  { code: 'SYN-998811', label: 'Elena Rostova (Trauma)' },
]

export function UniversalAppHeader({
  currentRoute,
  onNavigate,
  currentPatientCode,
}: UniversalAppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-4 py-2.5 shadow-2xs">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        {/* Brand & System Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('directory')}
            className="flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
              P
            </div>
            <div>
              <div className="text-xs font-black tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                PULSEVAULT AI <span className="text-[10px] font-bold text-blue-600">PRO</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">SynapseHealth Clinical OS</div>
            </div>
          </button>

          <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Safety Interlocks: ACTIVE
          </span>
        </div>

        {/* Central Navigation Pills */}
        <nav className="flex items-center gap-1.5 rounded-2xl bg-slate-100/80 p-1 border border-slate-200/70 text-xs font-bold">
          <button
            onClick={() => onNavigate('doctor', currentPatientCode || 'OPD-ARJUN')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition cursor-pointer ${
              currentRoute === 'doctor'
                ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🩺</span>
            <span>Doctor Console</span>
          </button>

          <button
            onClick={() => onNavigate('patient', currentPatientCode || 'OPD-ARJUN')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition cursor-pointer ${
              currentRoute === 'patient'
                ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📱</span>
            <span>Patient Locker</span>
          </button>

          <button
            onClick={() => onNavigate('reception')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition cursor-pointer ${
              currentRoute === 'reception'
                ? 'bg-white text-rose-700 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🚨</span>
            <span>Emergency Triage</span>
          </button>

          <button
            onClick={() => onNavigate('benchmarks')}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition cursor-pointer ${
              currentRoute === 'benchmarks'
                ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📊</span>
            <span>Benchmarks</span>
          </button>
        </nav>

        {/* Right Tools: Cohort Switcher & Architecture Modal Link */}
        <div className="flex items-center gap-2 text-xs">
          {/* Quick Demo Cohort Selector */}
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-[11px]">
            <span className="text-slate-400 font-semibold">Cohort:</span>
            <select
              value={currentPatientCode || 'OPD-ARJUN'}
              onChange={(e) => onNavigate(currentRoute, e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
            >
              {DEMO_PATIENTS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Interactive Architecture HTML Link */}
          <a
            href="/synapsehealth-architecture.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition shadow-2xs"
            title="Open Interactive Archify Architecture Visualizer"
          >
            <span>🗺️</span>
            <span className="hidden sm:inline">Arch Map</span>
          </a>

          {/* Research Paper Download */}
          <a
            href="/paper/pulsevault_ai_ieee_jbhi.pdf"
            download="PulseVault_AI_IEEE_JBHI.pdf"
            className="flex items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 text-[11px] font-bold text-white transition shadow-xs"
            title="Download Camera-Ready IEEE JBHI Research Paper PDF"
          >
            <span>📄</span>
            <span className="hidden sm:inline">IEEE Paper</span>
          </a>
        </div>
      </div>
    </header>
  )
}
