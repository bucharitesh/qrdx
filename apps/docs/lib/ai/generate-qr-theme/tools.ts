import { streamObject, tool } from "ai";
import z from "zod";
import { themeStylePropsOutputSchema } from "@/lib/ai/generate-qr-theme";
import { baseProviderOptions, myProvider } from "@/lib/ai/providers";
import type { AdditionalAIContext } from "@/types/ai";

export const QR_THEME_GENERATION_TOOLS = {
  generateQRTheme: tool({
    description: `Generates a QR code style theme based on the current conversation context. Use this tool once you have a clear understanding of the user's request, which may include a text prompt, images, an SVG, or a base theme reference (@[theme_name]).`,
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
