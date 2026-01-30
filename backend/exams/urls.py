from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views, auth_views, student_views

urlpatterns = [
    # Admin
    path('admin/exams/', views.admin_exams, name='admin-exams'),
    path('admin/exams/<uuid:exam_id>/answers/', views.admin_exam_answers, name='admin-exam-answers'),
    path('admin/exams/<uuid:exam_id>/invite-codes/', views.admin_generate_invite_codes, name='admin-invite-codes'),
    path('admin/exams/<uuid:exam_id>/results/', views.admin_exam_results, name='admin-exam-results'),

    # Auth
    path('auth/telegram/', auth_views.auth_telegram, name='auth-telegram'),
    path('auth/invite-code/', auth_views.auth_invite_code, name='auth-invite-code'),

    # JWT token endpoints
    path('token/', TokenObtainPairView.as_view(), name='token-obtain'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),

    # Student
    path('exams/<uuid:exam_id>/', student_views.exam_detail, name='exam-detail'),
    path('exams/<uuid:exam_id>/pdf/', student_views.exam_pdf, name='exam-pdf'),
    path('exams/<uuid:exam_id>/start/', student_views.start_exam, name='start-exam'),
    path('sessions/<uuid:session_id>/answers/', student_views.save_answer, name='save-answer'),
    path('sessions/<uuid:session_id>/submit/', student_views.submit_exam, name='submit-exam'),
    path('sessions/<uuid:session_id>/results/', student_views.session_results, name='session-results'),
]
