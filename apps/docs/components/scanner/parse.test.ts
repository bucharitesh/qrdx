// Run: cd apps/docs && npx tsx --test components/scanner/parse.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, toCsv } from "./csv";
import {
  formatWei,
  isValidGtin,
  type ParsedScan,
  parseGs1ElementString,
  parseScan,
  summarizeScan,
} from "./parse";

function expectKind<K extends ParsedScan["kind"]>(
  parsed: ParsedScan,
  kind: K,
): Extract<ParsedScan, { kind: K }> {
  assert.equal(parsed.kind, kind);
  return parsed as Extract<ParsedScan, { kind: K }>;
}

describe("parseScan: links", () => {
  it("recognizes http(s) links in any case", () => {
    const parsed = expectKind(parseScan("HTTPS://EXAMPLE.COM/Path"), "url");
    assert.equal(parsed.url, "https://example.com/Path");
  });

  it("parses GS1 Digital Link paths and query AIs", () => {
    const parsed = expectKind(
      parseScan(
        "https://id.example.com/01/09506000134352/10/ABC123/21/S1?17=261231",
      ),
      "url",
    );
    assert.deepEqual(parsed.gs1?.fields, [
      { label: "GTIN", value: "09506000134352" },
      { label: "Batch / lot", value: "ABC123" },
      { label: "Serial number", value: "S1" },
      { label: "Expiry date", value: "2026-12-31" },
    ]);
    assert.equal(parsed.gs1?.gtin, "09506000134352");
  });

  it("treats PayPal.Me and Venmo links as payments", () => {
    const paypal = expectKind(
      parseScan("https://paypal.me/janedoe/25EUR"),
      "payment",
    );
    assert.equal(paypal.scheme, "paypal");
    assert.equal(paypal.payee, "janedoe");
    assert.equal(paypal.amount, "25EUR");
    assert.equal(paypal.openUrl, "https://paypal.me/janedoe/25EUR");

    const venmo = expectKind(
      parseScan("https://venmo.com/u/Jane-Doe?txn=pay&amount=12.50"),
      "payment",
    );
    assert.equal(venmo.scheme, "venmo");
    assert.equal(venmo.payee, "Jane-Doe");
    assert.equal(venmo.amount, "12.50");
  });
});

describe("parseScan: Wi-Fi", () => {
  it("reads fields in any order with escapes", () => {
    const parsed = expectKind(
      parseScan("WIFI:S:My\\;Cafe;T:WPA;P:pa\\:ss\\\\word;H:true;;"),
      "wifi",
    );
    assert.equal(parsed.ssid, "My;Cafe");
    assert.equal(parsed.password, "pa:ss\\word");
    assert.equal(parsed.security, "WPA");
    assert.equal(parsed.hidden, true);
  });

  it("handles open networks", () => {
    const parsed = expectKind(parseScan("WIFI:T:nopass;S:Guest;;"), "wifi");
    assert.equal(parsed.security, "None");
    assert.equal(parsed.password, "");
  });
});

