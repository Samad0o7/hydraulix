const g = 9.81;

const state = {
  nodes: [],
  links: [],
  selected: null, // {type: 'node'|'link', id}
  activeTab: "inputs",
  drag: null,
  lastRun: null,
  phase2: { network: null, weir: null, sensitivity: null },
  phase3: { calibration: null, uncertainty: null, dynamic: null, scenarios: [], comparisons: null, versions: [], approvals: [] },
};

const fittingCatalog = [
  { key: "entrance_square", label: "Entrance (square)", K: 0.5 },
  { key: "entrance_rounded", label: "Entrance (rounded)", K: 0.2 },
  { key: "exit", label: "Exit", K: 1.0 },
  { key: "elbow_45", label: "Elbow 45°", K: 0.35 },
  { key: "elbow_90", label: "Elbow 90°", K: 0.9 },
  { key: "tee_run", label: "Tee (run)", K: 0.6 },
  { key: "tee_branch", label: "Tee (branch)", K: 1.8 },
  { key: "gate_valve", label: "Gate valve", K: 0.15 },
  { key: "butterfly_valve", label: "Butterfly valve", K: 0.25 },
  { key: "globe_valve", label: "Globe valve", K: 10.0 },
  { key: "check_valve", label: "Check valve", K: 2.5 },
  { key: "contraction", label: "Contraction", K: 0.45 },
  { key: "expansion", label: "Expansion", K: 1.0 },
  { key: "reducer", label: "Reducer", K: 0.3 },
  { key: "orifice_restriction", label: "Orifice/restriction", K: 2.4 },
];

const el = {
  canvas: document.getElementById("canvas"),
  linkLayer: document.getElementById("linkLayer"),
  resultBody: document.querySelector("#resultTable tbody"),
  chart: document.getElementById("profileChart"),
  addNodeBtn: document.getElementById("addNodeBtn"),
  addWeirNodeBtn: document.getElementById("addWeirNodeBtn"),
  addPipeBtn: document.getElementById("addPipeBtn"),
  seedBtn: document.getElementById("seedBtn"),
  clearBtn: document.getElementById("clearBtn"),
  runBtn: document.getElementById("runBtn"),
  calcDirection: document.getElementById("calcDirection"),
  flow: document.getElementById("flow"),
  boundarySwl: document.getElementById("boundarySwl"),
  alpha: document.getElementById("alpha"),
  tabInputs: document.getElementById("tab-inputs"),
  tabResults: document.getElementById("tab-results"),
  tabNotes: document.getElementById("tab-notes"),
  tabButtons: [...document.querySelectorAll(".tab-btn")],
  runNetworkBtn: document.getElementById("runNetworkBtn"),
  runWeirBtn: document.getElementById("runWeirBtn"),
  runSensitivityBtn: document.getElementById("runSensitivityBtn"),
  exportReportBtn: document.getElementById("exportReportBtn"),
  phase2Output: document.getElementById("phase2Output"),
  weirB: document.getElementById("weirB"),
  weirH: document.getElementById("weirH"),
  weirCd: document.getElementById("weirCd"),
  sensPct: document.getElementById("sensPct"),
  runCalibrationBtn: document.getElementById("runCalibrationBtn"),
  runUncertaintyBtn: document.getElementById("runUncertaintyBtn"),
  saveScenarioBtn: document.getElementById("saveScenarioBtn"),
  compareScenariosBtn: document.getElementById("compareScenariosBtn"),
  saveVersionBtn: document.getElementById("saveVersionBtn"),
  requestApprovalBtn: document.getElementById("requestApprovalBtn"),
  runDynamicBtn: document.getElementById("runDynamicBtn"),
  phase3Output: document.getElementById("phase3Output"),
  dynamicChart: document.getElementById("dynamicChart"),
  obsSwl: document.getElementById("obsSwl"),
  mcSamples: document.getElementById("mcSamples"),
  flowStdPct: document.getElementById("flowStdPct"),
  roughStdPct: document.getElementById("roughStdPct"),
  userRole: document.getElementById("userRole"),
  approvalStatus: document.getElementById("approvalStatus"),
  dynHours: document.getElementById("dynHours"),
  dynStepMin: document.getElementById("dynStepMin"),
  dynPeakFactor: document.getElementById("dynPeakFactor"),
  dynTopNodes: document.getElementById("dynTopNodes"),
};


const API_BASE = window.HYDRAULIX_API_BASE || "http://127.0.0.1:8000";

async function postJson(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

function toBackendNodes(nodes) {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    x: n.x,
    y: n.y,
    invert: n.invert,
    toc: n.toc,
    swl: n.swl,
    demand: Number(n.demand || 0),
    storage_area: Number(n.storageArea || 800),
    external_inflow: Number(n.externalInflow || 0),
    node_type: n.nodeType || "junction",
    equipment: n.nodeType === "weir"
      ? {
          crest_level: Number(n.equipment?.crestLevel ?? (n.invert + 0.8)),
          width: Number(n.equipment?.width ?? 1.2),
          cd: Number(n.equipment?.cd ?? 0.62),
          normal_operation: Boolean(n.equipment?.normalOperation ?? true),
          hydraulic_break: Boolean(n.equipment?.hydraulicBreak ?? true),
        }
      : null,
  }));
}

function toBackendLinks(links) {
  return links.map((l) => ({
    id: l.id,
    name: l.name,
    from_id: l.fromId,
    to_id: l.toId,
    segments: l.segments.map((seg) => ({
      length: Number(seg.length),
      diameter: Number(seg.diameter),
      flow_type: seg.flowType,
      manning_n: Number(seg.manningN),
      hazen_c: Number(seg.hazenC),
      dummy_loss: Number(seg.dummyLoss || 0),
      fittings: { values: { ...seg.fittingsCount } },
    })),
  }));
}

