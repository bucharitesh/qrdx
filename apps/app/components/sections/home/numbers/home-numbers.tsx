import { getHomeNumbers } from "@/lib/home-numbers/load";

/**
 * The home page's only link to "QRdx in numbers". While it's off
 * (QRDX_HOME_NUMBERS isn't "1") this renders nothing and loads nothing: no
 * query runs, the page stays fully static, and the section isn't in the
 * page's markup or its JavaScript. On, it renders only when there are real
 * counts to show.
 *
 * The check is the same as homeNumbersOnHomePage() (lib/home-numbers/flag),
 * written out inline on purpose: the build replaces the variable with its
 * value (next.config.ts compiler.defineServer), so with the switch off this
 * branch is dead code and the bundler drops the import inside it, client
 * component and all. A function call would hide that from the bundler.
 */
export async function HomeNumbers() {
  if (process.env.QRDX_HOME_NUMBERS === "1") {
    const numbers = await getHomeNumbers();
    if (!numbers) return null;
    const { NumbersSection } = await import("./numbers-section");
    return <NumbersSection numbers={numbers} />;
  }
  return null;
}
