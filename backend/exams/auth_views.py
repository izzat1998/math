import hashlib
import hmac
import json
import logging
import time
from urllib.parse import parse_qs

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import Student
from .permissions import StudentJWTAuthentication, IsStudent

logger = logging.getLogger(__name__)


class AuthRateThrottle(AnonRateThrottle):
    rate = '10/minute'

TELEGRAM_AUTH_MAX_AGE_SECONDS = 300  # 5 minutes


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
    if not getattr(settings, 'TELEGRAM_BOT_TOKEN', ''):
        return Response(
            {'error': 'Telegram autentifikatsiya sozlanmagan'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    init_data = request.data.get('initData')
    if not init_data:
        return Response({'error': 'initData talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    # Check auth_date freshness to prevent replay attacks
    parsed_for_date = parse_qs(init_data)
    auth_date_str = parsed_for_date.get('auth_date', [None])[0]
    if not auth_date_str:
        return Response({"error": "auth_date mavjud emas"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        auth_date = int(auth_date_str)
    except (ValueError, TypeError):
        return Response({"error": "auth_date noto'g'ri"}, status=status.HTTP_400_BAD_REQUEST)
    if abs(time.time() - auth_date) > TELEGRAM_AUTH_MAX_AGE_SECONDS:
        return Response({"error": "auth_date eskirgan"}, status=status.HTTP_401_UNAUTHORIZED)

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
@authentication_classes([StudentJWTAuthentication])
@permission_classes([IsStudent])
def auth_logout(request):
    """Blacklist the refresh token to invalidate the session."""
    refresh_token = request.data.get('refresh')
    if not refresh_token:
        return Response({'error': 'refresh token talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
    except TokenError:
        pass  # Token already expired or invalid — treat as success

    return Response({'message': 'Chiqish muvaffaqiyatli'})
