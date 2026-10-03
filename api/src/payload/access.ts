import type { PayloadRequest } from "payload";

export const isCmsEditor = ({ req }: { req: PayloadRequest }): boolean =>
  Boolean(
    req.user?.collection === "cms-users" &&
      (req.user.role === "admin" || req.user.role === "editor"),
  );

export const isCmsAdmin = ({ req }: { req: PayloadRequest }): boolean =>
  Boolean(req.user?.collection === "cms-users" && req.user.role === "admin");
