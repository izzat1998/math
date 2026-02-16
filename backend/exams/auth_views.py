import hashlib
import hmac
import json
import logging
from urllib.parse import parse_qs

from django.conf import settings
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Student, InviteCode

logger = logging.getLogger(__name__)


class AuthRateThrottle(AnonRateThrottle):
    rate = '10/minute'


def _get_tokens_for_student(student):
    refresh = RefreshToken()
    refresh['student_id'] = str(student.id)
    refresh['full_name'] = student.full_name
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'student_id': str(student.id),
        'full_name': student.full_name,
    }


def _validate_telegram_init_data(init_data_raw):
    """Validate Telegram Mini App initData per Telegram docs."""
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.error('TELEGRAM_BOT_TOKEN is not configured — Telegram auth disabled')
        return None

    parsed = parse_qs(init_data_raw)
    received_hash = parsed.get('hash', [None])[0]
    if not received_hash:
        return None

    data_check_string = '\n'.join(
        f"{key}={values[0]}"
        for key, values in sorted(parsed.items())
        if key != 'hash'
    )

    secret_key = hmac.new(
        b'WebAppData', settings.TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    computed_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    user_data = parsed.get('user', [None])[0]
    if user_data:
        return json.loads(user_data)
    return None


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def auth_telegram(request):
    init_data = request.data.get('initData')
    if not init_data:
        return Response({'error': 'initData talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    user_data = _validate_telegram_init_data(init_data)
    if not user_data:
        return Response({"error": "initData noto'g'ri"}, status=status.HTTP_401_UNAUTHORIZED)

    telegram_id = user_data.get('id')
    first_name = user_data.get('first_name', '')
    last_name = user_data.get('last_name', '')
    full_name = f"{first_name} {last_name}".strip()

    student, _ = Student.objects.get_or_create(
        telegram_id=telegram_id,
        defaults={'full_name': full_name},
    )

    return Response(_get_tokens_for_student(student))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def auth_invite_code(request):
    code = request.data.get('code')
    full_name = request.data.get('full_name')

    if not code or not full_name:
        return Response(
            {"error": "Kod va to'liq ism talab qilinadi"},
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

    student = Student.objects.create(full_name=full_name)
    if not invite.reusable:
        invite.is_used = True
        invite.used_by = student
        invite.save()

    return Response({
        **_get_tokens_for_student(student),
        'exam_id': str(invite.exam.id),
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
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
        logger.warning('Google OAuth token verification failed')
        return Response(
            {'error': 'Google token yaroqsiz'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    google_id = id_info['sub']
    email = id_info.get('email', '')
    name = id_info.get('name', '')

    student = Student.objects.filter(google_id=google_id).first()
    if not student and email:
        student = Student.objects.filter(email=email).first()
        if student:
            student.google_id = google_id
            student.save(update_fields=['google_id'])

    if not student:
        student = Student.objects.create(
            full_name=name,
            email=email or None,
            google_id=google_id,
        )

    return Response(_get_tokens_for_student(student))
