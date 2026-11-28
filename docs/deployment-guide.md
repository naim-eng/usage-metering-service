# Deployment Guide

## Deployment Scope

The initial deployment target is a single-server Docker Compose
environment with one backend API replica.

This guide prepares the platform for future production deployment.
No public deployment or hosting purchase is required for local validation.

## Production Architecture

- Reverse proxy for public HTTPS traffic.
- Next.js frontend on a restricted application network.
- Express backend API on a restricted application network.
- PostgreSQL 17 with persistent storage and verified TLS.
- One-shot database migration service.
- Dedicated asynchronous event consumer.
- Authenticated and encrypted external SMTP service.

Only the reverse proxy exposes public application ports.

Administrative backend routes must not be exposed through public ingress.
Customer metering endpoints remain accessible through HTTPS.

## Infrastructure Requirements

- Linux host with Docker Engine and Docker Compose.
- Separate production configuration and persistent database storage.
- Strong, independently generated production secrets.
- Valid TLS certificates and trusted proxy configuration.
- Restricted application and database networks.
- Persistent backups stored outside the database volume.
- Monitoring and documented recovery procedures.

## Deployment Isolation

Production configuration must remain separate from development,
demo and automated testing environments.

Production services must not reuse local database volumes,
test credentials or local email infrastructure.

The backend must remain at one replica until distributed
rate limiting has been implemented and validated.

## Deployment Status

Production infrastructure configuration and local deployment
rehearsals are being prepared.

Actual hosting, public DNS, publicly trusted certificates and
live SMTP verification remain outstanding.

## Related Documentation

- [Installation](installation.md)
- [Production ingress security](production-ingress.md)
- [Environment security](environment-security.md)
- [Operations](operations-guide.md)
- [Database](database.md)

## Production Environment Preparation

Production configuration templates are available in:

- [Backend environment](../deploy/backend.env.example)
- [Frontend environment](../deploy/frontend.env.example)

Copy these templates into backend.env and frontend.env
within the deploy directory when preparing an actual deployment.

Restrict populated environment files to authorized operators
using file permissions of 600.

Generate independent database, authentication and administrative
secrets using a cryptographically secure random generator:

    openssl rand -hex 32

The frontend METERING_ADMIN_API_KEY must match the backend
ADMIN_API_KEY. The authentication secret must be independent.

URL-encode database credentials when constructing connection URLs.

Production database connections require verified TLS.
Frontend-to-backend connections require HTTPS.

Use authenticated SMTP with mandatory TLS encryption.

Never commit populated environment files, private keys,
database backups or production credentials.

Keep PRODUCTION_INGRESS_CONFIGURED disabled until the
ingress and network isolation requirements have been verified.

The supplied templates intentionally contain placeholders
and are not runnable production configurations.

Custom PostgreSQL CA support across all database adapters
requires further implementation or verification.
