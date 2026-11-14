// One easing curve and a few short durations for every marketing interaction.

/** cubic-bezier(.32,.72,0,1) for motion/react `transition.ease`. */
export const EASE = [0.32, 0.72, 0, 1] as const;

/** Seconds, for motion/react. */
export const DURATION = { fast: 0.15, base: 0.22, slow: 0.3 } as const;

/** Spring-free transition used by layout animations (tabs, pills). */
export const LAYOUT_TRANSITION = { duration: DURATION.base, ease: EASE };

/** Tailwind classes for CSS transitions on the same curve. */
export const EASE_CLASS = "ease-[cubic-bezier(.32,.72,0,1)]";

/** Hover lift + press feedback for cards and buttons. */
export const PRESSABLE = `transition-[transform,background-color,border-color,box-shadow] duration-200 ${EASE_CLASS} hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100`;
