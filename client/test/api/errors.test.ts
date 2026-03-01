import { describe, expect, it } from "vitest";
import { parseFastApiError } from "../../src/api/errors";

describe("parseFastApiError", () => {
  it("parses detail string responses", () => {
    const parsed = parseFastApiError({ detail: "Invalid credentials" });

    expect(parsed.message).toBe("Invalid credentials");
    expect(parsed.issues).toHaveLength(0);
  });

  it("parses FastAPI validation arrays", () => {
    const parsed = parseFastApiError({
      detail: [
        {
          loc: ["body", "email"],
          msg: "value is not a valid email address",
          type: "value_error.email",
        },
      ],
    });

    expect(parsed.issues).toEqual([
      {
        location: "body.email",
        message: "value is not a valid email address",
        code: "value_error.email",
      },
    ]);
    expect(parsed.message).toContain("body.email");
  });
});
