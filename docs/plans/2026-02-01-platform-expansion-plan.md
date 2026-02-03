# Platform Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a student dashboard with three exam modes (Light, Medium, Real) — practice question bank, practice sessions, and a scheduled lobby for Real exams.

**Architecture:** New `Question` and `PracticeSession` models run alongside existing PDF exam system. `MockExam` gets scheduling fields. New frontend pages (Dashboard, Practice, Lobby) added via new routes. Existing exam flow untouched.

**Tech Stack:** Django 6 + DRF (backend), React 19 + TypeScript + Vite + TailwindCSS (frontend), existing JWT auth

---

## Task 1: Question and PracticeSession Models

**Files:**
- Modify: `backend/exams/models.py`
- Modify: `backend/exams/admin.py`

**Step 1: Add Question model to models.py**

Add after the `ItemDifficulty` model at the bottom of `backend/exams/models.py`:

```python
class Question(models.Model):
    class AnswerType(models.TextChoices):
        MULTIPLE_CHOICE = 'multiple_choice', 'Ko\'p tanlov'
        FREE_RESPONSE = 'free_response', 'Erkin javob'

    TOPIC_CHOICES = [
        ('algebra', 'Algebra'),
        ('geometry', 'Geometriya'),
        ('probability', 'Ehtimollik'),
        ('calculus', 'Analiz'),
        ('trigonometry', 'Trigonometriya'),
        ('number_theory', 'Sonlar nazariyasi'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    text = models.TextField(help_text="Savol matni")
    image = models.ImageField(upload_to='questions/images/', null=True, blank=True)
    topic = models.CharField(max_length=50, choices=TOPIC_CHOICES)
    difficulty = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], default=3)
    answer_type = models.CharField(max_length=20, choices=AnswerType.choices, default=AnswerType.MULTIPLE_CHOICE)
    choices = models.JSONField(null=True, blank=True, help_text="Variantlar ro'yxati, masalan: ['A', 'B', 'C', 'D']")
    correct_answer = models.CharField(max_length=255)
    explanation = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.topic}] {self.text[:60]}"


class PracticeSession(models.Model):
    class Mode(models.TextChoices):
        LIGHT = 'light', 'Yengil (30 daq)'
        MEDIUM = 'medium', 'O\'rta (60 daq)'

    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'Jarayonda'
        SUBMITTED = 'submitted', 'Topshirilgan'

    MODE_CONFIG = {
        'light': {'question_count': 10, 'duration': 30},
        'medium': {'question_count': 20, 'duration': 60},
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='practice_sessions')
    mode = models.CharField(max_length=10, choices=Mode.choices)
    questions = models.ManyToManyField(Question, related_name='practice_sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    duration = models.IntegerField(help_text="Daqiqalarda")
    submitted_at = models.DateTimeField(null=True, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    score = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    def __str__(self):
        return f"{self.student} — {self.get_mode_display()} ({self.status})"
```

**Step 2: Add scheduling fields to MockExam**

Add after `created_at` in the `MockExam` model:

```python
    scheduled_start = models.DateTimeField(null=True, blank=True, help_text="Rejalashtirilgan boshlanish vaqti")
    scheduled_end = models.DateTimeField(null=True, blank=True, help_text="Rejalashtirilgan tugash vaqti")
    is_scheduled = models.BooleanField(default=False, help_text="Rejalashtirilgan imtihon")
```

**Step 3: Register new models in admin.py**

Add to `backend/exams/admin.py`:

```python
from .models import Question, PracticeSession

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['text_short', 'topic', 'difficulty', 'answer_type', 'created_at']
    list_filter = ['topic', 'difficulty', 'answer_type']
    search_fields = ['text']

    def text_short(self, obj):
        return obj.text[:80]
    text_short.short_description = 'Savol'

admin.site.register(PracticeSession)
```

Also update `MockExam` registration to expose scheduling fields — unregister and re-register:

```python
admin.site.unregister(MockExam)

@admin.register(MockExam)
class MockExamAdmin(admin.ModelAdmin):
    list_display = ['title', 'is_scheduled', 'scheduled_start', 'scheduled_end', 'created_at']
    list_filter = ['is_scheduled']
```

**Step 4: Create and run migration**

Run:
```bash
cd backend && source venv/bin/activate && python manage.py makemigrations exams
python manage.py migrate
```

**Step 5: Commit**

```bash
git add backend/exams/models.py backend/exams/admin.py backend/exams/migrations/
git commit -m "feat: add Question, PracticeSession models and MockExam scheduling fields"
```

---

## Task 2: Practice Session API Endpoints

**Files:**
- Create: `backend/exams/practice_views.py`
- Modify: `backend/exams/serializers.py`
- Modify: `backend/exams/urls.py`

**Step 1: Add serializers**

Add to `backend/exams/serializers.py`:

