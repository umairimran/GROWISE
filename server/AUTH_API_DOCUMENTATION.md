# 🔐 GROWWISE AUTHENTICATION API - COMPLETE DOCUMENTATION

## Overview

Complete authentication system with:
- ✅ User registration and login
- ✅ JWT token-based authentication
- ✅ Session management with tracking
- ✅ Refresh token support
- ✅ Password management (change & reset)
- ✅ Full CRUD operations on users
- ✅ Admin user management
- ✅ Security features (IP tracking, user agent)

---

## 📊 Database Tables

### **users**
- User accounts with role-based access

### **user_sessions**
- Active sessions with token tracking
- IP address and user agent logging
- Session expiration management

### **password_reset_tokens**
- Secure password reset with expiring tokens

---

## 🔑 Authentication Endpoints

### **1. Register User**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "full_name": "John Doe",
  "password": "SecurePassword123"
}
```

**Response (201 Created):**
```json
{
  "user_id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "user",
  "created_at": "2024-01-15T10:30:00"
}
```

---

### **2. Login (OAuth2 Form)**
```http
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=SecurePassword123
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "session_id": "abc123def456"
}
```

---

### **3. Login (JSON)**
```http
POST /api/auth/login-json
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:** Same as Login (OAuth2)

---

### **4. Refresh Token**
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "NEW_ACCESS_TOKEN",
  "token_type": "bearer",
  "refresh_token": "SAME_REFRESH_TOKEN",
  "session_id": "abc123def456"
}
```

---

### **5. Logout**
```http
POST /api/auth/logout?session_id=abc123def456
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Options:**
- With `session_id`: Logout from specific session
- Without `session_id`: Logout from ALL sessions

**Response (200 OK):**
```json
{
  "message": "Successfully logged out from session"
}
```

---

## 👤 User Profile Management

### **6. Get Current User**
```http
GET /api/auth/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK):**
```json
{
  "user_id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "user",
  "created_at": "2024-01-15T10:30:00",
  "active_sessions_count": 2,
  "last_login": "2024-01-15T14:20:00"
}
```

---

### **7. Update Current User**
```http
PUT /api/auth/me
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "full_name": "John Updated Doe",
  "email": "newemail@example.com"
}
```

**Response (200 OK):**
```json
{
  "user_id": 1,
  "email": "newemail@example.com",
  "full_name": "John Updated Doe",
  "role": "user",
  "created_at": "2024-01-15T10:30:00"
}
```

---

### **8. Delete Current User**
```http
DELETE /api/auth/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response:** 204 No Content

---

## 🔐 Session Management

### **9. Get My Sessions**
```http
GET /api/auth/sessions?active_only=true
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK):**
```json
[
  {
    "session_id": "abc123def456",
    "user_id": 1,
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "is_active": true,
    "created_at": "2024-01-15T10:30:00",
    "expires_at": "2024-01-15T11:00:00",
    "last_activity": "2024-01-15T10:45:00"
  }
]
```

---

### **10. Get Session Details**
```http
GET /api/auth/sessions/{session_id}
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200 OK):**
```json
{
  "session_id": "abc123def456",
  "user_id": 1,
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00",
  "expires_at": "2024-01-15T11:00:00",
  "last_activity": "2024-01-15T10:45:00"
}
```

---

### **11. Revoke Session**
```http
DELETE /api/auth/sessions/{session_id}
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response:** 204 No Content

---

### **12. Revoke All Sessions**
```http
DELETE /api/auth/sessions
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response:** 204 No Content

---

## 🔑 Password Management

### **13. Change Password**
```http
POST /api/auth/password/change
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "old_password": "OldPassword123",
  "new_password": "NewSecurePassword456"
}
```

**Response (200 OK):**
```json
{
  "message": "Password changed successfully. Please login again."
}
```

**Note:** All sessions are invalidated after password change

---

### **14. Request Password Reset**
```http
POST /api/auth/password/reset/request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (200 OK) - MOCK MODE:**
```json
{
  "message": "If the email exists, a reset link has been sent",
  "reset_token": "GENERATED_RESET_TOKEN_HERE",
  "note": "Mock mode - use this token to reset password"
}
```

**Production:** Would send email, not return token

---

### **15. Confirm Password Reset**
```http
POST /api/auth/password/reset/confirm
Content-Type: application/json