function fromBackendProfile(profile) {
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
  return {
    nodeResults: profile.node_results.map((r) => {
      const base = nodeById.get(r.id);
      return {
        ...r,
        nodeId: base?.nodeId || r.id,
        invert: base?.invert ?? 0,
        toc: base?.toc ?? 0,
        hydraulicBreakApplied: r.hydraulic_break_applied,
      };
    }),
    linkResults: profile.link_results.map((l) => ({
      id: l.id,
      name: l.name,
      hTotal: l.h_total,
      segmentResults: l.segment_results.map((s) => ({
        hf: s.hf,
        hm: s.hm,
        hTotal: s.h_total,
        method: s.method,
      })),
    })),
  };
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatNodeId(seq) {
  return `N${String(seq).padStart(3, "0")}`;
}

function emptyFittingsCount() {
  const counts = {};
  for (const fit of fittingCatalog) counts[fit.key] = 0;
  return counts;
}

function makeSegment(length = 100, diameter = 0.25, flowType = "pressure") {
  return {
    id: uid("s"),
    length,
    diameter,
    flowType,
    manningN: 0.013,
    hazenC: 130,
    material: "DI",
    dummyLoss: 0,
    fittingsCount: emptyFittingsCount(),
  };
}

function totalLinkLength(link) {
  return link.segments.reduce((sum, seg) => sum + (Number(seg.length) || 0), 0);
}

function addNode(name, x, y, invert = 100, toc = 104, swl = null, nodeType = "junction") {
  const seq = state.nodes.length + 1;
  const node = {
    id: uid("n"),
    nodeId: formatNodeId(seq),
    name,
    x,
    y,
    invert,
    toc,
    swl,
    demand: 0,
    nodeType,
    equipment: {
      type: nodeType === "weir" ? "weir" : null,
      crestLevel: invert + 0.8,
      width: 1.2,
      cd: 0.62,
      normalOperation: true,
      hydraulicBreak: nodeType === "weir",
    },
    storageArea: 800,
    externalInflow: 0,
    notes: "",
  };
  state.nodes.push(node);
  state.selected = { type: "node", id: node.id };
  render();
}

function addLink(fromId, toId, name = null) {
  if (!fromId || !toId || fromId === toId) return;
  const link = {
    id: uid("l"),
    name: name || `L${state.links.length + 1}`,
    fromId,
    toId,
    segments: [makeSegment(100, 0.25, "pressure")],
    notes: "",
  };
  state.links.push(link);
  state.selected = { type: "link", id: link.id };
  render();
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  el.tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
}

function seedDemo() {
  state.nodes = [];
  state.links = [];

  addNode("Buffer tank Tk001", 40, 120, 100, 104, null, "junction");
  addNode("Junction JN002", 300, 170, 99.6, 103.8, null, "junction");
  addNode("Weir WR003", 520, 135, 99.3, 103.3, null, "weir");
  addNode("Outfall OF004", 760, 155, 99.0, 103.0, null, "junction");

  addLink(state.nodes[0].id, state.nodes[1].id, "L1");
  const l1 = state.links.at(-1);
  l1.segments = [
    makeSegment(50, 0.25, "pressure"),
    makeSegment(25, 0.125, "pressure"),
    makeSegment(25, 0.0625, "pressure"),
  ];
  l1.segments[0].material = "DN10";
  l1.segments[1].material = "DN5";
  l1.segments[2].material = "DN2.5";
  l1.segments[0].fittingsCount.entrance_square = 1;
  l1.segments[1].fittingsCount.tee_branch = 1;
  l1.segments[1].fittingsCount.reducer = 1;
  l1.segments[2].fittingsCount.exit = 1;

  addLink(state.nodes[1].id, state.nodes[2].id, "L2");
  const l2 = state.links.at(-1);
  l2.segments = [makeSegment(80, 0.2, "open")];
  l2.segments[0].material = "RC200";

  addLink(state.nodes[2].id, state.nodes[3].id, "L3");
  const l3 = state.links.at(-1);
  l3.segments = [makeSegment(120, 0.25, "open")];
  l3.segments[0].material = "DI250";

  state.selected = { type: "node", id: state.nodes[2].id };
  render();
}

function nodeCenter(node) {
  return { x: node.x + 60, y: node.y + 36 };
}

function pairKey(a, b) {
  return [a, b].sort().join("::");
}

function getLinkSiblings(link) {
  return state.links.filter((l) => pairKey(l.fromId, l.toId) === pairKey(link.fromId, link.toId));
}

function linkOffset(link) {
  const siblings = getLinkSiblings(link);
  const index = siblings.findIndex((s) => s.id === link.id);
  return (index - (siblings.length - 1) / 2) * 16;
}

function drawNodes() {
  el.canvas.innerHTML = "";
  for (const n of state.nodes) {
    const node = document.createElement("div");
    node.className = `node ${state.selected?.type === "node" && state.selected.id === n.id ? "selected" : ""}`;
    node.style.left = `${n.x}px`;
    node.style.top = `${n.y}px`;
    node.dataset.id = n.id;
    node.innerHTML = `<strong>${n.nodeId}</strong>
      <small>${n.name}</small>
      <small>Type: ${n.nodeType}</small>
      <small>Invert: ${n.invert.toFixed(2)} m</small>
      <small>TOC: ${n.toc.toFixed(2)} m</small>`;

    node.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.selected = { type: "node", id: n.id };
      renderInspector();
      drawNodes();
      renderLinks();
    });

    node.addEventListener("mousedown", (ev) => {
      state.drag = { id: n.id, dx: ev.offsetX, dy: ev.offsetY };
    });

    el.canvas.appendChild(node);
  }
}

window.addEventListener("mousemove", (ev) => {
  if (!state.drag) return;
  const rect = el.canvas.getBoundingClientRect();
  const node = state.nodes.find((n) => n.id === state.drag.id);
  if (!node) return;
  node.x = Math.max(0, Math.min(rect.width - 120, ev.clientX - rect.left - state.drag.dx));
  node.y = Math.max(0, Math.min(rect.height - 72, ev.clientY - rect.top - state.drag.dy));
  drawNodes();
  renderLinks();
});

window.addEventListener("mouseup", () => {
  state.drag = null;
});