```python
from .models import Question, PracticeSession

class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'text', 'image', 'topic', 'difficulty', 'answer_type', 'choices']
        # Note: correct_answer and explanation NOT included — only shown in results


class QuestionResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'text', 'image', 'topic', 'difficulty', 'answer_type', 'choices', 'correct_answer', 'explanation']


class PracticeSessionSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)

    class Meta:
        model = PracticeSession
        fields = ['id', 'mode', 'questions', 'started_at', 'duration', 'answers', 'status']
```

**Step 2: Create practice_views.py**

Create `backend/exams/practice_views.py`:

```python
import random
from collections import defaultdict

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .models import Question, PracticeSession
from .permissions import StudentJWTAuthentication, IsStudent
from .serializers import PracticeSessionSerializer, QuestionResultSerializer

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


def _assemble_questions(count):
    """Pick `count` questions balanced by topic, then by difficulty."""
    all_questions = list(Question.objects.all())
    if len(all_questions) <= count:
        return all_questions

    # Group by topic
    by_topic = defaultdict(list)
    for q in all_questions:
        by_topic[q.topic].append(q)

    # Shuffle within each topic
    for topic_list in by_topic.values():
        random.shuffle(topic_list)

    # Round-robin pick across topics
    selected = []
    topics = list(by_topic.keys())
    random.shuffle(topics)
    idx = 0
    while len(selected) < count:
        topic = topics[idx % len(topics)]
        if by_topic[topic]:
            selected.append(by_topic[topic].pop())
        else:
            topics.remove(topic)
            if not topics:
                break
            idx = idx % len(topics)
            continue
        idx += 1

    return selected


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def start_practice(request):
    mode = request.data.get('mode')
    if mode not in PracticeSession.MODE_CONFIG:
        return Response({'error': "Noto'g'ri rejim. 'light' yoki 'medium' tanlang."},
                        status=status.HTTP_400_BAD_REQUEST)

    config = PracticeSession.MODE_CONFIG[mode]
    questions = _assemble_questions(config['question_count'])

    if not questions:
        return Response({'error': "Savollar bazasi bo'sh."}, status=status.HTTP_404_NOT_FOUND)

    session = PracticeSession.objects.create(
        student=request.user,
        mode=mode,
        duration=config['duration'],
    )
    session.questions.set(questions)

    return Response(PracticeSessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_detail(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)
    return Response(PracticeSessionSerializer(session).data)


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_answer(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)

    if session.status == PracticeSession.Status.SUBMITTED:
        return Response({'error': 'Allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    elapsed = (timezone.now() - session.started_at).total_seconds() / 60
    if elapsed >= session.duration:
        _submit_practice(session)
        return Response({'error': 'Vaqt tugadi, avtomatik topshirildi'}, status=status.HTTP_403_FORBIDDEN)

    question_id = request.data.get('question_id')
    answer = request.data.get('answer')
    if not question_id or not answer:
        return Response({'error': 'question_id va answer talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    answers = session.answers or {}
    answers[str(question_id)] = answer
    session.answers = answers
    session.save(update_fields=['answers'])

    return Response({'message': 'Javob saqlandi'})


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_submit(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)

    if session.status == PracticeSession.Status.SUBMITTED:
        return Response({'error': 'Allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    _submit_practice(session)
    return Response({'message': 'Topshirildi'})


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_results(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)

    if session.status != PracticeSession.Status.SUBMITTED:
        return Response({'error': 'Hali topshirilmagan'}, status=status.HTTP_403_FORBIDDEN)

    questions = session.questions.all()
    answers = session.answers or {}

    breakdown = []
    for q in questions:
        student_answer = answers.get(str(q.id), '')
        is_correct = student_answer.strip().lower() == q.correct_answer.strip().lower()
        breakdown.append({
            'question': QuestionResultSerializer(q).data,
            'student_answer': student_answer,
            'is_correct': is_correct,
        })

    return Response({
        'session_id': str(session.id),
        'mode': session.mode,
        'score': session.score,
        'total': questions.count(),
        'duration': session.duration,
        'started_at': session.started_at.isoformat(),
        'submitted_at': session.submitted_at.isoformat() if session.submitted_at else None,
        'breakdown': breakdown,
    })


def _submit_practice(session):
    questions = {str(q.id): q for q in session.questions.all()}
    answers = session.answers or {}
    correct = 0
    for qid, q in questions.items():
        student_answer = answers.get(qid, '')
        if student_answer.strip().lower() == q.correct_answer.strip().lower():
            correct += 1
    session.score = correct
    session.status = PracticeSession.Status.SUBMITTED
    session.submitted_at = timezone.now()
    session.save()
```

**Step 3: Add scheduling & lobby endpoints**

Add to `backend/exams/student_views.py`:

