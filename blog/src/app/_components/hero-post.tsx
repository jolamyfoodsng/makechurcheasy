import Avatar from "@/app/_components/avatar";
import CoverImage from "@/app/_components/cover-image";
import { type Author } from "@/interfaces/author";
import Link from "next/link";
import DateFormatter from "./date-formatter";

type Props = {
  title: string;
  coverImage: string;
  date: string;
  excerpt: string;
  author: Author;
  slug: string;
};

export function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}: Props) {
  return (
    <section className="featured-story">
      <div className="featured-story__image">
        <CoverImage title={title} src={coverImage} slug={slug} />
      </div>
      <div className="featured-story__content">
        <p className="section-kicker">Featured article</p>
        <h2 className="featured-story__title">
          <Link href={`/posts/${slug}`}>{title}</Link>
        </h2>
        <div className="story-meta">
            <DateFormatter dateString={date} />
        </div>
        <p className="story-excerpt">{excerpt}</p>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={author.name} picture={author.picture} />
          <Link href={`/posts/${slug}`} className="story-link">
            Read the article <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
