#!/bin/bash
set -e
# Make container env vars available to cron jobs
printenv | grep -v '^_=' > /etc/environment
cron
exec tail -f /var/log/cron.log
