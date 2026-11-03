// The model behind each AI task (lib/ai/models.ts), the options each request
// carries, and the gateway-only provider setup (lib/ai/providers.ts). Nothing
// here calls the gateway.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ART_MODEL_ID,
  ART_MODEL_LABEL,
  ART_SUPPORTS_SEED,
  ART_USAGE_MODEL_IDS,
} from "@/lib/ai/art-models";
import {
  AI_MODELS,
  type AITask,
  ART_EVAL_CANDIDATES,
  artProviderOptions,
  creatorOf,
  textProviderOptions,
} from "@/lib/ai/models";
import { PRODUCT_FACTS } from "@/lib/product-facts";

const TASKS = Object.keys(AI_MODELS) as AITask[];

describe("the model map", () => {
  it("has a gateway model for every task", () => {
    expect(TASKS.sort()).toEqual(
      ["art", "base", "prompt-enhancement", "qr-theme-generation"].sort(),
    );
    for (const task of TASKS) {
      expect(AI_MODELS[task].model, task).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
    }
  });

  it("uses Claude Haiku 5.5 for text, Gemini 3 Flash for the theme schema and GPT Image 2 for art", () => {
    expect(AI_MODELS.base.model).toBe("anthropic/claude-haiku-5.5");
    expect(AI_MODELS["prompt-enhancement"].model).toBe(
      "anthropic/claude-haiku-5.5",
    );
    expect(AI_MODELS["qr-theme-generation"].model).toBe(
      "google/gemini-3-flash",
    );
    expect(AI_MODELS.art).toMatchObject({
      model: "openai/gpt-image-2",
      providers: ["openai"],
      output: "images",
      size: "1024x1024",
      maker: "OpenAI",
      name: "GPT Image 2",
      // The gateway warns "seed is not supported" for it.
      supportsSeed: false,
    });
  });

  it("pins every task to its creator's providers, so the Subprocessors page stays complete", () => {
    const allowed: Record<string, string[]> = {
      anthropic: ["anthropic"],
      google: ["google", "vertex"],
      openai: ["openai"],
    };
    for (const task of TASKS) {
      const { model, providers } = AI_MODELS[task];
      expect(providers, task).toEqual(allowed[creatorOf(model)]);
    }
  });
});

describe("provider options", () => {
  it("send Google's thinking budget only to Google models", () => {
    expect(textProviderOptions("base")).toEqual({
      gateway: { disallowPromptTraining: true, only: ["anthropic"] },
    });
    expect(textProviderOptions("prompt-enhancement")).toEqual({
      gateway: { disallowPromptTraining: true, only: ["anthropic"] },
    });
    expect(textProviderOptions("qr-theme-generation")).toEqual({
      gateway: { disallowPromptTraining: true, only: ["google", "vertex"] },
      google: {
        thinkingConfig: { includeThoughts: false, thinkingBudget: 128 },
      },
    });
  });

  it("route the art model to OpenAI only, with no prompt training, and ask Gemini for one square 1K image", () => {
    expect(artProviderOptions(AI_MODELS.art)).toEqual({
      gateway: { disallowPromptTraining: true, only: ["openai"] },
    });
    const nanoBanana = ART_EVAL_CANDIDATES.find(
      (choice) => choice.model === "google/gemini-nano-banana-2.1",
    );
    expect(nanoBanana && artProviderOptions(nanoBanana)).toEqual({
      gateway: { disallowPromptTraining: true, only: ["google", "vertex"] },
      google: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      },
    });
  });

  it("reject a model id without a creator", () => {
    expect(() => creatorOf("claude-haiku-5.5")).toThrow(/gateway model id/);
  });
});

describe("art eval candidates", () => {
  it("start with the configured art model and take an input image", () => {
    expect(ART_EVAL_CANDIDATES[0]).toBe(AI_MODELS.art);
    expect(ART_EVAL_CANDIDATES.map((choice) => choice.model)).toEqual([
      "openai/gpt-image-2",
      "google/gemini-nano-banana-2.1",
      "google/gemini-3.1-flash-image",
      "bfl/flux-kontext-pro",
    ]);
    for (const choice of ART_EVAL_CANDIDATES) {
      if (choice.output === "files") expect(choice.options).toBeDefined();
      else expect(choice.size ?? choice.aspectRatio).toBeDefined();
      expect(choice.maker && choice.name, choice.model).toBeTruthy();
      expect(typeof choice.supportsSeed, choice.model).toBe("boolean");
    }
  });
});