function renderLinks() {
  const rect = el.canvas.getBoundingClientRect();
  el.linkLayer.setAttribute("viewBox", `0 0 ${rect.width || 900} ${rect.height || 370}`);
  el.linkLayer.innerHTML = "";

  for (const l of state.links) {
    const from = state.nodes.find((n) => n.id === l.fromId);
    const to = state.nodes.find((n) => n.id === l.toId);
    if (!from || !to) continue;

    const a = nodeCenter(from);
    const b = nodeCenter(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const off = linkOffset(l);

    const x1 = a.x + nx * off;
    const y1 = a.y + ny * off;
    const x2 = b.x + nx * off;
    const y2 = b.y + ny * off;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", state.selected?.type === "link" && state.selected.id === l.id ? "#0059c9" : "#6f819a");
    line.setAttribute("stroke-width", "3");
    line.style.cursor = "pointer";
    line.addEventListener("click", () => {
      state.selected = { type: "link", id: l.id };
      renderInspector();
      renderLinks();
      drawNodes();
    });
    el.linkLayer.appendChild(line);
  }
}

function fittingCountEditor(segment, segIdx) {
  return fittingCatalog
    .map(
      (fit) => `<label>${fit.label} (K=${fit.K})
          <input data-fitcount="${fit.key}" data-segidx="${segIdx}" type="number" min="0" step="1" value="${segment.fittingsCount[fit.key] || 0}" />
        </label>`
    )
    .join("");
}

function renderInspectorInputs() {
  if (!state.selected) {
    el.tabInputs.innerHTML = `<p class="subtle">Select a node or link to edit inputs.</p>`;
    return;
  }

  if (state.selected.type === "node") {
    const n = state.nodes.find((x) => x.id === state.selected.id);
    if (!n) return;
    el.tabInputs.innerHTML = `<div class="inspector-card">
      <strong>${n.nodeId} — ${n.name}</strong>
      <div class="grid">
        <label>Node Name<input data-node-key="name" value="${n.name}" /></label>
        <label>Node Type
          <select data-node-key="nodeType">
            <option value="junction" ${n.nodeType === "junction" ? "selected" : ""}>Junction</option>
            <option value="weir" ${n.nodeType === "weir" ? "selected" : ""}>Weir / equipment</option>
          </select>
        </label>
        <label>Invert (m)<input data-node-key="invert" type="number" step="0.01" value="${n.invert}" /></label>
        <label>TOC (m)<input data-node-key="toc" type="number" step="0.01" value="${n.toc}" /></label>
        <label>SWL Initial (m)<input data-node-key="swl" type="number" step="0.01" value="${n.swl ?? ""}" /></label>
        <label>Node Demand (m³/s)<input data-node-key="demand" type="number" step="0.001" value="${n.demand ?? 0}" /></label>
        <label>Storage area (m²)<input data-node-key="storageArea" type="number" step="1" min="1" value="${n.storageArea ?? 800}" /></label>
        <label>External inflow base (m³/s)<input data-node-key="externalInflow" type="number" step="0.001" value="${n.externalInflow ?? 0}" /></label>
      </div>
      ${n.nodeType === "weir" ? `<div class="inspector-card"><strong>Weir equipment controls (hydraulic break)</strong>
        <div class="grid">
          <label>Crest level (m)<input data-weir-key="crestLevel" type="number" step="0.01" value="${n.equipment.crestLevel}" /></label>
          <label>Width b (m)<input data-weir-key="width" type="number" step="0.01" min="0.01" value="${n.equipment.width}" /></label>
          <label>Discharge coeff C_d<input data-weir-key="cd" type="number" step="0.01" min="0.1" value="${n.equipment.cd}" /></label>
          <label>Normal operation<input data-weir-check="normalOperation" type="checkbox" ${n.equipment.normalOperation ? "checked" : ""} /></label>
          <label>Hydraulic break<input data-weir-check="hydraulicBreak" type="checkbox" ${n.equipment.hydraulicBreak ? "checked" : ""} /></label>
        </div>
      </div>` : ""}
    </div>`;

    el.tabInputs.querySelectorAll("input[data-node-key], select[data-node-key]").forEach((inp) => {
      inp.addEventListener("input", (ev) => {
        const key = ev.target.dataset.nodeKey;
        if (key === "name" || key === "nodeType") {
          n[key] = ev.target.value;
          if (key === "nodeType" && n.nodeType === "weir") {
            n.equipment.type = "weir";
            n.equipment.hydraulicBreak = true;
          }
          if (key === "nodeType" && n.nodeType !== "weir") {
            n.equipment.type = null;
          }
        } else if (key === "swl") n[key] = ev.target.value === "" ? null : Number(ev.target.value);
        else n[key] = Number(ev.target.value);
        drawNodes();
        renderLinks();
        renderInspectorInputs();
      });
    });

    el.tabInputs.querySelectorAll("input[data-weir-key]").forEach((inp) => {
      inp.addEventListener("input", (ev) => {
        const key = ev.target.dataset.weirKey;
        n.equipment[key] = Number(ev.target.value);
      });
    });
    el.tabInputs.querySelectorAll("input[data-weir-check]").forEach((inp) => {
      inp.addEventListener("change", (ev) => {
        const key = ev.target.dataset.weirCheck;
        n.equipment[key] = ev.target.checked;
      });
    });
    return;
  }

  const l = state.links.find((x) => x.id === state.selected.id);
  if (!l) return;
  const from = state.nodes.find((n) => n.id === l.fromId)?.name || "?";
  const to = state.nodes.find((n) => n.id === l.toId)?.name || "?";

  el.tabInputs.innerHTML = `<div class="inspector-card">
    <strong>Link ${l.name}: ${from} → ${to}</strong>
    <div class="grid">
      <label>Link Name<input data-link-key="name" value="${l.name}" /></label>
      <label>Total Length (m)<input value="${totalLinkLength(l).toFixed(2)}" disabled /></label>
    </div>
    <p class="subtle">Headloss is calculated for each segment (length + diameter + fittings) and summed for this connection.</p>
    <div class="controls"><button id="addSegmentBtn">Add Segment</button></div>
    <div id="segmentEditorWrap"></div>
  </div>`;

  const segWrap = el.tabInputs.querySelector("#segmentEditorWrap");
  segWrap.innerHTML = l.segments
    .map(
      (seg, idx) => `<div class="inspector-card segment-card">
        <strong>Segment ${idx + 1}</strong>
        <div class="grid">
          <label>Length (m)<input data-seg-key="length" data-segidx="${idx}" type="number" step="0.1" value="${seg.length}"/></label>
          <label>Diameter D (m)<input data-seg-key="diameter" data-segidx="${idx}" type="number" step="0.001" value="${seg.diameter}"/></label>
          <label>Flow Regime
            <select data-seg-key="flowType" data-segidx="${idx}">
              <option value="pressure" ${seg.flowType === "pressure" ? "selected" : ""}>Pressure (Hazen-Williams)</option>
              <option value="open" ${seg.flowType === "open" ? "selected" : ""}>Open channel (Manning)</option>
            </select>
          </label>
          <label>Manning n<input data-seg-key="manningN" data-segidx="${idx}" type="number" step="0.001" value="${seg.manningN}"/></label>
          <label>Hazen C<input data-seg-key="hazenC" data-segidx="${idx}" type="number" step="1" value="${seg.hazenC}"/></label>
          <label>Dummy loss h (m)<input data-seg-key="dummyLoss" data-segidx="${idx}" type="number" step="0.01" value="${seg.dummyLoss}"/></label>
          <label>Material<input data-seg-key="material" data-segidx="${idx}" value="${seg.material}"/></label>
        </div>
        <details>
          <summary>Fittings and quantity</summary>
          <div class="grid">${fittingCountEditor(seg, idx)}</div>
        </details>
        <div class="controls"><button data-remove-seg="${idx}" ${l.segments.length === 1 ? "disabled" : ""}>Remove Segment</button></div>
      </div>`
    )
    .join("");

  el.tabInputs.querySelector("#addSegmentBtn").addEventListener("click", () => {
    l.segments.push(makeSegment(10, l.segments.at(-1)?.diameter || 0.25, l.segments.at(-1)?.flowType || "pressure"));
    renderInspectorInputs();
    renderLinks();
  });

  el.tabInputs.querySelectorAll("input[data-link-key]").forEach((inp) => {
    inp.addEventListener("input", (ev) => {
      const key = ev.target.dataset.linkKey;
      l[key] = ev.target.value;
      renderLinks();
    });
  });

  el.tabInputs.querySelectorAll("input[data-seg-key], select[data-seg-key]").forEach((inp) => {
    inp.addEventListener("input", (ev) => {
      const segIdx = Number(ev.target.dataset.segidx);
      const key = ev.target.dataset.segKey;
      const seg = l.segments[segIdx];
      if (!seg) return;
      if (["material", "flowType"].includes(key)) seg[key] = ev.target.value;
      else seg[key] = Number(ev.target.value);
      renderLinks();
      if (key === "length") renderInspectorInputs();
    });
  });

  el.tabInputs.querySelectorAll("input[data-fitcount]").forEach((inp) => {
    inp.addEventListener("input", (ev) => {
      const segIdx = Number(ev.target.dataset.segidx);
      const fitKey = ev.target.dataset.fitcount;
      const seg = l.segments[segIdx];
      if (!seg) return;
      seg.fittingsCount[fitKey] = Math.max(0, Number(ev.target.value) || 0);
    });
  });

  el.tabInputs.querySelectorAll("button[data-remove-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeSeg);
      if (l.segments.length <= 1) return;
      l.segments.splice(idx, 1);
      renderInspectorInputs();
      renderLinks();
    });
  });
}

