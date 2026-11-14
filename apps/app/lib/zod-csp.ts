import { z } from "zod";

// Zod compiles object schemas with `new Function` when it can, and probes for
// that by calling `Function("")`, which the Content-Security-Policy refuses
// (no 'unsafe-eval'): every page would log a violation. Browsers use the
// interpreted parser instead. Imported first by app/providers.tsx.
if (typeof window !== "undefined") z.config({ jitless: true });
