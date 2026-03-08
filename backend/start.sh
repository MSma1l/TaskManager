#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until python -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
conn.close()
" 2>/dev/null; do
  echo "PostgreSQL not ready, retrying in 2s..."
  sleep 2
done

echo "PostgreSQL is ready!"

echo "Running migrations..."
alembic upgrade head

echo "Running seed..."
python seed.py

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