function renderInspectorResults() {
  if (!state.selected) {
    el.tabResults.innerHTML = `<p class="subtle">No item selected.</p>`;
    return;
  }

  if (!state.lastRun) {
    el.tabResults.innerHTML = `<p class="subtle">Run calculation to populate results for selected item.</p>`;
    return;
  }

  if (state.selected.type === "node") {
    const r = state.lastRun.nodeResults.find((x) => x.id === state.selected.id);
    el.tabResults.innerHTML = r
      ? `<div class="inspector-card"><strong>${r.name} results</strong><p>Chainage: ${r.chainage.toFixed(2)} m</p><p>SWL: ${r.swl.toFixed(3)} m</p><p>Freeboard: ${r.freeboard.toFixed(3)} m</p><p>Hydraulic break: ${r.hydraulicBreakApplied ? "Yes" : "No"}</p><p>HGL: ${r.hgl.toFixed(3)} m</p><p>EGL: ${r.egl.toFixed(3)} m</p></div>`
      : `<p class="subtle">Selected node is not in latest run result.</p>`;
    return;
  }

  const rr = state.lastRun.linkResults.find((x) => x.id === state.selected.id);
  if (!rr) {
    el.tabResults.innerHTML = `<p class="subtle">Selected link may not be in current profile chain.</p>`;
    return;
  }

  const segRows = rr.segmentResults
    .map(
      (seg, i) => `<tr><td>Seg ${i + 1}</td><td>${seg.method}</td><td>${seg.hf.toFixed(3)}</td><td>${seg.hm.toFixed(3)}</td><td>${seg.hTotal.toFixed(3)}</td></tr>`
    )
    .join("");

  el.tabResults.innerHTML = `<div class="inspector-card"><strong>${rr.name} results</strong>
    <p>Total loss: ${rr.hTotal.toFixed(3)} m</p>
    <table id="segmentResultTable"><thead><tr><th>Segment</th><th>Method</th><th>hf</th><th>hm</th><th>Total</th></tr></thead><tbody>${segRows}</tbody></table>
  </div>`;
}

function renderInspectorNotes() {
  if (!state.selected) {
    el.tabNotes.innerHTML = `<p class="subtle">No item selected.</p>`;
    return;
  }
  const collection = state.selected.type === "node" ? state.nodes : state.links;
  const item = collection.find((x) => x.id === state.selected.id);
  if (!item) return;

  el.tabNotes.innerHTML = `<label>Notes<textarea id="notesField" rows="10" placeholder="Design notes, assumptions, checks...">${item.notes || ""}</textarea></label>`;
  document.getElementById("notesField").addEventListener("input", (ev) => {
    item.notes = ev.target.value;
  });
}

function renderInspector() {
  renderInspectorInputs();
  renderInspectorResults();
  renderInspectorNotes();
  setActiveTab(state.activeTab);
}

function areaCirc(d) {
  return Math.PI * (d ** 2) / 4;
}

function totalKValue(fittingsCount) {
  return fittingCatalog.reduce((sum, fit) => sum + (fittingsCount[fit.key] || 0) * fit.K, 0);
}

function frictionLossSegment(segment, Q) {
  const A = areaCirc(segment.diameter);
  const v = Q / A;
  let hf;
  let method;

  if (segment.flowType === "open") {
    const R = segment.diameter / 4;
    const slope = ((Q * segment.manningN) / (A * (R ** (2 / 3)))) ** 2;
    hf = slope * segment.length;
    method = "Manning";
  } else {
    hf = 10.67 * segment.length * (Q ** 1.852) / ((segment.hazenC ** 1.852) * (segment.diameter ** 4.87));
    method = "Hazen-Williams";
  }

  const hm = totalKValue(segment.fittingsCount) * (v ** 2) / (2 * g);
  return { hf, hm, v, method, hTotal: hf + hm + segment.dummyLoss };
}

function frictionLossLink(link, Q) {
  const segmentResults = link.segments.map((seg) => frictionLossSegment(seg, Q));
  const hTotal = segmentResults.reduce((sum, seg) => sum + seg.hTotal, 0);
  return { hTotal, segmentResults };
}

function sortProfileNodes() {
  return [...state.nodes].sort((a, b) => a.x - b.x);
}

function linksBetween(a, b) {
  return state.links.filter((l) => (l.fromId === a && l.toId === b) || (l.fromId === b && l.toId === a));
}

function pairRepresentativeDistance(links) {
  if (!links.length) return 0;
  // For parallel links between same nodes, use the longest physical run as chainage basis.
  return Math.max(...links.map((l) => totalLinkLength(l)));
}

async function runProfile() {
  if (state.nodes.length < 2 || state.links.length < 1) {
    alert("Add at least two nodes and one link.");
    return;
  }

  const req = {
    nodes: toBackendNodes(state.nodes),
    links: toBackendLinks(state.links),
    flow_q: Number(el.flow.value),
    alpha: Number(el.alpha.value),
    direction: el.calcDirection.value,
    boundary_swl: Number(el.boundarySwl.value),
  };

  try {
    const profile = await postJson("/profile", req);
    const result = fromBackendProfile(profile);
    state.lastRun = result;
    renderResults(result.nodeResults);
    renderInspectorResults();
  } catch (err) {
    // Fallback for environments where Python API dependencies are unavailable.
    try {
      const local = computeProfileRun({
        Q: Number(el.flow.value),
        alpha: Number(el.alpha.value),
        direction: el.calcDirection.value,
        boundary: Number(el.boundarySwl.value),
        links: state.links,
      });
      state.lastRun = local;
      renderResults(local.nodeResults);
      renderInspectorResults();
      setPhase2Output({ warning: err.message, fallback: "local-profile" }, "Backend unavailable; used local profile fallback");
    } catch (fallbackErr) {
      alert(fallbackErr.message || err.message || "Profile run failed");
    }
  }
}

