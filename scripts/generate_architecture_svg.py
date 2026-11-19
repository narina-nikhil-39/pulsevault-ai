"""
PulseVault AI / SynapseHealth — System Architecture Diagram Generator
Generates an updated dark-mode SVG architecture diagram reflecting:
1. Tri-Party Frontend (Doctor Console, Reception Desk, Patient Locker)
2. FastAPI Gateway + HL7 FHIR R4 export + SHA-256 Audit Chain & Break-Glass
3. 7 Explicit Pipeline Stages (including Stage 4 Spatial Vector Indexing)
4. Polyglot Storage Layer (PostgreSQL 16 / SQLite WAL, Qdrant 1.11, Neo4j 5.23)
5. External APIs (Gemini 2.5 Flash, NLM RxNav / OpenFDA)
"""

from pathlib import Path

SVG_CONTENT = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1480 960" width="1480" height="960" style="background:#0F121C; font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <!-- Grid pattern background -->
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="#1E2638" />
    </pattern>

    <!-- Marker Arrow -->
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748B" />
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#3B82F6" />
    </marker>
    <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#10B981" />
    </marker>
    <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#8B5CF6" />
    </marker>
    <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="#F59E0B" />
    </marker>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="#0A0D16" />
  <rect width="100%" height="100%" fill="url(#grid)" />

  <!-- ==================== TIER 1: TRI-PARTY FRONTEND CLIENTS ==================== -->
  <g id="clients-group">
    <rect x="30" y="240" width="220" height="420" rx="16" fill="#111827" fill-opacity="0.6" stroke="#3B82F6" stroke-width="1.5" stroke-dasharray="4 4" />
    <text x="45" y="268" fill="#93C5FD" font-size="12" font-weight="800" letter-spacing="0.5">Tri-Party Frontend (React 19)</text>

    <!-- Client 1: Doctor Console -->
    <rect x="50" y="295" width="180" height="90" rx="12" fill="#1E293B" stroke="#38BDF8" stroke-width="1.5" />
    <text x="65" y="325" fill="#38BDF8" font-size="12" font-weight="700">🩺 Doctor Console</text>
    <text x="65" y="345" fill="#94A3B8" font-size="10">Longitudinal Timeline</text>
    <text x="65" y="362" fill="#64748B" font-size="9" font-family="monospace">Route: /doctor</text>

    <!-- Client 2: Reception Desk -->
    <rect x="50" y="405" width="180" height="90" rx="12" fill="#1E293B" stroke="#F43F5E" stroke-width="1.5" />
    <text x="65" y="435" fill="#FB7185" font-size="12" font-weight="700">🚨 Reception Desk</text>
    <text x="65" y="455" fill="#94A3B8" font-size="10">Camera QR Triage &amp; Queue</text>
    <text x="65" y="472" fill="#64748B" font-size="9" font-family="monospace">Route: /reception</text>

    <!-- Client 3: Patient Locker -->
    <rect x="50" y="515" width="180" height="90" rx="12" fill="#1E293B" stroke="#10B981" stroke-width="1.5" />
    <text x="65" y="545" fill="#34D399" font-size="12" font-weight="700">📱 Patient Locker</text>
    <text x="65" y="565" fill="#94A3B8" font-size="10">Self-Enroll &amp; QR Pass</text>
    <text x="65" y="582" fill="#64748B" font-size="9" font-family="monospace">Route: /patient</text>
  </g>

  <!-- ==================== TIER 2: WEB GATEWAY & SECURITY LAYER ==================== -->
  <g id="gateway-group">
    <rect x="290" y="140" width="270" height="680" rx="16" fill="#111827" fill-opacity="0.6" stroke="#EC4899" stroke-width="1.5" stroke-dasharray="4 4" />
    <text x="305" y="168" fill="#F472B6" font-size="12" font-weight="800" letter-spacing="0.5">Web Gateway &amp; Security Layer</text>

    <!-- Auth Gateway -->
    <rect x="310" y="195" width="230" height="90" rx="12" fill="#1F1528" stroke="#D946EF" stroke-width="1.5" />
    <text x="325" y="225" fill="#E879F9" font-size="12" font-weight="700">🛡️ Auth Gateway</text>
    <text x="325" y="245" fill="#94A3B8" font-size="10">PBKDF2-SHA256 Passwords</text>
    <text x="325" y="262" fill="#C084FC" font-size="9" font-family="monospace">Scoped Ephemeral JWTs</text>

    <!-- FastAPI Gateway -->
    <rect x="310" y="340" width="230" height="135" rx="12" fill="#0C2538" stroke="#0EA5E9" stroke-width="1.8" />
    <text x="325" y="370" fill="#38BDF8" font-size="13" font-weight="800">&lt;/&gt; FastAPI Web Gateway</text>
    <text x="325" y="390" fill="#94A3B8" font-size="10">app/main.py :8000</text>
    <text x="325" y="415" fill="#E2E8F0" font-size="10">Uvicorn ASGI + BackgroundTasks</text>
    <!-- Outbound FHIR Badge -->
    <rect x="325" y="430" width="195" height="28" rx="6" fill="#047857" fill-opacity="0.3" stroke="#10B981" stroke-width="1" />
    <text x="335" y="448" fill="#6EE7B7" font-size="9.5" font-weight="700">⚡ Outbound: HL7 FHIR R4 Export</text>

    <!-- SHA-256 Audit Chain + Break-Glass -->
    <rect x="310" y="530" width="230" height="120" rx="12" fill="#2A1215" stroke="#F43F5E" stroke-width="1.5" />
    <text x="325" y="558" fill="#FB7185" font-size="11.5" font-weight="700">🔒 SHA-256 Audit Chain</text>
    <text x="325" y="578" fill="#FDA4AF" font-size="11" font-weight="700">+ Dual-Signature Break-Glass</text>
    <text x="325" y="600" fill="#94A3B8" font-size="10">Immutable Block Hash Ledger</text>
    <text x="325" y="618" fill="#F43F5E" font-size="9" font-family="monospace">GET /api/emergency/audit-chain</text>
  </g>

  <!-- ==================== TIER 3: 7-STAGE MULTI-AGENT INGESTION PIPELINE ==================== -->
  <g id="pipeline-group">
    <rect x="600" y="50" width="280" height="860" rx="16" fill="#111827" fill-opacity="0.6" stroke="#F59E0B" stroke-width="1.8" stroke-dasharray="4 4" />
    <text x="615" y="78" fill="#FBBF24" font-size="12" font-weight="800" letter-spacing="0.5">7-Stage Multi-Agent Pipeline</text>

    <!-- Stage 1 -->
    <rect x="620" y="95" width="240" height="85" rx="10" fill="#1E293B" stroke="#3B82F6" stroke-width="1.3" />
    <text x="635" y="122" fill="#60A5FA" font-size="11" font-weight="700">1. Ingestion / OCR</text>
    <text x="635" y="142" fill="#94A3B8" font-size="9.5">PyMuPDF Text + Vision Routing</text>
    <text x="635" y="158" fill="#64748B" font-size="8.5" font-family="monospace">src/agents/ingestion_agent.py</text>

    <!-- Stage 2 -->
    <rect x="620" y="200" width="240" height="85" rx="10" fill="#1E293B" stroke="#0284C7" stroke-width="1.3" />
    <text x="635" y="227" fill="#38BDF8" font-size="11" font-weight="700">2. Clinical Extraction</text>
    <text x="635" y="247" fill="#94A3B8" font-size="9.5">Gemini 2.5 Flash / Lexicon NLP</text>
    <text x="635" y="263" fill="#64748B" font-size="8.5" font-family="monospace">src/agents/extraction_agent.py</text>

    <!-- Stage 3 -->
    <rect x="620" y="305" width="240" height="85" rx="10" fill="#1E293B" stroke="#0D9488" stroke-width="1.3" />
    <text x="635" y="332" fill="#2DD4BF" font-size="11" font-weight="700">3. Terminology Normalization</text>
    <text x="635" y="352" fill="#94A3B8" font-size="9.5">RxNorm CUI / LOINC / SNOMED</text>
    <text x="635" y="368" fill="#64748B" font-size="8.5" font-family="monospace">src/services/drug_lookup_service.py</text>

    <!-- Stage 4 -->
    <rect x="620" y="410" width="240" height="85" rx="10" fill="#064E3B" fill-opacity="0.4" stroke="#10B981" stroke-width="1.5" />
    <text x="635" y="437" fill="#34D399" font-size="11" font-weight="800">4. Spatial Vector Indexing</text>
    <text x="635" y="457" fill="#A7F3D0" font-size="9.5">384-dim Embeddings + 2D Bbox</text>
    <text x="635" y="473" fill="#6EE7B7" font-size="8.5" font-family="monospace">src/services/rag_service.py</text>

    <!-- Stage 5 -->
    <rect x="620" y="515" width="240" height="85" rx="10" fill="#1E293B" stroke="#16A34A" stroke-width="1.3" />
    <text x="635" y="542" fill="#4ADE80" font-size="11" font-weight="700">5. Temporal Knowledge Graph</text>
    <text x="635" y="562" fill="#94A3B8" font-size="9.5">NetworkX Chronology &amp; Superseding</text>
    <text x="635" y="578" fill="#64748B" font-size="8.5" font-family="monospace">src/agents/temporal_graph_agent.py</text>

    <!-- Stage 6 -->
    <rect x="620" y="620" width="240" height="85" rx="10" fill="#2A1215" stroke="#DC2626" stroke-width="1.5" />
    <text x="635" y="647" fill="#F87171" font-size="11" font-weight="800">6. Deterministic Safety Engine</text>
    <text x="635" y="667" fill="#FCA5A5" font-size="9.5">100% Sensitivity Renal &amp; DDI Rules</text>
    <text x="635" y="683" fill="#EF4444" font-size="8.5" font-family="monospace">src/engine/safety_rules.py</text>

    <!-- Stage 7 -->
    <rect x="620" y="725" width="240" height="85" rx="10" fill="#1E1B4B" stroke="#7C3AED" stroke-width="1.5" />
    <text x="635" y="752" fill="#A78BFA" font-size="11" font-weight="800">7. Emergency Flashcard Cache</text>
    <text x="635" y="772" fill="#C4B5FD" font-size="9.5">3.57ms Sub-4ms Triage Retrieval</text>
    <text x="635" y="788" fill="#8B5CF6" font-size="8.5" font-family="monospace">src/agents/flashcard_agent.py</text>
  </g>

  <!-- ==================== TIER 4: POLYGLOT STORAGE LAYER ==================== -->
  <g id="storage-group">
    <rect x="920" y="400" width="260" height="430" rx="16" fill="#111827" fill-opacity="0.6" stroke="#A855F7" stroke-width="1.5" stroke-dasharray="4 4" />
    <text x="935" y="428" fill="#C084FC" font-size="12" font-weight="800" letter-spacing="0.5">Polyglot Storage Layer</text>

    <!-- Storage 1: Qdrant Vector DB (Linked from Stage 4) -->
    <rect x="940" y="445" width="220" height="85" rx="12" fill="#1C1929" stroke="#E11D48" stroke-width="1.5" />
    <text x="955" y="475" fill="#FB7185" font-size="12" font-weight="800">🔴 Qdrant 1.11 Vector DB</text>
    <text x="955" y="495" fill="#94A3B8" font-size="10">Spatial 2D Bbox Vectors (:6333)</text>
    <text x="955" y="512" fill="#E11D48" font-size="9" font-family="monospace">Patient-Scoped Semantic Chunks</text>

    <!-- Storage 2: Neo4j Knowledge Graph (Linked from Stage 5) -->
    <rect x="940" y="550" width="220" height="85" rx="12" fill="#0C2538" stroke="#0284C7" stroke-width="1.5" />
    <text x="955" y="580" fill="#38BDF8" font-size="12" font-weight="800">🔵 Neo4j 5.23 Graph DB</text>
    <text x="955" y="600" fill="#94A3B8" font-size="10">Cypher Knowledge Graph (:7474)</text>
    <text x="955" y="617" fill="#0284C7" font-size="9" font-family="monospace">nodes: Patient, Drug, Condition</text>

    <!-- Storage 3: Relational DB (PostgreSQL 16 / SQLite WAL) -->
    <rect x="940" y="655" width="220" height="95" rx="12" fill="#1F1528" stroke="#9333EA" stroke-width="1.5" />
    <text x="955" y="685" fill="#C084FC" font-size="11.5" font-weight="800">🟣 PostgreSQL 16 / SQLite</text>
    <text x="955" y="705" fill="#94A3B8" font-size="10">WAL Mode • Primary Records</text>
    <text x="955" y="722" fill="#94A3B8" font-size="9.5">Patients, FlashcardCache, AuditChain</text>
    <text x="955" y="738" fill="#A855F7" font-size="9" font-family="monospace">DATABASE_URL Dynamic Binding</text>
  </g>

  <!-- ==================== TIER 5: EXTERNAL MEDICAL & INTELLIGENCE APIS ==================== -->
  <g id="external-group">
    <rect x="1220" y="100" width="230" height="250" rx="16" fill="#111827" fill-opacity="0.6" stroke="#EAB308" stroke-width="1.5" stroke-dasharray="4 4" />
    <text x="1235" y="128" fill="#FDE047" font-size="12" font-weight="800" letter-spacing="0.5">External Medical &amp; AI APIs</text>

    <!-- Gemini 2.5 Flash -->
    <rect x="1240" y="145" width="190" height="85" rx="12" fill="#2E2413" stroke="#F59E0B" stroke-width="1.5" />
    <text x="1255" y="175" fill="#FBBF24" font-size="11.5" font-weight="800">☁️ Gemini 2.5 Flash</text>
    <text x="1255" y="195" fill="#D1D5DB" font-size="10">Multimodal Vision OCR</text>
    <text x="1255" y="212" fill="#F59E0B" font-size="9" font-family="monospace">Google GenAI SDK</text>

    <!-- RxNav / OpenFDA -->
    <rect x="1240" y="245" width="190" height="85" rx="12" fill="#1F2417" stroke="#84CC16" stroke-width="1.5" />
    <text x="1255" y="275" fill="#A3E635" font-size="11.5" font-weight="800">💊 NLM RxNav / OpenFDA</text>
    <text x="1255" y="295" fill="#D1D5DB" font-size="10">RxNorm CUI / LOINC / ATC</text>
    <text x="1255" y="312" fill="#84CC16" font-size="9" font-family="monospace">REST API + Local Cache</text>
  </g>

  <!-- ==================== CONNECTING FLOW ARROWS ==================== -->

  <!-- Clients -> FastAPI Gateway -->
  <path d="M 230 340 L 270 340 L 270 390 L 310 390" fill="none" stroke="#38BDF8" stroke-width="1.5" marker-end="url(#arrow-blue)" />
  <path d="M 230 450 L 310 405" fill="none" stroke="#F43F5E" stroke-width="1.5" marker-end="url(#arrow)" />
  <path d="M 230 560 L 270 560 L 270 420 L 310 420" fill="none" stroke="#10B981" stroke-width="1.5" marker-end="url(#arrow-emerald)" />

  <!-- FastAPI Gateway <-> Auth Gateway & Audit -->
  <path d="M 425 340 L 425 285" fill="none" stroke="#D946EF" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#arrow)" />
  <path d="M 425 475 L 425 530" fill="none" stroke="#F43F5E" stroke-width="1.5" marker-end="url(#arrow)" />

  <!-- FastAPI Gateway -> Pipeline Stage 1 -->
  <path d="M 540 370 L 580 370 L 580 137 L 620 137" fill="none" stroke="#38BDF8" stroke-width="2" marker-end="url(#arrow-blue)" />

  <!-- Sequential Pipeline Arrows (Stage 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7) -->
  <path d="M 740 180 L 740 200" fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)" />
  <path d="M 740 285 L 740 305" fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)" />
  <path d="M 740 390 L 740 410" fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)" />
  <path d="M 740 495 L 740 515" fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)" />
  <path d="M 740 600 L 740 620" fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)" />
  <path d="M 740 705 L 740 725" fill="none" stroke="#64748B" stroke-width="2" marker-end="url(#arrow)" />

  <!-- Pipeline -> Polyglot Storage Layer -->
  <!-- Stage 4 -> Qdrant -->
  <path d="M 860 452 L 940 475" fill="none" stroke="#E11D48" stroke-width="2" marker-end="url(#arrow)" />

  <!-- Stage 5 -> Neo4j -->
  <path d="M 860 557 L 940 580" fill="none" stroke="#0284C7" stroke-width="2" marker-end="url(#arrow-blue)" />

  <!-- Stage 6 & 7 -> Relational Database -->
  <path d="M 860 662 L 900 662 L 900 690 L 940 690" fill="none" stroke="#9333EA" stroke-width="2" marker-end="url(#arrow-purple)" />
  <path d="M 860 767 L 910 767 L 910 710 L 940 710" fill="none" stroke="#7C3AED" stroke-width="2" marker-end="url(#arrow-purple)" />

  <!-- Pipeline <-> External APIs -->
  <!-- Stage 1 & 2 <-> Gemini -->
  <path d="M 860 145 L 1240 175" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#arrow-amber)" />
  <path d="M 860 235 L 1240 195" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#arrow-amber)" />

  <!-- Stage 3 <-> RxNav -->
  <path d="M 860 340 L 1240 280" fill="none" stroke="#84CC16" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#arrow)" />

  <!-- Legend Bar -->
  <g id="legend" transform="translate(40, 915)">
    <rect x="0" y="0" width="1400" height="35" rx="8" fill="#111827" stroke="#1E293B" stroke-width="1" />
    <circle cx="20" cy="18" r="5" fill="#38BDF8" />
    <text x="32" y="22" fill="#94A3B8" font-size="10.5">Frontend Client</text>

    <circle cx="160" cy="18" r="5" fill="#0EA5E9" />
    <text x="172" y="22" fill="#94A3B8" font-size="10.5">Web Gateway / Backend</text>

    <circle cx="350" cy="18" r="5" fill="#F43F5E" />
    <text x="362" y="22" fill="#94A3B8" font-size="10.5">Security / Audit Chain</text>

    <circle cx="530" cy="18" r="5" fill="#10B981" />
    <text x="542" y="22" fill="#94A3B8" font-size="10.5">Agent Pipeline Stages (1-7)</text>

    <circle cx="730" cy="18" r="5" fill="#A855F7" />
    <text x="742" y="22" fill="#94A3B8" font-size="10.5">Polyglot Storage (Qdrant + Neo4j + Postgres/SQLite)</text>

    <circle cx="1070" cy="18" r="5" fill="#F59E0B" />
    <text x="1082" y="22" fill="#94A3B8" font-size="10.5">External Clinical Ontologies &amp; LLM</text>
  </g>
</svg>
'''

def generate_svg():
    out_paths = [
        Path("docs/synapsehealth_architecture.svg"),
        Path("mermaid-diagram.svg"),
        Path("frontend/public/synapsehealth_architecture.svg"),
    ]
    for p in out_paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(SVG_CONTENT, encoding="utf-8")
        print(f"Generated {p}")

if __name__ == "__main__":
    generate_svg()
