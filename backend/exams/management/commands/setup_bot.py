import asyncio

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Configure Telegram bot: set webhook, commands, and menu button'

    def add_arguments(self, parser):
        parser.add_argument(
            '--webhook-url',
            default='https://api.math.xlog.uz/api/telegram/webhook/',
            help='Public HTTPS URL for the webhook endpoint',
        )
        parser.add_argument(
            '--remove-webhook',
            action='store_true',
            help='Remove the webhook (use for switching to polling)',
        )

    def handle(self, *args, **options):
        if not settings.TELEGRAM_BOT_TOKEN:
            self.stderr.write(self.style.ERROR(
                'TELEGRAM_BOT_TOKEN is not configured. Set it in .env'
            ))
            return
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self._setup(options))
        finally:
            loop.close()

    async def _setup(self, options):
        from telegram import Bot, BotCommand, MenuButtonWebApp, WebAppInfo

        bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
        webapp_url = settings.TELEGRAM_WEBAPP_URL

        # 1. Set or remove webhook
        if options['remove_webhook']:
            await bot.delete_webhook()
            self.stdout.write(self.style.SUCCESS('Webhook removed'))
        else:
            webhook_url = options['webhook_url']
            secret = settings.TELEGRAM_WEBHOOK_SECRET
            await bot.set_webhook(
                url=webhook_url,
                secret_token=secret or None,
                allowed_updates=['message'],
            )
            self.stdout.write(self.style.SUCCESS(f'Webhook set: {webhook_url}'))

        # 2. Set bot commands
        commands = [
            BotCommand('start', 'Mini App\'ni ochish'),
            BotCommand('help', 'Yordam'),
        ]
        await bot.set_my_commands(commands)
        self.stdout.write(self.style.SUCCESS('Bot commands set: /start, /help'))

        # 3. Set menu button to open the Mini App
        menu_button = MenuButtonWebApp(
            text='Imtihon',
            web_app=WebAppInfo(url=webapp_url),
        )
        await bot.set_chat_menu_button(menu_button=menu_button)
        self.stdout.write(self.style.SUCCESS(f'Menu button set: {webapp_url}'))

        # 4. Print bot info
        me = await bot.get_me()
        self.stdout.write(self.style.SUCCESS(
            f'\nBot ready: @{me.username} ({me.first_name})'
        ))
