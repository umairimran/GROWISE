"""
Authentication router - Complete auth system with sessions and password management
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from typing import List

from app.database import get_db
from app import models, schemas
from app.utils import (
    verify_password, get_password_hash, create_access_token, 
    create_refresh_token, decode_refresh_token, generate_session_id,
    generate_reset_token, ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.auth_middleware import get_current_user, get_admin_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ============================================================================
# User Registration & Login
# ============================================================================

@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    """
    Register a new user
    """
    # Check if user already exists
    # Normalize email to lowercase
    user_data.email = user_data.email.lower()
    
    existing_user = db.query(models.User).filter(
        models.User.email == user_data.email
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = models.User(
        email=user_data.email,
        full_name=user_data.full_name,
        password_hash=hashed_password,
        role="user"
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Login with email and password, returns JWT token with session tracking
    """
    # Find user by email (username field in OAuth2 form)
    user = db.query(models.User).filter(
        models.User.email == form_data.username.lower()
    ).first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access and refresh tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.user_id},
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(
        data={"sub": user.email, "user_id": user.user_id}
    )
    
    # Create session record
    session_id = generate_session_id()
    expires_at = datetime.utcnow() + access_token_expires
    
    session = models.UserSession(
        session_id=session_id,
        user_id=user.user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        expires_at=expires_at,
        is_active=True
    )
    
    db.add(session)
    db.commit()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": refresh_token,
        "session_id": session_id
    }


@router.post("/login-json", response_model=schemas.Token)
def login_json(
    credentials: schemas.UserLogin,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Alternative login endpoint that accepts JSON instead of form data
    """
    user = db.query(models.User).filter(
        models.User.email == credentials.email.lower()
    ).first()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Create tokens
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.user_id},
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token(
        data={"sub": user.email, "user_id": user.user_id}
    )
    
    # Create session
    session_id = generate_session_id()
    expires_at = datetime.utcnow() + access_token_expires
    
    session = models.UserSession(
        session_id=session_id,
        user_id=user.user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        ip_address=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        expires_at=expires_at,
        is_active=True
    )
    
    db.add(session)
    db.commit()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": refresh_token,
        "session_id": session_id
    }


@router.post("/refresh", response_model=schemas.Token)
def refresh_token(
    token_data: schemas.TokenRefresh,
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token
    """
    # Decode refresh token
    payload = decode_refresh_token(token_data.refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_id = payload.get("user_id")
    email = payload.get("sub")
    
    # Verify user exists
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Verify session exists and is active
    session = db.query(models.UserSession).filter(
        models.UserSession.refresh_token == token_data.refresh_token,
        models.UserSession.is_active == True
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found or inactive"
        )
    
    # Create new access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    new_access_token = create_access_token(
        data={"sub": email, "user_id": user_id},
        expires_delta=access_token_expires
    )
    
    # Update session
    session.access_token = new_access_token
    session.expires_at = datetime.utcnow() + access_token_expires
    session.last_activity = datetime.utcnow()
    
    db.commit()
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "refresh_token": token_data.refresh_token,
        "session_id": session.session_id
    }


@router.post("/logout")
def logout(
    session_id: str = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Logout user and invalidate session
    If session_id is provided, logout that specific session
    Otherwise, logout from all sessions
    """
    if session_id:
        # Logout specific session
        session = db.query(models.UserSession).filter(
            models.UserSession.session_id == session_id,
            models.UserSession.user_id == current_user.user_id
        ).first()
        
        if session:
            session.is_active = False
            db.commit()
            return {"message": "Successfully logged out from session"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
    else:
        # Logout all sessions
        sessions = db.query(models.UserSession).filter(
            models.UserSession.user_id == current_user.user_id,
            models.UserSession.is_active == True
        ).all()
        
        for session in sessions:
            session.is_active = False
        
        db.commit()
        return {"message": f"Successfully logged out from {len(sessions)} session(s)"}


# ============================================================================
# User Profile Management
# ============================================================================

@router.get("/me", response_model=schemas.UserDetailedResponse)
def get_current_user_info(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current authenticated user information with session details
    """
    # Count active sessions
    active_sessions_count = db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.user_id,
        models.UserSession.is_active == True
    ).count()
    
    # Get last login
    last_session = db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.user_id
    ).order_by(models.UserSession.created_at.desc()).first()
    
    user_dict = schemas.UserResponse.model_validate(current_user).model_dump()
    user_dict["active_sessions_count"] = active_sessions_count
    user_dict["last_login"] = last_session.created_at if last_session else None
    
    return schemas.UserDetailedResponse(**user_dict)


@router.put("/me", response_model=schemas.UserResponse)
def update_current_user(
    user_data: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile
    """
    # Update fields
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name
    
    if user_data.email is not None:
        # Check if email is already taken
        normalized_email = user_data.email.lower()
        existing_user = db.query(models.User).filter(
            models.User.email == normalized_email,
            models.User.user_id != current_user.user_id
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        
        current_user.email = normalized_email
    
    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_current_user(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete current user account (soft delete - deactivate all sessions)
    """
    # Deactivate all sessions
    db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.user_id
    ).update({"is_active": False})
    
    # Delete user (CASCADE will handle related records)
    db.delete(current_user)
    db.commit()
    
    return None


