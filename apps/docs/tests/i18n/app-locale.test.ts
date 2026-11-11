// The signed-in app's language and the emails' (phase 2): the sign-up's
// language cookie, and email templates rendered in the recipient's language.
import { render } from "@react-email/render";
import { signUpLocale } from "@repo/auth/sign-up-locale";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  SignInCodeEmail,
  signInCodeSubject,
} from "@/lib/email/templates/sign-in-code";
import { ENGLISH_EMAIL, emailIntl } from "@/lib/i18n/email";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

const withCookie = (cookie: string) => ({ headers: new Headers({ cookie }) });

describe("a new account's language", () => {
  it("comes from the language menu's cookie on the sign-up request", () => {
    expect(signUpLocale(withCookie("NEXT_LOCALE=es"))).toBe("es");
    expect(signUpLocale(withCookie("a=1; NEXT_LOCALE=pt-BR; b=2"))).toBe(
      "pt-BR",
    );
    expect(signUpLocale(withCookie("NEXT_LOCALE=zh-Hans"))).toBe("zh-Hans");
    // OAuth callbacks carry the request instead of headers.
    expect(
      signUpLocale({
        request: { headers: new Headers({ cookie: "NEXT_LOCALE=ja" }) },
      }),
    ).toBe("ja");
  });

  it("is left unset without a well-formed code", () => {
    expect(signUpLocale(withCookie("theme=dark"))).toBeNull();
    expect(signUpLocale(withCookie("NEXT_LOCALE=<script>"))).toBeNull();
    expect(signUpLocale(withCookie("NEXT_LOCALE=es;es"))).toBe("es");
    expect(signUpLocale(null)).toBeNull();
    expect(signUpLocale({ headers: null })).toBeNull();
  });
});

describe("emails in the recipient's language", () => {
  it("render in English by default, as before", async () => {
    const html = await render(
      createElement(SignInCodeEmail, { code: "402871" }),
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain(en.emails.signInCode.heading);
    expect(signInCodeSubject()).toBe("Your QRdx sign-in code");
    expect(ENGLISH_EMAIL.t("codes.expires", { minutes: 5 })).toContain(
      "5 minutes",
    );
  });

  it("render in Spanish with a Spanish translator", async () => {
    const intl = await emailIntl("es");
    const html = await render(
      createElement(SignInCodeEmail, { code: "402871", intl }),
    );
    expect(html).toContain('lang="es"');
    expect(html).toContain("402871");
    expect(html).toContain(es.emails.signInCode.heading);
    expect(signInCodeSubject(intl)).toBe(es.emails.signInCode.subject);
    expect(signInCodeSubject(intl)).not.toBe(signInCodeSubject());
  });
});
