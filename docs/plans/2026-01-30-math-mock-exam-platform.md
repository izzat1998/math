# Math Mock Exam Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MVP platform where admins create timed math mock exams (PDF-based, 45 questions) and students take them via web or Telegram Mini App with auto-grading.

**Architecture:** Django REST Framework backend serving a React SPA frontend. PostgreSQL database. JWT auth for both Telegram and invite-code users. Celery for background auto-submit of expired sessions. React PDF viewer (react-pdf or pdfjs-dist) with answer sidebar.

**Tech Stack:** Python 3.11+, Django 5, DRF, PostgreSQL, Celery + Redis, React 18, TypeScript, Vite, react-pdf, Tailwind CSS

---

## Task 1: Project Scaffolding — Django Backend

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/manage.py`
- Create: `backend/config/settings.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/config/asgi.py`
- Create: `backend/config/__init__.py`

**Step 1: Create Django project**

```bash
cd /Users/izzatbekkhamraev/XLOG/math
mkdir backend && cd backend
python -m venv venv
source venv/bin/activate
pip install django djangorestframework django-cors-headers psycopg2-binary djangorestframework-simplejwt celery redis Pillow
pip freeze > requirements.txt
django-admin startproject config .
```

**Step 2: Configure settings**

Edit `backend/config/settings.py`:
- Add to INSTALLED_APPS: `rest_framework`, `corsheaders`, `rest_framework_simplejwt`
- Add CORS middleware (before CommonMiddleware)
- Set `CORS_ALLOW_ALL_ORIGINS = True` (dev only)
- Configure DRF default auth to JWT:
```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
}
```
- Set MEDIA_URL and MEDIA_ROOT for PDF uploads:
```python
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
```
- Configure database for PostgreSQL:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'math_mock',
        'USER': 'postgres',
        'PASSWORD': 'postgres',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

**Step 3: Verify server starts**

```bash
python manage.py migrate
python manage.py runserver
```
Expected: Django welcome page at http://127.0.0.1:8000/

**Step 4: Commit**

```bash
git init
echo "venv/\n__pycache__/\n*.pyc\ndb.sqlite3\nmedia/" > .gitignore
git add .
git commit -m "feat: scaffold Django backend with DRF, JWT, CORS, PostgreSQL config"
```

---

## Task 2: Project Scaffolding — React Frontend

**Files:**
- Create: `frontend/` (Vite React TypeScript project)
- Create: `frontend/.env`

**Step 1: Create React project**

```bash
cd /Users/izzatbekkhamraev/XLOG/math
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install axios react-router-dom react-pdf tailwindcss @tailwindcss/vite
```

**Step 2: Configure Tailwind**

Edit `frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
})
```

Add to `frontend/src/index.css`:
```css
@import "tailwindcss";
```

**Step 3: Set up basic App with router**

Edit `frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Math Mock Exam Platform</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

**Step 4: Verify dev server**

```bash
npm run dev
```
Expected: Vite dev server at http://localhost:5173/ showing "Math Mock Exam Platform"

**Step 5: Commit**

```bash
cd /Users/izzatbekkhamraev/XLOG/math
git add frontend/
git commit -m "feat: scaffold React frontend with Vite, TypeScript, Tailwind, react-pdf"
```

---

## Task 3: Django Models — Exams App

**Files:**
- Create: `backend/exams/__init__.py`
- Create: `backend/exams/models.py`
- Create: `backend/exams/admin.py`
- Create: `backend/exams/apps.py`
- Create: `backend/exams/migrations/`
- Modify: `backend/config/settings.py` (add to INSTALLED_APPS)

**Step 1: Create Django app**

```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py startapp exams
```

**Step 2: Write models**

Edit `backend/exams/models.py`:
```python
import uuid
from django.db import models
from django.contrib.auth.models import User


class MockExam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    pdf_file = models.FileField(upload_to='exams/pdfs/')
    open_at = models.DateTimeField()
    close_at = models.DateTimeField()
    duration = models.IntegerField(default=150, help_text="Duration in minutes")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class CorrectAnswer(models.Model):
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='correct_answers')
    question_number = models.IntegerField()
    sub_part = models.CharField(max_length=1, null=True, blank=True)
    correct_answer = models.CharField(max_length=255)

    class Meta:
        unique_together = ('exam', 'question_number', 'sub_part')

    def __str__(self):
        part = f"({self.sub_part})" if self.sub_part else ""
        return f"Q{self.question_number}{part}: {self.correct_answer}"


class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name


class InviteCode(models.Model):
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='invite_codes')
    code = models.CharField(max_length=20, unique=True)
    is_used = models.BooleanField(default=False)
    used_by = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.code} ({'used' if self.is_used else 'available'})"


class ExamSession(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'In Progress'
        SUBMITTED = 'submitted', 'Submitted'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='sessions')
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_auto_submitted = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    class Meta:
        unique_together = ('student', 'exam')

    def __str__(self):
        return f"{self.student} - {self.exam} ({self.status})"


class StudentAnswer(models.Model):
    session = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name='answers')
    question_number = models.IntegerField()
    sub_part = models.CharField(max_length=1, null=True, blank=True)
    answer = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)

    class Meta:
        unique_together = ('session', 'question_number', 'sub_part')

    def __str__(self):
        part = f"({self.sub_part})" if self.sub_part else ""
        return f"Q{self.question_number}{part}: {self.answer}"
```