function renderResults(results) {
  el.resultBody.innerHTML = results
    .map(
      (r) => `<tr>
      <td>${r.nodeId}</td>
      <td>${r.name}</td>
      <td>${r.chainage.toFixed(2)}</td>
      <td>${r.invert.toFixed(2)}</td>
      <td>${r.toc.toFixed(2)}</td>
      <td>${r.swl.toFixed(3)}</td>
      <td>${r.freeboard.toFixed(3)}</td>
      <td>${r.hydraulicBreakApplied ? "Yes" : "No"}</td>
      <td>${r.hgl.toFixed(3)}</td>
      <td>${r.egl.toFixed(3)}</td>
    </tr>`
    )
    .join("");
  drawChart(results);
}

function drawChart(rows) {
  const ctx = el.chart.getContext("2d");
  const W = el.chart.width;
  const H = el.chart.height;
  ctx.clearRect(0, 0, W, H);

  const pad = { l: 50, r: 12, t: 12, b: 26 };
  const allY = rows.flatMap((r) => [r.invert, r.toc, r.swl, r.egl]);
  const ymin = Math.min(...allY) - 0.5;
  const ymax = Math.max(...allY) + 0.5;
  const xPix = (x) => pad.l + (x / (rows.length - 1 || 1)) * (W - pad.l - pad.r);
  const yPix = (y) => H - pad.b - ((y - ymin) / (ymax - ymin || 1)) * (H - pad.t - pad.b);

  ctx.strokeStyle = "#c8d1df";
  ctx.strokeRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);

  let legendIdx = 0;
  const plot = (series, color, label) => {
    ctx.beginPath();
    series.forEach((y, i) => {
      const x = xPix(i);
      const yy = yPix(y);
      i === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(pad.l + 8, pad.t + 8 + legendIdx * 16, 12, 3);
    ctx.fillStyle = "#222";
    ctx.fillText(label, pad.l + 26, pad.t + 12 + legendIdx * 16);
    legendIdx += 1;
  };

  ctx.font = "12px Arial";
  plot(rows.map((r) => r.invert), "#7f8b9b", "Invert");
  plot(rows.map((r) => r.toc), "#333", "TOC");
  plot(rows.map((r) => r.swl), "#0077cc", "SWL/HGL");
  plot(rows.map((r) => r.egl), "#c23b22", "EGL");

  rows.forEach((r, i) => ctx.fillText(r.name, xPix(i) - 8, H - 8));
}



function setPhase2Output(obj, title = "Phase 2") {
  el.phase2Output.textContent = `${title}
${JSON.stringify(obj, null, 2)}`;
}


function setPhase3Output(obj, title = "Phase 3") {
  el.phase3Output.textContent = `${title}
${JSON.stringify(obj, null, 2)}`;
}

function cloneLinks() {
  return JSON.parse(JSON.stringify(state.links));
}

function weirControlledSwl(node, Q) {
  const eq = node.equipment || {};
  const crest = Number(eq.crestLevel ?? node.invert + 0.8);
  const cd = Math.max(0.1, Number(eq.cd ?? 0.62));
  const b = Math.max(0.01, Number(eq.width ?? 1.2));
  const H = Math.max(0, (Q / ((2 / 3) * cd * b * Math.sqrt(2 * g))) ** (2 / 3));
  return crest + H;
}

function applyHydraulicBreak(nodeRow, Q) {
  if (nodeRow.nodeType !== "weir") return false;
  const eq = nodeRow.equipment || {};
  if (!eq.normalOperation || !eq.hydraulicBreak) return false;
  nodeRow.swl = weirControlledSwl(nodeRow, Q);
  return true;
}

function computeProfileRun({ Q, alpha, direction, boundary, links, nodesOverride = null }) {
  const nodes = (nodesOverride ? [...nodesOverride] : sortProfileNodes()).sort((a, b) => a.x - b.x);
  const nodeMap = new Map(nodes.map((n) => [n.id, { ...n, swl: Number.isFinite(n.swl) ? n.swl : null, hgl: null, egl: null, hydraulicBreakApplied: false }]));
  const linkResults = [];
  const pairSegments = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].id;
    const b = nodes[i + 1].id;
    const segLinks = links.filter((l) => (l.fromId === a && l.toId === b) || (l.fromId === b && l.toId === a));
    if (!segLinks.length) {
      throw new Error("Profile calculation expects contiguous connection between neighboring nodes by horizontal order.");
    }
    pairSegments.push({ i, links: segLinks });
  }

  const velHead = (d) => {
    const A = areaCirc(d);
    const v = Q / A;
    return alpha * (v ** 2) / (2 * g);
  };

  const pairLoss = (segLinks) => {
    let total = 0;
    for (const link of segLinks) {
      const r = frictionLossLink(link, Q);
      total += r.hTotal;
      linkResults.push({ id: link.id, name: link.name, ...r });
    }
    return total;
  };

  if (direction === "forward") {
    nodeMap.get(nodes[0].id).swl = boundary;
    for (const seg of pairSegments) {
      const up = nodeMap.get(nodes[seg.i].id);
      const dn = nodeMap.get(nodes[seg.i + 1].id);
      if (applyHydraulicBreak(up, Q)) up.hydraulicBreakApplied = true;
      const predicted = up.swl - pairLoss(seg.links);
      const dnBroken = applyHydraulicBreak(dn, Q);
      dn.swl = dnBroken ? dn.swl : predicted;
      if (dnBroken) dn.hydraulicBreakApplied = true;
    }
  } else {
    nodeMap.get(nodes.at(-1).id).swl = boundary;
    for (let k = pairSegments.length - 1; k >= 0; k--) {
      const seg = pairSegments[k];
      const dn = nodeMap.get(nodes[seg.i + 1].id);
      const up = nodeMap.get(nodes[seg.i].id);
      if (applyHydraulicBreak(dn, Q)) dn.hydraulicBreakApplied = true;
      const predicted = dn.swl + pairLoss(seg.links);
      const upBroken = applyHydraulicBreak(up, Q);
      up.swl = upBroken ? up.swl : predicted;
      if (upBroken) up.hydraulicBreakApplied = true;
    }
  }

  let chainage = 0;
  for (let i = 0; i < nodes.length; i++) {
    const row = nodeMap.get(nodes[i].id);
    if (i > 0) chainage += pairRepresentativeDistance(pairSegments[i - 1].links);
    row.chainage = chainage;
    row.hgl = row.swl;
    const d = pairSegments[Math.max(0, i - 1)]?.links[0]?.segments[0]?.diameter || pairSegments[0].links[0].segments[0].diameter;
    row.egl = row.hgl + velHead(d);
    row.freeboard = row.toc - row.swl;
  }

  return { nodeResults: nodes.map((n) => nodeMap.get(n.id)), linkResults };
}