```python
@api_view(['GET'])
@permission_classes([AllowAny])
def upcoming_exam(request):
    """Return the next scheduled Real exam."""
    now = timezone.now()
    exam = MockExam.objects.filter(
        is_scheduled=True,
        scheduled_end__gt=now,
    ).order_by('scheduled_start').first()

    if not exam:
        return Response({'exam': None})

    return Response({
        'exam': {
            'id': str(exam.id),
            'title': exam.title,
            'scheduled_start': exam.scheduled_start.isoformat(),
            'scheduled_end': exam.scheduled_end.isoformat(),
            'has_started': now >= exam.scheduled_start,
        }
    })


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_lobby(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id, is_scheduled=True)
    now = timezone.now()

    has_started = now >= exam.scheduled_start
    has_ended = now >= exam.scheduled_end

    return Response({
        'id': str(exam.id),
        'title': exam.title,
        'scheduled_start': exam.scheduled_start.isoformat(),
        'scheduled_end': exam.scheduled_end.isoformat(),
        'has_started': has_started,
        'has_ended': has_ended,
    })
```

**Step 4: Wire up URLs**

Add to `backend/exams/urls.py`:

```python
from . import practice_views

# Add these URL patterns:

    # Practice
    path('practice/start/', practice_views.start_practice, name='start-practice'),
    path('practice/<uuid:session_id>/', practice_views.practice_detail, name='practice-detail'),
    path('practice/<uuid:session_id>/answer/', practice_views.practice_answer, name='practice-answer'),
    path('practice/<uuid:session_id>/submit/', practice_views.practice_submit, name='practice-submit'),
    path('practice/<uuid:session_id>/results/', practice_views.practice_results, name='practice-results'),

    # Scheduling
    path('exams/upcoming/', student_views.upcoming_exam, name='upcoming-exam'),
    path('exams/<uuid:exam_id>/lobby/', student_views.exam_lobby, name='exam-lobby'),
```

**Step 5: Commit**

```bash
git add backend/exams/practice_views.py backend/exams/serializers.py backend/exams/urls.py backend/exams/student_views.py
git commit -m "feat: add practice session and lobby API endpoints"
```

---

## Task 3: Frontend Types and API Client

**Files:**
- Modify: `frontend/src/api/types.ts`

**Step 1: Add new TypeScript types**

Add to `frontend/src/api/types.ts`:

```typescript
export interface Question {
  id: string
  text: string
  image: string | null
  topic: string
  difficulty: number
  answer_type: 'multiple_choice' | 'free_response'
  choices: string[] | null
}

export interface QuestionResult extends Question {
  correct_answer: string
  explanation: string
}

export interface PracticeSession {
  id: string
  mode: 'light' | 'medium'
  questions: Question[]
  started_at: string
  duration: number
  answers: Record<string, string>
  status: 'in_progress' | 'submitted'
}

export interface PracticeBreakdown {
  question: QuestionResult
  student_answer: string
  is_correct: boolean
}

export interface PracticeResults {
  session_id: string
  mode: string
  score: number
  total: number
  duration: number
  started_at: string
  submitted_at: string | null
  breakdown: PracticeBreakdown[]
}

export interface UpcomingExam {
  exam: {
    id: string
    title: string
    scheduled_start: string
    scheduled_end: string
    has_started: boolean
  } | null
}

export interface LobbyInfo {
  id: string
  title: string
  scheduled_start: string
  scheduled_end: string
  has_started: boolean
  has_ended: boolean
}
```

**Step 2: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add TypeScript types for practice sessions and lobby"
```

---

## Task 4: Dashboard Page

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create DashboardPage**

Create `frontend/src/pages/DashboardPage.tsx` — a clean page with three cards (Light, Medium, Real). The Real card fetches `/api/exams/upcoming/` and shows the next exam time or "Rejalashtirilgan imtihon yo'q".

Key details:
- Uses existing `api` client for the upcoming exam fetch
- Uses `useNavigate` for navigation
- Light/Medium cards call `POST /api/practice/start/` with `{mode: "light"|"medium"}` and navigate to `/practice/:id`
- Real card navigates to `/exam/:id/lobby` or shows disabled state
- Matches existing design system: `bg-slate-50 bg-noise`, `rounded-2xl`, primary/accent colors, `font-bold tracking-tight`
- Mobile-first layout (cards stack vertically, full width)
- Shows student name + ELO badge in header (reuse `EloBadge` component)

**Step 2: Update App.tsx routes**

In `frontend/src/App.tsx`:
- Import `DashboardPage`
- Change `"/"` route to render `<DashboardPage />` (both dev and prod)
- Remove `DevRedirect` component
- Add routes for `/practice/:id`, `/practice/:id/results`, `/exam/:id/lobby`

```tsx
<Route path="/" element={<DashboardPage />} />
<Route path="/practice/:id" element={<PracticeExamPage />} />
<Route path="/practice/:id/results" element={<PracticeResultsPage />} />
<Route path="/exam/:id/lobby" element={<LobbyPage />} />
```

**Step 3: Update LoginPage redirect**

In `frontend/src/pages/LoginPage.tsx`, change `handleSubmit` to navigate to `/` instead of `/exam/${data.exam_id}`:

```tsx
navigate('/')
```

**Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/App.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat: add student dashboard with Light, Medium, Real exam cards"
```

