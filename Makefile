.PHONY: pull backend frontend restart deploy logs status db-backup

# Full deploy: pull + install deps + backup db + migrate + build + restart
deploy: pull db-backup backend frontend restart

# Pull latest code from git
pull:
	git pull origin main

# Backup database before migrations
db-backup:
	@mkdir -p backend/backups
	@echo "Backing up database..."
	@BACKUP_FILE=backend/backups/pre_deploy_$$(date +%Y%m%d_%H%M%S).sql; \
	PGPASSWORD=$$(cd backend && grep DB_PASSWORD .env | cut -d= -f2) \
	pg_dump -h localhost \
		-U $$(cd backend && grep DB_USER .env | cut -d= -f2) \
		$$(cd backend && grep DB_NAME .env | cut -d= -f2) \
		> "$$BACKUP_FILE" 2>&1; \
	if [ $$? -ne 0 ] || [ ! -s "$$BACKUP_FILE" ]; then \
		echo "ERROR: Database backup failed! Check credentials and pg_dump output:"; \
		cat "$$BACKUP_FILE"; \
		exit 1; \
	else \
		echo "Backup saved: $$BACKUP_FILE ($$(du -h "$$BACKUP_FILE" | cut -f1))"; \
	fi

# Backend: install deps, run migrations, collect static files
backend:
	cd backend && venv/bin/pip install -r requirements.txt
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