describe("parseScan: contacts and events", () => {
  it("parses a folded vCard", () => {
    const parsed = expectKind(
      parseScan(
        "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;Jane;;;\r\nFN:Jane Doe\r\nORG:Acme\\, Inc.\r\nTEL;TYPE=CELL:+1 555 0100\r\nEMAIL:jane@\r\n example.com\r\nADR:;;1 Main St;Springfield;;;US\r\nEND:VCARD",
      ),
      "contact",
    );
    assert.equal(parsed.contact.name, "Jane Doe");
    assert.equal(parsed.contact.organization, "Acme, Inc.");
    assert.deepEqual(parsed.contact.phones, ["+1 555 0100"]);
    assert.deepEqual(parsed.contact.emails, ["jane@example.com"]);
    assert.equal(parsed.contact.address, "1 Main St, Springfield, US");
    assert.match(parsed.vcard, /END:VCARD\r\n$/);
  });

  it("converts a MeCard to vCard", () => {
    const parsed = expectKind(
      parseScan(
        "MECARD:N:Doe,Jane;TEL:+15550100;EMAIL:jane@example.com;NOTE:Hi\\, there;;",
      ),
      "contact",
    );
    assert.equal(parsed.format, "mecard");
    assert.equal(parsed.contact.name, "Jane Doe");
    assert.equal(parsed.contact.note, "Hi, there");
    assert.match(
      parsed.vcard,
      /^BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;Jane;;;\r\nFN:Jane Doe\r\n/,
    );
    assert.match(parsed.vcard, /NOTE:Hi\\, there\r\n/);
  });

  it("wraps a bare VEVENT in a calendar", () => {
    const parsed = expectKind(
      parseScan(
        "BEGIN:VEVENT\nSUMMARY:Launch party\nDTSTART:20261120T180000Z\nDTEND:20261120T210000Z\nLOCATION:Hall 1\nEND:VEVENT",
      ),
      "event",
    );
    assert.equal(parsed.event.summary, "Launch party");
    assert.equal(parsed.event.start, "2026-11-20T18:00:00Z");
    assert.equal(parsed.event.allDay, false);
    assert.equal(parsed.event.location, "Hall 1");
    assert.match(parsed.ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
    assert.match(parsed.ics, /END:VEVENT\r\nEND:VCALENDAR\r\n$/);
  });
});

describe("parseScan: location, phone, SMS, email", () => {
  it("parses geo URIs and rejects impossible coordinates", () => {
    const parsed = expectKind(
      parseScan("geo:48.8584,2.2945?q=Eiffel%20Tower"),
      "geo",
    );
    assert.equal(parsed.lat, 48.8584);
    assert.equal(parsed.lon, 2.2945);
    assert.equal(parsed.label, "Eiffel Tower");
    assert.equal(parseScan("geo:123,456").kind, "text");
  });

  it("parses tel, sms, SMSTO, mailto and MATMSG", () => {
    assert.equal(
      expectKind(parseScan("tel:+15550100"), "phone").number,
      "+15550100",
    );
    const sms = expectKind(
      parseScan("sms:+15550100?body=Hello%20there"),
      "sms",
    );
    assert.deepEqual([sms.number, sms.body], ["+15550100", "Hello there"]);
    const smsto = expectKind(parseScan("SMSTO:+15550100:Hi: you"), "sms");
    assert.deepEqual([smsto.number, smsto.body], ["+15550100", "Hi: you"]);
    const mail = expectKind(
      parseScan("mailto:hi@example.com?subject=Hello&body=Line"),
      "email",
    );
    assert.deepEqual(
      [mail.to, mail.subject, mail.body],
      ["hi@example.com", "Hello", "Line"],
    );
    const matmsg = expectKind(
      parseScan("MATMSG:TO:hi@example.com;SUB:Order;BODY:Two please;;"),
      "email",
    );
    assert.deepEqual(
      [matmsg.to, matmsg.subject, matmsg.body],
      ["hi@example.com", "Order", "Two please"],
    );
  });
});

describe("parseScan: payments", () => {
  it("parses UPI", () => {
    const parsed = expectKind(
      parseScan(
        "upi://pay?pa=shop@okbank&pn=Corner%20Shop&am=150.00&cu=INR&tn=Order%2042",
      ),
      "payment",
    );
    assert.equal(parsed.scheme, "upi");
    assert.equal(parsed.payee, "Corner Shop");
    assert.equal(parsed.amount, "INR 150.00");
    assert.equal(parsed.copyValue, "shop@okbank");
    assert.ok(parsed.openUrl?.startsWith("upi://pay"));
  });

  it("parses Bitcoin and Ethereum (EIP-681)", () => {
    const btc = expectKind(
      parseScan(
        "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.0015&label=Donation",
      ),
      "payment",
    );
    assert.equal(btc.amount, "0.0015 BTC");
    assert.equal(btc.payee, "Donation");

    const eth = expectKind(
      parseScan(
        "ethereum:0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359@1?value=2.014e18",
      ),
      "payment",
    );
    assert.equal(eth.amount, "2.014 ETH");
    assert.equal(eth.payee, "0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359");
    assert.deepEqual(
      eth.fields.find((field) => field.label === "Chain ID"),
      {
        label: "Chain ID",
        value: "1",
      },
    );
  });

  it("parses EPC (SEPA) transfers without an app link", () => {
    const parsed = expectKind(
      parseScan(
        "BCD\n002\n1\nSCT\nBFSWDE33BER\nWikimedia Foerdergesellschaft\nDE33 1002 0500 0001 1947 00\nEUR10.5\n\n\nDonation\n",
      ),
      "payment",
    );
    assert.equal(parsed.scheme, "epc");
    assert.equal(parsed.payee, "Wikimedia Foerdergesellschaft");
    assert.equal(parsed.copyValue, "DE33100205000001194700");
    assert.equal(parsed.amount, "EUR 10.5");
    assert.equal(parsed.openUrl, undefined);
  });
});

describe("GS1 and product codes", () => {
  it("parses bracketed and GS-separated element strings", () => {
    assert.deepEqual(
      parseGs1ElementString("(01)09506000134352(17)261200(10)LOT7")?.fields,
      [
        { label: "GTIN", value: "09506000134352" },
        { label: "Expiry date", value: "2026-12" },
        { label: "Batch / lot", value: "LOT7" },
      ],
    );
    const raw = parseGs1ElementString("010950600013435210LOT7\u001d3102001250");
    assert.deepEqual(raw?.fields, [
      { label: "GTIN", value: "09506000134352" },
      { label: "Batch / lot", value: "LOT7" },
      { label: "Net weight (kg)", value: "12.5" },
    ]);
    assert.equal(parseGs1ElementString("0109506000134352"), null);
    assert.equal(parseScan("(01)09506000134352", "data_matrix").kind, "gs1");
  });

  it("validates EAN/UPC check digits", () => {
    assert.equal(isValidGtin("4006381333931"), true);
    assert.equal(isValidGtin("4006381333932"), false);
    assert.equal(isValidGtin("96385074"), true);
    const product = expectKind(parseScan("4006381333931", "ean_13"), "product");
    assert.equal(product.checkDigitValid, true);
    assert.equal(
      expectKind(parseScan("01234565", "upc_e"), "product").checkDigitValid,
      null,
    );
    // Digits from a QR code are just text.
    assert.equal(parseScan("4006381333931", "qr_code").kind, "text");
  });
});

describe("helpers", () => {
  it("formats wei", () => {
    assert.equal(formatWei("1000000000000000000"), "1");
    assert.equal(formatWei("1500000000000000000"), "1.5");
    assert.equal(formatWei("2.014e18"), "2.014");
    assert.equal(formatWei("abc"), null);
  });

  it("summarizes scans for lists", () => {
    assert.equal(summarizeScan(parseScan("WIFI:S:Home;T:WPA;P:x;;")), "Home");
    assert.equal(summarizeScan(parseScan("hello")), "hello");
  });

  it("falls back to text for anything else", () => {
    assert.equal(parseScan("Just some words").kind, "text");
    assert.equal(parseScan("WIFI:T:WPA;;").kind, "text");
    assert.equal(parseScan("upi://pay").kind, "text");
  });
});

describe("CSV export", () => {
  it("quotes and defuses formulas", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
    assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(csvCell("+1 555"), '"\'+1 555"');
    assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  });

  it("writes a header and ISO timestamps", () => {
    const csv = toCsv([
      {
        scannedAt: Date.UTC(2026, 9, 31, 12),
        format: "QR code",
        type: "Link",
        value: "https://example.com/?a=1,2",
      },
    ]);
    assert.equal(
      csv,
      'scanned_at,format,type,value\r\n2026-10-31T12:00:00.000Z,QR code,Link,"https://example.com/?a=1,2"\r\n',
    );
  });
});
