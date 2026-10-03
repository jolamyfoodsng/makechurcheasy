import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { buildConfig } from "payload";
import { BlogPosts } from "./src/payload/collections/BlogPosts.ts";
import { CmsUsers } from "./src/payload/collections/CmsUsers.ts";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: CmsUsers.slug,
    importMap: {
      baseDir: path.resolve(dirname, "src/app/(payload)/cms"),
      importMapFile: path.resolve(dirname, "src/app/(payload)/cms/importMap.js"),
    },
  },
  collections: [CmsUsers, BlogPosts],
  db: mongooseAdapter({
    url: process.env.MONGODB_URI || "",
  }),
  routes: {
    admin: "/cms",
    api: "/payload-api",
    graphQL: "/payload-api/graphql",
    graphQLPlayground: "/payload-api/graphql-playground",
  },
  secret: process.env.PAYLOAD_SECRET || process.env.AUTH_SECRET || process.env.JWT_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
