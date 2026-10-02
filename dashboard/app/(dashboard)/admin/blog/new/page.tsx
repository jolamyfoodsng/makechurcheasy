"use client";

import React from "react";
import { BlogEditor } from "../components/BlogEditor";

export default function NewBlogPostPage() {
  return <BlogEditor isNew={true} />;
}
