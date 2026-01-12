/*
 * Copyright (C) 2025 Christin Löhner
 */

import { hashPassword, verifyPassword } from "./passwords";

describe("password hashing", () => {
  it("hashes and verifies with argon2id", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).toContain("$argon2id");
    const ok = await verifyPassword("secret123", hash);
    expect(ok).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("secret123");
    const ok = await verifyPassword("wrong", hash);
    expect(ok).toBe(false);
  });
});
