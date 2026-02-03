# Google Account Sign-In Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google account sign-in as a third authentication method alongside Telegram and invite codes.

**Architecture:** The frontend uses `@react-oauth/google` to render a Google Sign-In button and obtain a Google ID token (JWT credential). This token is sent to a new Django endpoint `POST /api/auth/google/` which verifies it using `google-auth` Python library, creates or retrieves the `Student` record (matched by `google_id` or `email`), and returns the existing JWT tokens. The Student model gains `email` and `google_id` fields.

**Tech Stack:** `@react-oauth/google` (frontend), `google-auth` (backend), Django REST Framework, SimpleJWT.

---

### Task 1: Add `google-auth` to backend dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add the dependency**

Add `google-auth` to `backend/requirements.txt`:

```
google-auth==2.38.0
```

Append after the existing `psycopg2-binary` line.

**Step 2: Install**

Run: `cd backend && pip install google-auth==2.38.0`
Expected: Successfully installed

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add google-auth dependency for Google OAuth"
```

---

### Task 2: Add `email` and `google_id` fields to Student model

**Files:**
- Modify: `backend/exams/models.py:37-44`
- Create: `backend/exams/migrations/0007_student_email_google_id.py` (auto-generated)

**Step 1: Update the Student model**

In `backend/exams/models.py`, modify the `Student` class (currently lines 37-44) to:

```python
class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    email = models.EmailField(null=True, blank=True, unique=True)
    google_id = models.CharField(max_length=255, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name
```

**Step 2: Generate migration**

Run: `cd backend && python manage.py makemigrations exams`
Expected: A new migration file created with `AddField` for `email` and `google_id`.

**Step 3: Apply migration**

Run: `cd backend && python manage.py migrate`
Expected: Migration applied successfully.

**Step 4: Commit**

```bash
git add backend/exams/models.py backend/exams/migrations/0007_*.py
git commit -m "feat: add email and google_id fields to Student model"
```

---

### Task 3: Add Google OAuth settings to Django config

**Files:**
- Modify: `backend/config/settings.py:111` (after `TELEGRAM_BOT_TOKEN`)

**Step 1: Add Google OAuth config**

In `backend/config/settings.py`, add after line 111 (`TELEGRAM_BOT_TOKEN = ...`):

```python
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
```

**Step 2: Commit**

```bash
git add backend/config/settings.py
git commit -m "feat: add GOOGLE_CLIENT_ID setting"
```

---

### Task 4: Create the `auth_google` backend endpoint

**Files:**
- Modify: `backend/exams/auth_views.py`
- Modify: `backend/exams/urls.py:14`

**Step 1: Add the Google auth view**

In `backend/exams/auth_views.py`, add these imports at the top:

```python
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
```

Then add this view function at the bottom of the file (after `auth_invite_code`):

```python
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def auth_google(request):
    credential = request.data.get('credential')
    if not credential:
        return Response(
            {'error': 'Google credential talab qilinadi'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        id_info = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        return Response(
            {'error': 'Google token yaroqsiz'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    google_id = id_info['sub']
    email = id_info.get('email', '')
    name = id_info.get('name', '')

    # Try to find existing student by google_id first, then by email
    student = Student.objects.filter(google_id=google_id).first()
    if not student and email:
        student = Student.objects.filter(email=email).first()
        if student:
            # Link existing account to Google
            student.google_id = google_id
            student.save(update_fields=['google_id'])

    if not student:
        student = Student.objects.create(
            full_name=name,
            email=email or None,
            google_id=google_id,
        )

    return Response(_get_tokens_for_student(student))
```

**Step 2: Register the URL**

In `backend/exams/urls.py`, add after line 14 (`path('auth/invite-code/', ...)`):

```python
    path('auth/google/', auth_views.auth_google, name='auth-google'),
```

**Step 3: Test manually**

Run: `cd backend && python manage.py runserver`
Then verify the endpoint exists:
```bash
curl -X POST http://localhost:8000/api/auth/google/ \
  -H "Content-Type: application/json" \
  -d '{"credential": "invalid"}'
```
Expected: 401 response with `{"error": "Google token yaroqsiz"}` (not a 404 or 500).

**Step 4: Commit**

```bash
git add backend/exams/auth_views.py backend/exams/urls.py
git commit -m "feat: add Google OAuth authentication endpoint"
```

---

### Task 5: Install `@react-oauth/google` in frontend

**Files:**
- Modify: `frontend/package.json` (auto-updated by npm)

**Step 1: Install the package**

Run: `cd frontend && npm install @react-oauth/google`
Expected: Package added to `dependencies` in `package.json`.

**Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @react-oauth/google dependency"
```

---

### Task 6: Wrap app with GoogleOAuthProvider

**Files:**
- Modify: `frontend/src/App.tsx:1-79`

**Step 1: Add the provider**

In `frontend/src/App.tsx`:

1. Add import at the top:
```typescript
import { GoogleOAuthProvider } from '@react-oauth/google'
```

2. Define the client ID constant after imports:
```typescript
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
```

3. Wrap the `<ErrorBoundary>` content inside the `App` function with the provider. Replace the return in `App()` with:

```tsx
function App() {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <BrowserRouter>
            <ToastProvider>
              <TelegramGate>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/practice/:id" element={<PracticeExamPage />} />
                  <Route path="/practice/:id/results" element={<PracticeResultsPage />} />
                  <Route path="/exam/:examId/lobby" element={<LobbyPage />} />
                  <Route path="/exam/:examId" element={<ExamPage />} />
                  <Route path="/results/:sessionId" element={<ResultsPage />} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/admin" element={<AdminLoginPage />} />
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/exams/create" element={<CreateExamPage />} />
                  <Route path="/admin/exams/:examId/answers" element={<ExamAnswersPage />} />
                  <Route path="/admin/exams/:examId/results" element={<ExamResultsPage />} />
                  <Route path="/admin/exams/:examId/codes" element={<InviteCodesPage />} />
                </Routes>
              </TelegramGate>
            </ToastProvider>
          </BrowserRouter>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
```

**Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wrap app with GoogleOAuthProvider"
```

---

### Task 7: Add `loginWithGoogle` to AuthContext

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`

**Step 1: Update the context**

In `frontend/src/context/AuthContext.tsx`:

1. Add `loginWithGoogle` to the `AuthContextType` interface:

```typescript
interface AuthContextType {
  studentId: string | null
  fullName: string | null
  isAuthenticated: boolean
  loginWithInviteCode: (code: string, fullName: string) => Promise<AuthResponse>
  loginWithTelegram: (initData: string) => Promise<AuthResponse>
  loginWithGoogle: (credential: string) => Promise<AuthResponse>
  logout: () => void
}
```

2. Add the `loginWithGoogle` function inside `AuthProvider`, after `loginWithTelegram`:

```typescript
  const loginWithGoogle = async (credential: string) => {
    const { data } = await api.post<AuthResponse>('/auth/google/', { credential })
    setAuth(data)
    return data
  }
```

3. Add `loginWithGoogle` to the context value object:

```tsx
      value={{
        studentId,
        fullName,
        isAuthenticated,
        loginWithInviteCode,
        loginWithTelegram,
        loginWithGoogle,
        logout,
      }}
```

**Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add frontend/src/context/AuthContext.tsx
git commit -m "feat: add loginWithGoogle method to AuthContext"
```

---

### Task 8: Add Google Sign-In button to LoginPage

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Step 1: Add the Google Sign-In button**

In `frontend/src/pages/LoginPage.tsx`:

1. Add imports:
```typescript
import { GoogleLogin } from '@react-oauth/google'
```

2. Update the destructuring from `useAuth()` (line 11):
```typescript
  const { loginWithInviteCode, loginWithGoogle, logout } = useAuth()
```

3. Add Google login handler after `handleSubmit`:
```typescript
  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle(credentialResponse.credential)
      navigate('/')
    } catch {
      setError("Google orqali kirishda xatolik yuz berdi. Qaytadan urinib ko'ring.")
    } finally {
      setLoading(false)
    }
  }
```

4. Add a divider and Google button after the `</form>` closing tag (after line 153) and before the links `<div>` (line 156). Insert between them:

```tsx
            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">yoki</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Google Sign-In */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError("Google orqali kirishda xatolik yuz berdi.")}
                theme="outline"
                size="large"
                text="signin_with"
                shape="rectangular"
                width="320"
              />
            </div>
```

**Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Test visually**

Run: `cd frontend && npm run dev`
Visit `http://localhost:5173/login`. Verify:
- The invite code form still works
- A "yoki" (or) divider appears below the form
- A Google Sign-In button appears below the divider
- The button renders correctly (it may show an error if `VITE_GOOGLE_CLIENT_ID` is not set — that's expected)

**Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add Google Sign-In button to login page"
```

---

### Task 9: Set up Google Cloud OAuth credentials

**Files:**
- Modify: `backend/.env` (add `GOOGLE_CLIENT_ID`)
- Modify: `frontend/.env` or environment (add `VITE_GOOGLE_CLIENT_ID`)

**Step 1: Create Google OAuth credentials**

This is a manual step in Google Cloud Console:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or select existing)
3. Click "Create Credentials" → "OAuth client ID"
4. Application type: "Web application"
5. Name: "Math Exam Platform"
6. Authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `https://math.xlog.uz` (prod, if applicable)
7. Authorized redirect URIs: (leave empty — we use the ID token flow, not redirect flow)
8. Copy the Client ID

**Step 2: Add to backend environment**

In `backend/.env` add:
```
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

**Step 3: Add to frontend environment**

Create or edit `frontend/.env`:
```
VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

Both values are the SAME Client ID.

**Step 4: Do NOT commit .env files**

Verify `.env` is in `.gitignore`. These contain secrets and should not be committed.

---

### Task 10: End-to-end verification

**Step 1: Start backend**

Run: `cd backend && python manage.py runserver`

**Step 2: Start frontend**

Run: `cd frontend && npm run dev`

**Step 3: Test Google Sign-In flow**

1. Navigate to `http://localhost:5173/login`
2. Click the Google Sign-In button
3. Complete the Google sign-in popup
4. Verify you are redirected to the dashboard
5. Verify `localStorage` has `access_token`, `refresh_token`, `student_id`, `full_name`

**Step 4: Test returning user**

1. Log out
2. Sign in with Google again (same account)
3. Verify you get the SAME `student_id` (not a duplicate account)

**Step 5: Verify invite code still works**

1. Log out
2. Sign in with an invite code
3. Verify the old flow still works

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Google Sign-In integration"
```

---

## Summary of all changes

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add `google-auth==2.38.0` |
| `backend/exams/models.py` | Add `email` and `google_id` fields to `Student` |
| `backend/exams/migrations/0007_*.py` | Auto-generated migration |
| `backend/config/settings.py` | Add `GOOGLE_CLIENT_ID` setting |
| `backend/exams/auth_views.py` | Add `auth_google` view with token verification |
| `backend/exams/urls.py` | Add `auth/google/` URL pattern |
| `frontend/package.json` | Add `@react-oauth/google` dependency |
| `frontend/src/App.tsx` | Wrap with `GoogleOAuthProvider` |
| `frontend/src/context/AuthContext.tsx` | Add `loginWithGoogle` method |
| `frontend/src/pages/LoginPage.tsx` | Add Google Sign-In button + divider |
| `backend/.env` | Add `GOOGLE_CLIENT_ID` (not committed) |
| `frontend/.env` | Add `VITE_GOOGLE_CLIENT_ID` (not committed) |
