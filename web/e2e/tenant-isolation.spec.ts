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
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
  createProjectThroughUI,
} from "./helpers/auth-browser";

test("isolates projects between independent customers", async ({
  browser,
}) => {
  const firstAccount = createTestAccount();
  const secondAccount = createTestAccount();

  const firstOrganization = createTestOrganization(firstAccount);
  const secondOrganization = createTestOrganization(secondAccount);

  const firstProject = createTestProject(firstAccount);
  const secondProject = createTestProject(secondAccount);

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();

  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await registerTestAccount(firstPage, firstAccount);
    await createOrganizationThroughUI(firstPage, firstOrganization);
    await createProjectThroughUI(firstPage, firstProject);

    await registerTestAccount(secondPage, secondAccount);
    await createOrganizationThroughUI(secondPage, secondOrganization);
    await createProjectThroughUI(secondPage, secondProject);

    const firstResponse = await firstPage.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    const secondResponse = await secondPage.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(firstResponse.status()).toBe(200);
    expect(secondResponse.status()).toBe(200);

    const firstListing = await firstResponse.json();
    const secondListing = await secondResponse.json();

    expect(firstListing.projects).toHaveLength(1);
    expect(secondListing.projects).toHaveLength(1);

    const firstRecord = firstListing.projects[0];
    const secondRecord = secondListing.projects[0];

    expect(firstRecord).toMatchObject({
      name: firstProject.name,
      slug: firstProject.slug,
      status: "active",
    });

    expect(secondRecord).toMatchObject({
      name: secondProject.name,
      slug: secondProject.slug,
      status: "active",
    });

    expect(firstRecord.id).not.toBe(secondRecord.id);
    expect(firstRecord.organizationId)
      .not.toBe(secondRecord.organizationId);

    await expect(
      firstPage.getByRole("heading", {
        name: secondProject.name,
        exact: true,
      })
    ).toHaveCount(0);

    await expect(
      secondPage.getByRole("heading", {
        name: firstProject.name,
        exact: true,
      })
    ).toHaveCount(0);

    for (const [page, own, foreign] of [
      [firstPage, firstRecord, secondRecord],
      [secondPage, secondRecord, firstRecord],
    ] as const) {
      const ownDashboard = await page.request.get(
        `/api/projects/${own.id}/dashboard`,
        { maxRedirects: 0 }
      );

      expect(ownDashboard.status()).toBe(200);

      expect(await ownDashboard.json()).toMatchObject({
        project: {
          id: own.id,
          organizationId: own.organizationId,
          name: own.name,
        },
      });

      const foreignDashboard = await page.request.get(
        `/api/projects/${foreign.id}/dashboard`,
        { maxRedirects: 0 }
      );

      expect(foreignDashboard.status()).toBe(404);

      expect(await foreignDashboard.json()).toEqual({
        error: "Project not found",
      });

      const ownKeysPath = `/api/projects/${own.id}/api-keys`;
      const foreignKeysPath = `/api/projects/${foreign.id}/api-keys`;

      const initialKeys = await page.request.get(
        ownKeysPath,
        { maxRedirects: 0 }
      );

      expect(initialKeys.status()).toBe(200);

      const foreignKeys = await page.request.get(
        foreignKeysPath,
        { maxRedirects: 0 }
      );

      expect(foreignKeys.status()).toBe(404);

      expect(await foreignKeys.json()).toEqual({
        error: "Project not found",
      });

      const unauthorizedCreation = await page.request.post(
        foreignKeysPath,
        {
          headers: { Origin: new URL(page.url()).origin },
          data: {
            name: "Unauthorized cross-tenant key",
            organizationId: foreign.organizationId,
          },
          maxRedirects: 0,
        }
      );

      expect(unauthorizedCreation.status()).toBe(404);

      expect(await unauthorizedCreation.json()).toEqual({
        error: "Project not found",
      });

      const authorizedCreation = await page.request.post(
        ownKeysPath,
        {
          headers: { Origin: new URL(page.url()).origin },
          data: {
            name: "E2E tenant isolation key",
            organizationId: foreign.organizationId,
          },
          maxRedirects: 0,
        }
      );

      expect(authorizedCreation.status()).toBe(201);

      const createdKey = await authorizedCreation.json();

      expect(createdKey.projectId).toBe(own.id);
      expect(typeof createdKey.id).toBe("string");

      const ownKeys = await page.request.get(
        ownKeysPath,
        { maxRedirects: 0 }
      );

      expect(ownKeys.status()).toBe(200);

      const ownKeyListing = await ownKeys.json();

      expect(ownKeyListing.apiKeys).toHaveLength(2);
      expect(ownKeyListing.apiKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Original project key",
            revokedAt: null,
          }),
        ])
      );

      expect(
        ownKeyListing.apiKeys.find(
          (key: { id: string }) => key.id === createdKey.id
        )
      ).toMatchObject({
        id: createdKey.id,
        projectId: own.id,
        name: "E2E tenant isolation key",
        revokedAt: null,
      });

      for (const key of ownKeyListing.apiKeys) {
        expect(key).not.toHaveProperty("apiKey");
        expect(key).not.toHaveProperty("keyHash");
        expect(key).not.toHaveProperty("key_hash");
        expect(key).not.toHaveProperty("api_key_hash");
      }

      const forgedListing = await page.request.get(
        `/api/projects?organizationId=${encodeURIComponent(foreign.organizationId)}`,
        { maxRedirects: 0 }
      );

      expect(forgedListing.status()).toBe(200);

      expect(await forgedListing.json()).toEqual({
        projects: [own],
      });
    }

    for (const [ownerPage, attackerPage, own, foreign] of [
      [firstPage, secondPage, firstRecord, secondRecord],
      [secondPage, firstPage, secondRecord, firstRecord],
    ] as const) {
      const keysPath = `/api/projects/${own.id}/api-keys`;

      const before = await ownerPage.request.get(
        keysPath,
        { maxRedirects: 0 }
      );

      expect(before.status()).toBe(200);

      const originalListing = await before.json();

      expect(originalListing.apiKeys).toHaveLength(2);
      expect(originalListing.apiKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Original project key",
            revokedAt: null,
          }),
        ])
      );

      const key = originalListing.apiKeys.find(
        (item: { name: string }) =>
          item.name === "E2E tenant isolation key"
      );

      expect(key).toBeDefined();

      expect(key.revokedAt).toBeNull();

      const unauthorizedRevocation =
        await attackerPage.request.delete(
          `${keysPath}/${key.id}?organizationId=${encodeURIComponent(own.organizationId)}`,
          {
          headers: { Origin: new URL(attackerPage.url()).origin }, maxRedirects: 0 }
        );

      expect(unauthorizedRevocation.status()).toBe(404);

      expect(await unauthorizedRevocation.json()).toEqual({
        error: "Project or API key not found",
      });

      const mismatchedProjectRevocation =
        await attackerPage.request.delete(
          `/api/projects/${foreign.id}/api-keys/${key.id}`,
          {
          headers: { Origin: new URL(attackerPage.url()).origin }, maxRedirects: 0 }
        );

      expect(mismatchedProjectRevocation.status()).toBe(404);

      expect(await mismatchedProjectRevocation.json()).toEqual({
        error: "Project or API key not found",
      });

      const after = await ownerPage.request.get(
        keysPath,
        { maxRedirects: 0 }
      );

      expect(after.status()).toBe(200);

      expect(await after.json()).toEqual(originalListing);
    }

    expect(
      await countTestProjects(
        firstAccount.email,
        firstOrganization.slug,
        firstProject.slug
      )
    ).toBe(1);

    expect(
      await countTestProjects(
        secondAccount.email,
        secondOrganization.slug,
        secondProject.slug
      )
    ).toBe(1);
  } finally {
    await firstContext.close();
    await secondContext.close();

    for (const [account, organization, project] of [
      [firstAccount, firstOrganization, firstProject],
      [secondAccount, secondOrganization, secondProject],
    ] as const) {
      await cleanupTestProject(
        account.email,
        organization.slug,
        project.slug
      );

      expect(
        await countTestProjects(
          account.email,
          organization.slug,
          project.slug
        )
      ).toBe(0);

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
  }
});

