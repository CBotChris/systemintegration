import { useState, useEffect, useRef, useCallback } from "react";

const INITIAL_SYSTEMS = [
  { id: "erp", name: "ERP System", color: "#e74c3c", x: 400, y: 250 },
  { id: "crm", name: "CRM", color: "#3498db", x: 200, y: 150 },
  { id: "webshop", name: "Webshop", color: "#2ecc71", x: 620, y: 150 },
  { id: "bi", name: "BI / Rapportering", color: "#f39c12", x: 400, y: 430 },
  { id: "wms", name: "WMS / Lager", color: "#9b59b6", x: 650, y: 380 },
  { id: "email", name: "Email Platform", color: "#1abc9c", x: 160, y: 360 },
];

const INITIAL_CONNECTIONS = [
  { from: "erp", to: "crm", direction: "both" },
  { from: "erp", to: "webshop", direction: "from" },
  { from: "erp", to: "bi", direction: "to" },
  { from: "erp", to: "wms", direction: "both" },
  { from: "crm", to: "email", direction: "from" },
  { from: "webshop", to: "wms", direction: "to" },
];

const DIRECTIONS = [
  { value: "from", label: "→ Fra → Til" },
  { value: "to", label: "← Til ← Fra" },
  { value: "both", label: "↔ Begge veje" },
];

const COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#e91e63","#00bcd4","#8bc34a"];

function autoLayout(systems) {
  const count = systems.length;
  return systems.map((s, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const rx = Math.min(300, 90 + count * 26);
    const ry = Math.min(190, 70 + count * 16);
    return { ...s, x: 420 + rx * Math.cos(angle), y: 280 + ry * Math.sin(angle) };
  });
}

// Follow directed dataflow chains from a given node
// Returns sets of upstream and downstream nodes following connection directions
function getFlowChain(id, connections) {
  // Downstream: nodes this system feeds data INTO
  const downstream = new Set();
  const qDown = [id];
  while (qDown.length) {
    const cur = qDown.shift();
    connections.forEach(c => {
      let next = null;
      if (c.from === cur && (c.direction === "from" || c.direction === "both")) next = c.to;
      if (c.to === cur && (c.direction === "to" || c.direction === "both")) next = c.from;
      if (next && !downstream.has(next) && next !== id) { downstream.add(next); qDown.push(next); }
    });
  }

  // Upstream: nodes that feed data INTO this system
  const upstream = new Set();
  const qUp = [id];
  while (qUp.length) {
    const cur = qUp.shift();
    connections.forEach(c => {
      let prev = null;
      if (c.to === cur && (c.direction === "from" || c.direction === "both")) prev = c.from;
      if (c.from === cur && (c.direction === "to" || c.direction === "both")) prev = c.to;
      if (prev && !upstream.has(prev) && prev !== id) { upstream.add(prev); qUp.push(prev); }
    });
  }

  // Direct neighbours (1st degree, any direction)
  const direct = new Set();
  connections.forEach(c => {
    if (c.from === id) direct.add(c.to);
    if (c.to === id) direct.add(c.from);
  });

  const all = new Set([...upstream, ...downstream]);
  return { upstream, downstream, direct, all };
}

function getNodeRadius(id, connections) {
  const count = connections.filter(c => c.from === id || c.to === id).length;
  return Math.max(22, Math.min(38, 20 + count * 4));
}

