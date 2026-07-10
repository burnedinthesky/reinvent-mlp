/* Admin authorization. A single shared ADMIN_TOKEN (env) gates every /admin
   endpoint (§3.3). Falls back to a dev default when unset so local runs work;
   set ADMIN_TOKEN in production. Server-only. */

const DEV_DEFAULT = "sitcon-admin";

export class AdminError extends Error {}

export function adminToken(): string {
    return process.env["ADMIN_TOKEN"] || DEV_DEFAULT;
}

export function requireAdmin(token: string): void {
    if (!token || token !== adminToken()) throw new AdminError("unauthorized");
}
