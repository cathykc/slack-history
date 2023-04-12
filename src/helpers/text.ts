import { slice } from "lodash";
import { toHTML } from "slack-markdown";

export const decodeHTML = (input: string) => {
  try {
    // Using this method instead of DOMParser as it preserves existing <> characters
    const txt = document.createElement("textarea");
    txt.innerHTML = input;
    return txt.value;
  } catch (e) {
    // Return original input if not in browser environment
    return input;
  }
};

export const getNodeText = (node: any): string => {
  if (["string", "number"].includes(typeof node)) {
    return node as string;
  }
  if (node instanceof Array) {
    return node.map(getNodeText).join("");
  }
  if (typeof node === "object" && node) {
    if (node.props?.children) return getNodeText(node.props.children);
    if (node.props?.emoji) return node.props.emoji;
    if (node.props) return getNodeText(node.props);
    if (node.dangerouslySetInnerHTML) return node.dangerouslySetInnerHTML.__html;
  }
  return "";
};

export const decodeHTMLandReplaceMrkdwn = (
  input: string,
  options: { shouldStripBlockFormatting: boolean } = {
    shouldStripBlockFormatting: false,
  },
) => {
  const decoded = decodeHTML(input);

  // The slack-markdown library doesn't quite do what we want with block-level styles, so we
  // apply a few simple transformations here to get the desired newline behavior for code
  // blocks and blockquotes.
  let htmlWithReplacedMarkdown = toHTML(decoded)
    .replace(/<pre><code>\n/g, "<pre><code>") // Code blocks should never have a leading newline.
    .replace(/<\/code><\/pre><br><br>/g, "</code></pre><br>") // Code blocks should only have 1 trailing line break.
    .replace(/<\/blockquote><br>/g, "</blockquote><br><br>") // Blockquotes need an additional trailing line break.
    .replace(/<a/g, '<a target="_blank"'); // Open links in new tab

  if (options.shouldStripBlockFormatting) {
    htmlWithReplacedMarkdown = htmlWithReplacedMarkdown
      .replace(/<br>/g, "\n")
      .replace(
        /(<pre><code>|<\/pre><\/code>|<code><pre>|<\/code><\/pre>|<blockquote>|<\/blockquote>)/g,
        "",
      );
  }

  return htmlWithReplacedMarkdown;
};

export const toSentence = (words: string[], joinerWord = "and"): string => {
  if (words.length === 1) {
    return words[0];
  } else if (words.length === 2) {
    return words.join(" " + joinerWord + " ");
  } else {
    return (
      slice(words, 0, words.length - 1).join(", ") +
      ", " +
      joinerWord +
      " " +
      words[words.length - 1]
    );
  }
};
