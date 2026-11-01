import { Output, streamText, type Tool, tool } from "ai";
import z from "zod";
import {
  ensureScannable,
  themeStylePropsOutputSchema,
} from "@/lib/ai/generate-qr-theme";
import { GENERATE_QR_THEME_OBJECT_SYSTEM } from "@/lib/ai/prompts";
import { baseProviderOptions, myProvider } from "@/lib/ai/providers";
import type { AdditionalAIContext } from "@/types/ai";

// Annotated because ai 7's inferred tool type names @ai-sdk/provider types,
// which apps/docs doesn't depend on directly.
type QRThemeGenerationTools = {
  generateQRTheme: Tool<
    Record<string, never>,
    z.infer<typeof themeStylePropsOutputSchema>,
    AdditionalAIContext
  >;
};

export const QR_THEME_GENERATION_TOOLS: QRThemeGenerationTools = {
  generateQRTheme: tool({
    description: `Generates a QR code style theme from the conversation. Honor explicit user specs (colors, pattern names, margin) over creative defaults. For @Current Theme or @[name] mentions, start from the attached JSON and apply only the requested delta. Use character recipes (e.g. Spider-Man: black bg, white fg, red eyes, diamond + diya) only when the user asks for that character. Output solid HEX colors only, no gradients or templateId. bgColor must contrast with fgColor, eyeColor, and dotColor.`,
    inputSchema: z.object({}),
    outputSchema: themeStylePropsOutputSchema,
    // The route's UI stream writer, passed in through `toolsContext`.
    contextSchema: z.custom<AdditionalAIContext>(),
    execute: async (_input, { messages, abortSignal, toolCallId, context }) => {
      const { writer } = context;

      const { partialOutputStream, output } = streamText({
        abortSignal,
        model: myProvider.languageModel("qr-theme-generation"),
        providerOptions: baseProviderOptions,
        instructions: GENERATE_QR_THEME_OBJECT_SYSTEM,
        output: Output.object({ schema: themeStylePropsOutputSchema }),
        messages,
      });

      for await (const chunk of partialOutputStream) {
        writer.write({
          id: toolCallId,
          type: "data-generated-qr-style",
          data: { status: "streaming", themeStyles: ensureScannable(chunk) },
          transient: true,
        });
      }

      const themeStyles = ensureScannable(await output);

      writer.write({
        id: toolCallId,
        type: "data-generated-qr-style",
        data: { status: "ready", themeStyles },
        transient: true,
      });

      return themeStyles;
    },
  }),
};
