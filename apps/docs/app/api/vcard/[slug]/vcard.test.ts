// Run: cd apps/docs && npx tsx --test "app/api/vcard/[slug]/vcard.test.ts"
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactSchema } from "@/lib/landing/blocks/contact";
import { buildVCard, escapeText, foldLine, vcardFilename } from "./vcard";

const contact = contactSchema.parse({
  firstName: "Zoë",
  lastName: "O'Brien; Jr",
  jobTitle: "Head, Partnerships",
  company: "Acme\\Co",
  bio: "Line one\nLine two",
  phones: [
    { type: "mobile", number: "+1 (555) 010-0100" },
    { type: "fax", number: "+1 555 0101" },
  ],
  emails: [{ type: "work", address: "zoe@example.com" }],
  website: "https://example.com/a,b",
  address: {
    street: "1 Main St, Suite 2",
    city: "Springfield",
    country: "USA",
  },
});

describe("vCard", () => {
  it("escapes TEXT values per RFC 2426 / 6350", () => {
    assert.equal(escapeText("a\\b,c;d\ne"), "a\\\\b\\,c\\;d\\ne");
  });

  it("builds a vCard 3.0 with CRLF line endings", () => {
    const card = buildVCard({
      contact,
      photo: { kind: "uri", uri: "https://example.com/me.jpg" },
      socials: [{ network: "linkedin", url: "https://linkedin.com/in/zoe" }],
    });
    assert.ok(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n"));
    assert.ok(card.endsWith("END:VCARD\r\n"));
    assert.ok(!/[^\r]\n/.test(card), "every newline is CRLF");
    const unfolded = card.replace(/\r\n /g, "");
    assert.ok(unfolded.includes("N:O'Brien\\; Jr;Zoë;;;\r\n"));
    assert.ok(unfolded.includes("FN:Zoë O'Brien\\; Jr\r\n"));
    assert.ok(unfolded.includes("ORG:Acme\\\\Co\r\n"));
    assert.ok(unfolded.includes("TITLE:Head\\, Partnerships\r\n"));
    assert.ok(unfolded.includes("TEL;TYPE=CELL,VOICE:+15550100100\r\n"));
    assert.ok(unfolded.includes("TEL;TYPE=FAX:+15550101\r\n"));
    assert.ok(
      unfolded.includes("EMAIL;TYPE=INTERNET,WORK:zoe@example.com\r\n"),
    );
    assert.ok(
      unfolded.includes("URL:https://example.com/a,b\r\n"),
      "URIs keep commas",
    );
    assert.ok(
      unfolded.includes(
        "ADR;TYPE=WORK:;;1 Main St\\, Suite 2;Springfield;;;USA\r\n",
      ),
    );
    assert.ok(unfolded.includes("NOTE:Line one\\nLine two\r\n"));
    assert.ok(
      unfolded.includes(
        "X-SOCIALPROFILE;TYPE=linkedin:https://linkedin.com/in/zoe\r\n",
      ),
    );
    assert.ok(
      unfolded.includes("PHOTO;VALUE=uri:https://example.com/me.jpg\r\n"),
    );
  });

  it("uses the company as the display name when there is no person", () => {
    const card = buildVCard({
      contact: contactSchema.parse({ company: "Green Leaf Market" }),
    });
    assert.ok(card.includes("FN:Green Leaf Market\r\n"));
    assert.ok(card.includes("X-ABShowAs:COMPANY\r\n"));
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const long = `NOTE:${"é".repeat(100)}`;
    const folded = foldLine(long);
    for (const line of folded.split("\r\n")) {
      assert.ok(new TextEncoder().encode(line).length <= 75, line);
    }
    assert.equal(folded.replace(/\r\n /g, ""), long);
    const ascii = `PHOTO;ENCODING=b;TYPE=JPEG:${"A".repeat(500)}`;
    const foldedAscii = foldLine(ascii);
    assert.ok(foldedAscii.split("\r\n").every((line) => line.length <= 75));
    assert.equal(foldedAscii.replace(/\r\n /g, ""), ascii);
  });

  it("makes safe ASCII file names", () => {
    assert.equal(vcardFilename(contact), "Zoe_OBrien_Jr.vcf");
    assert.equal(vcardFilename(contactSchema.parse({})), "contact.vcf");
  });
});
