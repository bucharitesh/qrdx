/** biome-ignore-all lint/suspicious/noArrayIndexKey: <explanation> */
/** biome-ignore-all lint/suspicious/noImplicitAnyLet: <explanation> */
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <explanation> */
import type { JSONContent } from "@tiptap/react";
import { useQREditorStore } from "@/store/editor-store";
import { useQRPresetStore } from "@/store/qr-preset-store";
import type { AIPromptData, MentionReference, PromptImage } from "@/types/ai";

export const getTextContent = (promptData: AIPromptData | null) => {
  if (!promptData) return "";
  return promptData.content;
};

export const buildMentionStringForAPI = (mention: MentionReference) => {
  return `@${mention.label} = 
  ${JSON.stringify(mention.themeData)}`;
};

export const buildPromptForAPI = (promptData: AIPromptData) => {
  const mentionReferences = promptData.mentions.map((mention) =>
    buildMentionStringForAPI(mention),
  );
  return `${promptData.content}\n\n${mentionReferences.join("\n")}`;
};

export const buildAIPromptRender = (
  promptData: AIPromptData,
): React.ReactNode => {
  // Create a regex that matches all possible mention patterns from the actual mentions
  const mentionPatterns = promptData.mentions.map(
    (m) => `@${m.label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`,
  );
  const mentionRegex = new RegExp(`(${mentionPatterns.join("|")})`, "g");

  const parts = promptData.content.split(mentionRegex);
  const textContent = parts.flatMap((part, index) => {
    const mention = promptData.mentions.find((m) => `@${m.label}` === part);
    if (mention) {
      return (
        <span key={index} className="mention">
          {part}
        </span>
      );
    }
    // Split by \n and interleave <br /> to show line breaks in the messages UI
    // without this, the line breaks are not shown and the user message looks messy.
    const lines = part.split("\n");
    return lines.flatMap((line, i) =>
      i === 0 ? line : [<br key={`br-${index}-${i}`} />, line],
    );
  });

  return textContent;
};

// Get current QR style as theme data format
function getCurrentStyleAsThemeData() {
  const style = useQREditorStore.getState().style;
  // Convert QR style to a light/dark format for compatibility
  return {
    light: style as Record<string, string>,
    dark: style as Record<string, string>,
  };
}

export function attachCurrentStyleMention(
  promptData: AIPromptData,
): AIPromptData {
  const mentionReference: MentionReference = {
    id: "editor:current-changes",
    label: "Current Style",
    themeData: getCurrentStyleAsThemeData(),
  };

  const promptDataWithMention = {
    ...promptData,
    mentions: [...promptData.mentions, mentionReference],
  };
  return promptDataWithMention;
}

export function createCurrentThemePrompt({
  prompt,
}: {
  prompt: string;
}): AIPromptData {
  const mentionReference: MentionReference = {
    id: "editor:current-changes",
    label: "Current Style",
    themeData: getCurrentStyleAsThemeData(),
  };

  return {
    content: `Make the following changes to the @Current Style:\n${prompt}`,
    mentions: [mentionReference],
  };
}

export function mentionsCurrentStyle(promptData: AIPromptData): boolean {
  return promptData.mentions.some(
    (mention) => mention.id === "editor:current-changes",
  );
}

export function createPromptDataFromMentions(
  content: string,
  mentionIds: string[],
): AIPromptData {
  const mentions: MentionReference[] = mentionIds.map((id) => {
    if (id === "editor:current-changes") {
      return {
        id,
        label: "Current Style",
        themeData: getCurrentStyleAsThemeData(),
      };
    }

    const preset = useQRPresetStore.getState().getPresetById(id);
    if (!preset) {
      throw new Error(`QR preset not found: ${id}`);
    }

    return {
      id,
      label: preset.name || id,
      themeData: {
        light: preset.style as Record<string, string>,
        dark: preset.style as Record<string, string>,
      },
    };
  });

  return {
    content,
    mentions,
  };
}

export function createPromptDataFromPreset(
  prompt: string,
  presetId: string,
): AIPromptData {
  const preset = useQRPresetStore.getState().getPresetById(presetId);

  if (!preset) {
    throw new Error(`Preset "${presetId}" not found`);
  }

  return {
    content: prompt,
    mentions: [
      {
        id: presetId,
        label: preset.name ?? presetId,
        themeData: {
          light: preset.style as Record<string, string>,
          dark: preset.style as Record<string, string>,
        },
      },
    ],
  };
}

