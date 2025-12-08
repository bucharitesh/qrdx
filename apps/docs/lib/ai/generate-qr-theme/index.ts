import { themeStylePropsSchema } from "@/types/theme";

export const themeStylePropsOutputSchema = themeStylePropsSchema
  .omit({ level: true, customLogo: true })
  .partial();
