import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { CopyButton } from "@/components/copy-button";
import type { DnsRecord } from "@/lib/custom-domains";

/** Record name as most DNS providers want it: relative to the zone, "@" for the apex. */
function relativeName(name: string, apexName: string | null): string {
  if (!apexName) return name;
  if (name === apexName) return "@";
  return name.endsWith(`.${apexName}`)
    ? name.slice(0, -(apexName.length + 1))
    : name;
}

export function DnsRecords({
  records,
  apexName,
}: {
  records: DnsRecord[];
  apexName: string | null;
}) {
  if (records.length === 0) return null;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const name = relativeName(record.name, apexName);
            return (
              <TableRow key={`${record.type}:${record.name}:${record.value}`}>
                <TableCell className="align-top font-mono text-xs font-medium">
                  {record.type}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <div className="flex items-start gap-1">
                    <code
                      className="font-mono text-xs break-all"
                      title={record.name}
                    >
                      {name}
                    </code>
                    <CopyButton
                      className="-mt-1 shrink-0"
                      successMessage={{ title: "Name copied" }}
                      textToCopy={name}
                    />
                  </div>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <div className="flex items-start gap-1">
                    <code className="font-mono text-xs break-all">
                      {record.value}
                    </code>
                    <CopyButton
                      className="-mt-1 shrink-0"
                      successMessage={{ title: "Value copied" }}
                      textToCopy={record.value}
                    />
                  </div>
                  {record.note && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {record.note}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
