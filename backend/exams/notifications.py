import asyncio
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def notify_new_exam(exam):
    """
    Notify all registered users and channel about a new exam.
    Called from Celery task.
    """
    bot_token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    channel_id = getattr(settings, 'TELEGRAM_CHANNEL_ID', None)

    if not bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not configured, skipping notifications")
        return

    text = (
        f"\U0001f4dd <b>Yangi Mock Exam!</b>\n\n"
        f"<b>{exam.title}</b>\n"
        f"\U0001f4c5 Boshlanishi: {exam.scheduled_start.strftime('%d.%m.%Y %H:%M')}\n"
        f"\U0001f4c5 Tugashi: {exam.scheduled_end.strftime('%d.%m.%Y %H:%M')}\n"
        f"\u23f1 Davomiyligi: {exam.duration} daqiqa\n\n"
        f"Mini App orqali ishtirok eting!"
    )

    try:
        from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
    except ImportError:
        logger.warning("python-telegram-bot not installed, skipping notifications")
        return

    webapp_url = getattr(settings, 'TELEGRAM_WEBAPP_URL', 'https://math.xlog.uz')
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="\U0001f4dd Imtihonga kirish",
            web_app=WebAppInfo(url=webapp_url),
        )]
    ])

    async def _send_messages():
        bot = Bot(token=bot_token)

        # Send to channel first
        if channel_id:
            try:
                await bot.send_message(
                    chat_id=channel_id, text=text,
                    parse_mode='HTML', reply_markup=keyboard,
                )
                logger.info("Sent exam notification to channel %s", channel_id)
            except Exception as e:
                logger.error("Channel notification failed: %s", e)

        # Send DMs to all registered students
        from exams.models import Student
        telegram_ids = list(Student.objects.values_list('telegram_id', flat=True))
        sent = 0
        for tid in telegram_ids:
            try:
                await bot.send_message(
                    chat_id=tid, text=text,
                    parse_mode='HTML', reply_markup=keyboard,
                )
                sent += 1
            except Exception as e:
                logger.warning("DM to %s failed: %s", tid, e)

        logger.info("Sent exam notification DMs to %d/%d students", sent, len(telegram_ids))

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_send_messages())
    finally:
        loop.close()
