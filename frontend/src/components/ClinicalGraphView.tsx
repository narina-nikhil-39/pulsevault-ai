import React, { useEffect, useRef, useState, useMemo } from 'react'
import {
  getPatientSubgraph,
  getPatientCypher,
  syncPatientGraph,
  type GraphSubgraphData,
  type GraphCypherData,
} from '../api'

interface ClinicalGraphViewProps {
  patientCode: string
}

interface GraphNode {
  id: string
  label: string
  type: string
  details: Record<string, unknown>
  x: number
  y: number
  vx?: number
  vy?: number
}

interface GraphLink {
  source: string
  target: string
  type: string
  label: string
  severity?: string
  rule?: string
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  Patient: { bg: '#2563EB', border: '#1D4ED8', text: '#FFFFFF', icon: '👤' },
  Condition: { bg: '#F59E0B', border: '#D97706', text: '#FFFFFF', icon: '🩺' },
  Medication: { bg: '#10B981', border: '#059669', text: '#FFFFFF', icon: '💊' },
  Allergy: { bg: '#EF4444', border: '#DC2626', text: '#FFFFFF', icon: '⚠️' },
  LabValue: { bg: '#8B5CF6', border: '#7C3AED', text: '#FFFFFF', icon: '🔬' },
}

export function ClinicalGraphView({ patientCode }: ClinicalGraphViewProps) {
  const [data, setData] = useState<GraphSubgraphData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Simulation layout coordinates
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])

  // Selected node inspection
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  // Transform / Zoom / Pan state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState<number>(1)
  const [isPanning, setIsPanning] = useState<boolean>(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Node Dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  // Cypher Script Modal
  const [cypherData, setCypherData] = useState<GraphCypherData | null>(null)
  const [cypherModalOpen, setCypherModalOpen] = useState<boolean>(false)
  const [cypherLoading, setCypherLoading] = useState<boolean>(false)
  const [copiedCypher, setCopiedCypher] = useState<boolean>(false)

  // Neo4j Sync state
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<boolean>(false)

  const svgRef = useRef<SVGSVGElement | null>(null)

  // Load Graph Data
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setSelectedNode(null)

    getPatientSubgraph(patientCode)
      .then((subgraph) => {
        if (!active) return
        setData(subgraph)

        // Radial layout initialization with physics separation
        const width = 900
        const height = 600
        const centerX = width / 2
        const centerY = height / 2

        const rawNodes = subgraph.nodes || []
        const rawLinks = subgraph.links || []

        const patientNode = rawNodes.find((n) => n.type === 'Patient')
        const otherNodes = rawNodes.filter((n) => n.type !== 'Patient')

        const placedNodes: GraphNode[] = []

        if (patientNode) {
          placedNodes.push({
            ...patientNode,
            x: centerX,
            y: centerY,
          })
        }

        const totalOthers = otherNodes.length
        otherNodes.forEach((node, i) => {
          const angle = (2 * Math.PI * i) / (totalOthers || 1)
          // Distribute different node types onto orbital radii
          let radius = 190
          if (node.type === 'Medication') radius = 170
          if (node.type === 'Condition') radius = 230
          if (node.type === 'Allergy') radius = 210
          if (node.type === 'LabValue') radius = 220

          // Slight angular variation for pleasant organic appearance
          const jitter = (i % 2 === 0 ? 1 : -1) * 15
          placedNodes.push({
            ...node,
            x: centerX + Math.cos(angle) * (radius + jitter),
            y: centerY + Math.sin(angle) * (radius + jitter),
          })
        })

        setNodes(placedNodes)
        setLinks(rawLinks)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load clinical graph.')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [patientCode])

  // Map of nodes by ID for fast link coordinate lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    nodes.forEach((n) => map.set(n.id, n))
    return map
  }, [nodes])

  // Pan Handlers
  function handleMouseDown(e: React.MouseEvent) {
    if (draggingNodeId) return
    setIsPanning(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (draggingNodeId && svgRef.current) {
      // Drag specific node
      const rect = svgRef.current.getBoundingClientRect()
      const mouseSvgX = (e.clientX - rect.left - pan.x) / zoom
      const mouseSvgY = (e.clientY - rect.top - pan.y) / zoom

      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, x: mouseSvgX, y: mouseSvgY } : n))
      )
      return
    }

    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  function handleMouseUp() {
    setIsPanning(false)
    setDraggingNodeId(null)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.4), 2.5)
    setZoom(newZoom)
  }

  // Zoom controls
  function zoomIn() {
    setZoom((z) => Math.min(z * 1.2, 2.5))
  }
  function zoomOut() {
    setZoom((z) => Math.max(z / 1.2, 0.4))
  }
  function resetZoom() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Fetch Cypher Statements
  async function handleExportCypher() {
    setCypherLoading(true)
    setCypherModalOpen(true)
    setCopiedCypher(false)
    try {
      const cypher = await getPatientCypher(patientCode)
      setCypherData(cypher)
    } catch (err) {
      console.error('Failed to export Cypher:', err)
    } finally {
      setCypherLoading(false)
    }
  }

  // Copy Cypher script to clipboard
  function copyCypherText() {
    if (!cypherData?.cypher_script) return
    navigator.clipboard.writeText(cypherData.cypher_script)
    setCopiedCypher(true)
    setTimeout(() => setCopiedCypher(false), 2000)
  }

  // Sync Graph with Live Neo4j
  async function handleSyncGraph() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await syncPatientGraph(patientCode)
      setSyncMessage(res.message || 'Graph synchronized successfully.')
      setTimeout(() => setSyncMessage(null), 5000)
    } catch (err: unknown) {
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  // Node Selection helper
  function handleNodeClick(e: React.MouseEvent, node: GraphNode) {
    e.stopPropagation()
    setSelectedNode(node)
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-xs text-slate-500 shadow-sm">
        <div className="inline-block animate-spin text-2xl mb-2">🕸️</div>
        <div>Loading interactive clinical knowledge graph for <strong>{patientCode}</strong>…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-xs text-rose-700 shadow-sm">
        <div className="font-bold text-sm mb-1">Knowledge Graph Unavailable</div>
        <div>{error}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-sm">
            🕸️
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <span>Clinical Knowledge Graph</span>
              <span className="font-mono text-[10px] text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-full font-semibold">
                {patientCode}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              {data?.total_nodes || 0} Entities · {data?.total_links || 0} Relationships · Drug Contraindication Links
            </div>
          </div>
        </div>

        {/* Action Buttons: Cypher Export & Sync */}
        <div className="flex items-center gap-2">
          {syncMessage && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg animate-fade-in">
              ✓ {syncMessage}
            </span>
          )}

          <button
            onClick={handleSyncGraph}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Sync graph model to Neo4j instance"
          >
            <span>{syncing ? '⏳' : '🔄'}</span>
            <span>{syncing ? 'Syncing…' : 'Sync Neo4j'}</span>
          </button>

          <button
            onClick={handleExportCypher}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
            title="View declarative Cypher query"
          >
            <span>📄</span>
            <span>Export Cypher</span>
          </button>

          {/* Zoom Buttons */}
          <div className="flex items-center border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs ml-1">
            <button
              onClick={zoomIn}
              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 transition"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={zoomOut}
              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 border-l border-r border-slate-200 transition"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={resetZoom}
              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 transition font-mono"
              title="Reset View"
            >
              ⟲
            </button>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas Area */}
      <div className="relative w-full h-[540px] bg-gradient-to-b from-slate-50/50 to-slate-100/40 select-none overflow-hidden">
        {/* Legend Overlay */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2 p-2 rounded-xl bg-white/90 backdrop-blur-xs border border-slate-200/80 shadow-2xs text-[10px] font-semibold text-slate-600">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Patient
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Condition
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Medication
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Allergy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Lab Test
          </span>
          <span className="flex items-center gap-1 text-rose-600 font-bold ml-1 pl-1 border-l border-slate-200">
            <span className="w-3 border-t-2 border-dashed border-rose-500 inline-block" /> ⚠️ Contraindication
          </span>
        </div>

        {/* SVG Viewport */}
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          <defs>
            {/* Standard Gray Arrowhead */}
            <marker
              id="arrow-slate"
              viewBox="0 0 10 10"
              refX="20"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
            </marker>

            {/* Contraindication Red Warning Arrowhead */}
            <marker
              id="arrow-red"
              viewBox="0 0 10 10"
              refX="22"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
            </marker>

            {/* Soft Node Drop Shadow Filter */}
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
            <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#EF4444" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Group container with Pan & Zoom transform */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Render Links */}
            {links.map((link, idx) => {
              const sourceNode = nodeMap.get(link.source)
              const targetNode = nodeMap.get(link.target)
              if (!sourceNode || !targetNode) return null

              const isConflict = link.type === 'CONTRAINDICATED_WITH'

              // Calculate midpoint for relationship label
              const midX = (sourceNode.x + targetNode.x) / 2
              const midY = (sourceNode.y + targetNode.y) / 2

              if (isConflict) {
                // Curved arch for contraindications between medications
                const dx = targetNode.x - sourceNode.x
                const dy = targetNode.y - sourceNode.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                const curveOffset = Math.min(dist * 0.25, 40)
                const controlX = midX - (dy / dist) * curveOffset
                const controlY = midY + (dx / dist) * curveOffset

                return (
                  <g key={`conflict-${idx}`}>
                    <path
                      d={`M ${sourceNode.x} ${sourceNode.y} Q ${controlX} ${controlY} ${targetNode.x} ${targetNode.y}`}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="2.5"
                      strokeDasharray="5,4"
                      className="animate-pulse"
                      filter="url(#glow-red)"
                      markerEnd="url(#arrow-red)"
                    />
                    <g transform={`translate(${controlX}, ${controlY})`}>
                      <rect
                        x="-55"
                        y="-10"
                        width="110"
                        height="20"
                        rx="10"
                        fill="#FEF2F2"
                        stroke="#EF4444"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill="#DC2626"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        ⚠️ Contraindicated
                      </text>
                    </g>
                  </g>
                )
              }

              // Standard Straight Links
              return (
                <g key={`link-${idx}`}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="#94A3B8"
                    strokeWidth="1.8"
                    strokeOpacity="0.7"
                    markerEnd="url(#arrow-slate)"
                  />
                  {link.label && (
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x="-30"
                        y="-8"
                        width="60"
                        height="16"
                        rx="8"
                        fill="#F8FAFC"
                        stroke="#E2E8F0"
                        strokeWidth="0.8"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill="#64748B"
                        fontSize="8"
                        fontWeight="600"
                        fontFamily="sans-serif"
                      >
                        {link.label.length > 12 ? `${link.label.slice(0, 10)}…` : link.label}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* 2. Render Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id
              const isPatient = node.type === 'Patient'
              const radius = isPatient ? 34 : 24
              const style = TYPE_COLORS[node.type] || {
                bg: '#64748B',
                border: '#475569',
                text: '#FFFFFF',
                icon: '🔹',
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer transition-transform group"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setDraggingNodeId(node.id)
                  }}
                  onClick={(e) => handleNodeClick(e, node)}
                >
                  {/* Outer selection ring */}
                  {isSelected && (
                    <circle
                      r={radius + 6}
                      fill="none"
                      stroke={style.bg}
                      strokeWidth="2.5"
                      strokeDasharray="4,2"
                      className="animate-spin"
                    />
                  )}

                  {/* Node Circle */}
                  <circle
                    r={radius}
                    fill={style.bg}
                    stroke={isSelected ? '#FFFFFF' : style.border}
                    strokeWidth={isSelected ? '2.5' : '1.5'}
                    filter="url(#shadow)"
                    className="hover:brightness-105 transition-all"
                  />

                  {/* Icon Emoji / Glyph */}
                  <text
                    x="0"
                    y={isPatient ? '-4' : '-2'}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={isPatient ? '18' : '14'}
                    fill="#FFFFFF"
                  >
                    {style.icon}
                  </text>

                  {/* Node Title / Label */}
                  <text
                    x="0"
                    y={isPatient ? '14' : radius + 12}
                    textAnchor="middle"
                    fill={isPatient ? '#FFFFFF' : '#1E293B'}
                    fontSize={isPatient ? '9' : '10'}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    className="pointer-events-none drop-shadow-xs"
                  >
                    {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                  </text>

                  {/* Type Pill Under Node */}
                  {!isPatient && (
                    <text
                      x="0"
                      y={radius + 23}
                      textAnchor="middle"
                      fill="#64748B"
                      fontSize="8"
                      fontWeight="500"
                      fontFamily="sans-serif"
                      className="pointer-events-none"
                    >
                      {node.type}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* Node Inspection Drawer (Right-docked floating card) */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-20 w-72 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-4 shadow-xl text-xs space-y-3 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[selectedNode.type]?.bg || '#64748B' }}
                />
                <span className="font-bold text-slate-900">{selectedNode.type}</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <div className="text-sm font-bold text-slate-800">{selectedNode.label}</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedNode.id}</div>
            </div>

            {/* Metadata Properties Table */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 space-y-1.5">
              {Object.entries(selectedNode.details || {}).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500 capitalize">{key.replace('_', ' ')}:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {val === null || val === undefined ? '—' : String(val)}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-slate-500 italic">
              Tip: Click and drag nodes on the canvas to customize topology layout.
            </div>
          </div>
        )}
      </div>

      {/* Cypher Script Modal */}
      {cypherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold text-xs">
                  Neo4j
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Declarative Cypher Export</h3>
                  <p className="text-[10px] text-slate-500">
                    Schema constraints, nodes, and typed clinical relationship statements
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCypherModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {cypherLoading ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Generating Cypher statements…
              </div>
            ) : cypherData ? (
              <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>
                    Statements: <strong>{cypherData.statements.length}</strong> (Nodes: {cypherData.nodes_count}, Edges: {cypherData.edges_count})
                  </span>
                  <button
                    onClick={copyCypherText}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    {copiedCypher ? '✓ Copied!' : 'Copy Script'}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] text-slate-200 border border-slate-800">
                  <pre className="whitespace-pre-wrap">{cypherData.cypher_script}</pre>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setCypherModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
