// Registers every landing page type (the "New code" picker + template
// gallery). Import the template APIs from here (not from ./registry) so all
// types are registered before use.
// Each page-type executor adds exactly ONE line below, e.g. `import "./menu";`
import "./links";
import "./business";
import "./vcard";
import "./pdf";
import "./images";
import "./mp3";
import "./video";
import "./menu";
import "./coupon";
import "./event";
import "./apps";
import "./feedback";
import "./custom";

export * from "./registry";
