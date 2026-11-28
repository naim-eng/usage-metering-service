# Deployment Readiness

## Deployment status

The application has completed a local production
infrastructure rehearsal using Docker Compose.

No public deployment or paid infrastructure has been provisioned.

## Verified infrastructure

- Production backend and frontend container builds.
- Non-root application container execution.
- HTTPS reverse proxy with trusted local certificates.
- Restricted public API routes and HTTP methods.
- Private frontend-to-backend API ingress.
- Separate frontend and backend database networks.
- Four blocked direct application connection attempts.
- PostgreSQL TLS encryption and certificate validation.
- Independent Prisma TLSv1.3 connection verification.
- Prisma rejection of an untrusted certificate authority.
- Prisma rejection of an incorrect database hostname.

## Verified database operations

- Eleven database migrations.
- Migration checksum verification.
- Migration repeatability and transaction rollback.
- Full database backup and temporary database restoration.
- Application rollback with unchanged database data.

## Verified operational controls

- Five persistent container health checks.
- Six container log rotation configurations.
- Consumer heartbeat monitoring.
- Outbox event status monitoring.
- Four HTTPS operational endpoint checks.
- Controlled consumer failure detection and recovery.
- Previous backend deployment and current version restoration.

## Operational documentation

- [Deployment guide](deployment-guide.md)
- [Production ingress](production-ingress.md)
- [Production rehearsal](production-rehearsal.md)
- [Database deployment](database-deployment.md)
- [Database recovery](database-recovery.md)
- [Production monitoring](production-monitoring.md)
- [Deployment rollback](deployment-rollback.md)

## Remaining public deployment requirements

- Provision the actual hosting infrastructure.
- Configure public DNS and trusted public TLS certificates.
- Configure private API ingress and trusted proxy addresses.
- Provision production secrets and appropriate database roles.
- Configure authenticated SMTP and controlled outbound access.
- Verify email delivery and authentication on the deployed system.
- Configure scheduled monitoring and external alert delivery.
- Establish encrypted off-host backups and retention policies.
- Retain versioned application images in a registry.
- Establish resource, latency and recovery objectives.
- Validate security controls against the actual infrastructure.

The local rehearsal uses placeholder SMTP configuration.
Live SMTP delivery and external service connectivity
have not been verified.

The frontend requires controlled outbound connectivity
for external email and password security services.

Database network separation does not establish database
role or schema-level least privilege.

Backup and rollback rehearsals used local rehearsal data,
not representative production customer workloads.

## Readiness conclusion

Local production infrastructure preparation and operational
rehearsal have been completed.

Final regression testing and GitHub CI verification
remain required before closing the deployment preparation step.

Public deployment readiness remains conditional on the
external infrastructure and operational requirements above.
