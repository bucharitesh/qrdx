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

      try {
        const { partialObjectStream, object } = streamObject({
          abortSignal,
          model: myProvider.languageModel("qr-theme-generation"),
          providerOptions: baseProviderOptions,
          schema: themeStylePropsOutputSchema,
          messages,
        });

        let lastChunk = {};
        for await (const chunk of partialObjectStream) {
          lastChunk = chunk;
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
      } catch (error) {
        console.error("Error in generateQRTheme tool:", error);
        // Return a default style on error to prevent tool failure
        const defaultStyle = {
          bgColor: "#FFFFFF",
          fgColor: "#000000",
        };

        writer.write({
          id: toolCallId,
          type: "data-generated-qr-style",
          data: { status: "ready", themeStyles: defaultStyle },
          transient: true,
        });

        return defaultStyle;
      }
    },
  }),
};
