"use client";

export default function GlobalError({
  retry,
}: {
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <section
            role="alert"
            aria-labelledby="global-error-title"
            style={{
              width: "100%",
              maxWidth: "480px",
              padding: "32px 24px",
              boxSizing: "border-box",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
              textAlign: "center",
            }}
          >
            <h1
              id="global-error-title"
              style={{
                margin: "0 0 12px",
                fontSize: "24px",
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              Application unavailable
            </h1>

            <p
              style={{
                margin: "0 0 24px",
                color: "#475569",
                fontSize: "16px",
                lineHeight: 1.6,
              }}
            >
              Something went wrong. Please try again.
            </p>

            <button
              type="button"
              onClick={() => retry()}
              style={{
                padding: "12px 24px",
                background: "#4f46e5",
                color: "#ffffff",
                border: "1px solid #4f46e5",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
