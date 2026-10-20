#!/bin/sh
# Production entrypoint: apply migrations, collect admin static files, run the app server.
set -e
python manage.py migrate --noinput
python manage.py collectstatic --noinput -v0
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-3}" --access-logfile -
