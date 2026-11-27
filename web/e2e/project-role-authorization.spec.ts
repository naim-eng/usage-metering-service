import { test, expect } from "@playwright/test";

import {
  createTestAccount,
  createTestOrganization,
  createTestProject,
  countTestAccounts,
  countTestOrganizations,
  countTestProjects,
  cleanupTestAccount,
  cleanupTestOrganization,
  cleanupTestProject,
  setTestOrganizationOwnerRole,
} from "./helpers/auth-test-data";

import {
  registerTestAccount,
  createOrganizationThroughUI,
  createProjectThroughUI,
} from "./helpers/auth-browser";

test("enforces project API permissions for owners, admins and members", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  const additionalProjects = {
    owner: createTestProject(account),
    admin: createTestProject(account),
    member: createTestProject(account),
  };

  let currentRole: "owner" | "admin" | "member" = "owner";

  try {
    await registerTestAccount(page, account);
    await createOrganizationThroughUI(page, organization);
    await createProjectThroughUI(page, project);

    const initialListing = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(initialListing.status()).toBe(200);

    const initialData = await initialListing.json();

    expect(initialData.projects).toHaveLength(1);

    const record = initialData.projects[0];

    expect(record.slug).toBe(project.slug);

    const dashboardPath =
      `/api/projects/${record.id}/dashboard`;

    const keysPath =
      `/api/projects/${record.id}/api-keys`;

    for (const role of ["owner", "admin"] as const) {
      if (currentRole !== role) {
        await setTestOrganizationOwnerRole(
          account.email,
          organization.slug,
          role,
          currentRole
        );

        currentRole = role;
      }

      const listing = await page.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

      expect(listing.status()).toBe(200);

      const dashboard = await page.request.get(
        dashboardPath,
        { maxRedirects: 0 }
      );

      expect(dashboard.status()).toBe(200);

      const projectCreation = await page.request.post(
        "/api/projects",
        {
          data: {
            name: additionalProjects[role].name,
          },
          maxRedirects: 0,
        }
      );

      expect(projectCreation.status()).toBe(201);

      const keyCreation = await page.request.post(
        keysPath,
        {
          data: {
            name: `E2E ${role} authorization key`,
          },
          maxRedirects: 0,
        }
      );

      expect(keyCreation.status()).toBe(201);

      const createdKey = await keyCreation.json();

      expect(createdKey.projectId).toBe(record.id);
      expect(typeof createdKey.id).toBe("string");

      const keyListing = await page.request.get(
        keysPath,
        { maxRedirects: 0 }
      );

      expect(keyListing.status()).toBe(200);

      const keyData = await keyListing.json();

      expect(keyData.apiKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: createdKey.id,
            revokedAt: null,
          }),
        ])
      );

      const revocation = await page.request.delete(
        `${keysPath}/${createdKey.id}`,
        { maxRedirects: 0 }
      );

      expect(revocation.status()).toBe(200);

      const afterRevocation = await page.request.get(
        keysPath,
        { maxRedirects: 0 }
      );

      expect(afterRevocation.status()).toBe(200);

      const revokedData = await afterRevocation.json();

      expect(revokedData.apiKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: createdKey.id,
            revokedAt: expect.any(String),
          }),
        ])
      );
    }

    const protectedKeyResponse = await page.request.post(
      keysPath,
      {
        data: {
          name: "E2E member isolation key",
        },
        maxRedirects: 0,
      }
    );

    expect(protectedKeyResponse.status()).toBe(201);

    const protectedKey = await protectedKeyResponse.json();

    expect(typeof protectedKey.id).toBe("string");

    const beforeProjects = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    const beforeKeys = await page.request.get(
      keysPath,
      { maxRedirects: 0 }
    );

    expect(beforeProjects.status()).toBe(200);
    expect(beforeKeys.status()).toBe(200);

    const expectedProjects = await beforeProjects.json();
    const expectedKeys = await beforeKeys.json();

    expect(expectedProjects.projects).toHaveLength(3);
    expect(expectedKeys.apiKeys).toHaveLength(4);
    expect(expectedKeys.apiKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Original project key",
          projectId: record.id,
          revokedAt: null,
        }),
      ])
    );

    await setTestOrganizationOwnerRole(
      account.email,
      organization.slug,
      "member",
      currentRole
    );

    currentRole = "member";

    const membershipResponse = await page.request.get(
      "/api/auth/organization/get-active-member"
    );

    expect(membershipResponse.status()).toBe(200);

    const membership = await membershipResponse.json();

    expect(membership.role).toBe("member");
    expect(membership.organizationId).toBe(record.organizationId);

    for (const role of ["admin", "owner"]) {
      const promotion = await page.request.post(
        "/api/auth/organization/update-member-role",
        {
          data: {
            memberId: membership.id,
            organizationId: record.organizationId,
            role,
          },
          maxRedirects: 0,
        }
      );

      expect([400, 403]).toContain(promotion.status());

      const unchanged = await page.request.get(
        "/api/auth/organization/get-active-member"
      );

      expect(unchanged.status()).toBe(200);
      expect((await unchanged.json()).role).toBe("member");
    }

    const organizationUpdate = await page.request.post(
      "/api/auth/organization/update",
      {
        data: {
          organizationId: record.organizationId,
          data: {
            name: "Unauthorized organization update",
          },
        },
        maxRedirects: 0,
      }
    );

    expect(organizationUpdate.status()).toBe(403);

    const invitation = await page.request.post(
      "/api/auth/organization/invite-member",
      {
        data: {
          email: account.email,
          organizationId: record.organizationId,
          role: "owner",
        },
        maxRedirects: 0,
      }
    );

    expect(invitation.status()).toBe(403);

    const removal = await page.request.post(
      "/api/auth/organization/remove-member",
      {
        data: {
          memberIdOrEmail: membership.id,
          organizationId: record.organizationId,
        },
        maxRedirects: 0,
      }
    );

    expect(removal.status()).toBe(403);

    const finalMembership = await page.request.get(
      "/api/auth/organization/get-active-member"
    );

    expect(finalMembership.status()).toBe(200);
    expect((await finalMembership.json()).role).toBe("member");



    const deniedRequests = [
      await page.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      ),

      await page.request.post(
        "/api/projects",
        {
          data: {
            name: additionalProjects.member.name,
          },
          maxRedirects: 0,
        }
      ),

      await page.request.get(
        dashboardPath,
        { maxRedirects: 0 }
      ),

      await page.request.get(
        keysPath,
        { maxRedirects: 0 }
      ),

      await page.request.post(
        keysPath,
        {
          data: {
            name: "Unauthorized member key",
          },
          maxRedirects: 0,
        }
      ),

      await page.request.delete(
        `${keysPath}/${protectedKey.id}`,
        { maxRedirects: 0 }
      ),
    ];

    for (const response of deniedRequests) {
      expect(response.status()).toBe(403);

      expect(await response.json()).toEqual({
        error: "Insufficient permissions",
      });
    }

    await setTestOrganizationOwnerRole(
      account.email,
      organization.slug,
      "owner",
      currentRole
    );

    currentRole = "owner";

    const afterProjects = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    const afterKeys = await page.request.get(
      keysPath,
      { maxRedirects: 0 }
    );

    expect(afterProjects.status()).toBe(200);
    expect(afterKeys.status()).toBe(200);

    expect(await afterProjects.json()).toEqual(
      expectedProjects
    );

    expect(await afterKeys.json()).toEqual(
      expectedKeys
    );

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        additionalProjects.member.slug
      )
    ).toBe(0);
  } finally {
    if (currentRole !== "owner") {
      await setTestOrganizationOwnerRole(
        account.email,
        organization.slug,
        "owner",
        currentRole
      );
    }

    for (const fixture of [
      ...Object.values(additionalProjects),
      project,
    ]) {
      await cleanupTestProject(
        account.email,
        organization.slug,
        fixture.slug
      );

      expect(
        await countTestProjects(
          account.email,
          organization.slug,
          fixture.slug
        )
      ).toBe(0);
    }

    await cleanupTestOrganization(
      account.email,
      organization.slug
    );

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(0);

    await cleanupTestAccount(account.email);

    expect(
      await countTestAccounts(account.email)
    ).toBe(0);
  }
});