**Step 3: Register admin**

Edit `backend/exams/admin.py`:
```python
from django.contrib import admin
from .models import MockExam, CorrectAnswer, Student, InviteCode, ExamSession, StudentAnswer

admin.site.register(MockExam)
admin.site.register(CorrectAnswer)
admin.site.register(Student)
admin.site.register(InviteCode)
admin.site.register(ExamSession)
admin.site.register(StudentAnswer)
```

**Step 4: Add app to settings and migrate**

Add `'exams'` to `INSTALLED_APPS` in `backend/config/settings.py`.

```bash
python manage.py makemigrations exams
python manage.py migrate
```
Expected: Migration creates all 6 tables.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add exams app with all 6 data models"
```

---

## Task 4: Admin API — Exam CRUD & Answer Management

**Files:**
- Create: `backend/exams/serializers.py`
- Create: `backend/exams/views.py`
- Create: `backend/exams/urls.py`
- Modify: `backend/config/urls.py`

**Step 1: Write serializers**

Create `backend/exams/serializers.py`:
```python
from rest_framework import serializers
from .models import MockExam, CorrectAnswer, InviteCode, Student, ExamSession, StudentAnswer


class MockExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = MockExam
        fields = ['id', 'title', 'pdf_file', 'open_at', 'close_at', 'duration', 'created_at']
        read_only_fields = ['id', 'created_at']


class CorrectAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CorrectAnswer
        fields = ['id', 'question_number', 'sub_part', 'correct_answer']


class BulkCorrectAnswerSerializer(serializers.Serializer):
    answers = CorrectAnswerSerializer(many=True)

    def create(self, validated_data):
        exam = self.context['exam']
        answers = []
        for answer_data in validated_data['answers']:
            answers.append(CorrectAnswer(exam=exam, **answer_data))
        CorrectAnswer.objects.filter(exam=exam).delete()
        return CorrectAnswer.objects.bulk_create(answers)


class InviteCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = InviteCode
        fields = ['id', 'code', 'is_used', 'used_by']
        read_only_fields = ['id', 'code', 'is_used', 'used_by']


class GenerateInviteCodesSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=1, max_value=500)


class StudentResultSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    student_name = serializers.CharField()
    exercises_correct = serializers.IntegerField()
    exercises_total = serializers.IntegerField()
    points = serializers.IntegerField()
    points_total = serializers.IntegerField()
    submitted_at = serializers.DateTimeField()
    is_auto_submitted = serializers.BooleanField()
```

**Step 2: Write admin views**

Create `backend/exams/views.py`:
```python
import string
import random
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import MockExam, CorrectAnswer, InviteCode, ExamSession, StudentAnswer
from .serializers import (
    MockExamSerializer,
    BulkCorrectAnswerSerializer,
    GenerateInviteCodesSerializer,
    InviteCodeSerializer,
)


# --- Admin Views ---