// Utility function to extract text content (user prompt) and QR style mentions from the JSON content
// we need both separate to create the prompt data to send to the AI
// we also need to handle the line breaks correctly, both in copy/paste and while typing directly
export function extractTextContentAndMentions(node: JSONContent): {
  content: string;
  mentions: MentionReference[];
} {
  const textArr: string[] = [];
  const mentionsArr: MentionReference[] = [];

  // This is a recursive function that walks through the JSON content (even nested) and extracts the text content and mentions
  const walk = (n: JSONContent) => {
    if (n.type === "text") {
      textArr.push(n.text || "");
    }
    if (n.type === "mention") {
      textArr.push(`@${n.attrs?.label}`);
      const id = n.attrs?.id;
      const label = n.attrs?.label;
      let themeData;
      if (id === "editor:current-changes") {
        themeData = getCurrentStyleAsThemeData();
      } else {
        const preset = useQRPresetStore.getState().getPresetById(id);
        themeData = preset?.style
          ? {
              light: preset.style as Record<string, string>,
              dark: preset.style as Record<string, string>,
            }
          : { light: {}, dark: {} };
      }
      mentionsArr.push({ id, label, themeData });
    }
    if (n.type === "hardBreak") {
      textArr.push("\n");
    }
    if (n.content) {
      n.content.forEach((child) => walk(child));
    }
  };

  const blocks = node.content;
  if (Array.isArray(blocks) && blocks.length > 0) {
    blocks.forEach((block, idx) => {
      walk(block);
      if (idx < blocks.length - 1) {
        textArr.push("\n");
      }
    });
  } else {
    walk(node);
  }

  const formattedText = textArr.join("").replace(/\\n/g, "\n");

  return { content: formattedText, mentions: mentionsArr };
}

export function convertJSONContentToPromptData(
  jsonContent: JSONContent,
): AIPromptData {
  const { content, mentions } = extractTextContentAndMentions(jsonContent);
  return { content, mentions };
}

/**
 * Converts AIPromptData (content + mentions) to JSONContent for initializing the editor.
 * Mentions are inserted as inline nodes, and line breaks are preserved as hardBreak nodes.
 * This matches the structure produced by Tiptap for multi-line content.
 */
export function convertPromptDataToJSONContent(
  promptData: AIPromptData,
): JSONContent {
  const { content, mentions } = promptData;

  if (!content) {
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "" }],
        },
      ],
    };
  }

  // If no mentions, just return the content as text
  if (!mentions || mentions.length === 0) {
    const lines = content.split(/\n/);
    const nodes: JSONContent[] = [];

    lines.forEach((line, lineIdx) => {
      if (line) {
        nodes.push({ type: "text", text: line });
      }
      if (lineIdx < lines.length - 1) {
        nodes.push({ type: "hardBreak" });
      }
    });

    if (nodes.length === 0) {
      nodes.push({ type: "text", text: "" });
    }

    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: nodes,
        },
      ],
    };
  }

  // Process content with mentions using direct string search
  const lines = content.split(/\n/);
  const nodes: JSONContent[] = [];

  // Dedupe mention to avoid scanning the same label multiple times
  const uniqueMentions = dedupeMentionReferences(mentions);

  lines.forEach((line, lineIdx) => {
    // Find all mention positions in the line
    const mentionPositions: Array<{
      index: number;
      mention: MentionReference;
      length: number;
    }> = [];

    uniqueMentions.forEach((mention) => {
      const mentionText = `@${mention.label}`;
      let searchIndex = 0;

      while (true) {
        const foundIndex = line.indexOf(mentionText, searchIndex);
        if (foundIndex === -1) break;

        mentionPositions.push({
          index: foundIndex,
          mention,
          length: mentionText.length,
        });

        searchIndex = foundIndex + mentionText.length;
      }
    });

    // Sort by index asc; for same start index prefer the longest match
    mentionPositions.sort((a, b) =>
      a.index === b.index ? b.length - a.length : a.index - b.index,
    );

    // Process the line with mentions
    let currentIndex = 0;

    mentionPositions.forEach(({ index, mention, length }) => {
      // Skip if this mention would overlap with a previously emitted one
      if (index < currentIndex) return;
      // Add text before mention
      if (index > currentIndex) {
        const textBefore = line.slice(currentIndex, index);
        if (textBefore) {
          nodes.push({ type: "text", text: textBefore });
        }
      }

      // Add mention node
      nodes.push({
        type: "mention",
        attrs: {
          id: mention.id,
          label: mention.label,
        },
      });

      currentIndex = index + length;
    });

    // If no mentions are present in this line, push the entire line once.
    // Otherwise, only push the text that comes after the last mention.
    if (mentionPositions.length === 0) {
      if (line) {
        nodes.push({ type: "text", text: line });
      }
    } else if (currentIndex < line.length) {
      const textAfter = line.slice(currentIndex);
      if (textAfter) {
        nodes.push({ type: "text", text: textAfter });
      }
    }

    // Add hardBreak if not the last line
    if (lineIdx < lines.length - 1) {
      nodes.push({ type: "hardBreak" });
    }
  });

  // If no nodes were created, ensure at least one empty text node
  if (nodes.length === 0) {
    nodes.push({ type: "text", text: "" });
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: nodes,
      },
    ],
  };
}

export function isEmptyPromptData(
  promptData?: AIPromptData,
  uploadedImages?: PromptImage[],
): boolean {
  const isEmptyPromptDataContent =
    !promptData?.content?.trim() || promptData?.content.length === 0;
  const isEmptyPromptDataImages =
    !!uploadedImages && uploadedImages.length === 0;

  return isEmptyPromptDataImages && isEmptyPromptDataContent;
}

export function dedupeMentionReferences(
  mentions: MentionReference[],
): MentionReference[] {
  const uniqueMentions = new Map<string, MentionReference>();
  for (const m of mentions) {
    if (!uniqueMentions.has(m.id)) {
      uniqueMentions.set(m.id, m);
    }
  }
  return Array.from(uniqueMentions.values());
}
