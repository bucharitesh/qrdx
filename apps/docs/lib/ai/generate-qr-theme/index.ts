import { themeStylePropsSchema } from "@/types/theme";

export const themeStylePropsOutputSchema = themeStylePropsSchema
  .omit({ templateId: true, frame: true, art: true })
  .partial();