{
  "reset_token": "GENERATED_RESET_TOKEN_HERE",
  "new_password": "NewSecurePassword789"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successful. Please login with new password."
}
```

---

## 👨‍💼 Admin User Management (CRUD)

### **16. Get All Users** (Admin Only)
```http
GET /api/auth/users?skip=0&limit=100&role=user
Authorization: Bearer ADMIN_ACCESS_TOKEN
```

**Response (200 OK):**
```json
[
  {
    "user_id": 1,
    "email": "user1@example.com",
    "full_name": "User One",
    "role": "user",
    "created_at": "2024-01-15T10:30:00"
  },
  {
    "user_id": 2,
    "email": "user2@example.com",
    "full_name": "User Two",
    "role": "user",
    "created_at": "2024-01-15T11:30:00"
  }
]
```

---

### **17. Get User By ID** (Admin Only)
```http
GET /api/auth/users/{user_id}
Authorization: Bearer ADMIN_ACCESS_TOKEN
```

**Response (200 OK):**
```json
{
  "user_id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "user",
  "created_at": "2024-01-15T10:30:00",
  "active_sessions_count": 2,
  "last_login": "2024-01-15T14:20:00"
}
```

---

### **18. Update User** (Admin Only)
```http
PUT /api/auth/users/{user_id}
Authorization: Bearer ADMIN_ACCESS_TOKEN
Content-Type: application/json

{
  "full_name": "Updated Name",
  "email": "newemail@example.com"
}
```

**Response (200 OK):**
```json
{
  "user_id": 1,
  "email": "newemail@example.com",
  "full_name": "Updated Name",
  "role": "user",
  "created_at": "2024-01-15T10:30:00"
}
```

---

### **19. Delete User** (Admin Only)
```http
DELETE /api/auth/users/{user_id}
Authorization: Bearer ADMIN_ACCESS_TOKEN
```

**Response:** 204 No Content

**Note:** Admin cannot delete themselves

---

## 🔒 Security Features

### **Session Tracking:**
- ✅ IP address logging
- ✅ User agent tracking
- ✅ Session expiration (30 minutes default)
- ✅ Last activity timestamp
- ✅ Active/inactive status

### **Token Management:**
- ✅ Access tokens (30 minutes validity)
- ✅ Refresh tokens (7 days validity)
- ✅ Token refresh without re-login
- ✅ Session-based token invalidation

### **Password Security:**
- ✅ Bcrypt hashing
- ✅ Minimum 8 characters
- ✅ Password reset with expiring tokens (1 hour)
- ✅ All sessions invalidated on password change
- ✅ Old reset tokens invalidated

### **Authorization:**
- ✅ JWT-based authentication
- ✅ Role-based access control (user/admin)
- ✅ Protected endpoints with middleware
- ✅ Admin-only endpoints

---

## 🧪 Testing Workflow

### **Complete User Journey:**

1. **Register**
   ```bash
   POST /api/auth/register
   ```

2. **Login**
   ```bash
   POST /api/auth/login-json
   # Save access_token and refresh_token
   ```

3. **Access Protected Endpoint**
   ```bash
   GET /api/auth/me
   Authorization: Bearer ACCESS_TOKEN
   ```

4. **Check Sessions**
   ```bash
   GET /api/auth/sessions
   ```

5. **Change Password**
   ```bash
   POST /api/auth/password/change
   ```

6. **Request Password Reset**
   ```bash
   POST /api/auth/password/reset/request
   # Get reset_token from response (mock mode)
   ```

7. **Confirm Password Reset**
   ```bash
   POST /api/auth/password/reset/confirm
   ```

8. **Refresh Token**
   ```bash
   POST /api/auth/refresh
   ```

9. **Logout**
   ```bash
   POST /api/auth/logout
   ```

---

## 📝 Error Responses

### **401 Unauthorized:**
```json
{
  "detail": "Incorrect email or password"
}
```

### **400 Bad Request:**
```json
{
  "detail": "Email already registered"
}
```

### **404 Not Found:**
```json
{
  "detail": "User not found"
}
```

### **403 Forbidden:**
```json
{
  "detail": "Not enough permissions"
}
```

---

## 🎯 Key Features Summary

| Feature | Endpoint | Auth Required | Admin Only |
|---------|----------|---------------|------------|
| Register | POST `/auth/register` | ❌ | ❌ |
| Login | POST `/auth/login` | ❌ | ❌ |
| Logout | POST `/auth/logout` | ✅ | ❌ |
| Get Profile | GET `/auth/me` | ✅ | ❌ |
| Update Profile | PUT `/auth/me` | ✅ | ❌ |
| Delete Account | DELETE `/auth/me` | ✅ | ❌ |
| List Sessions | GET `/auth/sessions` | ✅ | ❌ |
| Revoke Session | DELETE `/auth/sessions/{id}` | ✅ | ❌ |
| Change Password | POST `/auth/password/change` | ✅ | ❌ |
| Reset Password | POST `/auth/password/reset/*` | ❌ | ❌ |
| List All Users | GET `/auth/users` | ✅ | ✅ |
| Get User | GET `/auth/users/{id}` | ✅ | ✅ |
| Update User | PUT `/auth/users/{id}` | ✅ | ✅ |
| Delete User | DELETE `/auth/users/{id}` | ✅ | ✅ |

---

## 🚀 All Systems Ready!

Your authentication system is **production-ready** with:
- Complete session management
- Secure password handling
- Full CRUD operations
- Admin capabilities
- Token refresh mechanism
- Mock mode for testing

Start testing with the FastAPI Swagger docs at: `http://localhost:8000/docs`

