import type qrcodegen from "../src/codegen";

export type Modules = ReturnType<qrcodegen.QrCode["getModules"]>;
export type Excavation = { x: number; y: number; w: number; h: number };
