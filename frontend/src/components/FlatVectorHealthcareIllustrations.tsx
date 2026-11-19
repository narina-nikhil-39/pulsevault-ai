/**
 * Custom Flat Vector Healthcare & Pharmacy Illustrations
 * Matches Apollo Pharmacy / MediCare Pro design aesthetic:
 * - Rich dark green backdrop (#09382F / #053B2E)
 * - Crisp white lab coats, cards, and typography
 * - Sage green, mint, and soft coral accents
 * - Clean geometric flat vector anatomy and medical equipment
 */

export function DoctorTeamLeftIllustration({ className = 'w-full h-auto max-h-56' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Medical team consultation illustration"
    >
      <defs>
        <linearGradient id="leftGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#047857" stopOpacity="0.02" />
        </linearGradient>
        <filter id="shadowLeft" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#022c22" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Ambient background glow circle */}
      <circle cx="170" cy="130" r="110" fill="url(#leftGlow)" />

      {/* Floating Medical Speech Bubble with Orange Plus */}
      <g filter="url(#shadowLeft)">
        <rect x="180" y="24" width="72" height="42" rx="14" fill="#1b4332" stroke="#2d6a4f" strokeWidth="1.5" />
        <path d="M210 66 L216 76 L222 66 Z" fill="#1b4332" />
        {/* Plus Symbol */}
        <circle cx="216" cy="45" r="14" fill="#f97316" />
        <path d="M216 38 V52 M209 45 H223" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* Clinician 1 (Male Doctor - Left) */}
      <g id="doctor-left">
        {/* Body / Lab Coat */}
        <path
          d="M60 240 C60 175 75 135 110 135 C145 135 160 175 160 240 Z"
          fill="#e2e8f0"
          stroke="#0f172a"
          strokeWidth="2"
        />
        {/* Scrub Shirt Collar (Dark Teal) */}
        <path d="M98 135 L110 170 L122 135 Z" fill="#0d9488" stroke="#042f2e" strokeWidth="1.5" />
        {/* Lab Coat Lapels */}
        <path d="M90 135 L108 200 L110 240" stroke="#0f172a" strokeWidth="2" fill="none" />
        <path d="M130 135 L112 200 L110 240" stroke="#0f172a" strokeWidth="2" fill="none" />
        
        {/* Stethoscope Tubing around neck */}
        <path
          d="M94 148 C94 175 126 175 126 148"
          stroke="#334155"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="110" cy="182" r="5" fill="#94a3b8" stroke="#334155" strokeWidth="1.5" />

        {/* Neck */}
        <rect x="102" y="115" width="16" height="24" fill="#fed7aa" stroke="#0f172a" strokeWidth="1.5" rx="3" />

        {/* Head */}
        <ellipse cx="110" cy="92" rx="22" ry="26" fill="#fed7aa" stroke="#0f172a" strokeWidth="2" />
        {/* Hair */}
        <path
          d="M88 90 C88 64 100 62 110 62 C125 62 132 68 132 86 C132 94 130 96 128 88 C122 74 105 72 94 84 Z"
          fill="#1e293b"
        />
        {/* Eyeglasses */}
        <rect x="96" y="86" width="12" height="10" rx="3" fill="#ffffff" fillOpacity="0.7" stroke="#0f172a" strokeWidth="1.5" />
        <rect x="112" y="86" width="12" height="10" rx="3" fill="#ffffff" fillOpacity="0.7" stroke="#0f172a" strokeWidth="1.5" />
        <line x1="108" y1="91" x2="112" y2="91" stroke="#0f172a" strokeWidth="1.5" />

        {/* Smile */}
        <path d="M104 106 Q110 110 116 106" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" fill="none" />

        {/* Left Arm holding Clinical Chart / Clipboard */}
        <path d="M62 205 L80 180 L102 210" stroke="#0f172a" strokeWidth="2" fill="#e2e8f0" />
        {/* Clipboard */}
        <rect x="75" y="175" width="30" height="42" rx="4" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
        <rect x="83" y="170" width="14" height="6" rx="2" fill="#64748b" />
        <line x1="81" y1="187" x2="99" y2="187" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        <line x1="81" y1="195" x2="97" y2="195" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        <line x1="81" y1="203" x2="93" y2="203" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Clinician 2 (Female Pharmacist / Specialist - Right) */}
      <g id="pharmacist-right">
        {/* Body / White Coat */}
        <path
          d="M175 240 C175 185 190 148 220 148 C250 148 265 185 265 240 Z"
          fill="#f1f5f9"
          stroke="#0f172a"
          strokeWidth="2"
        />
        {/* Soft Jade Inner Shirt */}
        <path d="M210 148 L220 178 L230 148 Z" fill="#10b981" stroke="#065f46" strokeWidth="1.5" />
        {/* Coat Lapels */}
        <path d="M204 148 L218 202 L220 240" stroke="#0f172a" strokeWidth="2" fill="none" />
        <path d="M236 148 L222 202 L220 240" stroke="#0f172a" strokeWidth="2" fill="none" />

        {/* Neck */}
        <rect x="213" y="130" width="14" height="20" fill="#fcd34d" stroke="#0f172a" strokeWidth="1.5" rx="3" />

        {/* Head */}
        <ellipse cx="220" cy="108" rx="20" ry="24" fill="#fcd34d" stroke="#0f172a" strokeWidth="2" />
        {/* Hair (Sleek Dark Bun / Bob) */}
        <path
          d="M198 108 C198 84 210 78 220 78 C235 78 242 86 242 108 C242 120 238 126 238 116 C232 96 208 96 202 116 C200 122 198 120 198 108 Z"
          fill="#0f172a"
        />
        <circle cx="236" cy="88" r="8" fill="#0f172a" />

        {/* Eyes & Friendly Smile */}
        <ellipse cx="213" cy="106" rx="2" ry="2.5" fill="#0f172a" />
        <ellipse cx="227" cy="106" rx="2" ry="2.5" fill="#0f172a" />
        <path d="M216 117 Q220 121 224 117" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" fill="none" />

        {/* Hand holding amber Medicine Vial */}
        <g id="holding-vial">
          <path d="M245 195 L260 175 L252 165" stroke="#0f172a" strokeWidth="2" fill="#f1f5f9" />
          <rect x="246" y="152" width="12" height="22" rx="3" fill="#f59e0b" stroke="#0f172a" strokeWidth="1.5" />
          <rect x="248" y="148" width="8" height="5" rx="1" fill="#ffffff" stroke="#0f172a" strokeWidth="1" />
          <rect x="247" y="160" width="10" height="8" rx="1" fill="#ffffff" />
        </g>
      </g>
    </svg>
  )
}

