import React, { useMemo } from "react";
import { marked } from "marked";

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

export default function MarkdownView({ content, className = "", style = {} }) {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      return marked.parse(content);
    } catch (e) {
      return content;
    }
  }, [content]);

  return (
    <div
      className={`markdown-rendered-body ${className}`}
      style={{
        lineHeight: 1.65,
        fontSize: 13.5,
        color: "var(--text-main)",
        wordBreak: "break-word",
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
