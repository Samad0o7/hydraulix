"""Reference map for equations/models/modules used by the backend engine."""

EQUATION_REFERENCES = {
    "energy_equation": "Chow, Open-Channel Hydraulics; Henderson, Open Channel Flow",
    "hazen_williams": "AWWA M32; common SI form h_f = 10.67*L*Q^1.852/(C^1.852*D^4.87)",
    "manning": "Chow, Open-Channel Hydraulics; Q=(1/n)AR^(2/3)S^(1/2)",
    "minor_losses": "Standard K-method h_m = K*v^2/(2g)",
    "weir_rectangular": "Sharp-crested rectangular weir relation Q=(2/3)C_d b sqrt(2g) H^(3/2)",
    "newton_raphson": "Mays, Water Distribution Systems; nodal-head Newton approach",
    "dynamic_storage_routing": "Level-pool / continuity-based storage routing (Hydrologic routing practice)",
}

MODULE_REFERENCES = {
    "fastapi": "API service layer",
    "pydantic": "Validated engineering IO schemas",
    "numpy": "Vectorized numerical operations",
}