function headlossForQ(link, Qabs) {
  return frictionLossLink(link, Math.max(Qabs, 1e-9)).hTotal;
}

function solveLinkFlowForHeadDiff(link, deltaH) {
  const sign = deltaH >= 0 ? 1 : -1;
  const target = Math.abs(deltaH);
  let low = 0;
  let high = 0.1;
  while (headlossForQ(link, high) < target && high < 500) {
    high *= 2;
  }
  if (high >= 500 && headlossForQ(link, high) < target) {
    return sign * high;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const hmid = headlossForQ(link, mid);
    if (hmid > target) high = mid;
    else low = mid;
  }
  return sign * ((low + high) / 2);
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    }
    if (Math.abs(M[piv][i]) < 1e-12) continue;
    [M[i], M[piv]] = [M[piv], M[i]];
    const d = M[i][i];
    for (let c = i; c <= n; c++) M[i][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
}

function runNetworkSolver() {
  if (!state.nodes.length || !state.links.length) return;
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
  const fixed = state.nodes.filter((n) => Number.isFinite(n.swl));
  if (!fixed.length) {
    const first = state.nodes[0];
    first.swl = Number(el.boundarySwl.value);
  }
  const unknown = state.nodes.filter((n) => !Number.isFinite(n.swl));
  const heads = new Map(state.nodes.map((n) => [n.id, Number.isFinite(n.swl) ? n.swl : n.toc - 0.5]));

  const residual = () => {
    const f = [];
    for (const n of unknown) {
      let bal = 0;
      for (const l of state.links) {
        const hFrom = heads.get(l.fromId);
        const hTo = heads.get(l.toId);
        const q = solveLinkFlowForHeadDiff(l, hFrom - hTo);
        if (l.toId === n.id) bal += q;
        if (l.fromId === n.id) bal -= q;
      }
      bal -= Number(n.demand || 0);
      f.push(bal);
    }
    return f;
  };

  let iter = 0;
  let f = residual();
  while (iter < 25) {
    const norm = Math.sqrt(f.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-6) break;
    const J = Array.from({ length: unknown.length }, () => Array(unknown.length).fill(0));
    const baseHeads = new Map(heads);
    for (let j = 0; j < unknown.length; j++) {
      const id = unknown[j].id;
      const eps = 1e-4;
      heads.set(id, baseHeads.get(id) + eps);
      const fp = residual();
      for (let i = 0; i < unknown.length; i++) {
        J[i][j] = (fp[i] - f[i]) / eps;
      }
      heads.set(id, baseHeads.get(id));
    }
    const dx = solveLinearSystem(J, f.map((x) => -x));
    unknown.forEach((n, i) => heads.set(n.id, heads.get(n.id) + 0.8 * dx[i]));
    f = residual();
    iter += 1;
  }

  const linkFlows = state.links.map((l) => {
    const q = solveLinkFlowForHeadDiff(l, heads.get(l.fromId) - heads.get(l.toId));
    return { id: l.id, name: l.name, flow: q, from: nodeById.get(l.fromId).nodeId, to: nodeById.get(l.toId).nodeId };
  });

  state.phase2.network = {
    iterations: iter,
    nodeHeads: state.nodes.map((n) => ({ nodeId: n.nodeId, name: n.name, head: heads.get(n.id) })),
    linkFlows,
  };
  setPhase2Output(state.phase2.network, "Network solver result");
}

async function runWeirCalculation() {
  try {
    const payload = {
      cd: Number(el.weirCd.value),
      width: Number(el.weirB.value),
      head: Number(el.weirH.value),
    };
    const res = await postJson("/weir", payload);
    state.phase2.weir = { ...payload, Q: res.discharge_q };
    setPhase2Output(state.phase2.weir, "Weir result (Python backend)");
  } catch (err) {
    const cd = Number(el.weirCd.value);
    const b = Number(el.weirB.value);
    const h = Number(el.weirH.value);
    const q = (2 / 3) * cd * b * Math.sqrt(2 * g) * (h ** 1.5);
    state.phase2.weir = { cd, width: b, head: h, Q: q, fallback: true };
    setPhase2Output(state.phase2.weir, "Weir result (local fallback)");
  }
}

function runSensitivity() {
  const pct = Number(el.sensPct.value) / 100;
  const Q = Number(el.flow.value);
  const ranking = state.links.map((l) => {
    const base = frictionLossLink(l, Q).hTotal;
    const mod = JSON.parse(JSON.stringify(l));
    mod.segments.forEach((s) => { s.diameter *= (1 - pct); });
    const stressed = frictionLossLink(mod, Q).hTotal;
    return { link: l.name, baseLoss: base, stressedLoss: stressed, delta: stressed - base, pctIncrease: base ? ((stressed - base) / base) * 100 : 0 };
  }).sort((a, b) => b.delta - a.delta);
  state.phase2.sensitivity = { diameterDecreasePct: pct * 100, bottlenecks: ranking };
  setPhase2Output(state.phase2.sensitivity, "Sensitivity & bottleneck ranking");
}

function exportReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    profile: state.lastRun,
    phase2: state.phase2,
    nodes: state.nodes,
    links: state.links,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hydraulix-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setPhase2Output({ status: "exported", filename: a.download }, "Report export");
}