export default function App() {
  const [systems, setSystems] = useState(INITIAL_SYSTEMS);
  const [connections, setConnections] = useState(INITIAL_CONNECTIONS);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState("overview");
  const [newSys, setNewSys] = useState({ name: "", color: COLORS[0] });
  const [newConn, setNewConn] = useState({ from: "", to: "", direction: "from" });
  const [dragging, setDragging] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [toast, setToast] = useState(null);
  const [editingConn, setEditingConn] = useState(null); // index of connection being edited
  const svgRef = useRef();
  const fileInputRef = useRef();

  useEffect(() => {
    if (window.XLSX) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(script);
  }, []);

  // On first load: localStorage first, then check for shared JSON override
  useEffect(() => {
    // Always load localStorage first so personal work is never lost
    try {
      const s = localStorage.getItem("si_systems");
      const c = localStorage.getItem("si_connections");
      if (s) setSystems(JSON.parse(s));
      if (c) setConnections(JSON.parse(c));
    } catch {}

    // Then check if a shared JSON file exists — if so, it overrides (for colleagues)
    // Only override if localStorage is empty (first time visitor)
    const hasLocal = !!localStorage.getItem("si_systems");
    if (!hasLocal) {
      fetch("./systemintegration.json?t=" + Date.now())
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(({ systems: s, connections: c }) => {
          if (Array.isArray(s) && Array.isArray(c)) {
            setSystems(s); setConnections(c);
          }
        })
        .catch(() => {})
        .finally(() => setDataLoaded(true));
    } else {
      setDataLoaded(true);
    }
  }, []);

  // Auto-save to localStorage whenever data changes
  useEffect(() => {
    try { localStorage.setItem("si_systems", JSON.stringify(systems)); } catch {}
  }, [systems]);

  useEffect(() => {
    try { localStorage.setItem("si_connections", JSON.stringify(connections)); } catch {}
  }, [connections]);

  const exportJSON = () => {
    const data = JSON.stringify({ systems, connections }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "systemintegration.json"; a.click();
    showToast("success", "Gemt! Upload systemintegration.json til GitHub for at dele med andre.");
    URL.revokeObjectURL(url);
  };

  const importJSONRef = useRef();

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { systems: s, connections: c } = JSON.parse(ev.target.result);
        if (Array.isArray(s) && Array.isArray(c)) {
          setSystems(s); setConnections(c);
          setSelected(null); setPanel("overview");
          showToast("success", "Kort indlæst.");
        } else { showToast("error", "Ugyldigt filformat."); }
      } catch { showToast("error", "Kunne ikke læse filen."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const resetToDefault = () => {
    if (!window.confirm("Nulstil til eksempeldata? Dit nuværende kort slettes.")) return;
    setSystems(INITIAL_SYSTEMS); setConnections(INITIAL_CONNECTIONS);
    setSelected(null); setPanel("overview");
    showToast("success", "Nulstillet til eksempeldata.");
  };

  const chain = selected ? getFlowChain(selected, connections) : null;
  const getSystem = (id) => systems.find((s) => s.id === id);

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleMouseDown = useCallback((e, id) => {
    e.stopPropagation();
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    const sys = systems.find(s => s.id === id);
    setDragging(id);
    setOffset({ x: svgP.x - sys.x, y: svgP.y - sys.y });
  }, [systems]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    setSystems(prev => prev.map(s => s.id === dragging ? { ...s, x: svgP.x - offset.x, y: svgP.y - offset.y } : s));
  }, [dragging, offset]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  const addSystem = () => {
    if (!newSys.name.trim()) return;
    const id = newSys.name.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
    setSystems(prev => [...prev, { id, name: newSys.name.trim(), color: newSys.color, x: 200 + Math.random() * 400, y: 150 + Math.random() * 250 }]);
    setNewSys({ name: "", color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    setPanel("overview");
  };

  const addConnection = () => {
    if (!newConn.from || !newConn.to || newConn.from === newConn.to) return;
    const exists = connections.find(c => (c.from === newConn.from && c.to === newConn.to) || (c.from === newConn.to && c.to === newConn.from));
    if (exists) return;
    setConnections(prev => [...prev, { ...newConn }]);
    setNewConn({ from: "", to: "", direction: "from" });
    setPanel("overview");
  };

  const deleteSystem = (id) => {
    setSystems(prev => prev.filter(s => s.id !== id));
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
    if (selected === id) { setSelected(null); setPanel("overview"); }
  };

  const deleteConnection = (idx) => {
    setConnections(prev => prev.filter((_, i) => i !== idx));
    setEditingConn(null);
  };

  const updateConnectionDirection = (idx, direction) => {
    setConnections(prev => prev.map((c, i) => i === idx ? { ...c, direction } : c));
    setEditingConn(null);
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file || !window.XLSX) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const XLSX = window.XLSX;
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const sysSheet = wb.Sheets["Systemer"];
        if (!sysSheet) { showToast("error", "Arket 'Systemer' ikke fundet."); return; }
        const sysRows = XLSX.utils.sheet_to_json(sysSheet, { defval: "" });
        let colorIdx = 0;
        const newSystems = sysRows
          .filter(r => String(r["System ID *"] || r["System ID"] || r["ID"] || "").trim() && String(r["Systemnavn *"] || r["Systemnavn"] || r["Navn"] || "").trim())
          .map(r => ({
            id: String(r["System ID *"] || r["System ID"] || r["ID"] || "").trim(),
            name: String(r["Systemnavn *"] || r["Systemnavn"] || r["Navn"] || "").trim(),
            color: /^#[0-9a-fA-F]{6}$/.test(String(r["Farve (hex)"] || "").trim()) ? String(r["Farve (hex)"]).trim() : COLORS[colorIdx++ % COLORS.length],
            x: 0, y: 0,
          }));
        if (newSystems.length === 0) { showToast("error", "Ingen gyldige systemer fundet."); return; }
        const connSheet = wb.Sheets["Forbindelser"];
        const newConns = [];
        if (connSheet) {
          const sysIds = new Set(newSystems.map(s => s.id));
          XLSX.utils.sheet_to_json(connSheet, { defval: "" }).forEach(r => {
            const from = String(r["Fra System ID *"] || r["Fra System ID"] || r["Fra System (ID)"] || "").trim();
            const to = String(r["Til System ID *"] || r["Til System ID"] || r["Til System (ID)"] || "").trim();
            const dir = String(r["Retning *"] || r["Retning"] || "").trim().toLowerCase();
            if (from && to && from !== to && sysIds.has(from) && sysIds.has(to) && ["from","to","both"].includes(dir))
              if (!newConns.find(c => (c.from === from && c.to === to) || (c.from === to && c.to === from)))
                newConns.push({ from, to, direction: dir });
          });
        }
        setSystems(autoLayout(newSystems));
        setConnections(newConns);
        setSelected(null); setPanel("overview");
        showToast("success", `Importeret ${newSystems.length} systemer og ${newConns.length} forbindelser.`);
      } catch { showToast("error", "Kunne ikke læse filen."); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const renderArrow = (c, idx) => {
    const from = getSystem(c.from);
    const to = getSystem(c.to);
    if (!from || !to) return null;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;
    const nx = dx / len, ny = dy / len;
    const rFrom = getNodeRadius(c.from, connections);
    const rTo = getNodeRadius(c.to, connections);
    // Pull line ends back extra so arrowhead sits just outside the bubble
    const arrowGap = 7;
    const x1 = from.x + nx * (rFrom + arrowGap);
    const y1 = from.y + ny * (rFrom + arrowGap);
    const x2 = to.x - nx * (rTo + arrowGap);
    const y2 = to.y - ny * (rTo + arrowGap);

    let isHighlighted = false;
    if (selected) {
      const involvedInChain = chain.all.has(c.from) || chain.all.has(c.to) || c.from === selected || c.to === selected;
      isHighlighted = involvedInChain;
    }
    const isDimmed = selected && !isHighlighted;

    // Color-code by direction when not dimmed
    const baseColor = c.direction === "both" ? "#7c6fff" : c.direction === "from" ? "#2ecc71" : "#3498db";
    const color = isDimmed ? "#1e1e2e" : isHighlighted ? baseColor : baseColor;
    const opacity = isDimmed ? 0.08 : isHighlighted ? 1 : 0.55;
    const strokeW = isHighlighted ? 3 : 2;

    // Larger markers for better visibility
    const mSize = 10;
    const mId = `m-${idx}`;
    const mIdR = `mr-${idx}`;

    return (
      <g key={idx} opacity={opacity}>
        <defs>
          <marker id={mId} markerWidth={mSize} markerHeight={mSize} refX={mSize - 1} refY={mSize / 2} orient="auto" markerUnits="userSpaceOnUse">
            <path d={`M0,1 L0,${mSize - 1} L${mSize},${mSize / 2} z`} fill={color} />
          </marker>
          <marker id={mIdR} markerWidth={mSize} markerHeight={mSize} refX={1} refY={mSize / 2} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d={`M0,1 L0,${mSize - 1} L${mSize},${mSize / 2} z`} fill={color} />
          </marker>
        </defs>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeW}
          markerEnd={c.direction === "from" || c.direction === "both" ? `url(#${mId})` : undefined}
          markerStart={c.direction === "to" || c.direction === "both" ? `url(#${mIdR})` : undefined} />
      </g>
    );
  };

  const renderNode = (s) => {
    const isSelected = selected === s.id;
    const inChain = chain?.all.has(s.id);
    const isUpstream = chain?.upstream.has(s.id);
    const isDownstream = chain?.downstream.has(s.id);
    const isDirect = chain?.direct.has(s.id);
    const isDimmed = selected && !isSelected && !inChain;
    const hasNoConnections = !connections.some(c => c.from === s.id || c.to === s.id);
    const r = getNodeRadius(s.id, connections);

    let opacity = 1;
    if (isDimmed) opacity = 0.1;
    else if (!selected && hasNoConnections) opacity = 0.4;

    const ringColor = isSelected ? "#fff" : isUpstream ? "#3498db" : isDownstream ? "#2ecc71" : isDirect ? s.color : null;
    const ringWidth = isSelected ? 3 : 2;

    return (
      <g key={s.id} transform={`translate(${s.x},${s.y})`}
        style={{ cursor: dragging ? "grabbing" : "pointer", userSelect: "none", transition: "opacity 0.2s" }}
        onMouseDown={(e) => handleMouseDown(e, s.id)}
        onClick={(e) => { e.stopPropagation(); setSelected(s.id === selected ? null : s.id); setPanel(s.id === selected ? "overview" : "detail"); setEditingConn(null); }}
        opacity={opacity}>
        {(isSelected || inChain) && <circle r={r + 10} fill={s.color} opacity={0.12} />}
        {ringColor && <circle r={r + 4} fill="none" stroke={ringColor} strokeWidth={ringWidth} opacity={0.9} />}
        <circle r={r} fill={isDimmed ? "#0d0d1a" : s.color} stroke="#0d0d1a" strokeWidth={2} />
        <text textAnchor="middle" dy="0.35em" fill="#fff" fontSize={Math.max(7, r * 0.34)} fontWeight="700" fontFamily="'DM Sans', sans-serif" style={{ pointerEvents: "none" }}>
          {s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name}
        </text>
      </g>
    );
  };

  const btnStyle = (active) => ({
    background: active ? "#7c6fff" : "transparent",
    border: `1px solid ${active ? "#7c6fff" : "#2a2a4a"}`,
    color: active ? "#fff" : "#888",
    padding: "7px 13px", borderRadius: 8, cursor: "pointer",
    fontSize: 12, fontFamily: "'DM Sans'", transition: "all 0.15s"
  });

  const dirSymbol = (dir, fromId, toId) => {
    if (dir === "both") return "↔";
    if (dir === "from") return "→";
    return "←";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a18", color: "#e0e0ff", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: toast.type === "success" ? "#0f2a1a" : "#2a0f0f", border: `1px solid ${toast.type === "success" ? "#2ecc71" : "#e74c3c"}`, color: toast.type === "success" ? "#2ecc71" : "#e74c3c", padding: "10px 20px", borderRadius: 10, fontSize: 13, pointerEvents: "none" }}>{toast.text}</div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #1a1a3a", display: "flex", alignItems: "center", gap: 10, background: "#0d0d22", flexWrap: "wrap" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#7c6fff", boxShadow: "0 0 10px #7c6fff" }} />
        <span style={{ fontFamily: "'Space Mono'", fontSize: 13, letterSpacing: 3, color: "#7c6fff", textTransform: "uppercase" }}>Systemintegration</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setPanel(panel === "add-system" ? "overview" : "add-system")} style={btnStyle(panel === "add-system")}>+ System</button>
        <button onClick={() => { setNewConn(p => ({ ...p, from: panel === "add-connection" ? "" : (selected || p.from) })); setPanel(panel === "add-connection" ? "overview" : "add-connection"); }} style={btnStyle(panel === "add-connection")}>+ Forbindelse</button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileImport} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} style={btnStyle(false)}>↑ Excel</button>
        <input ref={importJSONRef} type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
        <button onClick={exportJSON} style={btnStyle(false)} title="Gem kort som JSON-fil">↓ Gem</button>
        <button onClick={() => importJSONRef.current?.click()} style={btnStyle(false)} title="Indlæs gemt JSON-fil">↑ Indlæs</button>
        <button onClick={resetToDefault} style={{ ...btnStyle(false), color: "#e74c3c55", borderColor: "#e74c3c22" }} title="Nulstil til eksempeldata">↺</button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 290, background: "#0d0d22", borderRight: "1px solid #1a1a3a", overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ADD SYSTEM */}
          {panel === "add-system" && (
            <div style={{ background: "#13132a", borderRadius: 12, padding: 16, border: "1px solid #2a2a4a" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7c6fff", marginBottom: 12, letterSpacing: 1 }}>NYT SYSTEM</div>
              <input placeholder="Systemnavn..." value={newSys.name} onChange={e => setNewSys(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && addSystem()}
                style={{ width: "100%", background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {COLORS.map(c => <div key={c} onClick={() => setNewSys(p => ({ ...p, color: c }))} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: newSys.color === c ? "2px solid #fff" : "2px solid transparent" }} />)}
              </div>
              <button onClick={addSystem} style={{ width: "100%", background: "#7c6fff", border: "none", color: "#fff", padding: "9px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Tilføj</button>
            </div>
          )}

          {/* ADD CONNECTION */}
          {panel === "add-connection" && (
            <div style={{ background: "#13132a", borderRadius: 12, padding: 16, border: "1px solid #2a2a4a" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7c6fff", marginBottom: 12, letterSpacing: 1 }}>NY FORBINDELSE</div>
              {["from", "to"].map(field => (
                <div key={field} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{field === "from" ? "Fra system" : "Til system"}</div>
                  <select value={newConn[field]} onChange={e => setNewConn(p => ({ ...p, [field]: e.target.value }))}
                    style={{ width: "100%", background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}>
                    <option value="">Vælg...</option>
                    {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Retning</div>
                {(() => {
                  const fromName = systems.find(s => s.id === newConn.from)?.name;
                  const toName = systems.find(s => s.id === newConn.to)?.name;
                  const dynDirs = [
                    { value: "from", label: fromName && toName ? `${fromName} → ${toName}` : "→ Fra → Til" },
                    { value: "to",   label: fromName && toName ? `${toName} → ${fromName}` : "← Til ← Fra" },
                    { value: "both", label: fromName && toName ? `${fromName} ↔ ${toName}` : "↔ Begge veje" },
                  ];
                  return (
                    <select value={newConn.direction} onChange={e => setNewConn(p => ({ ...p, direction: e.target.value }))}
                      style={{ width: "100%", background: "#1a1a3a", border: "1px solid #2a2a5a", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13, boxSizing: "border-box" }}>
                      {dynDirs.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  );
                })()}
              </div>
              <button onClick={addConnection} style={{ width: "100%", background: "#7c6fff", border: "none", color: "#fff", padding: "9px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Tilføj</button>
            </div>
          )}

          {/* DETAIL */}
          {panel === "detail" && selected && (() => {
            const sys = getSystem(selected);
            if (!sys) return null;
            const myConns = connections.map((c, i) => ({ ...c, idx: i })).filter(c => c.from === selected || c.to === selected);
            const upstream = [...(chain?.upstream || [])];
            const downstream = [...(chain?.downstream || [])];
            return (
              <div>
                <button onClick={() => { setSelected(null); setPanel("overview"); setEditingConn(null); }} style={{ background: "none", border: "none", color: "#7c6fff", cursor: "pointer", fontSize: 12, marginBottom: 12, padding: 0 }}>← Tilbage</button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: sys.color, flexShrink: 0 }} />
                  <input
                    value={sys.name}
                    onChange={e => setSystems(prev => prev.map(s => s.id === selected ? { ...s, name: e.target.value } : s))}
                    style={{ fontWeight: 700, fontSize: 15, background: "transparent", border: "none", borderBottom: "1px solid #2a2a5a", color: "#e0e0ff", outline: "none", flex: 1, padding: "2px 0", fontFamily: "'DM Sans', sans-serif" }}
                    onFocus={e => e.target.style.borderBottomColor = "#7c6fff"}
                    onBlur={e => e.target.style.borderBottomColor = "#2a2a5a"}
                  />
                </div>

                {/* Upstream */}
                {upstream.length > 0 && <>
                  <div style={{ fontSize: 10, color: "#3498db", letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>MODTAGER DATA FRA ({upstream.length})</div>
                  {upstream.map(id => {
                    const s = getSystem(id);
                    return s ? (
                      <div key={id} onClick={() => setSelected(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 8, background: "#0d1a2a", marginBottom: 4, cursor: "pointer", border: "1px solid #1a2a3a" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
                        <span style={{ flex: 1, fontSize: 12 }}>{s.name}</span>
                        <span style={{ color: "#3498db", fontSize: 12 }}>→</span>
                      </div>
                    ) : null;
                  })}
                </>}

                {/* Downstream */}
                {downstream.length > 0 && <>
                  <div style={{ fontSize: 10, color: "#2ecc71", letterSpacing: 1, fontWeight: 700, marginTop: 10, marginBottom: 6 }}>SENDER DATA TIL ({downstream.length})</div>
                  {downstream.map(id => {
                    const s = getSystem(id);
                    return s ? (
                      <div key={id} onClick={() => setSelected(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 8, background: "#0a1a0a", marginBottom: 4, cursor: "pointer", border: "1px solid #1a2a1a" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
                        <span style={{ flex: 1, fontSize: 12 }}>{s.name}</span>
                        <span style={{ color: "#2ecc71", fontSize: 12 }}>→</span>
                      </div>
                    ) : null;
                  })}
                </>}

                {/* Connections — editable */}
                <div style={{ fontSize: 10, color: "#7c6fff", letterSpacing: 1, fontWeight: 700, marginTop: 14, marginBottom: 6 }}>FORBINDELSER — klik for at redigere</div>
                {myConns.length === 0 && <div style={{ color: "#444", fontSize: 12 }}>Ingen forbindelser</div>}
                {myConns.map((c) => {
                  const other = getSystem(c.from === selected ? c.to : c.from);
                  const dir = c.direction === "both" ? "↔" : c.from === selected ? "→" : "←";
                  const isEditing = editingConn === c.idx;
                  return other ? (
                    <div key={c.idx} style={{ marginBottom: 6 }}>
                      <div onClick={() => setEditingConn(isEditing ? null : c.idx)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: isEditing ? "#1a1a3a" : "#13132a", border: `1px solid ${isEditing ? "#7c6fff" : "#1a1a3a"}`, cursor: "pointer", fontSize: 12, transition: "all 0.15s" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: other.color, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{other.name}</span>
                        <span style={{ color: "#7c6fff", fontWeight: 700, fontSize: 14 }}>{dir}</span>
                        <span style={{ color: "#444", fontSize: 10 }}>✎</span>
                      </div>
                      {isEditing && (
                        <div style={{ background: "#0f0f22", border: "1px solid #2a2a5a", borderRadius: 8, padding: 10, marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>Vælg retning:</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                            {DIRECTIONS.map(d => (
                              <button key={d.value} onClick={() => updateConnectionDirection(c.idx, d.value)}
                                style={{ background: c.direction === d.value ? "#7c6fff" : "#1a1a3a", border: `1px solid ${c.direction === d.value ? "#7c6fff" : "#2a2a5a"}`, color: c.direction === d.value ? "#fff" : "#aaa", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, textAlign: "left" }}>
                                {d.label}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => deleteConnection(c.idx)}
                            style={{ width: "100%", background: "transparent", border: "1px solid #e74c3c44", color: "#e74c3c", padding: "6px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                            Slet forbindelse
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null;
                })}

                <button onClick={() => deleteSystem(selected)} style={{ marginTop: 16, width: "100%", background: "transparent", border: "1px solid #e74c3c33", color: "#e74c3c", padding: "7px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Slet system</button>
              </div>
            );
          })()}

          {/* OVERVIEW */}
          {panel === "overview" && (
            <div>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, marginBottom: 12 }}>SYSTEMER ({systems.length})</div>
              {systems.map(s => {
                const connCount = connections.filter(c => c.from === s.id || c.to === s.id).length;
                return (
                  <div key={s.id} onClick={() => { setSelected(s.id); setPanel("detail"); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, marginBottom: 5, cursor: "pointer", background: "#13132a", border: "1px solid #1a1a3a", transition: "border-color 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = s.color}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#1a1a3a"}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: "#555" }}>{connCount} links</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative" }}>
          <svg ref={svgRef} width="100%" height="100%" style={{ display: "block", minHeight: 520 }}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onClick={() => { if (!dragging) { setSelected(null); setPanel("overview"); setEditingConn(null); } }}>
            <defs>
              <radialGradient id="bg" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#111130" />
                <stop offset="100%" stopColor="#0a0a18" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#bg)" />
            {Array.from({ length: 20 }).map((_, i) =>
              Array.from({ length: 14 }).map((_, j) => (
                <circle key={`${i}-${j}`} cx={i * 50} cy={j * 50} r={1} fill="#ffffff06" />
              ))
            )}
            {connections.map((c, i) => renderArrow(c, i))}
            {systems.map(s => renderNode(s))}
          </svg>

          {/* Legend */}
          <div style={{ position: "absolute", bottom: 16, right: 16, background: "#0d0d22dd", borderRadius: 10, padding: "10px 14px", border: "1px solid #1a1a3a", fontSize: 11, color: "#777" }}>
            <div style={{ marginBottom: 6, color: "#444", letterSpacing: 1 }}>LEGENDE</div>
            {[["→", "Envejs ud", "#2ecc71"], ["←", "Envejs ind", "#3498db"], ["↔", "Bidirektionel", "#7c6fff"]].map(([sym, label, col]) => (
              <div key={sym} style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", color: col, width: 14 }}>{sym}</span>
                <span>{label}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, color: "#333", borderTop: "1px solid #1a1a3a", paddingTop: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #3498db" }} />
                <span>Sender data hertil</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #2ecc71" }} />
                <span>Modtager data herfra</span>
              </div>
            </div>
            <div style={{ marginTop: 6, color: "#333" }}>Træk noder for at flytte</div>
          </div>
          {selected && <div style={{ position: "absolute", top: 12, left: 12, background: "#0d0d22cc", borderRadius: 8, padding: "6px 12px", border: "1px solid #7c6fff44", fontSize: 11, color: "#7c6fff" }}>Klik på lærredet for at fravælge</div>}
        </div>
      </div>
    </div>
  );
}
