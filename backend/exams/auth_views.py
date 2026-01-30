import hashlib
import hmac
import json
from urllib.parse import parse_qs

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Student, InviteCode


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

    if computed_hash != received_hash:
        return None

    user_data = parsed.get('user', [None])[0]
    if user_data:
        return json.loads(user_data)
    return None


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
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
def auth_invite_code(request):
    code = request.data.get('code')
    full_name = request.data.get('full_name')

    if not code or not full_name:
        return Response(
            {"error": "Kod va to'liq ism talab qilinadi"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        invite = InviteCode.objects.get(code=code, is_used=False)
    except InviteCode.DoesNotExist:
        return Response(
            {"error": "Taklif kodi noto'g'ri yoki ishlatilgan"},
            status=status.HTTP_404_NOT_FOUND,
        )

    student = Student.objects.create(full_name=full_name)
    invite.is_used = True
    invite.used_by = student
    invite.save()

    return Response({
        **_get_tokens_for_student(student),
        'exam_id': str(invite.exam.id),
    })