export function DoctorTeamRightIllustration({ className = 'w-full h-auto max-h-56' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 340 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Doctor and medication delivery illustration"
    >
      <defs>
        <linearGradient id="rightGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
        </linearGradient>
        <filter id="shadowRight" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#022c22" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Ambient background glow circle */}
      <circle cx="170" cy="130" r="110" fill="url(#rightGlow)" />

      {/* Floating 3D/Flat Medical Capsule Pill 1 (Green/White) */}
      <g transform="translate(60, 48) rotate(-28)" filter="url(#shadowRight)">
        <rect x="0" y="0" width="38" height="18" rx="9" fill="#10b981" stroke="#064e3b" strokeWidth="1.5" />
        <path d="M19 0 H29 A9 9 0 0 1 38 9 A9 9 0 0 1 29 18 H19 Z" fill="#ffffff" />
        <line x1="19" y1="0" x2="19" y2="18" stroke="#064e3b" strokeWidth="1.5" />
      </g>

      {/* Floating Medical Capsule Pill 2 (Coral Orange/White) */}
      <g transform="translate(235, 36) rotate(32)" filter="url(#shadowRight)">
        <rect x="0" y="0" width="36" height="17" rx="8.5" fill="#f97316" stroke="#9a3412" strokeWidth="1.5" />
        <path d="M18 0 H27.5 A8.5 8.5 0 0 1 36 8.5 A8.5 8.5 0 0 1 27.5 17 H18 Z" fill="#ffffff" />
        <line x1="18" y1="0" x2="18" y2="17" stroke="#9a3412" strokeWidth="1.5" />
      </g>

      {/* Floating Prescription Pill Sheet Icon */}
      <g transform="translate(52, 16)" filter="url(#shadowRight)">
        <rect x="0" y="0" width="34" height="26" rx="6" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
        <circle cx="9" cy="9" r="4" fill="#f87171" />
        <circle cx="25" cy="9" r="4" fill="#38bdf8" />
        <circle cx="9" cy="19" r="4" fill="#fbbf24" />
        <circle cx="25" cy="19" r="4" fill="#34d399" />
      </g>

      {/* Clinician 3 (Physician with Stethoscope - Left) */}
      <g id="physician-male">
        {/* Lab Coat */}
        <path
          d="M80 240 C80 180 95 142 125 142 C155 142 170 180 170 240 Z"
          fill="#f8fafc"
          stroke="#0f172a"
          strokeWidth="2"
        />
        {/* Navy Blue Scrub Collar */}
        <path d="M115 142 L125 174 L135 142 Z" fill="#1e3a8a" stroke="#0f172a" strokeWidth="1.5" />
        <path d="M108 142 L122 204 L125 240" stroke="#0f172a" strokeWidth="2" fill="none" />
        <path d="M142 142 L128 204 L125 240" stroke="#0f172a" strokeWidth="2" fill="none" />

        {/* Stethoscope */}
        <path
          d="M110 156 C110 188 140 188 140 156"
          stroke="#475569"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="125" cy="194" r="5.5" fill="#cbd5e1" stroke="#334155" strokeWidth="1.5" />

        {/* Neck */}
        <rect x="117" y="122" width="16" height="22" fill="#fed7aa" stroke="#0f172a" strokeWidth="1.5" rx="3" />

        {/* Head */}
        <ellipse cx="125" cy="98" rx="21" ry="25" fill="#fed7aa" stroke="#0f172a" strokeWidth="2" />
        {/* Neat Hair Cut */}
        <path
          d="M104 94 C104 70 114 66 125 66 C138 66 146 74 146 94 C146 102 144 104 140 98 C135 80 116 80 108 92 Z"
          fill="#334155"
        />
        {/* Spectacles */}
        <rect x="112" y="92" width="11" height="9" rx="2.5" fill="#ffffff" fillOpacity="0.75" stroke="#0f172a" strokeWidth="1.5" />
        <rect x="127" y="92" width="11" height="9" rx="2.5" fill="#ffffff" fillOpacity="0.75" stroke="#0f172a" strokeWidth="1.5" />
        <line x1="123" y1="96" x2="127" y2="96" stroke="#0f172a" strokeWidth="1.5" />

        {/* Smile */}
        <path d="M119 113 Q125 117 131 113" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </g>

      {/* Clinician 4 (Female Specialist Holding Digital Tablet - Right) */}
      <g id="specialist-female">
        {/* Lab Coat */}
        <path
          d="M185 240 C185 182 200 145 230 145 C260 145 275 182 275 240 Z"
          fill="#f1f5f9"
          stroke="#0f172a"
          strokeWidth="2"
        />
        {/* Teal Scrub */}
        <path d="M220 145 L230 175 L240 145 Z" fill="#0f766e" stroke="#134e4a" strokeWidth="1.5" />
        <path d="M214 145 L228 205 L230 240" stroke="#0f172a" strokeWidth="2" fill="none" />
        <path d="M246 145 L232 205 L230 240" stroke="#0f172a" strokeWidth="2" fill="none" />

        {/* Neck */}
        <rect x="223" y="126" width="14" height="21" fill="#fcd34d" stroke="#0f172a" strokeWidth="1.5" rx="3" />

        {/* Head */}
        <ellipse cx="230" cy="104" rx="20" ry="24" fill="#fcd34d" stroke="#0f172a" strokeWidth="2" />
        {/* Hair (High ponytail) */}
        <path
          d="M210 104 C210 82 220 74 230 74 C244 74 250 84 250 104 C250 114 246 118 244 110 C240 92 218 92 214 110 Z"
          fill="#1e1b4b"
        />
        <ellipse cx="248" cy="84" rx="7" ry="12" fill="#1e1b4b" transform="rotate(25 248 84)" />

        {/* Facial Expression */}
        <ellipse cx="224" cy="102" rx="2" ry="2.5" fill="#0f172a" />
        <ellipse cx="236" cy="102" rx="2" ry="2.5" fill="#0f172a" />
        <path d="M226 113 Q230 117 234 113" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" fill="none" />

        {/* Digital Hospital Tablet / Clipboard */}
        <g id="holding-tablet">
          <path d="M205 210 L190 190 L210 178" stroke="#0f172a" strokeWidth="2" fill="#f1f5f9" />
          <rect x="180" y="165" width="34" height="46" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="2" />
          <rect x="183" y="168" width="28" height="40" rx="2" fill="#0284c7" />
          {/* Tablet Screen UI Lines */}
          <line x1="187" y1="175" x2="207" y2="175" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="187" y1="183" x2="201" y2="183" stroke="#e0f2fe" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="187" y1="191" x2="205" y2="191" stroke="#e0f2fe" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="197" cy="201" r="2.5" fill="#38bdf8" />
        </g>
      </g>
    </svg>
  )
}