@api_view(['POST', 'GET'])
@permission_classes([permissions.IsAdminUser])
def admin_exams(request):
    if request.method == 'POST':
        serializer = MockExamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    exams = MockExam.objects.all().order_by('-created_at')
    serializer = MockExamSerializer(exams, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def admin_exam_answers(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
    serializer = BulkCorrectAnswerSerializer(data=request.data, context={'exam': exam})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({'message': 'Answers saved'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def admin_generate_invite_codes(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
    serializer = GenerateInviteCodesSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    count = serializer.validated_data['count']
    codes = []
    for _ in range(count):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        codes.append(InviteCode(exam=exam, code=code))
    InviteCode.objects.bulk_create(codes)
    return Response(
        InviteCodeSerializer(codes, many=True).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_exam_results(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
    sessions = ExamSession.objects.filter(
        exam=exam, status=ExamSession.Status.SUBMITTED
    ).select_related('student')
    results = []
    for session in sessions:
        answers = StudentAnswer.objects.filter(session=session)
        points = answers.filter(is_correct=True).count()
        # Calculate exercise count
        exercises_correct = 0
        for q in range(1, 36):
            if answers.filter(question_number=q, is_correct=True).exists():
                exercises_correct += 1
        for q in range(36, 46):
            a_correct = answers.filter(question_number=q, sub_part='a', is_correct=True).exists()
            b_correct = answers.filter(question_number=q, sub_part='b', is_correct=True).exists()
            if a_correct and b_correct:
                exercises_correct += 1
        results.append({
            'student_id': session.student.id,
            'student_name': session.student.full_name,
            'exercises_correct': exercises_correct,
            'exercises_total': 45,
            'points': points,
            'points_total': 55,
            'submitted_at': session.submitted_at,
            'is_auto_submitted': session.is_auto_submitted,
        })
    return Response(results)
```

**Step 3: Wire up URLs**

Create `backend/exams/urls.py`:
```python
from django.urls import path
from . import views

urlpatterns = [
    # Admin
    path('admin/exams/', views.admin_exams, name='admin-exams'),
    path('admin/exams/<uuid:exam_id>/answers/', views.admin_exam_answers, name='admin-exam-answers'),
    path('admin/exams/<uuid:exam_id>/invite-codes/', views.admin_generate_invite_codes, name='admin-invite-codes'),
    path('admin/exams/<uuid:exam_id>/results/', views.admin_exam_results, name='admin-exam-results'),
]
```

Edit `backend/config/urls.py`:
```python
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('exams.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

**Step 4: Test via Django admin**

```bash
python manage.py createsuperuser
python manage.py runserver
```
Test: POST to `/api/admin/exams/` with admin token.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add admin API endpoints for exam CRUD, answers, invite codes, results"
```

---

## Task 5: Auth API — Telegram & Invite Code

**Files:**
- Create: `backend/exams/auth_views.py`
- Modify: `backend/exams/urls.py`
- Modify: `backend/config/settings.py` (add BOT_TOKEN setting)

**Step 1: Write auth views**

Create `backend/exams/auth_views.py`:
```python
import hashlib
import hmac
import json
from urllib.parse import parse_qs
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Student, InviteCode


def get_tokens_for_student(student):
    refresh = RefreshToken()
    refresh['student_id'] = str(student.id)
    refresh['full_name'] = student.full_name
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'student_id': str(student.id),
        'full_name': student.full_name,
    }


def validate_telegram_init_data(init_data_raw):
    """Validate Telegram Mini App initData per Telegram docs."""
    parsed = parse_qs(init_data_raw)
    received_hash = parsed.get('hash', [None])[0]
    if not received_hash:
        return None

    data_check_pairs = []
    for key, values in sorted(parsed.items()):
        if key == 'hash':
            continue
        data_check_pairs.append(f"{key}={values[0]}")
    data_check_string = '\n'.join(data_check_pairs)

    secret_key = hmac.new(b'WebAppData', settings.TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if computed_hash != received_hash:
        return None

    user_data = parsed.get('user', [None])[0]
    if user_data:
        return json.loads(user_data)
    return None


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_telegram(request):
    init_data = request.data.get('initData')
    if not init_data:
        return Response({'error': 'initData required'}, status=status.HTTP_400_BAD_REQUEST)

    user_data = validate_telegram_init_data(init_data)
    if not user_data:
        return Response({'error': 'Invalid initData'}, status=status.HTTP_401_UNAUTHORIZED)

    telegram_id = user_data.get('id')
    first_name = user_data.get('first_name', '')
    last_name = user_data.get('last_name', '')
    full_name = f"{first_name} {last_name}".strip()

    student, _ = Student.objects.get_or_create(
        telegram_id=telegram_id,
        defaults={'full_name': full_name},
    )

    return Response(get_tokens_for_student(student))


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_invite_code(request):
    code = request.data.get('code')
    full_name = request.data.get('full_name')

    if not code or not full_name:
        return Response(
            {'error': 'code and full_name are required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        invite = InviteCode.objects.get(code=code, is_used=False)
    except InviteCode.DoesNotExist:
        return Response({'error': 'Invalid or used invite code'}, status=status.HTTP_404_NOT_FOUND)

    student = Student.objects.create(full_name=full_name)
    invite.is_used = True
    invite.used_by = student
    invite.save()

    return Response({
        **get_tokens_for_student(student),
        'exam_id': str(invite.exam.id),
    })
```

**Step 2: Add to URLs**

Append to `backend/exams/urls.py`:
```python
from . import auth_views

# Add to urlpatterns:
path('auth/telegram/', auth_views.auth_telegram, name='auth-telegram'),
path('auth/invite-code/', auth_views.auth_invite_code, name='auth-invite-code'),
```

**Step 3: Add Telegram bot token to settings**

Add to `backend/config/settings.py`:
```python
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
```
Add `import os` at top if not present.

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add auth endpoints for Telegram initData and invite code"
```

---

## Task 6: Student API — Exam Session, Answers, Submit, Results

**Files:**
- Create: `backend/exams/student_views.py`
- Modify: `backend/exams/urls.py`
- Create: `backend/exams/permissions.py`

**Step 1: Create custom JWT authentication for students**

Create `backend/exams/permissions.py`:
```python
from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Student


class StudentJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        student_id = validated_token.get('student_id')
        if not student_id:
            return None
        try:
            return Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return None


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return isinstance(request.user, Student)
```

**Step 2: Write student views**

Create `backend/exams/student_views.py`:
```python
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from .models import MockExam, ExamSession, StudentAnswer, CorrectAnswer
from .permissions import StudentJWTAuthentication, IsStudent
from .serializers import MockExamSerializer

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_detail(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    return Response({
        **MockExamSerializer(exam).data,
        'is_open': exam.open_at <= now <= exam.close_at,
    })


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_pdf(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
    from django.http import FileResponse
    return FileResponse(exam.pdf_file.open(), content_type='application/pdf')


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def start_exam(request, exam_id):
    student = request.user
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    if not (exam.open_at <= now <= exam.close_at):
        return Response({'error': 'Exam is not currently open'}, status=status.HTTP_403_FORBIDDEN)

    existing = ExamSession.objects.filter(student=student, exam=exam).first()
    if existing:
        if existing.status == ExamSession.Status.SUBMITTED:
            return Response({'error': 'Already submitted'}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            'session_id': str(existing.id),
            'started_at': existing.started_at.isoformat(),
            'duration': exam.duration,
        })

    session = ExamSession.objects.create(student=student, exam=exam)
    return Response({
        'session_id': str(session.id),
        'started_at': session.started_at.isoformat(),
        'duration': exam.duration,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def save_answer(request, session_id):
    student = request.user
    try:
        session = ExamSession.objects.get(id=session_id, student=student)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if session.status == ExamSession.Status.SUBMITTED:
        return Response({'error': 'Exam already submitted'}, status=status.HTTP_403_FORBIDDEN)

    # Check timer
    now = timezone.now()
    elapsed = (now - session.started_at).total_seconds() / 60
    if elapsed >= session.exam.duration:
        _submit_session(session, auto=True)
        return Response({'error': 'Time expired, exam auto-submitted'}, status=status.HTTP_403_FORBIDDEN)

    question_number = request.data.get('question_number')
    sub_part = request.data.get('sub_part')
    answer = request.data.get('answer')

    if not question_number or not answer:
        return Response({'error': 'question_number and answer required'}, status=status.HTTP_400_BAD_REQUEST)

    StudentAnswer.objects.update_or_create(
        session=session,
        question_number=question_number,
        sub_part=sub_part,
        defaults={'answer': answer},
    )
    return Response({'message': 'Answer saved'})


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def submit_exam(request, session_id):
    student = request.user
    try:
        session = ExamSession.objects.get(id=session_id, student=student)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if session.status == ExamSession.Status.SUBMITTED:
        return Response({'error': 'Already submitted'}, status=status.HTTP_403_FORBIDDEN)

    _submit_session(session, auto=False)
    return Response({'message': 'Exam submitted'})


def _submit_session(session, auto=False):
    """Grade all answers and mark session as submitted."""
    correct_answers = {
        (ca.question_number, ca.sub_part): ca.correct_answer
        for ca in CorrectAnswer.objects.filter(exam=session.exam)
    }

    for answer in StudentAnswer.objects.filter(session=session):
        key = (answer.question_number, answer.sub_part)
        expected = correct_answers.get(key, '')
        answer.is_correct = answer.answer.strip().lower() == expected.strip().lower()
        answer.save()

    session.status = ExamSession.Status.SUBMITTED
    session.submitted_at = timezone.now()
    session.is_auto_submitted = auto
    session.save()


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def session_results(request, session_id):
    student = request.user
    try:
        session = ExamSession.objects.get(id=session_id, student=student)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    if session.status != ExamSession.Status.SUBMITTED:
        return Response({'error': 'Exam not yet submitted'}, status=status.HTTP_403_FORBIDDEN)

    answers = StudentAnswer.objects.filter(session=session).order_by('question_number', 'sub_part')
    points = answers.filter(is_correct=True).count()

    exercises_correct = 0
    for q in range(1, 36):
        if answers.filter(question_number=q, is_correct=True).exists():
            exercises_correct += 1
    for q in range(36, 46):
        a_ok = answers.filter(question_number=q, sub_part='a', is_correct=True).exists()
        b_ok = answers.filter(question_number=q, sub_part='b', is_correct=True).exists()
        if a_ok and b_ok:
            exercises_correct += 1

    breakdown = []
    for a in answers:
        breakdown.append({
            'question_number': a.question_number,
            'sub_part': a.sub_part,
            'is_correct': a.is_correct,
        })

    return Response({
        'exercises_correct': exercises_correct,
        'exercises_total': 45,
        'points': points,
        'points_total': 55,
        'is_auto_submitted': session.is_auto_submitted,
        'breakdown': breakdown,
    })
```

**Step 3: Add student URLs**

Append to `backend/exams/urls.py`:
```python
from . import student_views

# Add to urlpatterns:
path('exams/<uuid:exam_id>/', student_views.exam_detail, name='exam-detail'),
path('exams/<uuid:exam_id>/pdf/', student_views.exam_pdf, name='exam-pdf'),
path('exams/<uuid:exam_id>/start/', student_views.start_exam, name='start-exam'),
path('sessions/<uuid:session_id>/answers/', student_views.save_answer, name='save-answer'),
path('sessions/<uuid:session_id>/submit/', student_views.submit_exam, name='submit-exam'),
path('sessions/<uuid:session_id>/results/', student_views.session_results, name='session-results'),
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add student API — exam start, answer save, submit, results"
```

---

## Task 7: Celery Auto-Submit Background Task

**Files:**
- Create: `backend/exams/tasks.py`
- Create: `backend/config/celery.py`
- Modify: `backend/config/__init__.py`
- Modify: `backend/config/settings.py`

**Step 1: Configure Celery**

Create `backend/config/celery.py`:
```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
```

Edit `backend/config/__init__.py`:
```python
from .celery import app as celery_app
__all__ = ('celery_app',)
```

Add to `backend/config/settings.py`:
```python
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_BEAT_SCHEDULE = {
    'auto-submit-expired-sessions': {
        'task': 'exams.tasks.auto_submit_expired_sessions',
        'schedule': 60.0,  # Every 60 seconds
    },
}
```

**Step 2: Write the auto-submit task**

Create `backend/exams/tasks.py`:
```python
from celery import shared_task
from django.utils import timezone
from datetime import timedelta


@shared_task
def auto_submit_expired_sessions():
    from .models import ExamSession
    from .student_views import _submit_session

    sessions = ExamSession.objects.filter(status=ExamSession.Status.IN_PROGRESS).select_related('exam')
    now = timezone.now()
    count = 0
    for session in sessions:
        elapsed = (now - session.started_at).total_seconds() / 60
        if elapsed >= session.exam.duration:
            _submit_session(session, auto=True)
            count += 1
    return f"Auto-submitted {count} sessions"
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add Celery task for auto-submitting expired exam sessions"
```

---

## Task 8: Frontend — API Client & Auth Context

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/context/AuthContext.tsx`

**Step 1: Define TypeScript types**

Create `frontend/src/api/types.ts`:
```typescript
export interface Exam {
  id: string
  title: string
  pdf_file: string
  open_at: string
  close_at: string
  duration: number
  created_at: string
  is_open?: boolean
}

export interface SessionStart {
  session_id: string
  started_at: string
  duration: number
}

export interface AnswerBreakdown {
  question_number: number
  sub_part: string | null
  is_correct: boolean
}

export interface ExamResults {
  exercises_correct: number
  exercises_total: number
  points: number
  points_total: number
  is_auto_submitted: boolean
  breakdown: AnswerBreakdown[]
}

export interface AuthResponse {
  access: string
  refresh: string
  student_id: string
  full_name: string
  exam_id?: string
}
```

**Step 2: Create API client**

Create `frontend/src/api/client.ts`:
```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
```

**Step 3: Create AuthContext**

Create `frontend/src/context/AuthContext.tsx`:
```tsx
import { createContext, useContext, useState, ReactNode } from 'react'
import api from '../api/client'
import { AuthResponse } from '../api/types'

interface AuthContextType {
  studentId: string | null
  fullName: string | null
  isAuthenticated: boolean
  loginWithInviteCode: (code: string, fullName: string) => Promise<AuthResponse>
  loginWithTelegram: (initData: string) => Promise<AuthResponse>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentId] = useState<string | null>(
    localStorage.getItem('student_id')
  )
  const [fullName, setFullName] = useState<string | null>(
    localStorage.getItem('full_name')
  )

  const setAuth = (data: AuthResponse) => {
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    localStorage.setItem('student_id', data.student_id)
    localStorage.setItem('full_name', data.full_name)
    setStudentId(data.student_id)
    setFullName(data.full_name)
  }

  const loginWithInviteCode = async (code: string, fullName: string) => {
    const { data } = await api.post<AuthResponse>('/auth/invite-code/', { code, full_name: fullName })
    setAuth(data)
    return data
  }

  const loginWithTelegram = async (initData: string) => {
    const { data } = await api.post<AuthResponse>('/auth/telegram/', { initData })
    setAuth(data)
    return data
  }

  const logout = () => {
    localStorage.clear()
    setStudentId(null)
    setFullName(null)
  }

  return (
    <AuthContext.Provider
      value={{
        studentId,
        fullName,
        isAuthenticated: !!studentId,
        loginWithInviteCode,
        loginWithTelegram,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add API client, TypeScript types, and AuthContext"
```

---

## Task 9: Frontend — Invite Code Login Page

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Build login page**

Create `frontend/src/pages/LoginPage.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginWithInviteCode } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await loginWithInviteCode(code, fullName)
      navigate(`/exam/${data.exam_id}`)
    } catch {
      setError('Invalid or used invite code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Math Mock Exam</h1>
        <input
          type="text"
          placeholder="Your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full border rounded px-3 py-2"
          required
        />
        <input
          type="text"
          placeholder="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full border rounded px-3 py-2 uppercase tracking-widest"
          required
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Entering...' : 'Enter Exam'}
        </button>
      </form>
    </div>
  )
}
```

**Step 2: Update App.tsx with route**

Edit `frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import LoginPage from './pages/LoginPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
```

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add invite code login page"
```

---

## Task 10: Frontend — Exam Page with PDF Viewer & Answer Sidebar

**Files:**
- Create: `frontend/src/pages/ExamPage.tsx`
- Create: `frontend/src/components/PdfViewer.tsx`
- Create: `frontend/src/components/AnswerSidebar.tsx`
- Create: `frontend/src/components/Timer.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Build Timer component**

Create `frontend/src/components/Timer.tsx`:
```tsx
import { useState, useEffect } from 'react'

interface TimerProps {
  startedAt: string
  durationMinutes: number
  onExpire: () => void
}

export default function Timer({ startedAt, durationMinutes, onExpire }: TimerProps) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000

    const tick = () => {
      const now = Date.now()
      const diff = endTime - now
      if (diff <= 0) {
        setRemaining('00:00:00')
        onExpire()
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startedAt, durationMinutes, onExpire])

  return (
    <span className="font-mono text-lg font-bold tabular-nums">{remaining}</span>
  )
}
```

**Step 2: Build PDF viewer**

Create `frontend/src/components/PdfViewer.tsx`:
```tsx
import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
}

export default function PdfViewer({ url }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b bg-gray-50">
        <button
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={pageNumber <= 1}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-30"
        >
          Prev
        </button>
        <span className="text-sm">
          Page {pageNumber} of {numPages}
        </span>
        <button
          onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-30"
        >
          Next
        </button>
      </div>
      <div className="flex-1 overflow-auto flex justify-center p-4 bg-gray-100">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        >
          <Page pageNumber={pageNumber} width={700} />
        </Document>
      </div>
    </div>
  )
}
```

**Step 3: Build Answer Sidebar**

Create `frontend/src/components/AnswerSidebar.tsx`:
```tsx
interface AnswerSidebarProps {
  answers: Record<string, string>
  onAnswer: (questionNumber: number, subPart: string | null, answer: string) => void
  onSubmit: () => void
  disabled: boolean
}

const MCQ_OPTIONS = ['A', 'B', 'C', 'D']

export default function AnswerSidebar({ answers, onAnswer, onSubmit, disabled }: AnswerSidebarProps) {
  const getKey = (q: number, sub: string | null) => sub ? `${q}_${sub}` : `${q}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* MCQ questions 1-35 */}
        {Array.from({ length: 35 }, (_, i) => i + 1).map((q) => (
          <div key={q} className="flex items-center gap-2">
            <span className="w-8 text-sm font-medium text-right">{q}.</span>
            <div className="flex gap-1">
              {MCQ_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onAnswer(q, null, opt)}
                  disabled={disabled}
                  className={`w-8 h-8 rounded text-sm font-medium border transition-colors ${
                    answers[getKey(q, null)] === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  } disabled:opacity-50`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Free text questions 36-45 */}
        {Array.from({ length: 10 }, (_, i) => i + 36).map((q) => (
          <div key={q} className="space-y-1">
            <span className="text-sm font-medium">{q}.</span>
            {['a', 'b'].map((sub) => (
              <div key={sub} className="flex items-center gap-2 ml-4">
                <span className="text-sm text-gray-500 w-4">{sub})</span>
                <input
                  type="text"
                  value={answers[getKey(q, sub)] || ''}
                  onChange={(e) => onAnswer(q, sub, e.target.value)}
                  disabled={disabled}
                  className="flex-1 border rounded px-2 py-1 text-sm disabled:opacity-50"
                  placeholder="Answer..."
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="p-4 border-t">
        <button
          onClick={onSubmit}
          disabled={disabled}
          className="w-full bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50"
        >
          Submit Exam
        </button>
      </div>
    </div>
  )
}
```

**Step 4: Build ExamPage**

Create `frontend/src/pages/ExamPage.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { Exam, SessionStart } from '../api/types'
import PdfViewer from '../components/PdfViewer'
import AnswerSidebar from '../components/AnswerSidebar'
import Timer from '../components/Timer'

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const { fullName } = useAuth()
  const navigate = useNavigate()

  const [exam, setExam] = useState<Exam | null>(null)
  const [session, setSession] = useState<SessionStart | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  useEffect(() => {
    api.get<Exam>(`/exams/${examId}/`).then(({ data }) => setExam(data))
  }, [examId])

  useEffect(() => {
    api.post<SessionStart>(`/exams/${examId}/start/`).then(({ data }) => {
      setSession(data)
    }).catch((err) => {
      if (err.response?.data?.error === 'Already submitted') {
        navigate(`/results/${examId}`)
      }
    })
  }, [examId, navigate])

  const saveAnswer = useCallback(
    (questionNumber: number, subPart: string | null, answer: string) => {
      if (!session) return
      const key = subPart ? `${questionNumber}_${subPart}` : `${questionNumber}`
      setAnswers((prev) => ({ ...prev, [key]: answer }))
      api.post(`/sessions/${session.session_id}/answers/`, {
        question_number: questionNumber,
        sub_part: subPart,
        answer,
      })
    },
    [session]
  )

  const handleSubmit = async () => {
    if (!session || submitted) return
    if (!confirm('Are you sure you want to submit?')) return
    await api.post(`/sessions/${session.session_id}/submit/`)
    setSubmitted(true)
    navigate(`/results/${session.session_id}`)
  }

  const handleExpire = useCallback(() => {
    if (!session || submitted) return
    api.post(`/sessions/${session.session_id}/submit/`).then(() => {
      setSubmitted(true)
      navigate(`/results/${session.session_id}`)
    })
  }, [session, submitted, navigate])

  if (!exam || !session) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm">
        <h1 className="font-bold text-lg">{exam.title}</h1>
        <Timer
          startedAt={session.started_at}
          durationMinutes={session.duration}
          onExpire={handleExpire}
        />
        <span className="text-sm text-gray-600">{fullName}</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF viewer */}
        <div className={`${showSidebar ? 'w-[70%]' : 'w-full'} h-full hidden md:block`}>
          <PdfViewer url={`/api/exams/${examId}/pdf/`} />
        </div>
        {/* Mobile PDF */}
        <div className="w-full h-full md:hidden">
          <PdfViewer url={`/api/exams/${examId}/pdf/`} />
        </div>

        {/* Sidebar — desktop */}
        {showSidebar && (
          <div className="w-[30%] border-l bg-white hidden md:flex flex-col">
            <AnswerSidebar
              answers={answers}
              onAnswer={saveAnswer}
              onSubmit={handleSubmit}
              disabled={submitted}
            />
          </div>
        )}
      </div>

      {/* Mobile toggle */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-50"
      >
        {showSidebar ? '×' : '✎'}
      </button>

      {/* Mobile sidebar sheet */}
      {showSidebar && (
        <div className="md:hidden fixed inset-x-0 bottom-0 top-16 bg-white z-40 overflow-auto">
          <AnswerSidebar
            answers={answers}
            onAnswer={saveAnswer}
            onSubmit={handleSubmit}
            disabled={submitted}
          />
        </div>
      )}
    </div>
  )
}
```

**Step 5: Add route to App.tsx**

Add to `frontend/src/App.tsx`:
```tsx
import ExamPage from './pages/ExamPage'

// Add to Routes:
<Route path="/exam/:examId" element={<ExamPage />} />
```

**Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add exam page with PDF viewer, answer sidebar, and timer"
```

---

## Task 11: Frontend — Results Page

**Files:**
- Create: `frontend/src/pages/ResultsPage.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Build results page**

Create `frontend/src/pages/ResultsPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api/client'
import { ExamResults } from '../api/types'

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [results, setResults] = useState<ExamResults | null>(null)

  useEffect(() => {
    api.get<ExamResults>(`/sessions/${sessionId}/results/`).then(({ data }) => setResults(data))
  }, [sessionId])

  if (!results) {
    return <div className="flex items-center justify-center h-screen">Loading results...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6">Exam Results</h1>

        {results.is_auto_submitted && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-sm text-yellow-800">
            Time expired — your exam was auto-submitted.
          </div>
        )}

        {/* Score summary */}
        <div className="flex gap-6 mb-8">
          <div className="flex-1 bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-blue-700">
              {results.exercises_correct}/{results.exercises_total}
            </div>
            <div className="text-sm text-blue-600 mt-1">exercises</div>
          </div>
          <div className="flex-1 bg-green-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-green-700">
              {results.points}/{results.points_total}
            </div>
            <div className="text-sm text-green-600 mt-1">points</div>
          </div>
        </div>

        {/* Breakdown */}
        <h2 className="text-lg font-semibold mb-3">Question Breakdown</h2>
        <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => i + 1).map((q) => {
            const entry = results.breakdown.find((b) => b.question_number === q && !b.sub_part)
            const answered = !!entry
            const correct = entry?.is_correct
            return (
              <div
                key={q}
                className={`rounded p-2 text-center text-sm font-medium ${
                  !answered
                    ? 'bg-gray-100 text-gray-400'
                    : correct
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {q}
              </div>
            )
          })}
        </div>

        {/* Questions 36-45 */}
        <div className="mt-4 space-y-2">
          {Array.from({ length: 10 }, (_, i) => i + 36).map((q) => {
            const a = results.breakdown.find((b) => b.question_number === q && b.sub_part === 'a')
            const b = results.breakdown.find((b) => b.question_number === q && b.sub_part === 'b')
            return (
              <div key={q} className="flex items-center gap-3 text-sm">
                <span className="w-8 font-medium">{q}.</span>
                <span className={a?.is_correct ? 'text-green-600' : 'text-red-600'}>
                  a) {a ? (a.is_correct ? 'Correct' : 'Wrong') : 'No answer'}
                </span>
                <span className={b?.is_correct ? 'text-green-600' : 'text-red-600'}>
                  b) {b ? (b.is_correct ? 'Correct' : 'Wrong') : 'No answer'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Add route**

Add to `frontend/src/App.tsx`:
```tsx
import ResultsPage from './pages/ResultsPage'

// Add to Routes:
<Route path="/results/:sessionId" element={<ResultsPage />} />
```

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add results page with score summary and question breakdown"
```

---

## Task 12: Frontend — Telegram Mini App Integration

**Files:**
- Create: `frontend/src/hooks/useTelegram.ts`
- Modify: `frontend/src/App.tsx`

**Step 1: Create Telegram hook**

Create `frontend/src/hooks/useTelegram.ts`:
```typescript
export function useTelegram() {
  const tg = (window as any).Telegram?.WebApp

  return {
    tg,
    isTelegram: !!tg,
    initData: tg?.initData || '',
    user: tg?.initDataUnsafe?.user,
    ready: () => tg?.ready(),
    expand: () => tg?.expand(),
  }
}
```

**Step 2: Update App.tsx to handle Telegram auto-login**

Modify `frontend/src/App.tsx` — add a `TelegramGate` component that:
1. Detects if running inside Telegram Mini App
2. If yes: auto-authenticates using `initData` and redirects to exam
3. If no: shows normal login page

```tsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useTelegram } from './hooks/useTelegram'
import LoginPage from './pages/LoginPage'
import ExamPage from './pages/ExamPage'
import ResultsPage from './pages/ResultsPage'

function TelegramGate({ children }: { children: React.ReactNode }) {
  const { isTelegram, initData, ready, expand } = useTelegram()
  const { isAuthenticated, loginWithTelegram } = useAuth()
  const [loading, setLoading] = useState(isTelegram && !isAuthenticated)

  useEffect(() => {
    if (isTelegram) {
      ready()
      expand()
      if (!isAuthenticated && initData) {
        loginWithTelegram(initData).finally(() => setLoading(false))
      }
    }
  }, [isTelegram, isAuthenticated, initData, loginWithTelegram, ready, expand])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Connecting...</div>
  }

  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <TelegramGate>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/exam/:examId" element={<ExamPage />} />
            <Route path="/results/:sessionId" element={<ResultsPage />} />
          </Routes>
        </TelegramGate>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
```

**Step 3: Add Telegram Web App script to index.html**

Add to `frontend/index.html` inside `<head>`:
```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

**Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: add Telegram Mini App integration with auto-login"
```

---

## Task 13: Admin Frontend — Exam Management

**Files:**
- Create: `frontend/src/pages/admin/AdminLoginPage.tsx`
- Create: `frontend/src/pages/admin/AdminDashboard.tsx`
- Create: `frontend/src/pages/admin/CreateExamPage.tsx`
- Create: `frontend/src/pages/admin/ExamAnswersPage.tsx`
- Create: `frontend/src/pages/admin/ExamResultsPage.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Admin login page**

Create `frontend/src/pages/admin/AdminLoginPage.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function AdminLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { data } = await axios.post('/api/token/', { username, password })
      localStorage.setItem('admin_access_token', data.access)
      localStorage.setItem('admin_refresh_token', data.refresh)
      navigate('/admin/dashboard')
    } catch {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Admin Login</h1>
        <input type="text" placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border rounded px-3 py-2" required />
        <input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2" required />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          Login
        </button>
      </form>
    </div>
  )
}
```

**Step 2: Admin dashboard**

Create `frontend/src/pages/admin/AdminDashboard.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { Exam } from '../../api/types'

const adminApi = axios.create({ baseURL: '/api' })
adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default function AdminDashboard() {
  const [exams, setExams] = useState<Exam[]>([])

  useEffect(() => {
    adminApi.get('/admin/exams/').then(({ data }) => setExams(data))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Mock Exams</h1>
          <Link to="/admin/exams/create"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Create Exam
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow-md">
          {exams.map((exam) => (
            <div key={exam.id} className="flex items-center justify-between p-4 border-b last:border-0">
              <div>
                <h2 className="font-semibold">{exam.title}</h2>
                <p className="text-sm text-gray-500">
                  {new Date(exam.open_at).toLocaleString()} — {new Date(exam.close_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/admin/exams/${exam.id}/answers`}
                  className="text-sm text-blue-600 hover:underline">Answers</Link>
                <Link to={`/admin/exams/${exam.id}/results`}
                  className="text-sm text-green-600 hover:underline">Results</Link>
                <Link to={`/admin/exams/${exam.id}/codes`}
                  className="text-sm text-purple-600 hover:underline">Codes</Link>
              </div>
            </div>
          ))}
          {exams.length === 0 && (
            <p className="p-4 text-gray-500 text-center">No exams yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Create exam page, answers page, results page**

These follow the same pattern — forms posting to the admin API. (Create `CreateExamPage.tsx` with file upload form, `ExamAnswersPage.tsx` with a table of 45 question answer inputs, `ExamResultsPage.tsx` with a student results table.)

Implementation details are straightforward form pages using the admin API endpoints.

**Step 4: Add admin JWT endpoint to Django**

Add to `backend/exams/urls.py`:
```python
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# Add to urlpatterns:
path('token/', TokenObtainPairView.as_view(), name='token-obtain'),
path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
```

**Step 5: Add admin routes to App.tsx**

```tsx
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminDashboard from './pages/admin/AdminDashboard'

// Add to Routes:
<Route path="/admin" element={<AdminLoginPage />} />
<Route path="/admin/dashboard" element={<AdminDashboard />} />
<Route path="/admin/exams/create" element={<CreateExamPage />} />
<Route path="/admin/exams/:examId/answers" element={<ExamAnswersPage />} />
<Route path="/admin/exams/:examId/results" element={<ExamResultsPage />} />
<Route path="/admin/exams/:examId/codes" element={<InviteCodesPage />} />
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add admin frontend — dashboard, exam creation, answers, results"
```

---

## Task 14: End-to-End Integration Testing

**Step 1: Create superuser and test data**

```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py createsuperuser --username admin --email admin@test.com
```

**Step 2: Manual smoke test**

1. Login as admin at `/admin`
2. Create an exam (upload a sample PDF, set open/close times)
3. Enter 45 correct answers
4. Generate invite codes
5. Open incognito window, go to `/`
6. Enter invite code + name
7. Verify PDF loads, answer questions, submit
8. Check results page shows score + breakdown
9. Verify admin results page shows the student

**Step 3: Verify Celery auto-submit**

```bash
celery -A config worker -l info
celery -A config beat -l info
```
Start an exam, wait for duration to expire, verify auto-submission.

**Step 4: Commit**

```bash
git add .
git commit -m "chore: integration test verification complete"
```

---

## Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Django backend scaffolding | None |
| 2 | React frontend scaffolding | None |
| 3 | Django data models (6 models) | Task 1 |
| 4 | Admin API endpoints | Task 3 |
| 5 | Auth API (Telegram + invite code) | Task 3 |
| 6 | Student API (session, answers, submit, results) | Task 3 |
| 7 | Celery auto-submit background task | Task 6 |
| 8 | Frontend API client & auth context | Task 2 |
| 9 | Frontend login page | Task 8 |
| 10 | Frontend exam page (PDF + sidebar + timer) | Task 8 |
| 11 | Frontend results page | Task 8 |
| 12 | Telegram Mini App integration | Task 8 |
| 13 | Admin frontend pages | Task 8 |
| 14 | Integration testing | All above |
