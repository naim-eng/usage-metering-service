"use client";

export default function GlobalError({
  retry,
}: {
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main style={{ padding: "48px 24px", textAlign: "center" }}>
          <h1>Application unavailable</h1>
          <p>Something went wrong. Please try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: "10px 20px", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