function runCalibration() {
  const obs = Number(el.obsSwl.value);
  const candidates = [0.7, 0.85, 1.0, 1.15, 1.3];
  let best = null;

  for (const mult of candidates) {
    const links = cloneLinks();
    links.forEach((l) => l.segments.forEach((seg) => {
      seg.hazenC = seg.hazenC * mult;
      seg.manningN = seg.manningN / Math.max(mult, 1e-6);
    }));

    try {
      const result = computeProfileRun({
        Q: Number(el.flow.value),
        alpha: Number(el.alpha.value),
        direction: el.calcDirection.value,
        boundary: Number(el.boundarySwl.value),
        links,
      });
      const pred = result.nodeResults.at(-1).swl;
      const err = Math.abs(pred - obs);
      if (!best || err < best.error) {
        best = { multiplier: mult, predictedDownstreamSwl: pred, observedDownstreamSwl: obs, error: err };
      }
    } catch (_) {}
  }

  state.phase3.calibration = best;
  setPhase3Output(best || { error: "Calibration failed" }, "Calibration result");
}

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function runUncertainty() {
  const samples = Math.max(20, Number(el.mcSamples.value));
  const flowStd = Number(el.flowStdPct.value) / 100;
  const roughStd = Number(el.roughStdPct.value) / 100;
  const baseQ = Number(el.flow.value);
  const values = [];

  for (let i = 0; i < samples; i++) {
    const q = Math.max(1e-4, baseQ * (1 + flowStd * randn()));
    const links = cloneLinks();
    links.forEach((l) => l.segments.forEach((seg) => {
      const r = 1 + roughStd * randn();
      seg.hazenC = Math.max(20, seg.hazenC * r);
      seg.manningN = Math.max(0.008, seg.manningN * r);
    }));

    try {
      const res = computeProfileRun({
        Q: q,
        alpha: Number(el.alpha.value),
        direction: el.calcDirection.value,
        boundary: Number(el.boundarySwl.value),
        links,
      });
      values.push(res.nodeResults.at(-1).swl);
    } catch (_) {}
  }

  if (!values.length) {
    setPhase3Output({ error: "Uncertainty run failed" }, "Uncertainty result");
    return;
  }

  values.sort((a, b) => a - b);
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  const p5 = values[Math.floor(0.05 * (values.length - 1))];
  const p95 = values[Math.floor(0.95 * (values.length - 1))];
  state.phase3.uncertainty = { samples: values.length, meanDownstreamSwl: mean, p5, p95 };
  setPhase3Output(state.phase3.uncertainty, "Uncertainty result");
}

function saveScenarioSnapshot() {
  const snapshot = {
    id: `SCN-${state.phase3.scenarios.length + 1}`,
    name: `Scenario ${state.phase3.scenarios.length + 1}`,
    timestamp: new Date().toISOString(),
    flow: Number(el.flow.value),
    boundarySwl: Number(el.boundarySwl.value),
    direction: el.calcDirection.value,
    profile: state.lastRun,
  };
  state.phase3.scenarios.push(snapshot);
  setPhase3Output(snapshot, "Scenario saved");
}

function compareScenarios() {
  if (state.phase3.scenarios.length < 2) {
    setPhase3Output({ warning: "Save at least 2 scenarios first." }, "Scenario comparison");
    return;
  }
  const base = state.phase3.scenarios.at(-2);
  const cur = state.phase3.scenarios.at(-1);
  const baseDn = base.profile?.nodeResults?.at(-1)?.swl;
  const curDn = cur.profile?.nodeResults?.at(-1)?.swl;
  const cmp = {
    base: base.id,
    current: cur.id,
    downstreamSwlBase: baseDn,
    downstreamSwlCurrent: curDn,
    deltaDownstreamSwl: (curDn ?? 0) - (baseDn ?? 0),
  };
  state.phase3.comparisons = cmp;
  setPhase3Output(cmp, "Scenario comparison");
}



function drawDynamicChart(dynamicResult) {
  const canvas = el.dynamicChart;
  if (!canvas || !dynamicResult || !dynamicResult.timesHr?.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const pad = { l: 52, r: 16, t: 12, b: 28 };
  const times = dynamicResult.timesHr;
  const series = dynamicResult.trackedNodes;
  const allY = series.flatMap((n) => n.swlSeries);
  const ymin = Math.min(...allY) - 0.2;
  const ymax = Math.max(...allY) + 0.2;
  const xPix = (x) => pad.l + (x / (times.at(-1) || 1)) * (W - pad.l - pad.r);
  const yPix = (y) => H - pad.b - ((y - ymin) / (ymax - ymin || 1)) * (H - pad.t - pad.b);

  ctx.strokeStyle = "#c8d1df";
  ctx.strokeRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);

  const colors = ["#0059c9", "#c23b22", "#1b8a3b", "#6f42c1", "#0f766e", "#a16207"];
  ctx.font = "12px Arial";
  series.forEach((nodeSeries, idx) => {
    ctx.beginPath();
    nodeSeries.swlSeries.forEach((y, i) => {
      const x = xPix(times[i]);
      const yy = yPix(y);
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    });
    ctx.strokeStyle = colors[idx % colors.length];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fillRect(pad.l + 8, pad.t + 8 + idx * 15, 10, 3);
    ctx.fillStyle = "#222";
    ctx.fillText(`${nodeSeries.nodeId} ${nodeSeries.name}`, pad.l + 24, pad.t + 11 + idx * 15);
  });

  ctx.fillStyle = "#222";
  ctx.fillText("Time (hr)", W / 2 - 25, H - 8);
}

