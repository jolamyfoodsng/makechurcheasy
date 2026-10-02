"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { BlogEditor, BlogPostData } from "../components/BlogEditor";

interface EditBlogPostPageProps {
  params: Promise<{ id: string }>;
}

export default function EditBlogPostPage({ params }: EditBlogPostPageProps) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [post, setPost] = useState<BlogPostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPost() {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/blog/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.post) {
          throw new Error(data.error || "Failed to load blog post");
        }
        setPost(data.post);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading post");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchPost();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <Loader2 size={32} className="animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Loading story...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 flex flex-col items-center justify-center text-center">
        <AlertCircle size={40} className="text-rose-400 mb-3" />
        <h2 className="text-xl font-bold text-slate-200">Unable to load story</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-md">{error || "Story not found"}</p>
        <Link
          href="/admin/blog"
          className="mt-6 flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700"
        >
          <ArrowLeft size={14} />
          <span>Back to Stories</span>
        </Link>
      </div>
    );
  }

  return <BlogEditor initialData={post} isNew={false} />;
}
