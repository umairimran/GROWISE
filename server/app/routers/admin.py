"""
Admin router — system stats, health, knowledge-base file upload, AI ping
"""
import io
import logging
import os
import time
from datetime import datetime, date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, text as sa_text
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db, engine
from app import models
from app.auth_middleware import get_admin_user

log = logging.getLogger("growwise.admin")

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ---------------------------------------------------------------------------
# Response schemas (inline — no need to add to main schemas.py)
# ---------------------------------------------------------------------------

class StatsResponse(BaseModel):
    total_users: int
    total_tracks: int
    active_sessions: int
    assessments_today: int
    assessments_total: int
    evaluations_total: int
    evaluations_completed: int
    learning_paths_total: int
    knowledge_base_entries: int
    recent_users: List[dict]
    track_stats: List[dict]


class HealthResponse(BaseModel):
    status: str
    database: str
    ai_provider: str
    ai_model: str
    rag_api_url: str
    rag_reachable: Optional[bool]
    use_mock_ai: bool
    server_time: str


class KBFileUploadResponse(BaseModel):
    track_id: int
    source: str
    chunks_created: int
    message: str


class AnalyticsResponse(BaseModel):
    signups_by_day: List[dict]
    track_popularity: List[dict]
    assessment_completion_by_track: List[dict]
    evaluation_distribution: dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _chunk_text(text: str, max_chars: int = 1500) -> List[str]:
    """Split text into roughly equal chunks respecting paragraph boundaries."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 <= max_chars:
            current = (current + "\n\n" + para).strip()
        else:
            if current:
                chunks.append(current)
            # If a single paragraph is too long, split by sentence
            if len(para) > max_chars:
                sentences = para.split(". ")
                sub = ""
                for s in sentences:
                    if len(sub) + len(s) + 2 <= max_chars:
                        sub = (sub + ". " + s).strip(". ").strip()
                    else:
                        if sub:
                            chunks.append(sub)
                        sub = s
                if sub:
                    chunks.append(sub)
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks or [text[:max_chars]]


async def _check_rag_reachable(url: str) -> bool:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            return resp.status_code < 500
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=StatsResponse)
async def get_admin_stats(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Return platform-wide statistics for the admin dashboard."""
    today = date.today()

    total_users = db.query(func.count(models.User.user_id)).scalar() or 0
    total_tracks = db.query(func.count(models.Track.track_id)).scalar() or 0
    active_sessions = (
        db.query(func.count(models.UserSession.session_id))
        .filter(models.UserSession.is_active == True)  # noqa: E712
        .scalar()
        or 0
    )
    assessments_today = (
        db.query(func.count(models.AssessmentSession.session_id))
        .filter(func.date(models.AssessmentSession.started_at) == today)
        .scalar()
        or 0
    )
    assessments_total = db.query(func.count(models.AssessmentSession.session_id)).scalar() or 0
    evaluations_total = db.query(func.count(models.EvaluationSession.evaluation_id)).scalar() or 0
    evaluations_completed = (
        db.query(func.count(models.EvaluationSession.evaluation_id))
        .filter(models.EvaluationSession.status == "completed")
        .scalar()
        or 0
    )
    learning_paths_total = db.query(func.count(models.LearningPath.path_id)).scalar() or 0
    kb_entries = db.query(func.count(models.KnowledgeBase.kb_id)).scalar() or 0

    # Recent 5 users
    recent_users_rows = (
        db.query(models.User)
        .order_by(models.User.created_at.desc())
        .limit(5)
        .all()
    )
    recent_users = [
        {
            "user_id": u.user_id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in recent_users_rows
    ]

    # Track stats: name + selection count
    track_rows = db.query(models.Track).all()
    track_stats = []
    for t in track_rows:
        sel_count = (
            db.query(func.count(models.UserTrackSelection.selection_id))
            .filter(models.UserTrackSelection.track_id == t.track_id)
            .scalar()
            or 0
        )
        dim_count = (
            db.query(func.count(models.AssessmentDimension.dimension_id))
            .filter(models.AssessmentDimension.track_id == t.track_id)
            .scalar()
            or 0
        )
        track_stats.append(
            {
                "track_id": t.track_id,
                "track_name": t.track_name,
                "selections": sel_count,
                "dimensions": dim_count,
            }
        )

    return StatsResponse(
        total_users=total_users,
        total_tracks=total_tracks,
        active_sessions=active_sessions,
        assessments_today=assessments_today,
        assessments_total=assessments_total,
        evaluations_total=evaluations_total,
        evaluations_completed=evaluations_completed,
        learning_paths_total=learning_paths_total,
        knowledge_base_entries=kb_entries,
        recent_users=recent_users,
        track_stats=track_stats,
    )


@router.get("/system-health", response_model=HealthResponse)
async def get_system_health(
    _admin: models.User = Depends(get_admin_user),
):
    """Return AI provider config and connectivity status."""
    ai_provider = os.getenv("AI_PROVIDER", "gemini").lower()
    ai_model = (
        os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        if ai_provider == "openai"
        else os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
    )
    use_mock = os.getenv("USE_MOCK_AI", "false").lower() == "true"
    rag_url = os.getenv("RAG_API_URL", "")

    # Test DB
    db_status = "connected"
    try:
        with engine.connect() as conn:
            conn.execute(sa_text("SELECT 1"))
    except Exception as exc:
        db_status = f"error: {exc}"

    # Test RAG reachability (async, non-blocking)
    rag_reachable: Optional[bool] = None
    if rag_url:
        rag_reachable = await _check_rag_reachable(rag_url)

    return HealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        database=db_status,
        ai_provider=ai_provider,
        ai_model=ai_model,
        rag_api_url=rag_url,
        rag_reachable=rag_reachable,
        use_mock_ai=use_mock,
        server_time=datetime.utcnow().isoformat(),
    )


