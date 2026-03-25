// CSS Modules type declaration
declare module "*.css" {
  const styles: Record<string, string>;
  export default styles;
  export = styles;
}

// webpack HMR
interface NodeModule {
  hot?: {
    accept(dependency: string, callback: () => void): void;
  };
}
