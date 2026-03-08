from __future__ import annotations

import math
from .models import Segment, WeirEquipment

G = 9.81

FITTING_K = {
    "entrance_square": 0.5,
    "entrance_rounded": 0.2,
    "exit": 1.0,
    "elbow_45": 0.35,
    "elbow_90": 0.9,
    "tee_run": 0.6,
    "tee_branch": 1.8,
    "gate_valve": 0.15,
    "butterfly_valve": 0.25,
    "globe_valve": 10.0,
    "check_valve": 2.5,
    "contraction": 0.45,
    "expansion": 1.0,
    "reducer": 0.3,
    "orifice_restriction": 2.4,
}


def area_circular(diameter: float) -> float:
    return math.pi * diameter**2 / 4.0


def total_k(segment: Segment) -> float:
    return sum(FITTING_K.get(k, 0.0) * v for k, v in segment.fittings.values.items())


def friction_loss_segment(segment: Segment, flow_q: float) -> tuple[float, float, float, str]:
    area = area_circular(segment.diameter)
    velocity = flow_q / area

    if segment.flow_type == "open":
        r_h = segment.diameter / 4.0
        slope = ((flow_q * segment.manning_n) / (area * (r_h ** (2.0 / 3.0)))) ** 2
        hf = slope * segment.length
        method = "Manning"
    else:
        hf = 10.67 * segment.length * (flow_q ** 1.852) / ((segment.hazen_c ** 1.852) * (segment.diameter ** 4.87))
        method = "Hazen-Williams"

    hm = total_k(segment) * velocity**2 / (2.0 * G)
    h_total = hf + hm + segment.dummy_loss
    return hf, hm, h_total, method


def weir_head_to_flow(equipment: WeirEquipment, head: float) -> float:
    return (2.0 / 3.0) * equipment.cd * equipment.width * math.sqrt(2.0 * G) * head ** 1.5


def weir_flow_to_head(equipment: WeirEquipment, flow_q: float) -> float:
    denom = (2.0 / 3.0) * equipment.cd * equipment.width * math.sqrt(2.0 * G)
    return max(0.0, (flow_q / denom) ** (2.0 / 3.0))
