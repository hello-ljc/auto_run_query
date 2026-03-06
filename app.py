import asyncio
import io
import json
import logging
import re
import time
import warnings
from pathlib import Path

import openpyxl
import requests
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("auto_run_query")

app = FastAPI(title="Auto Run Query")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files & index ──────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

DEFAULT_API_URL = "http://47.101.63.38:33908/api/v1/neo4j/test_query"
CONFIG_FILE = Path(__file__).parent / "config.json"

DEFAULT_CONFIG = {
    "apiUrl": DEFAULT_API_URL,
    "instanceIds": "",
    "llmConfigId": 8,
    "analysisPromptId": "",
    "resultGenerationPromptId": "",
    "useKeywords": True,
    "useRag": True,
    "useGraphRag": True,
    "retrievalTopK": 10,
    "keyRagWeight": 5,
    "maxPaths": 10,
    "conceptTopK": 2,
    "conceptSimilarity": 0.8,
    "maxHops": 12,
    "maxVisited": 100,
    "scoreLimit": 0.35,
    "cutLimit": 8,
}


# Serve index.html at root and /index.html
@app.get("/")
@app.get("/index.html")
async def index():
    from fastapi.responses import FileResponse
    return FileResponse(STATIC_DIR / "index.html")


# ── Config persistence ─────────────────────────────────────────────────────────
@app.get("/api/config")
async def get_config():
    """Return saved config from config.json, or defaults if file doesn't exist."""
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            logger.info("[CONFIG] Loaded from %s", CONFIG_FILE)
            return data
        except Exception as exc:
            logger.warning("[CONFIG] Failed to read config.json: %s – returning defaults", exc)
    return DEFAULT_CONFIG


@app.post("/api/config")
async def save_config(config: dict):
    """Persist the configuration to config.json."""
    try:
        CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("[CONFIG] Saved to %s", CONFIG_FILE)
        return {"ok": True}
    except Exception as exc:
        logger.error("[CONFIG] Failed to save: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to save config: {exc}")


