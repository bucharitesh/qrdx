// Test only: a tiny DNS server for workspace SSO domain verification.
// Answers TXT queries from a JSON file ({ "<name>": ["value", ...] }) that
// can be edited while it runs; everything else is NXDOMAIN. The dev server
// is pointed at it with NODE_OPTIONS="--require ./e2e/sso/dns-preload.cjs",
// which only changes node:dns's resolver (resolveTxt), not dns.lookup, so
// the database and other connections are untouched.
//
//   node e2e/sso/dns-stub.mjs <records.json> [port=5399]

import { createSocket } from "node:dgram";
import { existsSync, readFileSync } from "node:fs";

const [file, portArg] = process.argv.slice(2);
if (!file) {
  console.error("usage: node e2e/sso/dns-stub.mjs <records.json> [port]");
  process.exit(1);
}
const port = Number(portArg ?? 5399);

function records() {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function readName(buffer, offset) {
  const labels = [];
  let at = offset;
  while (buffer[at] !== 0) {
    const length = buffer[at];
    labels.push(buffer.subarray(at + 1, at + 1 + length).toString("ascii"));
    at += length + 1;
  }
  return { name: labels.join(".").toLowerCase(), end: at + 1 };
}

function txtRecord(value) {
  const chunks = [];
  const bytes = Buffer.from(value, "utf8");
  for (let i = 0; i < bytes.length; i += 255) {
    const part = bytes.subarray(i, i + 255);
    chunks.push(Buffer.from([part.length]), part);
  }
  return Buffer.concat(chunks);
}

const socket = createSocket("udp4");
socket.on("message", (query, remote) => {
  const id = query.subarray(0, 2);
  const { name, end } = readName(query, 12);
  const type = query.readUInt16BE(end);
  const question = query.subarray(12, end + 4);
  const values = type === 16 ? (records()[name] ?? []) : [];
  const answers = values.map((value) => {
    const rdata = txtRecord(value);
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0xc00c, 0); // pointer to the question's name
    header.writeUInt16BE(16, 2); // TXT
    header.writeUInt16BE(1, 4); // IN
    header.writeUInt32BE(30, 6); // TTL
    header.writeUInt16BE(rdata.length, 10);
    return Buffer.concat([header, rdata]);
  });
  const known = Object.keys(records()).some((key) => key === name);
  const flags = Buffer.alloc(10);
  // QR, RD, RA; RCODE 3 (NXDOMAIN) for unknown names.
  flags.writeUInt16BE(0x8180 | (known ? 0 : 3), 0);
  flags.writeUInt16BE(1, 2);
  flags.writeUInt16BE(answers.length, 4);
  const reply = Buffer.concat([id, flags, question, ...answers]);
  socket.send(reply, remote.port, remote.address);
  console.log(`[dns-stub] TXT? ${name} -> ${values.length} record(s)`);
});
socket.bind(port, "127.0.0.1", () =>
  console.log(`[dns-stub] listening on 127.0.0.1:${port}, records in ${file}`),
);