test("isolates projects between workspaces owned by the same customer", async ({
  page,
}) => {
  const account = createTestAccount();

  const firstOrganization = createTestOrganization(account);
  const secondOrganization = createTestOrganization(account, 2);

  const firstProject = createTestProject(account);
  const secondProject = createTestProject(account);

  try {
    await registerTestAccount(page, account);

    await createOrganizationThroughUI(page, firstOrganization);
    await createProjectThroughUI(page, firstProject);

    const firstResponse = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(firstResponse.status()).toBe(200);

    const firstListing = await firstResponse.json();

    expect(firstListing.projects).toHaveLength(1);

    const firstRecord = firstListing.projects[0];

    expect(firstRecord.slug).toBe(firstProject.slug);

    await createOrganizationThroughUI(page, secondOrganization);
    await createProjectThroughUI(page, secondProject);

    const secondResponse = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(secondResponse.status()).toBe(200);

    const secondListing = await secondResponse.json();

    expect(secondListing.projects).toHaveLength(1);

    const secondRecord = secondListing.projects[0];

    expect(secondRecord.slug).toBe(secondProject.slug);

    expect(firstRecord.organizationId)
      .not.toBe(secondRecord.organizationId);

    expect(firstRecord.id).not.toBe(secondRecord.id);

    for (const [organization, own, foreign] of [
      [secondOrganization, secondRecord, firstRecord],
      [firstOrganization, firstRecord, secondRecord],
      [secondOrganization, secondRecord, firstRecord],
    ] as const) {
      await page.goto("/");

      const switcher = page.getByLabel("Active workspace", {
        exact: true,
      });

      await expect(switcher).toBeVisible();

      const selected = await switcher
        .locator("option:checked").textContent();

      if (selected !== organization.name) {
        await switcher.selectOption({
          label: organization.name,
        });
      }

      await expect(
        page.getByRole("heading", {
          name: organization.name,
          exact: true,
        })
      ).toBeVisible();

      await expect(
        switcher.locator("option:checked")
      ).toHaveText(organization.name);

      const listing = await page.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

      expect(listing.status()).toBe(200);

      expect(await listing.json()).toEqual({
        projects: [own],
      });

      const ownDashboard = await page.request.get(
        `/api/projects/${own.id}/dashboard`,
        { maxRedirects: 0 }
      );

      expect(ownDashboard.status()).toBe(200);

      expect(await ownDashboard.json()).toMatchObject({
        project: {
          id: own.id,
          organizationId: own.organizationId,
        },
      });

      const foreignDashboard = await page.request.get(
        `/api/projects/${foreign.id}/dashboard`,
        { maxRedirects: 0 }
      );

      expect(foreignDashboard.status()).toBe(404);

      expect(await foreignDashboard.json()).toEqual({
        error: "Project not found",
      });

      const foreignKeys = await page.request.get(
        `/api/projects/${foreign.id}/api-keys`,
        { maxRedirects: 0 }
      );

      expect(foreignKeys.status()).toBe(404);

      expect(await foreignKeys.json()).toEqual({
        error: "Project not found",
      });

      await page.goto("/projects");

      await expect(
        page.getByRole("heading", {
          name: own.name,
          exact: true,
        })
      ).toBeVisible();

      await expect(
        page.getByRole("heading", {
          name: foreign.name,
          exact: true,
        })
      ).toHaveCount(0);

      await page.reload();

      await expect(
        page.getByRole("heading", {
          name: own.name,
          exact: true,
        })
      ).toBeVisible();

      await expect(
        page.getByRole("heading", {
          name: foreign.name,
          exact: true,
        })
      ).toHaveCount(0);
    }

    for (const [organization, project] of [
      [firstOrganization, firstProject],
      [secondOrganization, secondProject],
    ] as const) {
      expect(
        await countTestProjects(
          account.email,
          organization.slug,
          project.slug
        )
      ).toBe(1);
    }
  } finally {
    for (const [organization, project] of [
      [secondOrganization, secondProject],
      [firstOrganization, firstProject],
    ] as const) {
      await cleanupTestProject(
        account.email,
        organization.slug,
        project.slug
      );

      expect(
        await countTestProjects(
          account.email,
          organization.slug,
          project.slug
        )
      ).toBe(0);

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
    }

    await cleanupTestAccount(account.email);

    expect(
      await countTestAccounts(account.email)
    ).toBe(0);
  }
});