// =============================================================================
// Flat Vector Clinical Category Icons (Apollo Pharmacy Style)
// =============================================================================

export function CardiacVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#FEE2E2" />
      <path
        d="M24 37 C15 30 11 25 11 19.5 A6.5 6.5 0 0 1 24 16 A6.5 6.5 0 0 1 37 19.5 C37 25 33 30 24 37 Z"
        fill="#EF4444"
        stroke="#DC2626"
        strokeWidth="1.5"
      />
      {/* ECG Pulse Line */}
      <path
        d="M16 23.5 H20 L22 19 L25 28 L27 21 L29 24 H32"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DiabetesVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#E0F2FE" />
      {/* Glucometer Device */}
      <rect x="14" y="14" width="20" height="24" rx="6" fill="#0284C7" stroke="#0369A1" strokeWidth="1.5" />
      <rect x="18" y="18" width="12" height="9" rx="2" fill="#E0F2FE" />
      <text x="24" y="24.5" fill="#0369A1" fontSize="6" fontWeight="bold" textAnchor="middle">108</text>
      {/* Blood Droplet */}
      <path
        d="M29 10 C29 10 33 14 33 16 A4 4 0 0 1 25 16 C25 14 29 10 29 10 Z"
        fill="#EF4444"
      />
    </svg>
  )
}

