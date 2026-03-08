# Hydraulix Engineering Plan (Pre-Coding)

## 1) Recommended technology stack

### Frontend (web app + graphing + drag/drop)
- **TypeScript + React + Vite** for maintainable UI, strong typing, and fast iteration.
- **React Flow** for drag-and-drop node/link editing with multiple edge connections per node.
- **Zustand** (or Redux Toolkit) for deterministic state management and undo/redo.
- **Plotly.js** (or ECharts) for HGL/EGL/SWL plotting and print/export.
- **TanStack Table** for scenario/sensitivity result tables.

### Backend (engineering compute engine)
- **Python + FastAPI** for engineering-heavy numerical code and strong scientific ecosystem.
- **Pydantic** schemas for strict input validation and API contracts.
- **NumPy/SciPy** for nonlinear solves, matrix/network calculations, and sensitivity analysis.
- **PostgreSQL** for projects, scenarios, assets, and audit trail.
- **Celery/RQ + Redis** for long-running network/sensitivity jobs.

### Why this split
- UI remains highly interactive and visual.
- Python engine supports robust numerical methods and future extension to transient analysis.
- Clear separation of concerns: model builder (UI) vs validated solver core (backend).

## 2) Core hydraulic capabilities and calculation strategy

## 2.1 Longitudinal hydraulic profile (forward/backward)
- Inputs: node elevations (invert/TOC/SWL), links (pipe/channel), flow, roughness coefficients, minor loss selections.
- **Forward solve**: start from known upstream boundary, propagate energy grade downstream.
- **Backward solve**: start from downstream control/tailwater boundary, propagate upstream.
- Include automatic regime checks (full pipe vs open-channel assumptions where relevant).

## 2.2 Pipe network solver (multiple node connections)
- Use **Hardy Cross** as educational/diagnostic mode.
- Use **nodal-head method (Newton–Raphson)** as production solver for large networks.
- Support pressure networks and gravity sections with clear assumptions.
- Convergence controls:
  - residual norm threshold,
  - max iterations,
  - relaxation damping,
  - singularity/ill-conditioning detection.

## 2.3 Friction formula options
- **Manning** (open channel / partially full sewer assumptions).
- **Hazen–Williams** (water distribution, empirical, temperature/units caveats).
- UI should force unit/system compatibility and prevent misuse via warnings.

## 2.4 Minor losses and fittings
- Link-level checkboxes for valve, restriction, entrance, exit, bends, etc.
- Compute minor losses as:
  - `h_m = K * v^2 / (2g)`
- Total link headloss:
  - `h_total = h_friction + Σh_m + h_equipment`

## 2.5 Equipment modules
- **Weir module**:
  - rectangular, V-notch, broad-crested variants (phase 2).
  - configurable discharge coefficient `C_d`.
- **Default equipment/dummy module**:
  - user-specified fixed headloss,
  - optional flow-dependent curve mode in later phase.

## 2.6 Sensitivity analysis / bottleneck detection
- One-factor and multi-factor perturbation (e.g., roughness, diameter, demand, tailwater).
- Outputs:
  - influence ranking on key KPIs (HGL exceedance, surcharge, velocity limits),
  - bottleneck links/nodes with percentile stress score,
  - tornado and spider charts.

## 3) Governing equations (minimum engine scope)

## 3.1 Energy equation between two sections
- `z1 + p1/γ + α1*v1^2/(2g) + H_p - H_t = z2 + p2/γ + α2*v2^2/(2g) + h_L`

## 3.2 Darcy–Weisbach (recommended internal canonical form)
- `h_f = f * (L/D) * v^2/(2g)`
- Even if user selects Manning/Hazen-Williams, normalize internally where practical for consistency checks.

## 3.3 Hazen–Williams (SI form commonly used)
- `h_f = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)`
- enforce unit consistency in API layer.

## 3.4 Manning
- `Q = (1/n) * A * R^(2/3) * S^(1/2)`
- for circular partially full sections, use geometric relationships for `A`, `P`, `R` by depth ratio.

## 3.5 Continuity at network nodes
- `ΣQ_in - ΣQ_out - Demand = 0`

## 3.6 Minor losses
- `h_m = K * v^2/(2g)`

