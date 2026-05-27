FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium --with-deps

COPY scripts/ ./scripts/
COPY crontab /etc/cron.d/newsboard
COPY entrypoint.sh /entrypoint.sh

RUN chmod 0644 /etc/cron.d/newsboard \
    && chmod +x /entrypoint.sh \
    && touch /var/log/cron.log

ENTRYPOINT ["/entrypoint.sh"]
