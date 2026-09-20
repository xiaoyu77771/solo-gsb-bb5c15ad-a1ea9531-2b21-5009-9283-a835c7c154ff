"""直流网络校核器 FastAPI 入口。"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .solver import (
    CircuitError,
    MAX_ELEMENTS,
    MAX_NODES,
    SWEEP_POINTS_MAX,
    SWEEP_POINTS_MIN,
    solve,
    sweep,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="直流网络校核器", version="1.1.0")


async def _read_json_object(request: Request) -> tuple[dict[str, Any] | None, JSONResponse | None]:
    """解析请求体 JSON 对象，失败时返回可直接回复的 400 响应。"""
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return None, JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "errors": [
                    {"code": "bad_json", "message": "请求体不是合法的 JSON", "items": []}
                ],
            },
        )
    if not isinstance(payload, dict):
        return None, JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "errors": [
                    {"code": "bad_payload", "message": "请求体应为对象", "items": []}
                ],
            },
        )
    return payload, None


@app.post("/api/solve")
async def api_solve(request: Request) -> JSONResponse:
    payload, err = await _read_json_object(request)
    if err is not None:
        return err

    try:
        result = solve(payload)
    except CircuitError as exc:
        # 422：网络可解析但无法得到唯一物理解（输入校验 / 结构矛盾）
        return JSONResponse(status_code=422, content=exc.to_dict())
    return JSONResponse(status_code=200, content=result)


@app.post("/api/sweep")
async def api_sweep(request: Request) -> JSONResponse:
    payload, err = await _read_json_object(request)
    if err is not None:
        return err

    try:
        result = sweep(payload)
    except CircuitError as exc:
        # 422：扫描配置本身非法（范围 / 点数 / 元件 / 电阻非正）
        return JSONResponse(status_code=422, content=exc.to_dict())
    # 注意：即使全部采样点失败，扫描本身仍为 200，逐点错误见 samples[*].errors
    return JSONResponse(status_code=200, content=result)


@app.get("/api/meta")
async def api_meta() -> dict[str, Any]:
    return {
        "max_nodes": MAX_NODES,
        "max_elements": MAX_ELEMENTS,
        "sweep_points_min": SWEEP_POINTS_MIN,
        "sweep_points_max": SWEEP_POINTS_MAX,
        "element_types": [
            {"type": "R", "name": "电阻", "unit": "Ω"},
            {"type": "I", "name": "独立电流源", "unit": "A"},
            {"type": "V", "name": "独立电压源", "unit": "V"},
        ],
    }


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