export function StomachVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#FEF3C7" />
      <path
        d="M20 12 C20 12 21 16 21 18 C21 21 17 22 15 26 C13 30 15 36 21 36 C27 36 33 33 33 27 C33 21 27 18 27 15 C27 13 28 12 28 12"
        stroke="#D97706"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="#FDE68A"
      />
      <circle cx="24" cy="27" r="2.5" fill="#D97706" />
    </svg>
  )
}

export function PainReliefVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#EDE9FE" />
      {/* Spine / Vertebrae alignment */}
      <ellipse cx="24" cy="14" rx="6" ry="3" fill="#8B5CF6" />
      <ellipse cx="24" cy="21" rx="7" ry="3.5" fill="#7C3AED" />
      <ellipse cx="24" cy="28" rx="8" ry="4" fill="#6D28D9" />
      <ellipse cx="24" cy="35" rx="7" ry="3.5" fill="#8B5CF6" />
      {/* Relief Glow Rays */}
      <path d="M12 21 L16 21 M32 21 L36 21 M13 28 L17 28 M31 28 L35 28" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function RespiratoryVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#E0F7FA" />
      {/* Trachea */}
      <path d="M24 12 V21" stroke="#00838F" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 21 L19 25 M24 21 L29 25" stroke="#00838F" strokeWidth="2.5" strokeLinecap="round" />
      {/* Left Lung */}
      <path
        d="M19 25 C15 25 13 28 13 33 C13 36 16 38 19 38 C22 38 23 33 23 27 Z"
        fill="#4DD0E1"
        stroke="#00838F"
        strokeWidth="1.5"
      />
      {/* Right Lung */}
      <path
        d="M29 25 C33 25 35 28 35 33 C35 36 32 38 29 38 C26 38 25 33 25 27 Z"
        fill="#4DD0E1"
        stroke="#00838F"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function NeurologyVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#FDF2F8" />
      {/* Brain Hemispheres */}
      <path
        d="M24 14 C20 12 14 15 14 20 C14 22 13 25 15 28 C14 31 16 35 20 35 C22 35 24 33 24 33 M24 14 C28 12 34 15 34 20 C34 22 35 25 33 28 C34 31 32 35 28 35 C26 35 24 33 24 33"
        stroke="#DB2777"
        strokeWidth="2"
        fill="#FCE7F3"
      />
      <circle cx="20" cy="22" r="2" fill="#DB2777" />
      <circle cx="28" cy="22" r="2" fill="#DB2777" />
      <line x1="20" y1="22" x2="28" y2="22" stroke="#DB2777" strokeWidth="1.5" />
    </svg>
  )
}

export function ElderlyCareVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#F1F5F9" />
      {/* Caring hands holding heart */}
      <circle cx="24" cy="24" r="12" fill="#E2E8F0" />
      <path
        d="M24 28 C18 23 16 20 16 17 C16 14.5 18 13 20 13 C22 13 24 15 24 15 C24 15 26 13 28 13 C30 13 32 14.5 32 17 C32 20 30 23 24 28 Z"
        fill="#059669"
      />
    </svg>
  )
}

export function ColdImmunityVectorIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="#ECFDF5" />
      {/* Immune Shield */}
      <path
        d="M24 12 L33 16 V24 C33 30 29 35 24 37 C19 35 15 30 15 24 V16 L24 12 Z"
        fill="#10B981"
        stroke="#047857"
        strokeWidth="1.5"
      />
      <path d="M24 18 V28 M19 23 H29" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
