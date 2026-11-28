#!/bin/sh
set -eu

export POSTGRES_PASSWORD="${DB_PASSWORD:?Database password required}"

install -d -m 700 -o postgres -g postgres /run/postgresql-tls

install -m 600 -o postgres -g postgres \
    /run/certificates/database.key \
    /run/postgresql-tls/server.key

install -m 644 -o postgres -g postgres \
    /run/certificates/database.pem \
    /run/postgresql-tls/server.crt

exec docker-entrypoint.sh postgres \
    -c ssl=on \
    -c ssl_cert_file=/run/postgresql-tls/server.crt \
    -c ssl_key_file=/run/postgresql-tls/server.key \
    -c ssl_min_protocol_version=TLSv1.2 \
    -c password_encryption=scram-sha-256 \
    -c hba_file=/etc/postgresql/pg_hba.conf