test("prevents customers from activating another customer's workspace", async ({
  browser,
}) => {
  test.setTimeout(60_000);

  const firstAccount = createTestAccount();
  const secondAccount = createTestAccount();

  const firstOrganization = createTestOrganization(firstAccount);
  const secondOrganization = createTestOrganization(secondAccount);

  const firstProject = createTestProject(firstAccount);
  const secondProject = createTestProject(secondAccount);

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();

  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await registerTestAccount(firstPage, firstAccount);
    await createOrganizationThroughUI(
      firstPage,
      firstOrganization
    );
    await createProjectThroughUI(firstPage, firstProject);

    await registerTestAccount(secondPage, secondAccount);
    await createOrganizationThroughUI(
      secondPage,
      secondOrganization
    );
    await createProjectThroughUI(secondPage, secondProject);

    const firstListing = await firstPage.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    const secondListing = await secondPage.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(firstListing.status()).toBe(200);
    expect(secondListing.status()).toBe(200);

    const firstData = await firstListing.json();
    const secondData = await secondListing.json();

    expect(firstData.projects).toHaveLength(1);
    expect(secondData.projects).toHaveLength(1);

    const firstRecord = firstData.projects[0];
    const secondRecord = secondData.projects[0];

    expect(firstRecord.slug).toBe(firstProject.slug);
    expect(secondRecord.slug).toBe(secondProject.slug);

    expect(firstRecord.organizationId)
      .not.toBe(secondRecord.organizationId);

    for (const [page, otherPage, own, foreign, organization, foreignOrganization] of [
      [
        firstPage,
        secondPage,
        firstRecord,
        secondRecord,
        firstOrganization,
        secondOrganization,
      ],
      [
        secondPage,
        firstPage,
        secondRecord,
        firstRecord,
        secondOrganization,
        firstOrganization,
      ],
    ] as const) {
      const headers = {
        Origin: new URL(page.url()).origin,
      };

      const organizations = await page.request.get(
        "/api/auth/organization/list",
        { maxRedirects: 0 }
      );

      expect(organizations.status()).toBe(200);

      const organizationData = await organizations.json();

      expect(organizationData).toHaveLength(1);

      expect(organizationData[0]).toMatchObject({
        id: own.organizationId,
        slug: organization.slug,
      });

      for (const data of [
        { organizationId: foreign.organizationId },
        { organizationSlug: foreignOrganization.slug },
      ]) {
        const rejected = await page.request.post(
          "/api/auth/organization/set-active",
          {
            data,
            headers,
            maxRedirects: 0,
          }
        );

        expect(rejected.status()).toBe(403);

        expect(await rejected.json()).toMatchObject({
          code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
        });

        const blocked = await page.request.get(
          "/api/projects",
          { maxRedirects: 0 }
        );

        expect(blocked.status()).toBe(403);

        expect(await blocked.json()).toEqual({
          error: "Select an organization first",
        });

        const unaffected = await otherPage.request.get(
          "/api/projects",
          { maxRedirects: 0 }
        );

        expect(unaffected.status()).toBe(200);

        expect(await unaffected.json()).toEqual({
          projects: [foreign],
        });

        const restored = await page.request.post(
          "/api/auth/organization/set-active",
          {
            data: {
              organizationId: own.organizationId,
            },
            headers,
            maxRedirects: 0,
          }
        );

        expect(restored.status()).toBe(200);

        expect(await restored.json()).toMatchObject({
          id: own.organizationId,
          slug: organization.slug,
        });

        const authorized = await page.request.get(
          "/api/projects",
          { maxRedirects: 0 }
        );

        expect(authorized.status()).toBe(200);

        expect(await authorized.json()).toEqual({
          projects: [own],
        });

        const foreignDashboard = await page.request.get(
          `/api/projects/${foreign.id}/dashboard`,
          { maxRedirects: 0 }
        );

        expect(foreignDashboard.status()).toBe(404);

        expect(await foreignDashboard.json()).toEqual({
          error: "Project not found",
        });
      }

      await page.goto("/");

      await expect(
        page.getByRole("heading", {
          name: organization.name,
          exact: true,
        })
      ).toBeVisible();
    }
  } finally {
    await firstContext.close();
    await secondContext.close();

    for (const [account, organization, project] of [
      [firstAccount, firstOrganization, firstProject],
      [secondAccount, secondOrganization, secondProject],
    ] as const) {
      await cleanupTestProject(
        account.email,
        organization.slug,
        project.slug
      );

      expect(
        await countTestProjects(
          account.email,
          organization.slug,
          project.slug
        )
      ).toBe(0);

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
  }
});

