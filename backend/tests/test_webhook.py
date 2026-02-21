import json

from django.test import TestCase, RequestFactory, override_settings
from exams.bot_views import telegram_webhook


WEBHOOK_SECRET = 'test-secret-token'


@override_settings(
    TELEGRAM_WEBHOOK_SECRET=WEBHOOK_SECRET,
    TELEGRAM_BOT_TOKEN='fake:token',
    TELEGRAM_WEBAPP_URL='https://example.com',
)
class TestTelegramWebhook(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _post(self, payload, secret=WEBHOOK_SECRET):
        headers = {}
        if secret is not None:
            headers['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] = secret
        return self.factory.post(
            '/api/telegram/webhook/',
            data=json.dumps(payload),
            content_type='application/json',
            **headers,
        )

    def test_valid_secret_returns_200(self):
        request = self._post({'update_id': 1})
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 200)

    def test_wrong_secret_returns_403(self):
        request = self._post({'update_id': 1}, secret='wrong')
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 403)

    def test_missing_secret_returns_403(self):
        request = self._post({'update_id': 1}, secret=None)
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 403)

    def test_invalid_json_returns_400(self):
        request = self.factory.post(
            '/api/telegram/webhook/',
            data='not json',
            content_type='application/json',
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=WEBHOOK_SECRET,
        )
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 400)

    def test_message_without_chat_returns_200(self):
        """Malformed message without chat field should not crash."""
        payload = {
            'update_id': 1,
            'message': {'message_id': 1, 'text': '/start', 'date': 1},
        }
        request = self._post(payload)
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 200)

    def test_message_without_text_returns_200(self):
        """Message without text (e.g. photo) should be handled gracefully."""
        payload = {
            'update_id': 1,
            'message': {
                'message_id': 1,
                'chat': {'id': 123, 'type': 'private'},
                'date': 1,
            },
        }
        request = self._post(payload)
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 200)

    def test_non_message_update_returns_200(self):
        """Update types other than message should be accepted silently."""
        payload = {
            'update_id': 1,
            'edited_message': {'message_id': 1, 'chat': {'id': 123}},
        }
        request = self._post(payload)
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 200)

    def test_empty_body_returns_400(self):
        request = self.factory.post(
            '/api/telegram/webhook/',
            data='',
            content_type='application/json',
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=WEBHOOK_SECRET,
        )
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 400)

    @override_settings(TELEGRAM_WEBHOOK_SECRET='', DEBUG=True)
    def test_empty_secret_skips_validation_in_debug(self):
        """When secret is empty and DEBUG=True, any request should pass through."""
        request = self._post({'update_id': 1}, secret=None)
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(TELEGRAM_WEBHOOK_SECRET='', DEBUG=False)
    def test_empty_secret_rejects_in_production(self):
        """When secret is empty and DEBUG=False, requests are rejected with 500."""
        request = self._post({'update_id': 1}, secret=None)
        response = telegram_webhook(request)
        self.assertEqual(response.status_code, 500)
