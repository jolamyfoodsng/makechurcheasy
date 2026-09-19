import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug } from "@/lib/api";
import {
  COMPANY_URL,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_URL,
  toAbsoluteUrl,
} from "@/lib/constants";
import markdownToHtml from "@/lib/markdownToHtml";
import Alert from "@/app/_components/alert";
import Container from "@/app/_components/container";
import { PostBody } from "@/app/_components/post-body";
import { PostHeader } from "@/app/_components/post-header";
import { ArticleSidebars } from "@/app/_components/article-sidebars";

export default async function Post(props: Params) {
  const params = await props.params;
  const post = getPostBySlug(params.slug);

  if (!post || post.published === false) {
    return notFound();
  }

  const content = await markdownToHtml(post.content || "");
  const posts = getAllPosts();
  const articleUrl = `${SITE_URL}/posts/${post.slug}`;
  const imageUrl = toAbsoluteUrl(post.ogImage.url);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${articleUrl}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    image: [imageUrl],
    datePublished: post.date,
    dateModified: post.modifiedDate || post.date,
    author: {
      "@type": "Organization",
      name: post.author.name,
      url: COMPANY_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: COMPANY_URL,
      logo: { "@type": "ImageObject", url: SITE_LOGO_URL },
    },
    url: articleUrl,
    articleSection: post.category,
    keywords: post.tags,
    inLanguage: "en",
    isAccessibleForFree: true,
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Alert preview={post.preview} />
      <Container>
        <div className="article-layout">
          <ArticleSidebars currentSlug={post.slug} title={post.title} posts={posts} />
          <article className="article-main">
            <PostHeader
              title={post.title}
              coverImage={post.coverImage}
              date={post.date}
              author={post.author}
            />
            <PostBody content={content} />
          </article>
        </div>
      </Container>
    </main>
  );
}

type Params = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata(props: Params): Promise<Metadata> {
  const params = await props.params;
  const post = getPostBySlug(params.slug);

  if (!post || post.published === false) {
    return notFound();
  }

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const articleUrl = `${SITE_URL}/posts/${post.slug}`;
  const imageUrl = toAbsoluteUrl(post.ogImage.url);

  return {
    title,
    description,
    alternates: { canonical: articleUrl },
    authors: [{ name: post.author.name, url: COMPANY_URL }],
    keywords: post.tags,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: articleUrl,
      siteName: `${SITE_NAME} Blog`,
      locale: "en_GB",
      publishedTime: post.date,
      modifiedTime: post.modifiedDate || post.date,
      authors: [post.author.name],
      section: post.category,
      tags: post.tags,
      images: [
        {
          url: imageUrl,
          width: 1300,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export async function generateStaticParams() {
  const posts = getAllPosts();

  return posts.map((post) => ({
    slug: post.slug,
  }));
}
