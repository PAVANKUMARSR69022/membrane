import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from .simulation import Simulation, TaskTransitionError
from . import config

app = FastAPI(title="Membrane Robot Engine API", version="0.1.0")
_sim = None


class MoveRequest(BaseModel):
    distance: float = Field(..., ge=-1.0, le=1.0)


class TurnRequest(BaseModel):
    degrees: float = Field(..., ge=-90.0, le=90.0)


class TaskStartRequest(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}

    task_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/state")
def get_state():
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    return _sim.state()


@app.get("/look")
def look():
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    jpeg, _ = _sim.camera_jpeg()
    return Response(content=jpeg, media_type="image/jpeg")


@app.get("/depth")
def depth():
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    return {"distance": _sim.depth()}


@app.post("/move")
def move(req: MoveRequest):
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    return _sim.move(req.distance)


@app.post("/turn")
def turn(req: TurnRequest):
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    return _sim.turn(req.degrees)


@app.post("/pickup")
def pickup():
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    return _sim.pickup()


@app.post("/drop")
def drop():
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    return _sim.drop()


@app.post("/task/start")
def start_task(req: TaskStartRequest):
    if _sim is None:
        raise HTTPException(503, "Simulation not initialized")
    try:
        return _sim.start_task(req.task_id)
    except TaskTransitionError as exc:
        raise HTTPException(status_code=409, detail=exc.code) from exc


def start_engine(gui=True, diagnostics_dir=None):
    global _sim
    _sim = Simulation(gui=gui, diagnostics_dir=diagnostics_dir)
    print(f"Membrane engine listening at http://{config.HOST}:{config.PORT}")
    print("Swagger API docs: http://127.0.0.1:8080/docs")
    print("Agent-facing endpoints do not expose object metadata.")
    try:
        uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")
    finally:
        _sim.close()
