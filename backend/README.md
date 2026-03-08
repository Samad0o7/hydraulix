# Hydraulix Python Engineering Backend

This backend is the engineering calculation authority (Python), aligned with the agreed engineering plan.

## Implemented modules
- `hydraulix_engine/models.py`: pydantic calculation schemas for nodes, links, segments, weirs, profile requests/responses.
- `hydraulix_engine/equations.py`: canonical engineering equations (Manning, Hazen-Williams, minor losses, rectangular weir).
- `hydraulix_engine/solver.py`: profile solver with segmented links, weir hydraulic-break handling, chainage/freeboard outputs.
- `hydraulix_engine/references.py`: explicit equation/model/module citations.
- `api.py`: FastAPI endpoints (`/profile`, `/dynamic`, `/weir`, `/references`, `/health`).

## Equations and model citations
The API exposes references at `GET /references`.

Primary equations currently used:
- Hazen-Williams (SI): `h_f = 10.67 L Q^1.852 / (C^1.852 D^4.87)`.
- Manning: `Q = (1/n) A R^(2/3) S^(1/2)` and rearranged slope/headloss for segment solve.
- Minor loss K-method: `h_m = K v^2/(2g)`.
- Sharp-crested rectangular weir: `Q = (2/3) C_d b sqrt(2g) H^(3/2)`.
- Dynamic storage routing (continuity/level-pool style): `dS/dt = Qin - Qout`, with `dS = A * dh` for node storage updates.

## Run
```bash
pip install fastapi uvicorn pydantic
uvicorn api:app --reload --app-dir backend
```