@router.post("/ai-ping")
async def ping_ai(
    _admin: models.User = Depends(get_admin_user),
):
    """Fire a trivial AI call and return latency + success status."""
    from app.ai_services.ai_provider import get_provider

    provider = get_provider()
    start = time.perf_counter()
    success = False
    error_msg = ""

    try:
        response = await provider.chat_complete(
            messages=[
                {"role": "system", "content": "You are a test assistant."},
                {"role": "user", "content": "Reply with exactly: pong"},
            ],
            temperature=0.0,
            timeout=15.0,
        )
        success = bool(response and len(response.strip()) > 0)
    except Exception as exc:
        error_msg = str(exc)

    elapsed_ms = round((time.perf_counter() - start) * 1000)

    return {
        "success": success,
        "elapsed_ms": elapsed_ms,
        "error": error_msg if not success else None,
    }


@router.post("/kb/upload-file", response_model=KBFileUploadResponse)
async def upload_knowledge_base_file(
    track_id: int = Form(...),
    source: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """
    Upload a .txt, .md, or .pdf file and ingest its content into the
    knowledge base for the given track.  The file is split into ~1 500-char
    chunks; each chunk becomes one KnowledgeBase row.
    """
    track = db.query(models.Track).filter(models.Track.track_id == track_id).first()
    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    filename = file.filename or "upload"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    raw_bytes = await file.read()

    if extension == "pdf":
        text = _extract_pdf_text(raw_bytes)
    elif extension in ("txt", "md", ""):
        text = raw_bytes.decode("utf-8", errors="replace")
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type: .{extension}. Allowed: .txt, .md, .pdf",
        )

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File appears to be empty or could not be parsed.",
        )

    chunks = _chunk_text(text)
    log.info("Ingesting %d chunks from '%s' into track %d", len(chunks), filename, track_id)

    for i, chunk in enumerate(chunks):
        db.add(
            models.KnowledgeBase(
                track_id=track_id,
                content=chunk,
                source=f"{source} (chunk {i + 1}/{len(chunks)})" if len(chunks) > 1 else source,
                embedding_vector="placeholder",
            )
        )
    db.commit()

    return KBFileUploadResponse(
        track_id=track_id,
        source=source,
        chunks_created=len(chunks),
        message=f"Successfully ingested {len(chunks)} chunk(s) from '{filename}'.",
    )


