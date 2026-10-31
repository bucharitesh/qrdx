// Registers every landing-page block. Import the landing APIs from here (not
// from ../registry) so all blocks are registered before use.
// Each block executor adds exactly ONE line below, e.g. `import "./links";`
import "@/components/landing/core-blocks";
import "@/lib/files/blocks";
import "./menu";
import "./menu-wifi";
import "./coupon";
import "./event";
import "./apps";
import "./form";
import "./rating";

export * from "../registry";
