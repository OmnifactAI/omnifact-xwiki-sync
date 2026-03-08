import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

export function convertToMarkdown(html: string, pageTitle: string): string {
  const markdown = turndown.turndown(html);
  return `# ${pageTitle}\n\n${markdown}`;
}