async function runDynamicSimulation() {
  if (state.nodes.length < 2 || state.links.length < 1) {
    setPhase3Output({ error: "Need at least two nodes and one link." }, "Dynamic simulation");
    return;
  }

  try {
    const req = {
      nodes: toBackendNodes(state.nodes),
      links: toBackendLinks(state.links),
      base_flow_q: Number(el.flow.value),
      alpha: Number(el.alpha.value),
      direction: el.calcDirection.value,
      boundary_swl: Number(el.boundarySwl.value),
      duration_hours: Number(el.dynHours.value),
      dt_minutes: Number(el.dynStepMin.value),
      storm_peak_factor: Number(el.dynPeakFactor.value),
    };

    const res = await postJson("/dynamic", req);
    const topNodes = Math.max(1, Number(el.dynTopNodes.value));
    const ranked = [...res.node_series]
      .map((n) => ({ ...n, max_swl: Math.max(...n.swl) }))
      .sort((a, b) => b.max_swl - a.max_swl)
      .slice(0, topNodes);

    const idToNode = new Map(state.nodes.map((n) => [n.id, n]));
    const trackedNodes = ranked.map((n) => ({
      nodeId: idToNode.get(n.id)?.nodeId || n.id,
      name: n.name,
      maxSwl: n.max_swl,
      floodTimeHr: n.flood_time_hr,
      swlSeries: n.swl,
    }));

    const summary = {
      durationHr: res.duration_hours,
      dtMin: res.dt_minutes,
      floodedNodes: trackedNodes
        .filter((n) => n.floodTimeHr !== null)
        .map((n) => ({ nodeId: n.nodeId, timeHr: n.floodTimeHr })),
      trackedNodes,
    };

    state.phase3.dynamic = summary;
    setPhase3Output(summary, "Dynamic SWL / flooding simulation (Python backend)");
    drawDynamicChart({ timesHr: ranked[0]?.times_hr || [], trackedNodes });
  } catch (err) {
    // Local fallback dynamic simulation (same continuity-style logic used previously in UI).
    try {
      const durationHr = Number(el.dynHours.value);
      const dtMin = Number(el.dynStepMin.value);
      const peak = Number(el.dynPeakFactor.value);
      const topNodes = Math.max(1, Number(el.dynTopNodes.value));
      const dtSec = dtMin * 60;
      const steps = Math.max(1, Math.floor((durationHr * 60) / dtMin));
      const baseQ = Number(el.flow.value);
      const current = new Map(state.nodes.map((n) => [n.id, Number.isFinite(n.swl) ? n.swl : n.invert + 1]));
      const series = new Map(state.nodes.map((n) => [n.id, []]));
      const floodAt = new Map(state.nodes.map((n) => [n.id, null]));
      const timesHr = [];

      for (let k = 0; k <= steps; k++) {
        const tHr = (k * dtMin) / 60;
        timesHr.push(tHr);
        const stormShape = Math.sin(Math.PI * (tHr / durationHr));
        const factor = 1 + Math.max(0, stormShape) * (peak - 1);
        const q = baseQ * factor;
        const nodesOverride = state.nodes.map((n) => ({ ...n, swl: current.get(n.id) }));
        const profile = computeProfileRun({
          Q: q,
          alpha: Number(el.alpha.value),
          direction: el.calcDirection.value,
          boundary: Number(el.boundarySwl.value),
          links: state.links,
          nodesOverride,
        });
        const byId = new Map(profile.nodeResults.map((r) => [r.id, r]));
        for (const n of state.nodes) {
          const target = byId.get(n.id).swl;
          const area = Math.max(1, Number(n.storageArea || 800));
          const extIn = Number(n.externalInflow || 0) * factor;
          const tau = 1800;
          const dsStorage = (extIn / area) * dtSec;
          const dsHydraulic = ((target - current.get(n.id)) / tau) * dtSec;
          const next = current.get(n.id) + dsStorage + dsHydraulic;
          current.set(n.id, next);
          series.get(n.id).push(next);
          if (floodAt.get(n.id) === null && next >= n.toc) floodAt.set(n.id, tHr);
        }
      }

      const ranked = state.nodes
        .map((n) => ({ n, maxSwl: Math.max(...series.get(n.id)) }))
        .sort((a, b) => b.maxSwl - a.maxSwl)
        .slice(0, topNodes);

      const trackedNodes = ranked.map(({ n, maxSwl }) => ({
        nodeId: n.nodeId,
        name: n.name,
        maxSwl,
        floodTimeHr: floodAt.get(n.id),
        swlSeries: series.get(n.id),
      }));

      const summary = {
        durationHr,
        dtMin,
        floodedNodes: trackedNodes.filter((x) => x.floodTimeHr !== null).map((x) => ({ nodeId: x.nodeId, timeHr: x.floodTimeHr })),
        trackedNodes,
        fallback: true,
      };
      state.phase3.dynamic = summary;
      setPhase3Output({ warning: err.message, ...summary }, "Dynamic SWL / flooding simulation (local fallback)");
      drawDynamicChart({ timesHr, trackedNodes });
    } catch (fallbackErr) {
      setPhase3Output({ error: fallbackErr.message || err.message || "Dynamic API failed" }, "Dynamic simulation");
    }
  }
}

function saveVersion() {
  const version = {
    version: `v${state.phase3.versions.length + 1}`,
    timestamp: new Date().toISOString(),
    userRole: el.userRole.value,
    summary: {
      nodes: state.nodes.length,
      links: state.links.length,
      scenarios: state.phase3.scenarios.length,
    },
  };
  state.phase3.versions.push(version);
  setPhase3Output(version, "Version saved");
}

function requestApproval() {
  const approval = {
    id: `APR-${state.phase3.approvals.length + 1}`,
    requestedAt: new Date().toISOString(),
    role: el.userRole.value,
    status: el.approvalStatus.value,
    latestVersion: state.phase3.versions.at(-1)?.version || null,
  };
  state.phase3.approvals.push(approval);
  setPhase3Output(approval, "Approval workflow");
}

function render() {
  drawNodes();
  renderLinks();
  renderInspector();
}

el.canvas.addEventListener("click", () => {
  state.selected = null;
  renderInspector();
  drawNodes();
  renderLinks();
});

el.addNodeBtn.addEventListener("click", () => {
  const i = state.nodes.length + 1;
  addNode(`Node ${String(i).padStart(3, "0")}`, 30 + i * 130, 95 + (i % 2) * 55, 100 - i * 0.2, 104 - i * 0.2, null, "junction");
});

el.addWeirNodeBtn.addEventListener("click", () => {
  const i = state.nodes.length + 1;
  addNode(`Weir ${String(i).padStart(3, "0")}`, 30 + i * 130, 95 + (i % 2) * 55, 100 - i * 0.2, 104 - i * 0.2, null, "weir");
});

el.addPipeBtn.addEventListener("click", () => {
  if (state.nodes.length < 2) return;
  const from = prompt("From node ID or name?", "N001");
  const to = prompt("To node ID or name?", "N002");
  const name = prompt("Link name?", `L${state.links.length + 1}`);
  const fromN = state.nodes.find((n) => n.name === from || n.nodeId === from);
  const toN = state.nodes.find((n) => n.name === to || n.nodeId === to);
  addLink(fromN?.id, toN?.id, name);
});

el.seedBtn.addEventListener("click", seedDemo);
el.clearBtn.addEventListener("click", () => {
  state.nodes = [];
  state.links = [];
  state.selected = null;
  state.lastRun = null;
  state.phase2 = { network: null, weir: null, sensitivity: null };
  state.phase3 = { calibration: null, uncertainty: null, dynamic: null, scenarios: [], comparisons: null, versions: [], approvals: [] };
  el.phase2Output.textContent = "Phase 2 output will appear here.";
  el.phase3Output.textContent = "Phase 3 output will appear here.";
  const dctx = el.dynamicChart?.getContext("2d");
  if (dctx) dctx.clearRect(0, 0, el.dynamicChart.width, el.dynamicChart.height);
  el.resultBody.innerHTML = "";
  const ctx = el.chart.getContext("2d");
  ctx.clearRect(0, 0, el.chart.width, el.chart.height);
  render();
});
el.runBtn.addEventListener("click", runProfile);

el.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});
el.runNetworkBtn.addEventListener("click", runNetworkSolver);
el.runWeirBtn.addEventListener("click", runWeirCalculation);
el.runSensitivityBtn.addEventListener("click", runSensitivity);
el.exportReportBtn.addEventListener("click", exportReport);
el.runCalibrationBtn.addEventListener("click", runCalibration);
el.runUncertaintyBtn.addEventListener("click", runUncertainty);
el.saveScenarioBtn.addEventListener("click", saveScenarioSnapshot);
el.compareScenariosBtn.addEventListener("click", compareScenarios);
el.saveVersionBtn.addEventListener("click", saveVersion);
el.requestApprovalBtn.addEventListener("click", requestApproval);
el.runDynamicBtn.addEventListener("click", runDynamicSimulation);

seedDemo();
setActiveTab("inputs");
