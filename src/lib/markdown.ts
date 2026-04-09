function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function renderInline(value: string): string {
  let html = value;
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function renderHeading(level: 1 | 2 | 3, text: string): string {
  const tag = `h${level}`;
  const id = slugify(text);
  return `<${tag} id="${id}">${renderInline(text)}</${tag}>`;
}

function renderBlock(block: string): string {
  const lines = block.split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }

    if (line.startsWith("### ")) {
      closeLists();
      html += renderHeading(3, line.slice(4));
      continue;
    }
    if (line.startsWith("## ")) {
      closeLists();
      html += renderHeading(2, line.slice(3));
      continue;
    }
    if (line.startsWith("# ")) {
      closeLists();
      html += renderHeading(1, line.slice(2));
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (!inOl) {
        closeLists();
        html += "<ol>";
        inOl = true;
      }
      html += `<li>${renderInline(orderedMatch[2])}</li>`;
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      if (!inUl) {
        closeLists();
        html += "<ul>";
        inUl = true;
      }
      html += `<li>${renderInline(unorderedMatch[1])}</li>`;
      continue;
    }

    closeLists();
    html += `<p>${renderInline(line)}</p>`;
  }

  closeLists();
  return html;
}

export function renderMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const parts = escaped.split(/```/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return `<pre><code>${part.trim()}</code></pre>`;
      }
      return renderBlock(part);
    })
    .join("");
}
