import type { Metadata } from "next";
import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import { importMap } from "../importMap.js";

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

export default function PayloadAdminPage({ params, searchParams }: Args) {
  return RootPage({ config, importMap, params, searchParams });
}
