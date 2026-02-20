from django.urls import path
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views, auth_views, student_views, leaderboard_views, practice_views


class LoginRateThrottle(AnonRateThrottle):
    rate = '5/minute'


urlpatterns = [
    # Admin
    path('admin/exams/', views.admin_exams, name='admin-exams'),
    path('admin/exams/<uuid:exam_id>/answers/', views.admin_exam_answers, name='admin-exam-answers'),
    path('admin/exams/<uuid:exam_id>/results/', views.admin_exam_results, name='admin-exam-results'),

    # Auth
    path('auth/telegram/', auth_views.auth_telegram, name='auth-telegram'),
    path('auth/logout/', auth_views.auth_logout, name='auth-logout'),

    # JWT token endpoints (rate-limited to prevent brute force)
    path('token/', TokenObtainPairView.as_view(throttle_classes=[LoginRateThrottle]), name='token-obtain'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),

    # Student — Real exams
    path('exams/latest/', student_views.latest_exam, name='latest-exam'),
    path('exams/upcoming/', student_views.upcoming_exam, name='upcoming-exam'),
    path('exams/<uuid:exam_id>/', student_views.exam_detail, name='exam-detail'),
    path('exams/<uuid:exam_id>/pdf/', student_views.exam_pdf, name='exam-pdf'),
    path('exams/<uuid:exam_id>/start/', student_views.start_exam, name='start-exam'),
    path('exams/<uuid:exam_id>/lobby/', student_views.exam_lobby, name='exam-lobby'),
    path('sessions/<uuid:session_id>/answers/', student_views.save_answer, name='save-answer'),
    path('sessions/<uuid:session_id>/submit/', student_views.submit_exam, name='submit-exam'),
    path('sessions/<uuid:session_id>/results/', student_views.session_results, name='session-results'),

    # Practice
    path('practice/start/', practice_views.start_practice, name='start-practice'),
    path('practice/<uuid:session_id>/', practice_views.practice_detail, name='practice-detail'),
    path('practice/<uuid:session_id>/answer/', practice_views.practice_answer, name='practice-answer'),
    path('practice/<uuid:session_id>/submit/', practice_views.practice_submit, name='practice-submit'),
    path('practice/<uuid:session_id>/results/', practice_views.practice_results, name='practice-results'),

    # Leaderboard
    path('leaderboard/', leaderboard_views.leaderboard, name='leaderboard'),
    path('me/elo-history/', leaderboard_views.my_elo_history, name='my-elo-history'),
]
