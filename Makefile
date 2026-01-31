.PHONY: pull backend frontend restart deploy logs status

# Full deploy: pull + install deps + migrate + build + restart
deploy: pull backend frontend restart

# Pull latest code from git
pull:
	git pull

# Backend: install deps, run migrations, collect static files
backend:
	cd backend && venv/bin/pip install -r requirements.txt --quiet
	cd backend && venv/bin/python manage.py migrate --noinput
	cd backend && venv/bin/python manage.py collectstatic --noinput

# Frontend: install deps and build
frontend:
	cd frontend && npm install --silent
	cd frontend && npm run build

# Restart all services
restart:
	sudo systemctl restart math-gunicorn
	sudo systemctl restart math-celery
	sudo systemctl restart math-celerybeat

# Show service status
status:
	@sudo systemctl status math-gunicorn --no-pager -l
	@echo "---"
	@sudo systemctl status math-celery --no-pager -l
	@echo "---"
	@sudo systemctl status math-celerybeat --no-pager -l

# Tail logs for all services
logs:
	@sudo journalctl -u math-gunicorn -u math-celery -u math-celerybeat -f