describe("the art model in copy", () => {
  const app = join(__dirname, "..", "..");
  const read = (path: string) => readFileSync(join(app, path), "utf8");

  it("names it from the model map", () => {
    expect(ART_MODEL_LABEL).toBe("OpenAI's GPT Image 2");
    expect(PRODUCT_FACTS.artModel).toBe(ART_MODEL_LABEL);
    expect(ART_SUPPORTS_SEED).toBe(AI_MODELS.art.supportsSeed);
  });

  it("isn't hard-coded in the studio, the AI art page or the Art QR docs", () => {
    const files = [
      "components/sections/ai-art/ai-art-faq.tsx",
      "components/sections/ai-art/ai-art-studio.tsx",
      "components/sections/ai-art/ai-art-result.tsx",
      "components/sections/ai-art/ai-art-coming-soon.tsx",
      "app/(home)/ai/art/page.tsx",
      "content/docs/features/art-qr.mdx",
    ];
    for (const file of files) {
      const text = read(file);
      for (const name of [
        "Nano Banana",
        "Gemini",
        "GPT Image",
        "OpenAI",
        "Google's",
      ]) {
        expect(text, `${file} names ${name}`).not.toContain(name);
      }
    }
    expect(read("content/docs/features/art-qr.mdx")).toContain(
      "{facts.artModel}",
    );
  });
});

describe("AI art usage ids", () => {
  it("count the art model and every earlier one", () => {
    expect(ART_MODEL_ID).toBe(AI_MODELS.art.model);
    expect(ART_MODEL_ID).toBe("openai/gpt-image-2");
    expect(ART_USAGE_MODEL_IDS).toEqual(
      expect.arrayContaining([
        "openai/gpt-image-2",
        "google/gemini-nano-banana-2.1",
        "fal-ai/illusion-diffusion",
        "fal-ai/esrgan",
      ]),
    );
    expect(new Set(ART_USAGE_MODEL_IDS).size).toBe(ART_USAGE_MODEL_IDS.length);
  });
});

describe("legal pages", () => {
  // Who receives user content must match the map: a new creator here needs
  // its name below and on both pages.
  const NAMES: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    openai: "OpenAI",
  };
  const page = (name: string) =>
    readFileSync(
      join(__dirname, "..", "..", "content", "legal", `${name}.mdx`),
      "utf8",
    );

  it("name every provider in the model map", () => {
    const subprocessors = page("subprocessors");
    const aiFeatures = page("ai-features");
    for (const task of TASKS) {
      const name = NAMES[creatorOf(AI_MODELS[task].model)];
      expect(name, `${task}: add its provider to NAMES`).toBeDefined();
      expect(subprocessors).toContain(`| **${name} (`);
      expect(subprocessors).toContain("through Vercel AI Gateway");
      expect(aiFeatures).toContain(name);
    }
  });

  it("no longer describe a direct Gemini API key on its unpaid tier as current", () => {
    expect(page("ai-features")).not.toMatch(/QRdx uses the Gemini API/);
    expect(page("subprocessors")).not.toContain("| **Google (Gemini API)**");
  });
});

describe("providers (gateway only)", () => {
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
    vi.resetModules();
  });

  const load = () => import("@/lib/ai/providers");

  it("is off without AI_GATEWAY_API_KEY, even with a Google key, and never builds a client", async () => {
    process.env.GOOGLE_API_KEY = "test-google-key";
    try {
      vi.resetModules();
      const providers = await load();
      expect(providers.isAIConfigured).toBe(false);
      expect(() => providers.assertAIConfigured()).toThrow(
        expect.objectContaining({ status: 503, code: "AI_NOT_CONFIGURED" }),
      );
      // No fallback to a Vercel OIDC token or another env lookup.
      expect(() => providers.aiGateway()).toThrow(
        expect.objectContaining({ code: "AI_NOT_CONFIGURED" }),
      );
      expect(() => providers.languageModel("base")).toThrow(
        expect.objectContaining({ code: "AI_NOT_CONFIGURED" }),
      );
    } finally {
      delete process.env.GOOGLE_API_KEY;
    }
  });

  it("serves each text task from the gateway with the key", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    vi.resetModules();
    const providers = await load();
    expect(providers.isAIConfigured).toBe(true);
    expect(() => providers.assertAIConfigured()).not.toThrow();
    for (const task of [
      "base",
      "qr-theme-generation",
      "prompt-enhancement",
    ] as const) {
      const model = providers.languageModel(task);
      expect(typeof model === "string" ? model : model.modelId).toBe(
        AI_MODELS[task].model,
      );
      expect(typeof model === "string" ? "" : model.provider).toBe("gateway");
    }
  });
});
