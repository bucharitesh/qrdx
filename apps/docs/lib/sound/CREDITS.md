# Sound credits

The recorded cues in `apps/docs/public/sounds/` come from the
[soundcn](https://www.soundcn.xyz/) registry (`https://www.soundcn.xyz/r/<name>.json`),
decoded from each item's `data:audio/mpeg` URI without re-encoding. Every file is by
Kenney (https://kenney.nl) under **CC0 1.0** (public domain; attribution not required,
given here anyway). Only items whose `meta.license` is `CC0` were used.

| Cue (file)     | soundcn item       | Author | Licence | Length as played |
| -------------- | ------------------ | ------ | ------- | ---------------- |
| `copy.mp3`     | `glass-002`        | Kenney | CC0     | 0.12 s |
| `download.mp3` | `drop-002`         | Kenney | CC0     | 0.19 s |
| `success.mp3`  | `confirmation-001` | Kenney | CC0     | 0.29 s file, faded out at 0.25 s |
| `error.mp3`    | `bong-001`         | Kenney | CC0     | 0.12 s |
| `ai-done.mp3`  | `power-up-2`       | Kenney | CC0     | 0.47 s file; 0.19 s after its leading silence |

Every cue also has a Web Audio synth fallback, used while its sample loads or if
the file fails to load.

The engine skips leading silence and caps cues at 250 ms at runtime
(`lib/sound/trim.ts`, `lib/sound/engine.ts`), so the files stay byte-identical
to the registry.
