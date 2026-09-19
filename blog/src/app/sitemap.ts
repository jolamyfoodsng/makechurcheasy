import { getAllPosts } from "@/lib/api";
import { SITE_URL, toAbsoluteUrl } from "@/lib/constants";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...posts.map((post) => ({
      url: `${SITE_URL}/posts/${post.slug}`,
      lastModified: post.modifiedDate || post.date,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: [toAbsoluteUrl(post.ogImage.url)],
    })),
  ];
}
