import { type Author } from "@/interfaces/author";
import Link from "next/link";
import Avatar from "./avatar";
import CoverImage from "./cover-image";
import DateFormatter from "./date-formatter";

type Props = {
  title: string;
  coverImage: string;
  date: string;
  excerpt: string;
  author: Author;
  slug: string;
};

export function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}: Props) {
  return (
    <article className="story-card">
      <div className="story-card__image">
        <CoverImage slug={slug} title={title} src={coverImage} />
      </div>
      <div className="story-meta">
        <DateFormatter dateString={date} />
      </div>
      <h3 className="story-card__title">
        <Link href={`/posts/${slug}`}>
          {title}
        </Link>
      </h3>
      <p className="story-card__excerpt">{excerpt}</p>
      <Avatar name={author.name} picture={author.picture} />
    </article>
  );
}