---

## Task 5: Practice Exam Page

**Files:**
- Create: `frontend/src/pages/PracticeExamPage.tsx`

**Step 1: Create PracticeExamPage**

Create `frontend/src/pages/PracticeExamPage.tsx` — question-by-question practice UI.

Key details:
- Reads `session_id` from URL params
- On mount: `GET /api/practice/:id/` to load session (questions, existing answers, time)
- Shows one question at a time with prev/next navigation
- Question display: text (large), optional image, then either multiple-choice buttons or free-response input with `MathKeyboard`
- Question counter: "3 / 10" in header
- Reuses `Timer` component with `session.started_at` and `session.duration`
- Each answer change: `POST /api/practice/:id/answer/` with `{question_id, answer}`
- Submit button: `POST /api/practice/:id/submit/` then navigate to `/practice/:id/results`
- Auto-submit on timer expire (same flow)
- Navigation dots/pills at bottom showing answered vs unanswered questions
- Mobile layout: full screen, question centered, nav at bottom
- Desktop layout: centered card (max-w-2xl), question + nav

**Step 2: Commit**

```bash
git add frontend/src/pages/PracticeExamPage.tsx
git commit -m "feat: add practice exam page with question-by-question UI"
```

---

## Task 6: Practice Results Page

**Files:**
- Create: `frontend/src/pages/PracticeResultsPage.tsx`

**Step 1: Create PracticeResultsPage**

Create `frontend/src/pages/PracticeResultsPage.tsx` — shows score and breakdown after submitting.

Key details:
- Reads `session_id` from URL params (`:id`)
- On mount: `GET /api/practice/:id/results/`
- Header: score display (e.g. "7 / 10") with percentage, mode label
- Breakdown: scrollable list of questions, each showing:
  - Question text
  - Student answer (green if correct, red if wrong)
  - Correct answer (always shown)
  - Explanation (if available, in a muted box)
- "Boshqa mashq" button → navigates back to `/` (dashboard)
- Follows existing results page patterns from `ResultsPage.tsx`

**Step 2: Commit**

```bash
git add frontend/src/pages/PracticeResultsPage.tsx
git commit -m "feat: add practice results page with score breakdown"
```

---

## Task 7: Lobby Page

**Files:**
- Create: `frontend/src/pages/LobbyPage.tsx`

**Step 1: Create LobbyPage**

Create `frontend/src/pages/LobbyPage.tsx` — countdown waiting room for scheduled Real exams.

Key details:
- Reads `examId` from URL params
- On mount: `GET /api/exams/:id/lobby/` to get lobby info
- If `has_started` is true → navigate directly to `/exam/:id` (late arrival)
- If `has_ended` is true → show "Imtihon tugagan" message
- Otherwise: show countdown timer to `scheduled_start`
  - Large centered countdown: "02:14:33" format
  - Exam title above
  - "Imtihon boshlanishiga..." label
  - Subtle pulsing dot or animation
- Uses `setInterval` (1 second) to update countdown
- When countdown reaches 0 → auto-navigate to `/exam/:id`
- Back button to return to dashboard
- Same design system: centered layout, primary colors, clean typography

**Step 2: Commit**

```bash
git add frontend/src/pages/LobbyPage.tsx
git commit -m "feat: add exam lobby page with countdown timer"
```

---

## Task 8: Wire Everything Together and Test

**Files:**
- Modify: `frontend/src/App.tsx` (ensure all imports work)
- Verify: all backend endpoints respond correctly

**Step 1: Verify backend**

```bash
cd backend && source venv/bin/activate
python manage.py runserver 0.0.0.0:8007
```

Test endpoints manually:
- `GET /api/exams/upcoming/` → should return `{"exam": null}` or upcoming exam
- `POST /api/practice/start/` with `{"mode": "light"}` → should return session (after adding questions via admin)

**Step 2: Verify frontend**

```bash
cd frontend && npm run dev
```

- Open `http://localhost:5173/`
- Should see dashboard with three cards
- Light/Medium should work if questions exist in DB
- Real card should show upcoming exam or "no exam" state

**Step 3: Add sample questions via Django admin**

- Open `http://localhost:8007/admin/`
- Add 10+ questions with varied topics and difficulties
- Test Light mode practice flow end-to-end

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: wire up all routes and fix integration issues"
```
