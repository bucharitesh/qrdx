/**
 * Zod validation schemas for AI route request bodies
 */

import { z } from "zod";
import {
  AI_PROMPT_SERVER_CHARACTER_LIMIT,
  MAX_AI_CHAT_MESSAGES,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_FILES,
} from "@/lib/constants";

const MAX_MENTIONS = 10;
const MAX_MESSAGE_PART_TEXT_LENGTH = 20_000;
const MAX_IMAGE_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_FILE_SIZE * 4) / 3) + 64;

// Only inline data URLs: remote URLs would be fetched server-side by the AI SDK (SSRF).
const IMAGE_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp|svg\+xml)[;,]/i;

// Logos are base64 blobs that only inflate token usage; the model never needs them.
const themeDataSchema = z
  .record(z.string(), z.unknown())
  .transform(({ customLogo: _customLogo, ...rest }) => rest);

const promptImageSchema = z.object({
  url: z
    .string()
    .max(MAX_IMAGE_DATA_URL_LENGTH, "Image is too large")
    .regex(IMAGE_DATA_URL_REGEX, "Images must be uploaded as data URLs"),
});

const mentionSchema = z.object({
  id: z.string().max(200),
  label: z.string().max(200),
  themeData: themeDataSchema,
});

export const promptDataSchema = z.object({
  content: z.string().max(AI_PROMPT_SERVER_CHARACTER_LIMIT),
  mentions: z.array(mentionSchema).max(MAX_MENTIONS).default([]),
  images: z.array(promptImageSchema).max(MAX_IMAGE_FILES).optional(),
});

export const enhancePromptRequestSchema = z.object({
  promptData: promptDataSchema,
});

const messagePartSchema = z.looseObject({
  type: z.string(),
  text: z.string().max(MAX_MESSAGE_PART_TEXT_LENGTH).optional(),
});

const chatMessageSchema = z.looseObject({
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(messagePartSchema).max(100),
  metadata: z
    .looseObject({
      promptData: promptDataSchema.optional(),
      themeStyles: themeDataSchema.optional(),
    })
    .optional(),
});

export const generateQRThemeRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_AI_CHAT_MESSAGES),
});
