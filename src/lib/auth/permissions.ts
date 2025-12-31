import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,
  public_content: ["create", "read", "update", "delete"],
  protected_content: ["create", "read", "update", "delete"],
  settings: ["read", "update"]
} as const;

const ac = createAccessControl(statement);

const admin = ac.newRole({
  ...adminAc.statements,
  public_content: ["create", "read", "update", "delete"],
  protected_content: ["create", "read", "update", "delete"],
  settings: ["read", "update"]
});

const user = ac.newRole({
  public_content: ["read"],
});

export const RolesList = ["admin", "user"] as const
export type ROLE = typeof RolesList[number]

export const roles = {
  admin,
  user
};