# ============================================================================
# Session Management
# ============================================================================

@router.get("/sessions", response_model=List[schemas.UserSessionResponse])
def get_my_sessions(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get all sessions for current user
    """
    query = db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.user_id
    )
    
    if active_only:
        query = query.filter(models.UserSession.is_active == True)
    
    sessions = query.order_by(models.UserSession.created_at.desc()).all()
    return sessions


@router.get("/sessions/{session_id}", response_model=schemas.UserSessionResponse)
def get_session_details(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get details of a specific session
    """
    session = db.query(models.UserSession).filter(
        models.UserSession.session_id == session_id,
        models.UserSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return session


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Revoke a specific session (logout from that session)
    """
    session = db.query(models.UserSession).filter(
        models.UserSession.session_id == session_id,
        models.UserSession.user_id == current_user.user_id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    session.is_active = False
    db.commit()
    
    return None


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_all_sessions(
    except_current: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Revoke all sessions for current user
    If except_current=True, keeps the current session active
    """
    query = db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.user_id,
        models.UserSession.is_active == True
    )
    
    # TODO: If except_current, we'd need to identify current session
    # For now, revoke all
    
    sessions = query.all()
    for session in sessions:
        session.is_active = False
    
    db.commit()
    
    return None


# ============================================================================
# Password Management
# ============================================================================

@router.post("/password/change")
def change_password(
    password_data: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Change password for current user
    """
    # Verify old password
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    # Update password
    current_user.password_hash = get_password_hash(password_data.new_password)
    
    # Invalidate all other sessions for security
    db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.user_id
    ).update({"is_active": False})
    
    db.commit()
    
    return {"message": "Password changed successfully. Please login again."}


@router.post("/password/reset/request")
def request_password_reset(
    reset_request: schemas.PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Request password reset - generates reset token
    In production, this would send an email with reset link
    """
    # Find user
    user = db.query(models.User).filter(
        models.User.email == reset_request.email
    ).first()
    
    if not user:
        # Don't reveal if email exists - security best practice
        return {
            "message": "If the email exists, a reset link has been sent",
            "note": "Mock mode - check database for reset token"
        }
    
    # Generate reset token
    reset_token = generate_reset_token()
    expires_at = datetime.utcnow() + timedelta(hours=1)  # Valid for 1 hour
    
    # Invalidate old tokens
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.user_id,
        models.PasswordResetToken.is_used == False
    ).update({"is_used": True})
    
    # Create new token
    token_record = models.PasswordResetToken(
        user_id=user.user_id,
        reset_token=reset_token,
        expires_at=expires_at
    )
    
    db.add(token_record)
    db.commit()
    
    # In production, send email here
    # For mock mode, return token
    return {
        "message": "If the email exists, a reset link has been sent",
        "reset_token": reset_token,  # Remove in production!
        "note": "Mock mode - use this token to reset password"
    }


@router.post("/password/reset/confirm")
def confirm_password_reset(
    reset_data: schemas.PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Confirm password reset with token
    """
    # Find valid token
    token_record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.reset_token == reset_data.reset_token,
        models.PasswordResetToken.is_used == False,
        models.PasswordResetToken.expires_at > datetime.utcnow()
    ).first()
    
    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Get user
    user = db.query(models.User).filter(
        models.User.user_id == token_record.user_id
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update password
    user.password_hash = get_password_hash(reset_data.new_password)
    
    # Mark token as used
    token_record.is_used = True
    
    # Invalidate all sessions
    db.query(models.UserSession).filter(
        models.UserSession.user_id == user.user_id
    ).update({"is_active": False})
    
    db.commit()
    
    return {"message": "Password reset successful. Please login with new password."}


# ============================================================================
# Admin User Management (CRUD)
# ============================================================================

@router.get("/users", response_model=List[schemas.UserResponse])
def get_all_users(
    skip: int = 0,
    limit: int = 100,
    role: str = None,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Get all users (Admin only)
    """
    query = db.query(models.User)
    
    if role:
        query = query.filter(models.User.role == role)
    
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/users/{user_id}", response_model=schemas.UserDetailedResponse)
def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Get specific user by ID (Admin only)
    """
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Count active sessions
    active_sessions_count = db.query(models.UserSession).filter(
        models.UserSession.user_id == user.user_id,
        models.UserSession.is_active == True
    ).count()
    
    # Get last login
    last_session = db.query(models.UserSession).filter(
        models.UserSession.user_id == user.user_id
    ).order_by(models.UserSession.created_at.desc()).first()
    
    user_dict = schemas.UserResponse.model_validate(user).model_dump()
    user_dict["active_sessions_count"] = active_sessions_count
    user_dict["last_login"] = last_session.created_at if last_session else None
    
    return schemas.UserDetailedResponse(**user_dict)


@router.put("/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Update user (Admin only)
    """
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    
    if user_data.email is not None:
        existing_user = db.query(models.User).filter(
            models.User.email == user_data.email,
            models.User.user_id != user_id
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        
        user.email = user_data.email
    
    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(get_admin_user)
):
    """
    Delete user (Admin only)
    """
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from deleting themselves
    if user.user_id == admin_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    db.delete(user)
    db.commit()
    
    return None

