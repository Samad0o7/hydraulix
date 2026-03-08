from fastapi import FastAPI

from hydraulix_engine.equations import weir_head_to_flow
from hydraulix_engine.models import ProfileRequest, ProfileResponse, WeirRequest, WeirResponse, WeirEquipment
from hydraulix_engine.references import EQUATION_REFERENCES, MODULE_REFERENCES
from hydraulix_engine.solver import compute_profile

app = FastAPI(title="Hydraulix Engineering Backend", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/references")
def references() -> dict:
    return {"equations": EQUATION_REFERENCES, "modules": MODULE_REFERENCES}


@app.post("/profile", response_model=ProfileResponse)
def profile(req: ProfileRequest) -> ProfileResponse:
    return compute_profile(req)


@app.post("/weir", response_model=WeirResponse)
def weir(req: WeirRequest) -> WeirResponse:
    equipment = WeirEquipment(crest_level=0.0, width=req.width, cd=req.cd)
    q = weir_head_to_flow(equipment, req.head)
    return WeirResponse(discharge_q=q)
