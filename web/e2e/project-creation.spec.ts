import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  createTestProject,
  countTestAccounts,
  countTestOrganizations,
  countTestProjects,
  cleanupTestProject,
  cleanupTestOrganization,
  cleanupTestAccount,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
  createProjectThroughUI,
} from "./helpers/auth-browser";

test("creates and persists a customer project", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  try {
    await registerTestAccount(page, account);

    await createOrganizationThroughUI(page, organization);

    await page.goto("/projects");

    await expect(
      page.getByRole("heading", {
        name: "No projects yet",
        exact: true,
      })
    ).toBeVisible();

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(0);

    await createProjectThroughUI(page, project);

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(1);

    await page.reload();

    await expect(
      page.getByRole("heading", {
        name: project.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByText("Your new API key", {
        exact: true,
      })
    ).toHaveCount(0);

    await expect(
      page.getByText(
        "1 project in this workspace",
        { exact: true }
      )
    ).toBeVisible();

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(1);
  } finally {
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
});

test("rejects invalid and duplicate project names", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  try {
    await registerTestAccount(page, account);
    await createOrganizationThroughUI(page, organization);

    await page.goto("/projects");

    await expect(
      page.getByRole("heading", {
        name: "No projects yet",
        exact: true,
      })
    ).toBeVisible();

    const nameInput = page.getByPlaceholder(
      "Enter your project name",
      { exact: true }
    );

    const createButton = page.getByRole("button", {
      name: "Create Project",
      exact: true,
    });

    for (const name of ["", " ", "a"]) {
      await nameInput.fill(name);
      await expect(createButton).toBeDisabled();
    }

    for (const name of [
      "",
      "   ",
      "a",
      "a".repeat(101),
      "!!!",
      null,
      123,
    ]) {
      const response = await page.request.post(
        "/api/projects",
        {
          data: { name },
          maxRedirects: 0,
        }
      );

      expect(response.status()).toBe(400);

      expect(await response.json()).toEqual({
        error: "Enter a valid project name",
      });
    }

    const emptyResponse = await page.request.get(
      "/api/projects"
    );

    expect(emptyResponse.status()).toBe(200);

    expect(await emptyResponse.json()).toEqual({
      projects: [],
    });

    await createProjectThroughUI(page, project);

    await nameInput.fill(project.name);
    await createButton.click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "A project with this name already exists",
      })
    ).toHaveText(
      "A project with this name already exists"
    );

    await expect(
      page.getByText("Your new API key", {
        exact: true,
      })
    ).toHaveCount(0);

    const duplicateResponse = await page.request.post(
      "/api/projects",
      {
        data: {
          name: project.name.toUpperCase(),
        },
        maxRedirects: 0,
      }
    );

    expect(duplicateResponse.status()).toBe(409);

    expect(await duplicateResponse.json()).toEqual({
      error: "A project with this name already exists",
    });

    const listingResponse = await page.request.get(
      "/api/projects"
    );

    expect(listingResponse.status()).toBe(200);

    const listing = await listingResponse.json();

    expect(listing.projects).toHaveLength(1);

    expect(listing.projects[0]).toMatchObject({
      name: project.name,
      slug: project.slug,
      status: "active",
    });

    await page.reload();

    await expect(
      page.getByText("1 project in this workspace", {
        exact: true,
      })
    ).toBeVisible();

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(1);
  } finally {
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
});
