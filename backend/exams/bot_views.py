import asyncio
import hmac
import json
import logging

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)


@csrf_exempt
@require_POST
def telegram_webhook(request):
    """Handle incoming Telegram Bot API webhook updates."""
    expected_secret = getattr(settings, 'TELEGRAM_WEBHOOK_SECRET', '')
    if expected_secret:
        token = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
        if not hmac.compare_digest(token, expected_secret):
            return JsonResponse({'error': 'unauthorized'}, status=403)
    elif not settings.DEBUG:
        logger.error("TELEGRAM_WEBHOOK_SECRET is not set; rejecting webhook request")
        return JsonResponse({'error': 'webhook secret not configured'}, status=500)

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'invalid json'}, status=400)

    message = data.get('message')
    if message:
        chat = message.get('chat')
        if not chat or 'id' not in chat:
            return JsonResponse({'ok': True})

        chat_id = chat['id']
        text = message.get('text', '')

        if text.startswith('/start'):
            _run_async(_send_welcome(chat_id))
        elif text.startswith('/help'):
            _run_async(_send_help(chat_id))

    return JsonResponse({'ok': True})


def _run_async(coro):
    """Run an async coroutine from sync Django context."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(coro)
    finally:
        loop.close()


async def _send_welcome(chat_id):
    from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    webapp_url = settings.TELEGRAM_WEBAPP_URL

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="\U0001f4dd Imtihonga kirish",
            web_app=WebAppInfo(url=webapp_url),
        )]
    ])

    try:
        await bot.send_message(
            chat_id=chat_id,
            text=(
                "\U0001f393 <b>Math Mock Exam</b>\n\n"
                "Xush kelibsiz! Bu bot orqali siz:\n"
                "\u2022 Mock imtihonlarni topshirishingiz\n"
                "\u2022 O'z natijalaringizni ko'rishingiz\n"
                "\u2022 Reyting jadvalida o'rningizni bilishingiz mumkin\n\n"
                "Boshlash uchun quyidagi tugmani bosing \U0001f447"
            ),
            parse_mode='HTML',
            reply_markup=keyboard,
        )
    except Exception as e:
        logger.error("Failed to send welcome to %s: %s", chat_id, e)


async def _send_help(chat_id):
    from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    webapp_url = settings.TELEGRAM_WEBAPP_URL

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="\U0001f4dd Mini App'ni ochish",
            web_app=WebAppInfo(url=webapp_url),
        )]
    ])

    try:
        await bot.send_message(
            chat_id=chat_id,
            text=(
                "\u2753 <b>Yordam</b>\n\n"
                "<b>Qanday ishlaydi:</b>\n"
                "1. Quyidagi tugmani bosing\n"
                "2. Mini App ochiladi\n"
                "3. Imtihon mavjud bo'lsa, uni boshlang\n"
                "4. 150 daqiqa ichida 45 ta savolga javob bering\n"
                "5. Natijangiz avtomatik hisoblanadi\n\n"
                "<b>Baho tizimi:</b>\n"
                "\u2022 1-35: Test (A/B/C/D)\n"
                "\u2022 36-45: Yozma (a va b qismlari)\n"
                "\u2022 Maksimal ball: 55"
            ),
            parse_mode='HTML',
            reply_markup=keyboard,
        )
    except Exception as e:
        logger.error("Failed to send help to %s: %s", chat_id, e)
