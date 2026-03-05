import { themeStylePropsSchema } from "@/types/theme";

export const themeStylePropsOutputSchema = themeStylePropsSchema
  .omit({ templateId: true })
  .partial();
