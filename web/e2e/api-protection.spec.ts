import { test, expect } from "@playwright/test";

const projectId = "00000000-0000-4000-8000-000000000001";
const keyId = "00000000-0000-4000-8000-000000000002";

const protectedEndpoints = [
  {
    method: "GET",
    path: "/api/projects",
  },
  {
    method: "POST",
    path: "/api/projects",
    data: {},
  },
  {
    method: "GET",
    path: `/api/projects/${projectId}/dashboard`,
  },
  {
    method: "GET",
    path: `/api/projects/${projectId}/api-keys`,
  },
  {
    method: "POST",
    path: `/api/projects/${projectId}/api-keys`,
    data: {},
  },
  {
    method: "DELETE",
    path: `/api/projects/${projectId}/api-keys/${keyId}`,
  },
];

for (const endpoint of protectedEndpoints) {
  test(`${endpoint.method} ${endpoint.path} rejects unauthenticated requests`, async ({
    request,
  }) => {
    const response = await request.fetch(endpoint.path, {
      headers: { Origin: "http://localhost:3004" },
      method: endpoint.method,
      data: endpoint.data,
      maxRedirects: 0,
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["content-type"]).toContain(
      "application/json"
    );

    expect(await response.json()).toEqual({
      error: "Authentication required",
    });
  });
}
