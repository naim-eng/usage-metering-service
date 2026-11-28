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
  removeTestOrganizationMembership,
  restoreTestOrganizationMembership,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
  createProjectThroughUI,
} from "./helpers/auth-browser";

test("denies project API access when active workspace membership is removed", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);
  const unauthorizedProject = createTestProject(account);

  let removedMembership:
    | Awaited<ReturnType<typeof removeTestOrganizationMembership>>
    | undefined;

  try {
    await registerTestAccount(page, account);
    await createOrganizationThroughUI(page, organization);
    await createProjectThroughUI(page, project);

    const listing = await page.request.get("/api/projects");

    expect(listing.status()).toBe(200);

    const originalProjects = await listing.json();

    expect(originalProjects.projects).toHaveLength(1);

    const record = originalProjects.projects[0];

    expect(record.slug).toBe(project.slug);

    const dashboardPath = `/api/projects/${record.id}/dashboard`;
    const keysPath = `/api/projects/${record.id}/api-keys`;

    const createdKey = await page.request.post(keysPath, {
          headers: { Origin: new URL(page.url()).origin },
      data: {
        name: "E2E stale membership key",
      },
    });

    expect(createdKey.status()).toBe(201);

    const key = await createdKey.json();

    expect(typeof key.id).toBe("string");

    const originalKeysResponse = await page.request.get(keysPath);

    expect(originalKeysResponse.status()).toBe(200);

    const originalKeys = await originalKeysResponse.json();

    removedMembership = await removeTestOrganizationMembership(
      account.email,
      organization.slug
    );

    const sessionResponse = await page.request.get(
      "/api/auth/get-session"
    );

    expect(sessionResponse.status()).toBe(200);

    const session = await sessionResponse.json();

    expect(session.user.email).toBe(account.email);

    expect(session.session.activeOrganizationId)
      .toBe(record.organizationId);

    const requests = [
      {
        method: "GET",
        path: "/api/projects",
      },
      {
        method: "POST",
        path: "/api/projects",
        data: {
          name: unauthorizedProject.name,
        },
      },
      {
        method: "GET",
        path: dashboardPath,
      },
      {
        method: "GET",
        path: keysPath,
      },
      {
        method: "POST",
        path: keysPath,
        data: {
          name: "Unauthorized stale membership key",
        },
      },
      {
        method: "DELETE",
        path: `${keysPath}/${key.id}`,
      },
    ];

    for (const request of requests) {
      const response = await page.request.fetch(request.path, {
        method: request.method,
        headers: request.method === "GET"
          ? {}
          : { Origin: new URL(page.url()).origin },
        data: request.data,
        maxRedirects: 0,
      });

      expect.soft(
        response.status(),
        `${request.method} ${request.path}`
      ).toBe(403);

      if (response.status() === 403) {
        expect.soft(await response.json()).toEqual({
          error: "Organization access denied",
        });
      }
    }

    await restoreTestOrganizationMembership(
      account.email,
      organization.slug,
      removedMembership
    );

    removedMembership = undefined;

    const restoredProjects = await page.request.get(
      "/api/projects"
    );

    expect(restoredProjects.status()).toBe(200);

    expect(await restoredProjects.json())
      .toEqual(originalProjects);

    const restoredKeys = await page.request.get(keysPath);

    expect(restoredKeys.status()).toBe(200);

    expect(await restoredKeys.json()).toEqual(originalKeys);

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        unauthorizedProject.slug
      )
    ).toBe(0);
  } finally {
    if (removedMembership) {
      await restoreTestOrganizationMembership(
        account.email,
        organization.slug,
        removedMembership
      );
    }

    for (const fixture of [unauthorizedProject, project]) {
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
