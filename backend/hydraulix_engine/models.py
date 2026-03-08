from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


FlowType = Literal["pressure", "open"]
NodeType = Literal["junction", "weir"]


class FittingsCount(BaseModel):
    values: Dict[str, float] = Field(default_factory=dict)


class Segment(BaseModel):
    length: float = Field(gt=0)
    diameter: float = Field(gt=0)
    flow_type: FlowType = "pressure"
    manning_n: float = Field(default=0.013, gt=0)
    hazen_c: float = Field(default=130, gt=0)
    dummy_loss: float = 0.0
    fittings: FittingsCount = Field(default_factory=FittingsCount)


class WeirEquipment(BaseModel):
    crest_level: float
    width: float = Field(gt=0)
    cd: float = Field(default=0.62, gt=0)
    normal_operation: bool = True
    hydraulic_break: bool = True


class Node(BaseModel):
    id: str
    name: str
    x: float
    y: float
    invert: float
    toc: float
    swl: Optional[float] = None
    demand: float = 0.0
    storage_area: float = Field(default=800.0, gt=0)
    external_inflow: float = 0.0
    node_type: NodeType = "junction"
    equipment: Optional[WeirEquipment] = None


class Link(BaseModel):
    id: str
    name: str
    from_id: str
    to_id: str
    segments: List[Segment]


class ProfileRequest(BaseModel):
    nodes: List[Node]
    links: List[Link]
    flow_q: float = Field(gt=0)
    alpha: float = Field(default=1.0, ge=1.0)
    direction: Literal["forward", "backward"] = "forward"
    boundary_swl: float


class NodeResult(BaseModel):
    id: str
    name: str
    swl: float
    hgl: float
    egl: float
    chainage: float
    freeboard: float
    hydraulic_break_applied: bool


class SegmentResult(BaseModel):
    hf: float
    hm: float
    h_total: float
    method: str


class LinkResult(BaseModel):
    id: str
    name: str
    h_total: float
    segment_results: List[SegmentResult]


class ProfileResponse(BaseModel):
    node_results: List[NodeResult]
    link_results: List[LinkResult]


class WeirRequest(BaseModel):
    cd: float = Field(gt=0)
    width: float = Field(gt=0)
    head: float = Field(ge=0)


class WeirResponse(BaseModel):
    discharge_q: float


class DynamicRequest(BaseModel):
    nodes: List[Node]
    links: List[Link]
    base_flow_q: float = Field(gt=0)
    alpha: float = Field(default=1.0, ge=1.0)
    direction: Literal["forward", "backward"] = "forward"
    boundary_swl: float
    duration_hours: float = Field(gt=0)
    dt_minutes: float = Field(gt=0)
    storm_peak_factor: float = Field(default=2.0, ge=1.0)


class DynamicNodeSeries(BaseModel):
    id: str
    name: str
    times_hr: List[float]
    swl: List[float]
    flood_time_hr: Optional[float] = None


class DynamicResponse(BaseModel):
    duration_hours: float
    dt_minutes: float
    node_series: List[DynamicNodeSeries]
