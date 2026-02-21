import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from exams.models import Student
from tests.helpers import authenticated_client, make_student

BOT_TOKEN = 'test-bot-token-for-testing'


def _build_init_data(user_data, bot_token=BOT_TOKEN):
    """Build valid Telegram initData with HMAC signature."""
    auth_date = str(int(time.time()))
    params = {
        'user': json.dumps(user_data),
        'auth_date': auth_date,
    }
    data_check_string = '\n'.join(
        f"{k}={v}" for k, v in sorted(params.items())
    )
    secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    hash_value = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    params['hash'] = hash_value
    return urlencode(params, doseq=True)


@override_settings(TELEGRAM_BOT_TOKEN=BOT_TOKEN)
class TestTelegramAuthHTTP(TestCase):
    """Test POST /api/auth/telegram/ through actual HTTP."""

    def setUp(self):
        cache.clear()  # Reset throttle counters between tests
        self.client = APIClient()
        self.url = '/api/auth/telegram/'

    def test_valid_initdata_creates_student_and_returns_tokens(self):
        user_data = {'id': 12345, 'first_name': 'Izzat', 'last_name': 'Khamraev'}
        init_data = _build_init_data(user_data)

        response = self.client.post(self.url, {'initData': init_data}, format='json')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertIn('student_id', data)
        self.assertEqual(data['full_name'], 'Izzat Khamraev')

        # Student was actually created in DB
        self.assertTrue(Student.objects.filter(telegram_id=12345).exists())

    def test_second_login_syncs_name(self):
        """Name updates on subsequent logins."""
        user_data = {'id': 99999, 'first_name': 'Old', 'last_name': 'Name'}
        init_data = _build_init_data(user_data)
        self.client.post(self.url, {'initData': init_data}, format='json')

        # Login again with new name
        user_data['first_name'] = 'New'
        init_data = _build_init_data(user_data)
        response = self.client.post(self.url, {'initData': init_data}, format='json')

        self.assertEqual(response.status_code, 200)
        student = Student.objects.get(telegram_id=99999)
        self.assertEqual(student.full_name, 'New Name')

    def test_missing_initdata_returns_400(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_signature_returns_401(self):
        user_data = {'id': 12345, 'first_name': 'Hacker'}
        init_data = _build_init_data(user_data, bot_token='wrong-token')
        response = self.client.post(self.url, {'initData': init_data}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_expired_auth_date_returns_401(self):
        """initData older than 5 minutes should be rejected."""
        auth_date = str(int(time.time()) - 600)  # 10 minutes ago
        params = {
            'user': json.dumps({'id': 12345, 'first_name': 'Test'}),
            'auth_date': auth_date,
        }
        data_check_string = '\n'.join(f"{k}={v}" for k, v in sorted(params.items()))
        secret = hmac.new(b'WebAppData', BOT_TOKEN.encode(), hashlib.sha256).digest()
        params['hash'] = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
        init_data = urlencode(params, doseq=True)

        response = self.client.post(self.url, {'initData': init_data}, format='json')
        self.assertEqual(response.status_code, 401)


class TestAuthProtection(TestCase):
    """Verify endpoints reject unauthenticated requests."""

    def setUp(self):
        self.client = APIClient()

    def test_dashboard_requires_auth(self):
        response = self.client.get('/api/me/dashboard/')
        self.assertIn(response.status_code, [401, 403])

    def test_exam_start_requires_auth(self):
        response = self.client.post('/api/exams/00000000-0000-0000-0000-000000000001/start/')
        self.assertIn(response.status_code, [401, 403])

    def test_leaderboard_allows_anonymous(self):
        """Leaderboard is AllowAny."""
        response = self.client.get('/api/leaderboard/')
        self.assertEqual(response.status_code, 200)

    def test_upcoming_exam_allows_anonymous(self):
        response = self.client.get('/api/exams/upcoming/')
        self.assertEqual(response.status_code, 200)


class TestTokenRefresh(TestCase):
    """Test JWT token refresh flow."""

    def test_refresh_returns_new_access_token(self):
        client, student = authenticated_client()
        from exams.auth_views import _get_tokens_for_student
        tokens = _get_tokens_for_student(student)

        refresh_client = APIClient()
        response = refresh_client.post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.json())

    def test_invalid_refresh_token_rejected(self):
        client = APIClient()
        response = client.post('/api/token/refresh/', {'refresh': 'invalid-token'}, format='json')
        self.assertEqual(response.status_code, 401)


class TestLogout(TestCase):
    """Test POST /api/auth/logout/ blacklists token."""

    def test_logout_blacklists_refresh_token(self):
        client, student = authenticated_client()
        from exams.auth_views import _get_tokens_for_student
        tokens = _get_tokens_for_student(student)

        response = client.post('/api/auth/logout/', {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 200)

        # Refresh with blacklisted token should fail
        anon = APIClient()
        refresh_response = anon.post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(refresh_response.status_code, 401)
