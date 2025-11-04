// Base props that all templates support
export type BaseTemplateProps = {
  fgColor?: string;
  bgColor?: string;
};

// Generic template definition that allows custom props
export type TemplateDefinition<TCustomProps = Record<string, never>> = {
  id: string;
  name: string;
  description?: string;
  wrapper: (
    children: React.ReactNode,
    props?: BaseTemplateProps & TCustomProps
  ) => React.ReactNode;
};

