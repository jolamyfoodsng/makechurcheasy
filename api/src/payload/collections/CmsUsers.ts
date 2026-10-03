import type { CollectionConfig } from "payload";
import { isCmsAdmin, isCmsEditor } from "../access.ts";

export const CmsUsers: CollectionConfig = {
  slug: "cms-users",
  auth: true,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "role", "createdAt"],
  },
  access: {
    admin: isCmsEditor,
    create: isCmsAdmin,
    read: isCmsAdmin,
    update: isCmsAdmin,
    delete: isCmsAdmin,
  },
  fields: [
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "admin",
      options: [
        { label: "Administrator", value: "admin" },
        { label: "Editor", value: "editor" },
      ],
      access: {
        update: isCmsAdmin,
      },
    },
  ],
};