test("ignores forged organization IDs during project creation", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const account = createTestAccount();
  const firstOrganization = createTestOrganization(account);
  const secondOrganization = createTestOrganization(account, 2);
  const project = createTestProject(account);

  try {
    await registerTestAccount(page, account);

    await createOrganizationThroughUI(page, firstOrganization);
    await createOrganizationThroughUI(page, secondOrganization);

    const organizationsResponse = await page.request.get(
      "/api/auth/organization/list"
    );

    expect(organizationsResponse.status()).toBe(200);

    const organizations = await organizationsResponse.json();

    expect(organizations).toHaveLength(2);

    const first = organizations.find(
      (item: { slug: string }) =>
        item.slug === firstOrganization.slug
    );

    const second = organizations.find(
      (item: { slug: string }) =>
        item.slug === secondOrganization.slug
    );

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first.id).not.toBe(second.id);

    const sessionResponse = await page.request.get(
      "/api/auth/get-session"
    );

    expect(sessionResponse.status()).toBe(200);

    const session = await sessionResponse.json();

    expect(session.session.activeOrganizationId).toBe(second.id);

    const response = await page.request.post("/api/projects", {
          headers: { Origin: new URL(page.url()).origin },
      data: {
        name: project.name,
        organizationId: first.id,
      },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(201);

    const created = await response.json();

    expect(created.project).toMatchObject({
      organizationId: second.id,
      name: project.name,
      slug: project.slug,
    });

    expect(
      await countTestProjects(
        account.email,
        firstOrganization.slug,
        project.slug
      )
    ).toBe(0);

    expect(
      await countTestProjects(
        account.email,
        secondOrganization.slug,
        project.slug
      )
    ).toBe(1);

    const activeListing = await page.request.get("/api/projects");

    expect(activeListing.status()).toBe(200);

    expect(await activeListing.json()).toMatchObject({
      projects: [
        {
          id: created.project.id,
          organizationId: second.id,
          slug: project.slug,
        },
      ],
    });

    const switched = await page.request.post(
      "/api/auth/organization/set-active",
      {
        headers: {
          Origin: new URL(page.url()).origin,
        },
        data: {
          organizationId: first.id,
        },
        maxRedirects: 0,
      }
    );

    expect(switched.status()).toBe(200);

    const foreignListing = await page.request.get("/api/projects");

    expect(foreignListing.status()).toBe(200);

    expect(await foreignListing.json()).toEqual({
      projects: [],
    });

    const foreignDashboard = await page.request.get(
      `/api/projects/${created.project.id}/dashboard`
    );

    expect(foreignDashboard.status()).toBe(404);

    expect(await foreignDashboard.json()).toEqual({
      error: "Project not found",
    });
  } finally {
    for (const organization of [
      secondOrganization,
      firstOrganization,
    ]) {
      await cleanupTestProject(
        account.email,
        organization.slug,
        project.slug
      );

      expect(
        await countTestProjects(
          account.email,
          organization.slug,
          project.slug
        )
      ).toBe(0);

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
    }

    await cleanupTestAccount(account.email);

    expect(await countTestAccounts(account.email)).toBe(0);
  }
});
