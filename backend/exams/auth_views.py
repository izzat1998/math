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
from rest_framework_simplejwt.exceptions import AuthenticationFailed as JWTAuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer as BaseTokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.utils import datetime_from_epoch
from rest_framework_simplejwt.views import TokenRefreshView

from .models import Student
from .permissions import StudentJWTAuthentication, IsStudent

logger = logging.getLogger(__name__)


class AuthRateThrottle(AnonRateThrottle):
    rate = '10/minute'

TELEGRAM_AUTH_MAX_AGE_SECONDS = 300  # 5 minutes


def _blacklist_student_token(token):
    """Blacklist a student token without the User lookup that simplejwt requires.

    simplejwt 5.5's built-in blacklist() does User.objects.get(id=<student_uuid>)
    which raises ValueError because User.id is an integer. This bypasses the User
    lookup and directly creates OutstandingToken + BlacklistedToken records.
    """
    jti = token.payload[jwt_settings.JTI_CLAIM]
    exp = token.payload['exp']
    outstanding, _ = OutstandingToken.objects.get_or_create(
        jti=jti,
        defaults={
            'user': None,
            'token': str(token),
            'expires_at': datetime_from_epoch(exp),
        },
    )
    return BlacklistedToken.objects.get_or_create(token=outstanding)


class StudentTokenRefreshSerializer(BaseTokenRefreshSerializer):
    """Token refresh that validates Student instead of Django User.

    simplejwt 5.5's default serializer does User.objects.get(id=<student_uuid>),
    which fails because our tokens carry a Student UUID in the 'student_id' claim
    while Django's User.id is an integer.
    """

    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])

        student_id = refresh.payload.get('student_id')
        if student_id and not Student.objects.filter(id=student_id).exists():
            raise JWTAuthenticationFailed('Student not found')

        data = {"access": str(refresh.access_token)}

        if jwt_settings.ROTATE_REFRESH_TOKENS:
            if jwt_settings.BLACKLIST_AFTER_ROTATION:
                _blacklist_student_token(refresh)
            refresh.set_jti()
            refresh.set_exp()
            refresh.set_iat()
            data["refresh"] = str(refresh)

        return data


class StudentTokenRefreshView(TokenRefreshView):
    serializer_class = StudentTokenRefreshSerializer


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
    if time.time() - auth_date > TELEGRAM_AUTH_MAX_AGE_SECONDS:
        return Response({"error": "auth_date eskirgan"}, status=status.HTTP_401_UNAUTHORIZED)

    user_data = _validate_telegram_init_data(init_data)
    if not user_data:
        return Response({"error": "initData noto'g'ri"}, status=status.HTTP_401_UNAUTHORIZED)

    telegram_id = user_data.get('id')
    first_name = user_data.get('first_name', '')
    last_name = user_data.get('last_name', '')
    full_name = f"{first_name} {last_name}".strip()

    student, created = Student.objects.get_or_create(
        telegram_id=telegram_id,
        defaults={'full_name': full_name},
    )

    # Sync name on every login (not just creation)
    if not created and student.full_name != full_name:
        student.full_name = full_name
        student.save(update_fields=['full_name'])

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
        _blacklist_student_token(token)
    except (TokenError, ValueError, AttributeError):
        pass  # Token expired, invalid, or not in outstanding tokens — treat as success

    return Response({'message': 'Chiqish muvaffaqiyatli'})
