"""
GrowWise Backend - AI-Powered Learning Platform
FastAPI application with complete API workflows
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv

from app.database import engine, Base
from app.routers import auth, tracks, assessment, learning, chat, evaluation, content, progress

# Load environment variables
load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="GrowWise API",
    description="AI-Powered Learning Platform with Dynamic Assessment and Personalized Learning Paths",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Include Routers
# ============================================================================

app.include_router(auth.router)
app.include_router(tracks.router)
app.include_router(assessment.router)
app.include_router(learning.router)
app.include_router(content.router)
app.include_router(chat.router)
app.include_router(evaluation.router)
app.include_router(progress.router)


# ============================================================================
# Root Endpoints
# ============================================================================

@app.get("/")
def root():
    """
    Root endpoint - API information
    """
    return {
        "name": "GrowWise API",
        "version": "1.0.0",
        "description": "AI-Powered Learning Platform",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health")
def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "service": "GrowWise Backend",
        "database": "connected"
    }


# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors
    """
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc) if os.getenv("DEBUG", "false").lower() == "true" else "An error occurred"
        }
    )


# ============================================================================
# Startup and Shutdown Events
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """
    Application startup event
    """
    print("=" * 60)
    print("🚀 GrowWise Backend Starting...")
    print("=" * 60)
    print("📚 API Documentation: http://localhost:8000/docs")
    print("🔍 Alternative Docs: http://localhost:8000/redoc")
    print("💚 Health Check: http://localhost:8000/health")
    print("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """
    Application shutdown event
    """
    print("=" * 60)
    print("👋 GrowWise Backend Shutting Down...")
    print("=" * 60)


# ============================================================================
# Run with: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