## 3.7 Weir (example rectangular sharp-crested)
- `Q = (2/3) * C_d * b * sqrt(2g) * H^(3/2)`
- include submergence corrections where applicable.

## 4) Data model (initial)

### Node
- id, name, x, y
- invert level
- TOC level
- SWL (optional boundary/initial)
- demand/inflow
- boundary type (fixed head, fixed flow, rating curve)

### Link (pipe/channel/equipment)
- id, fromNode, toNode, geometry type
- length, diameter/section dimensions
- upstream/downstream invert references
- material
- roughness (`n` or `C`, or equivalent)
- fittings list (`K` library + custom K)
- status (open/closed)

### Scenario
- calculation mode (profile forward/backward/network)
- formula mode (Manning/Hazen-Williams)
- solver settings (tolerance, iteration limits)
- unit system

## 5) Module architecture (solid engineering implementation)

1. **units**
   - strict dimensional conversions and validation.
2. **geometry**
   - section properties for pipe/channel shapes.
3. **hydraulics-core**
   - friction, minor loss, energy equation primitives.
4. **network-solver**
   - nodal equations, Jacobian builder, convergence manager.
5. **equipment**
   - weirs, pumps (future), dummy losses.
6. **quality-control**
   - rule checks (velocity bounds, cover depth, surcharge flags).
7. **reporting**
   - profile plots HGL/EGL/SWL, tables, printable PDF.
8. **sensitivity**
   - parameter sweep and bottleneck ranking.

## 6) Validation & QA plan (must-have for engineering credibility)

- Golden test set with hand-calculated textbook examples.
- Cross-validation versus established tools/spreadsheets on benchmark networks.
- Property-based tests for monotonic expectations (e.g., increasing roughness should not reduce losses).
- Regression snapshots for solver outputs and plots.
- Numerical robustness tests (near-zero slopes, low/high Reynolds edge cases).
- Audit log capturing equations, coefficients, and assumptions used for each run.

## 7) Suggested phased delivery

### Phase 1 (MVP)
- drag/drop nodes/links,
- forward/backward profile,
- Manning + Hazen-Williams,
- minor losses and dummy equipment,
- HGL/EGL/SWL graph output.

### Phase 2
- full network solver (Newton-Raphson),
- weir module,
- sensitivity analysis and bottleneck ranking,
- report export.

### Phase 3
- calibration tools,
- uncertainty analysis,
- scenario comparison dashboard,
- enterprise features (roles, approvals, versioning).

## 8) Engineering references (recommended)

- **Chow, V.T.** Open-Channel Hydraulics.
- **Henderson, F.M.** Open Channel Flow.
- **Mays, L.W.** Water Distribution Systems Handbook.
- **AWWA Manuals** (e.g., M11 Steel Pipe, M32 Computer Modeling of Water Distribution Systems).
- **EPA SWMM documentation** (hydraulic routing concepts for storm/sewer context).
- **WEF Manual of Practice / ASCE references** for sewer design practices.
- Relevant local standards/codes (must be configurable per jurisdiction).

## 9) Immediate next implementation step

Build the solver core first (backend package with tested equations and unit handling), then attach UI editor to this validated API. This reduces risk and ensures engineering integrity from day one.

## 10) Python backend engineering modules to use

For the production backend (FastAPI solver service), use mature scientific modules:

- **numpy**: vectorized array math for hydraulic equations and Jacobian assembly.
- **scipy** (`scipy.optimize`, `scipy.sparse`, `scipy.sparse.linalg`): nonlinear root solving, sparse linear algebra, and robust network convergence.
- **pint**: strict unit/dimension handling to reduce engineering unit mistakes.
- **fluids**: validated fluid mechanics correlations (loss coefficients, dimensionless groups, pressure-drop utilities).
- **thermo**: fluid properties package (useful when extending beyond water or temperature-dependent properties).
- **networkx**: graph topology traversal (pathing, connectivity checks, cycle detection, node/link diagnostics).
- **pydantic**: validated input schemas and solver contract enforcement.
- **pandas**: tabular scenario and sensitivity post-processing.
- **matplotlib/plotly** (server-side export mode): report-ready figures where needed.

Recommended approach:
- Keep equations in a dedicated solver package and isolate third-party dependencies behind adapter layers.
- Pin versions and create benchmark regression tests to lock engineering reproducibility.
