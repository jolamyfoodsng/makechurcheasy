import Link from "next/link";
import type { ReactNode } from "react";
import { Post } from "@/interfaces/post";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import DateFormatter from "./date-formatter";

type Props = {
  currentSlug: string;
  title: string;
  posts: Post[];
};

type ShareLink = {
  label: string;
  href: string;
  icon: ReactNode;
};

function ShareIcon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  } as const;

  if (name === "Telegram") {
    return (
      <svg {...common}>
        <path d="M21.4 3.5 18.2 20c-.2 1.2-.9 1.5-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L5.6 13.7.7 12.2c-1.1-.3-1.1-1.1.2-1.6L20 3.4c.9-.3 1.7.2 1.4.1Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "X") {
    return (
      <svg {...common}>
        <path d="M4.6 4h4.2l3.7 4.9L16.8 4H19l-5.5 6.3L20 20h-4.2l-4.1-5.4L7 20H4.8l5.8-6.8L4.6 4Zm3.4 1.7H6.9l8.9 12.6h1.1L8 5.7Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "Facebook") {
    return (
      <svg {...common}>
        <path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.3v3h2.8v8h3.4Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "WhatsApp") {
    return (
      <svg {...common}>
        <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3 21l4.8-1.3A8.8 8.8 0 1 0 12 3.2Zm0 15.9c-1.4 0-2.7-.4-3.8-1.1l-.3-.2-2.8.7.8-2.7-.2-.3a7 7 0 1 1 6.3 3.6Zm3.8-5.2c-.2-.1-1.3-.7-1.5-.8-.2-.1-.4-.1-.6.1l-.6.8c-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.7-1-.6-.5-1-1.1-1.1-1.3-.1-.2 0-.3.1-.4l.4-.5c.1-.1.1-.3 0-.4l-.7-1.5c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.4.1-.5.2-.2.2-.7.7-.7 1.7s.7 2 1 2.3c.1.2 1.5 2.3 3.6 3.1.5.2.9.3 1.2.4.5.2.9.1 1.3.1.4-.1 1.3-.5 1.5-1 .2-.5.2-.9.1-1-.1-.1-.3-.2-.7-.4Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "LinkedIn") {
    return (
      <svg {...common}>
        <path d="M5.1 7.2A2.1 2.1 0 1 0 5 3a2.1 2.1 0 0 0 .1 4.2ZM3.3 20.8h3.6V9H3.3v11.8ZM9.1 9v11.8h3.6v-5.8c0-1.5.3-3 2.2-3 1.8 0 1.8 1.7 1.8 3.1v5.7h3.6v-6.4c0-3.1-.7-5.5-4.5-5.5-1.8 0-3 .9-3.5 1.8h-.1V9H9.1Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 3.3a8.7 8.7 0 0 0-8.7 8.8c0 3.8 2.4 7 5.8 8.2.4.1.5-.2.5-.4v-1.5c-2.4.5-2.9-1-2.9-1-.4-1-.9-1.2-.9-1.2-.8-.6.1-.6.1-.6.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.6.8.1-.6.3-1 .5-1.2-1.9-.2-3.8-1-3.8-4.2 0-.9.3-1.6.9-2.2-.1-.2-.4-1.1.1-2.2 0 0 .7-.2 2.3.8a8 8 0 0 1 4.2 0c1.6-1 2.3-.8 2.3-.8.5 1.1.2 2 .1 2.2.6.6.9 1.3.9 2.2 0 3.2-2 4-3.8 4.2.3.3.5.8.5 1.6v2.4c0 .2.1.5.5.4A8.7 8.7 0 0 0 12 3.3Z" fill="currentColor" />
    </svg>
  );
}

export function ArticleSidebars({ currentSlug, title, posts }: Props) {
  const articleUrl = `${SITE_URL}/posts/${currentSlug}`;
  const encodedUrl = encodeURIComponent(articleUrl);
  const encodedTitle = encodeURIComponent(title);
  const latestPosts = posts.filter((post) => post.slug !== currentSlug).slice(0, 4);
  const shareLinks: ShareLink[] = [
    {
      label: "Share on Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
      icon: <ShareIcon name="Telegram" />,
    },
    {
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      icon: <ShareIcon name="X" />,
    },
    {
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: <ShareIcon name="Facebook" />,
    },
    {
      label: "Share on WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${title} ${articleUrl}`)}`,
      icon: <ShareIcon name="WhatsApp" />,
    },
    {
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: <ShareIcon name="LinkedIn" />,
    },
    {
      label: "Share on Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      icon: <ShareIcon name="Reddit" />,
    },
  ];

  return (
    <>
      <aside className="share-rail" aria-label="Share this article">
        <span className="share-rail__label">Share</span>
          {shareLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              aria-label={link.label}
              title={link.label}
              className="share-rail__link"
            >
              {link.icon}
            </a>
          ))}
      </aside>

      <aside className="latest-news" aria-label="Latest news">
        <div className="latest-news__heading">
          <h2>Latest news</h2>
        </div>

        {latestPosts.length > 0 ? (
          <div className="latest-news__list">
            {latestPosts.map((post) => (
              <article key={post.slug} className="latest-news__item">
                <p className="latest-news__date">
                  <DateFormatter dateString={post.date} />
                </p>
                <Link href={`/posts/${post.slug}`} className="latest-news__link">
                  {post.title}
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="latest-news__empty">
            More {SITE_NAME} stories are coming soon.
          </p>
        )}

        <Link href="/" className="latest-news__all">
          View all articles →
        </Link>
      </aside>
    </>
  );
}