@router.delete("/kb/{kb_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge_base_entry(
    kb_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Delete a single knowledge-base entry."""
    entry = db.query(models.KnowledgeBase).filter(models.KnowledgeBase.kb_id == kb_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KB entry not found")
    db.delete(entry)
    db.commit()
    return None


@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Return analytics data for charts."""
    # Signups per day (last 30 days)
    try:
        rows = db.execute(
            sa_text(
                """
                SELECT date_trunc('day', created_at)::date AS day,
                       COUNT(*) AS count
                  FROM users
                 WHERE created_at >= NOW() - INTERVAL '30 days'
                 GROUP BY 1
                 ORDER BY 1
                """
            )
        ).fetchall()
        signups_by_day = [{"date": str(r[0]), "count": r[1]} for r in rows]
    except Exception:
        signups_by_day = []

    # Track popularity (selections per track)
    try:
        rows = db.execute(
            sa_text(
                """
                SELECT t.track_name, COUNT(s.selection_id) AS selections
                  FROM tracks t
                  LEFT JOIN user_track_selection s ON s.track_id = t.track_id
                 GROUP BY t.track_id, t.track_name
                 ORDER BY selections DESC
                """
            )
        ).fetchall()
        track_popularity = [{"track": r[0], "selections": r[1]} for r in rows]
    except Exception:
        track_popularity = []

    # Assessment completion rate per track
    try:
        rows = db.execute(
            sa_text(
                """
                SELECT t.track_name,
                       COUNT(a.session_id) AS total,
                       COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed
                  FROM tracks t
                  LEFT JOIN assessment_sessions a ON a.track_id = t.track_id
                 GROUP BY t.track_id, t.track_name
                 ORDER BY t.track_name
                """
            )
        ).fetchall()
        assessment_completion_by_track = [
            {"track": r[0], "total": r[1], "completed": r[2]} for r in rows
        ]
    except Exception:
        assessment_completion_by_track = []

    # Evaluation readiness distribution
    try:
        rows = db.execute(
            sa_text(
                """
                SELECT readiness_level, COUNT(*) AS count
                  FROM evaluation_results
                 GROUP BY readiness_level
                """
            )
        ).fetchall()
        evaluation_distribution = {r[0]: r[1] for r in rows}
    except Exception:
        evaluation_distribution = {}

    return AnalyticsResponse(
        signups_by_day=signups_by_day,
        track_popularity=track_popularity,
        assessment_completion_by_track=assessment_completion_by_track,
        evaluation_distribution=evaluation_distribution,
    )


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    body: dict,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    """Promote or demote a user (admin <-> user)."""
    new_role = body.get("role")
    if new_role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
    if user_id == admin.user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = new_role
    db.commit()
    return {"user_id": user_id, "role": new_role}


@router.delete("/users/{user_id}/sessions", status_code=status.HTTP_204_NO_CONTENT)
def force_logout_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(get_admin_user),
):
    """Revoke all active sessions for a user (force logout)."""
    db.query(models.UserSession).filter(
        models.UserSession.user_id == user_id,
        models.UserSession.is_active == True,  # noqa: E712
    ).update({"is_active": False})
    db.commit()
    return None


# ---------------------------------------------------------------------------
# PDF extraction helper (requires pypdf; graceful fallback)
# ---------------------------------------------------------------------------

def _extract_pdf_text(raw: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n\n".join(pages)
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PDF parsing requires pypdf. Install it with: pip install pypdf",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse PDF: {exc}",
        )
