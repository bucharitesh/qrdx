import { streamObject, tool } from "ai";
import z from "zod";
import { themeStylePropsOutputSchema } from "@/lib/ai/generate-qr-theme";
import { GENERATE_QR_THEME_OBJECT_SYSTEM } from "@/lib/ai/prompts";
import { baseProviderOptions, myProvider } from "@/lib/ai/providers";
import type { AdditionalAIContext } from "@/types/ai";

export const QR_THEME_GENERATION_TOOLS = {
  generateQRTheme: tool({
    description: `Generates a QR code style theme from the conversation. Honor explicit user specs (colors, pattern names, margin) over creative defaults. For @Current Theme or @[name] mentions, start from the attached JSON and apply only the requested delta. Use character recipes (e.g. Spider-Man: black bg, white fg, red eyes, diamond + diya) only when the user asks for that character. Output solid HEX colors only, no gradients or templateId. bgColor must contrast with fgColor, eyeColor, and dotColor.`,
    inputSchema: z.object({}),
    outputSchema: themeStylePropsOutputSchema,
    execute: async (
      _input,
      { messages, abortSignal, toolCallId, experimental_context },
    ) => {
      const { writer } = experimental_context as AdditionalAIContext;

      const { partialObjectStream, object } = streamObject({
        abortSignal,
        model: myProvider.languageModel("qr-theme-generation"),
        providerOptions: baseProviderOptions,
        system: GENERATE_QR_THEME_OBJECT_SYSTEM,
        schema: themeStylePropsOutputSchema,
        messages,
      });

      for await (const chunk of partialObjectStream) {
        writer.write({
          id: toolCallId,
          type: "data-generated-qr-style",
          data: { status: "streaming", themeStyles: chunk },
          transient: true,
        });
      }

      const themeStyles = await object;

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
