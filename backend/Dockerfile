FROM python:3.11-slim

WORKDIR /app

# psycopg2-binary, pyjwt, etc. are all pure-Python or come as wheels — no system
# build deps needed. Skipping apt-get also avoids DNS/network issues at build time.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001", "--reload"]
