"""
GrowWise Backend — AI-Powered Learning Platform
"""
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.routers import auth, assessment, chat, content, evaluation, learning, progress, tracks
from app import models
from app.utils import get_password_hash

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("growwise")


# ---------------------------------------------------------------------------
# Schema patches (additive only — safe to run on every boot)
# ---------------------------------------------------------------------------
_PATCHES = [
    # Add criteria_scores column to assessment_responses (stores per-criterion JSON)
    """
    ALTER TABLE assessment_responses
        ADD COLUMN IF NOT EXISTS criteria_scores TEXT;
    """,
    # Create assessment_dimension_results table if it doesn't exist yet
    """
    CREATE TABLE IF NOT EXISTS assessment_dimension_results (
        dimension_result_id  SERIAL PRIMARY KEY,
        session_id           INTEGER NOT NULL
                                REFERENCES assessment_sessions(session_id) ON DELETE CASCADE,
        dimension_id         INTEGER NOT NULL
                                REFERENCES assessment_dimensions(dimension_id) ON DELETE CASCADE,
        dimension_score      DECIMAL(4,3) NOT NULL
                                CHECK (dimension_score >= 0 AND dimension_score <= 1),
        weighted_contribution DECIMAL(6,4) NOT NULL,
        questions_evaluated  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, dimension_id)
    );
    """,
]


def _apply_schema_patches() -> None:
    """Run every patch inside its own transaction so one failure doesn't block the rest."""
    from sqlalchemy import text as sa_text

    with engine.begin() as conn:
        for sql in _PATCHES:
            try:
                conn.execute(sa_text(sql.strip()))
            except Exception as exc:
                log.warning("⚠️  Schema patch skipped: %s", exc)
    log.info("✅  Schema patches applied")

ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL",    "admin@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_NAME     = os.getenv("ADMIN_NAME",     "Admin")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="GrowWise API",
    description="AI-Powered Learning Platform with Dynamic Assessment and Personalised Learning Paths",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tracks.router)
app.include_router(assessment.router)
app.include_router(learning.router)
app.include_router(content.router)
app.include_router(chat.router)
app.include_router(evaluation.router)
app.include_router(progress.router)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    log.info("━" * 50)
    log.info("🌱  GrowWise Backend starting ...")

    # Create all tables that do not exist yet (schema defined in growwise_database.sql)
    try:
        Base.metadata.create_all(bind=engine)
        log.info("✅  Database tables ready")
    except Exception as exc:
        log.error("❌  Database error: %s", exc)

    # Apply additive schema patches — safe to re-run (IF NOT EXISTS / DO NOTHING)
    _apply_schema_patches()

    # Seed default admin user on first boot
    db: Session = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.email == ADMIN_EMAIL).first()
        if not existing:
            db.add(models.User(
                full_name=ADMIN_NAME,
                email=ADMIN_EMAIL,
                password_hash=get_password_hash(ADMIN_PASSWORD),
                role="admin",
            ))
            db.commit()
            log.info("👤  Admin created  →  %s  /  %s", ADMIN_EMAIL, ADMIN_PASSWORD)
        elif existing.role != "admin":
            existing.role = "admin"
            db.commit()
            log.info("👤  Admin role restored for %s", ADMIN_EMAIL)
        else:
            log.info("👤  Admin OK  (%s)", ADMIN_EMAIL)
    except Exception as exc:
        db.rollback()
        log.error("❌  Admin seed error: %s", exc)
    finally:
        db.close()

    log.info("🚀  Live  →  http://localhost:8000/docs")
    log.info("━" * 50)


# ---------------------------------------------------------------------------
# Shutdown
# ---------------------------------------------------------------------------
@app.on_event("shutdown")
async def shutdown_event():
    log.info("👋  GrowWise Backend shutting down.")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"name": "GrowWise API", "version": "1.0.0", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "GrowWise Backend", "database": "connected"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("💥  Unhandled error on %s: %s", request.url, exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc) if os.getenv("DEBUG", "false").lower() == "true" else "An error occurred",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