# ── Single-question endpoint ───────────────────────────────────────────────────
@app.post("/api/ask")
async def ask_single(body: dict):
    """
    Accepts JSON: { question, apiUrl?, kagConfig? }
    Returns the same SSE event format as /api/run-stream (init→start→result→done)
    so the frontend can reuse identical event-handling logic.
    """
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    api_url = body.get("apiUrl", DEFAULT_API_URL)
    kag_config = body.get("kagConfig", {})

    logger.info("[ASK] Single question | question=%r | url=%s", question[:60], api_url)

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
        yield sse({"type": "init", "total": 1, "questions": [question]})
        yield sse({"type": "start", "index": 0, "question": question})
        try:
            answer = await asyncio.to_thread(call_external_api, question, kag_config, api_url)
            logger.info("[ASK] Done | answer_len=%d", len(answer))
            yield sse({"type": "result", "index": 0, "question": question,
                       "answer": answer, "status": "success"})
        except Exception as exc:
            logger.error("[ASK] Error | %s", exc)
            yield sse({"type": "result", "index": 0, "question": question,
                       "answer": f"**Error:** {exc}", "status": "error"})
        yield sse({"type": "done"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Helpers ───────────────────────────────────────────────────────────────────
def parse_questions_from_excel(file_bytes: bytes) -> list[str]:
    """Extract non-empty values from the first column; no header row."""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    questions = []
    for row in ws.iter_rows(min_col=1, max_col=1, values_only=True):
        val = row[0]
        if val is not None and str(val).strip():
            questions.append(str(val).strip())
    return questions


def call_external_api(question: str, kag_config: dict, api_url: str) -> str:
    """
    POST to the external SSE API and aggregate the streamed answer.

    Each SSE event is a JSON object of the form:
        {"message_type": "content",       "data": {"content": "<text chunk>"}}
        {"message_type": "process",       "data": {...}}        # debug info, ignored
        {"message_type": "error_message", "data": {"error_message": "...", ...}}

    The content may contain <evidence ...>...</evidence> blocks which are
    stripped so we return only the main answer text.
    """
    logger.info("[API] Calling external API | question=%r | url=%s", question[:60], api_url)
    t0 = time.monotonic()

    payload = {"query": question, "kagConfig": kag_config}
    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
        "Origin": "http://47.101.63.38:33908",
    }

    chunks: list[str] = []
    error_msg: str | None = None

    with requests.post(
        api_url,
        json=payload,
        headers=headers,
        stream=True,
        timeout=180,
        verify=False,
    ) as resp:
        resp.raise_for_status()
        buf = ""
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
            if not line.startswith("data:"):
                continue

            data_str = line[5:].strip()
            if data_str in ("[DONE]", ""):
                break

            try:
                event = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            msg_type = event.get("message_type", "")
            msg_data = event.get("data", {})

            if msg_type == "content":
                chunk = msg_data.get("content", "")
                if chunk:
                    chunks.append(chunk)

            elif msg_type == "error_message":
                error_msg = (
                    msg_data.get("error_message")
                    or msg_data.get("message_key")
                    or "Unknown error from API"
                )
                logger.warning("[API] error_message event: %s", error_msg)
            # "process" events are debug info – ignored

    elapsed = time.monotonic() - t0
    if error_msg:
        logger.error("[API] Failed after %.2fs | question=%r | error=%s",
                     elapsed, question[:60], error_msg)
        raise RuntimeError(error_msg)

    # Strip <evidence ...>...</evidence> blocks, keep main content only
    full = "".join(chunks)
    full = re.sub(r"<evidence(?:\s[^>]*)?>[\s\S]*?</evidence>", "", full)
    logger.info("[API] Done in %.2fs | question=%r | answer_len=%d chars",
                elapsed, question[:60], len(full))
    return full.strip()


# ── SSE endpoint ──────────────────────────────────────────────────────────────
@app.post("/api/run-stream")
async def run_stream(
    file: UploadFile = File(...),
    config: str = Form(default="{}"),
):
    """
    Accepts multipart/form-data:
      file   – .xlsx / .xls Excel file
      config – JSON string { apiUrl, kagConfig }

    Returns SSE stream:
      { type: "init",   total, questions }
      { type: "start",  index, question }
      { type: "result", index, question, answer, status }
      { type: "done" }
    """
    try:
        cfg = json.loads(config)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid config JSON")

    api_url = cfg.get("apiUrl", DEFAULT_API_URL)
    kag_config = cfg.get("kagConfig", {})

    try:
        file_bytes = await file.read()
        questions = parse_questions_from_excel(file_bytes)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {exc}")

    if not questions:
        raise HTTPException(status_code=400, detail="No questions found in the Excel file")

    logger.info("[RUN] Start | file=%s | questions=%d | api_url=%s",
                file.filename, len(questions), api_url)

    def sse(data: dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate():
        yield sse({"type": "init", "total": len(questions), "questions": questions})

        for i, question in enumerate(questions):
            logger.info("[Q %d/%d] Start | %r", i + 1, len(questions), question[:60])
            yield sse({"type": "start", "index": i, "question": question})
            try:
                # run blocking I/O in a thread so each result streams immediately
                answer = await asyncio.to_thread(
                    call_external_api, question, kag_config, api_url
                )
                logger.info("[Q %d/%d] Success | answer_len=%d", i + 1, len(questions), len(answer))
                yield sse({"type": "result", "index": i, "question": question,
                           "answer": answer, "status": "success"})
            except Exception as exc:
                logger.error("[Q %d/%d] Error | %s", i + 1, len(questions), exc)
                yield sse({"type": "result", "index": i, "question": question,
                           "answer": f"**Error:** {exc}", "status": "error"})

        logger.info("[RUN] Done | all %d questions processed", len(questions))
        yield sse({"type": "done"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5090, reload=True)
