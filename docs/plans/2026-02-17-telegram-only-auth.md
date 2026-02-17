# Telegram-Only Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Telegram Mini App the only student auth method, remove Google OAuth, convert invite code from auth to join-exam endpoint.

**Architecture:** Remove Google OAuth (backend endpoint + frontend components + dependency). Replace LoginPage with a "Open via Telegram" screen. Convert invite code endpoint from anonymous auth to authenticated join-exam action.

**Tech Stack:** Django REST Framework, React, SimpleJWT, Telegram WebApp API

---

### Task 1: Remove Google OAuth backend

**Files:**
- Modify: `backend/exams/auth_views.py` — delete `auth_google()` function and google imports
- Modify: `backend/exams/urls.py` — remove `auth/google/` URL pattern
- Modify: `backend/config/settings.py` — remove `GOOGLE_CLIENT_ID`

**Step 1: Edit `auth_views.py`**

Remove these imports (lines 8-9):
```python
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
```

Remove the entire `auth_google` function (lines 138-181).

**Step 2: Edit `urls.py`**

Remove line 15:
```python
path('auth/google/', auth_views.auth_google, name='auth-google'),
```

**Step 3: Edit `settings.py`**

Remove line 132:
```python
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
```

**Step 4: Commit**

```bash
git add backend/exams/auth_views.py backend/exams/urls.py backend/config/settings.py
git commit -m "feat: remove Google OAuth backend"
```

---

### Task 2: Convert invite code from auth to join-exam endpoint

**Files:**
- Modify: `backend/exams/auth_views.py` — change `auth_invite_code()` to require authentication

**Step 1: Rewrite `auth_invite_code`**

Current: anonymous endpoint, creates a new Student.
New: requires StudentJWT, looks up existing student, links to exam.

```python
@api_view(['POST'])
@authentication_classes([StudentJWTAuthentication])
@permission_classes([IsStudent])
def join_exam_by_invite_code(request):
    code = request.data.get('code')
    if not code:
        return Response(
            {"error": "Kod talab qilinadi"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        invite = InviteCode.objects.get(code=code)
        if invite.is_used and not invite.reusable:
            return Response(
                {"error": "Taklif kodi allaqachon ishlatilgan"},
                status=status.HTTP_404_NOT_FOUND,
            )
    except InviteCode.DoesNotExist:
        return Response(
            {"error": "Taklif kodi noto'g'ri yoki ishlatilgan"},
            status=status.HTTP_404_NOT_FOUND,
        )

    student = request.user
    if not invite.reusable:
        invite.is_used = True
        invite.used_by = student
        invite.save()

    return Response({'exam_id': str(invite.exam.id)})
```

**Step 2: Update URL**

In `urls.py`, rename route:
```python
path('auth/invite-code/', auth_views.join_exam_by_invite_code, name='join-exam-invite'),
```
Keep the same URL path for backwards compatibility with frontend.

**Step 3: Commit**

```bash
git add backend/exams/auth_views.py backend/exams/urls.py
git commit -m "feat: convert invite code to authenticated join-exam endpoint"
```

---

### Task 3: Remove Google OAuth frontend + add "Open via Telegram" LoginPage

**Files:**
- Modify: `frontend/src/App.tsx` — remove GoogleOAuthProvider, update ProtectedRoute
- Modify: `frontend/src/context/AuthContext.tsx` — remove `loginWithGoogle`
- Modify: `frontend/src/pages/LoginPage.tsx` — replace with "Open via Telegram" screen

**Step 1: Edit `App.tsx`**

- Remove import: `import { GoogleOAuthProvider } from '@react-oauth/google'`
- Remove the `<GoogleOAuthProvider>` wrapper (lines 68, 93)
- Update `ProtectedRoute`: if not authenticated and not in Telegram, show login page; if in Telegram, TelegramGate handles it

**Step 2: Edit `AuthContext.tsx`**

- Remove `loginWithGoogle` method and its type from the interface
- Remove from provider value

**Step 3: Rewrite `LoginPage.tsx`**

Replace with a simple "Open via Telegram" message page. Keep the admin link. Include a link/button to the Telegram bot.

**Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/context/AuthContext.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat: replace Google login with Telegram-only auth"
```

---

### Task 4: Update DashboardPage invite code form

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx` — update invite code POST (no longer sends `full_name`, already authenticated)

**Step 1: Edit `DashboardPage.tsx`**

Change the invite code form submission from:
```typescript
const { data } = await api.post('/auth/invite-code/', {
  code: inviteCode,
  full_name: fullName || 'Talaba',
})
```

To:
```typescript
const { data } = await api.post('/auth/invite-code/', {
  code: inviteCode,
})
```

The request will include the JWT token automatically via the axios interceptor.

**Step 2: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: update invite code form for authenticated flow"
```

---

### Task 5: Remove @react-oauth/google package

**Files:**
- Modify: `frontend/package.json` — remove dependency

**Step 1: Uninstall package**

```bash
cd frontend && npm uninstall @react-oauth/google
```

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: remove @react-oauth/google dependency"
```

---

### Task 6: Remove google-auth backend dependency

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Remove from requirements.txt**

Remove these lines:
```
google-auth
requests
```

Note: only remove `requests` if it was added solely for google-auth transport (check commit a5cb180).

**Step 2: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: remove google-auth backend dependency"
```
