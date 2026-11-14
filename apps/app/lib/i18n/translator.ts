// The type of a translator for one namespace, the same for useTranslations
// (client), getTranslations (server) and createTranslator (emails, tests).
// Helpers outside components take one as a parameter.
import type {
  createTranslator,
  Messages,
  NamespaceKeys,
  NestedKeyOf,
} from "next-intl";

export type Translator<
  Namespace extends NamespaceKeys<Messages, NestedKeyOf<Messages>> = never,
> = ReturnType<typeof createTranslator<Messages, Namespace>>;
