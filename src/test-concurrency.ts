import "dotenv/config";
import { randomUUID } from "node:crypto";

const apiKey = process.env.TEST_ACCOUNT_API_KEY;

if (!apiKey) {
  throw new Error("TEST_ACCOUNT_API_KEY is missing");
}

async function consume(userId: string, requestId: string) {
  const response = await fetch("http://localhost:3000/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey!,
    },
    body: JSON.stringify({
      userId,
      units: 2,
      requestId,
    }),
  });

  return response.json();
}

async function main() {
  const id = randomUUID();

  const results = await Promise.all([
    consume("ahmed", `concurrent-ahmed-${id}`),
    consume("sara", `concurrent-sara-${id}`),
  ]);

  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
