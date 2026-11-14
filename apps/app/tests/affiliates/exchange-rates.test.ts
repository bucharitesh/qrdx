// D-C2: US-dollar rates from the European Central Bank's daily reference
// rates (lib/affiliates/exchange-rates.ts). Read from the ECB's own XML
// shape; with no answer, a broken file or no US-dollar rate there's no
// rate at all, and nothing is guessed. No network: fetch is a stand-in.
import { describe, expect, it } from "vitest";
import { fetchUsdRates, parseEcbDaily } from "@/lib/affiliates/exchange-rates";
import { quotePayout } from "@/lib/affiliates/payout-quote";
import { AFFILIATE_FX_DATA_URL } from "@/lib/affiliates/terms";

// The shape the ECB publishes (rates per euro); the numbers are made up.
const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-11-10'>
      <Cube currency='USD' rate='1.1000'/>
      <Cube currency='JPY' rate='165.00'/>
      <Cube currency='INR' rate='96.800'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

const response = (body: string, status = 200) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("the ECB's daily rates", () => {
  it("become US dollars per unit, with the ECB's date", () => {
    const rates = parseEcbDaily(ECB_XML);
    expect(rates).toMatchObject({
      date: "2026-11-10",
      source: "European Central Bank reference rates",
    });
    // 1.1 US$ per € ÷ 96.8 ₹ per € = 0.011363636… US$ per ₹.
    expect(rates?.usdPer.inr).toBe("0.01136363636");
    expect(rates?.usdPer.eur).toBe("1.1");
    expect(rates?.usdPer.usd).toBeUndefined();
  });

  it("are nothing without a date or a US-dollar rate", () => {
    expect(parseEcbDaily("<html>Maintenance</html>")).toBeNull();
    expect(
      parseEcbDaily(
        ECB_XML.replace("<Cube currency='USD' rate='1.1000'/>", ""),
      ),
    ).toBeNull();
  });

  it("are fetched fresh from the ECB", async () => {
    let asked: string | null = null;
    const result = await fetchUsdRates((async (
      url: string,
      init?: RequestInit,
    ) => {
      asked = url;
      expect(init?.cache).toBe("no-store");
      return new Response(ECB_XML);
    }) as unknown as typeof fetch);
    expect(asked).toBe(AFFILIATE_FX_DATA_URL);
    expect(result).toMatchObject({ ok: true, rates: { date: "2026-11-10" } });
  });

  it("say why there's no rate, and never throw", async () => {
    expect(await fetchUsdRates(response("", 503))).toEqual({
      ok: false,
      reason: "The ECB answered 503.",
    });
    expect(await fetchUsdRates(response("<html/>"))).toEqual({
      ok: false,
      reason: "The ECB's file had no US-dollar rate.",
    });
    expect(
      await fetchUsdRates((async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch),
    ).toEqual({ ok: false, reason: "The ECB couldn't be reached." });
  });

  it("leave a payout in rupees unquoted when they're missing", async () => {
    const failed = await fetchUsdRates(response("", 503));
    expect(
      quotePayout({
        affiliateId: "aff_1",
        cutoff: new Date(),
        byCurrency: { usd: 3000, inr: 90_000 },
        rates: failed,
      }),
    ).toMatchObject({ ok: false, reason: "no_rate", currencies: ["inr"] });
    // US dollars alone need no rate.
    expect(
      quotePayout({
        affiliateId: "aff_1",
        cutoff: new Date(),
        byCurrency: { usd: 3000 },
        rates: failed,
      }),
    ).toMatchObject({ ok: true, quote: { usdTotal: 3000, fxDate: null } });
  });
});
