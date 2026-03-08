from __future__ import annotations

import math
from typing import Dict, List

from .equations import G, area_circular, friction_loss_segment, weir_flow_to_head
from .models import DynamicNodeSeries, DynamicRequest, DynamicResponse, Link, LinkResult, Node, NodeResult, ProfileRequest, ProfileResponse, SegmentResult


def _pair_key(a: str, b: str) -> str:
    return "::".join(sorted([a, b]))


def _links_between(links: List[Link], a: str, b: str) -> List[Link]:
    return [l for l in links if (l.from_id == a and l.to_id == b) or (l.from_id == b and l.to_id == a)]


def _link_loss(link: Link, q: float) -> LinkResult:
    seg_results: List[SegmentResult] = []
    total = 0.0
    for s in link.segments:
        hf, hm, h_total, method = friction_loss_segment(s, q)
        seg_results.append(SegmentResult(hf=hf, hm=hm, h_total=h_total, method=method))
        total += h_total
    return LinkResult(id=link.id, name=link.name, h_total=total, segment_results=seg_results)


def _apply_weir_break(node: Node, q: float) -> tuple[bool, float | None]:
    if node.node_type != "weir" or not node.equipment:
        return False, None
    if not node.equipment.normal_operation or not node.equipment.hydraulic_break:
        return False, None
    head = weir_flow_to_head(node.equipment, q)
    return True, node.equipment.crest_level + head


def compute_profile(req: ProfileRequest) -> ProfileResponse:
    nodes = sorted(req.nodes, key=lambda n: n.x)
    node_map: Dict[str, dict] = {
        n.id: {
            "node": n,
            "swl": n.swl,
            "hgl": None,
            "egl": None,
            "chainage": 0.0,
            "freeboard": None,
            "hydraulic_break_applied": False,
        }
        for n in nodes
    }

    segments = []
    for i in range(len(nodes) - 1):
        a = nodes[i].id
        b = nodes[i + 1].id
        ls = _links_between(req.links, a, b)
        if not ls:
            raise ValueError("Profile requires contiguous links between sorted nodes")
        segments.append((i, ls))

    link_results: List[LinkResult] = []

    def pair_loss(ls: List[Link]) -> float:
        p = 0.0
        for l in ls:
            lr = _link_loss(l, req.flow_q)
            link_results.append(lr)
            p += lr.h_total
        return p

    if req.direction == "forward":
        node_map[nodes[0].id]["swl"] = req.boundary_swl
        for i, ls in segments:
            up = node_map[nodes[i].id]
            dn = node_map[nodes[i + 1].id]

            broken, swl_break = _apply_weir_break(up["node"], req.flow_q)
            if broken:
                up["swl"] = swl_break
                up["hydraulic_break_applied"] = True

            predicted = up["swl"] - pair_loss(ls)
            dn_broken, dn_break = _apply_weir_break(dn["node"], req.flow_q)
            if dn_broken:
                dn["swl"] = dn_break
                dn["hydraulic_break_applied"] = True
            else:
                dn["swl"] = predicted
    else:
        node_map[nodes[-1].id]["swl"] = req.boundary_swl
        for i, ls in reversed(segments):
            dn = node_map[nodes[i + 1].id]
            up = node_map[nodes[i].id]

            broken, swl_break = _apply_weir_break(dn["node"], req.flow_q)
            if broken:
                dn["swl"] = swl_break
                dn["hydraulic_break_applied"] = True

            predicted = dn["swl"] + pair_loss(ls)
            up_broken, up_break = _apply_weir_break(up["node"], req.flow_q)
            if up_broken:
                up["swl"] = up_break
                up["hydraulic_break_applied"] = True
            else:
                up["swl"] = predicted

    chainage = 0.0
    for i, n in enumerate(nodes):
        if i > 0:
            _, ls = segments[i - 1]
            chainage += max(sum(seg.length for seg in l.segments) for l in ls)

        row = node_map[n.id]
        row["chainage"] = chainage
        row["hgl"] = row["swl"]
        d = segments[max(0, i - 1)][1][0].segments[0].diameter
        v = req.flow_q / area_circular(d)
        row["egl"] = row["hgl"] + req.alpha * v * v / (2.0 * G)
        row["freeboard"] = row["node"].toc - row["swl"]

    node_results = [
        NodeResult(
            id=n.id,
            name=n.name,
            swl=node_map[n.id]["swl"],
            hgl=node_map[n.id]["hgl"],
            egl=node_map[n.id]["egl"],
            chainage=node_map[n.id]["chainage"],
            freeboard=node_map[n.id]["freeboard"],
            hydraulic_break_applied=node_map[n.id]["hydraulic_break_applied"],
        )
        for n in nodes
    ]

    return ProfileResponse(node_results=node_results, link_results=link_results)



def compute_dynamic(req: DynamicRequest) -> DynamicResponse:
    dt_sec = req.dt_minutes * 60.0
    steps = max(1, int((req.duration_hours * 60.0) / req.dt_minutes))

    current = {n.id: (n.swl if n.swl is not None else n.invert + 1.0) for n in req.nodes}
    series = {n.id: [] for n in req.nodes}
    times = []
    flood_at = {n.id: None for n in req.nodes}

    for k in range(steps + 1):
        t_hr = (k * req.dt_minutes) / 60.0
        times.append(t_hr)
        storm_shape = max(0.0, math.sin(math.pi * (t_hr / req.duration_hours)))
        factor = 1.0 + storm_shape * (req.storm_peak_factor - 1.0)
        q = req.base_flow_q * factor

        nodes_step = []
        for n in req.nodes:
            if hasattr(n, "model_copy"):
                nodes_step.append(n.model_copy(update={"swl": current[n.id]}))
            else:
                nodes_step.append(n.copy(update={"swl": current[n.id]}))

        prof = compute_profile(
            ProfileRequest(
                nodes=nodes_step,
                links=req.links,
                flow_q=q,
                alpha=req.alpha,
                direction=req.direction,
                boundary_swl=req.boundary_swl,
            )
        )
        by_id = {r.id: r for r in prof.node_results}

        for n in req.nodes:
            target = by_id[n.id].swl
            area = max(1.0, n.storage_area)
            ext = n.external_inflow * factor
            tau = 1800.0
            ds = (ext / area) * dt_sec + ((target - current[n.id]) / tau) * dt_sec
            current[n.id] += ds
            series[n.id].append(current[n.id])
            if flood_at[n.id] is None and current[n.id] >= n.toc:
                flood_at[n.id] = t_hr

    return DynamicResponse(
        duration_hours=req.duration_hours,
        dt_minutes=req.dt_minutes,
        node_series=[
            DynamicNodeSeries(
                id=n.id,
                name=n.name,
                times_hr=times,
                swl=series[n.id],
                flood_time_hr=flood_at[n.id],
            )
            for n in req.nodes
        ],
    )
