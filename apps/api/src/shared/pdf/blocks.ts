import type { Content, ContentTable, TDocumentDefinitions, TableCell } from "pdfmake/interfaces.js";

/** A company or customer as printed on a document. Every field except the name is optional. */
export interface Party {
  name: string;
  addressLines?: string[];
  gstin?: string | null;
  pan?: string | null;
  contactLine?: string | null;
  website?: string | null;
}

export interface Signatory {
  name: string;
  designation?: string | null;
  phone?: string | null;
}

const INK = "#1a2230";
const MUTED = "#5a6573";
const RULE = "#c9d0d8";
const HEAD_FILL = "#e8ecf1";

const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => RULE,
  vLineColor: () => RULE,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

export function partyLines(party: Party): Content[] {
  const lines: Content[] = [{ text: party.name, bold: true, fontSize: 10.5 }];
  for (const line of party.addressLines ?? []) if (line) lines.push({ text: line, color: MUTED });
  const ids = [party.gstin && `GSTIN: ${party.gstin}`, party.pan && `PAN: ${party.pan}`].filter(Boolean).join("   ");
  if (ids) lines.push({ text: ids, margin: [0, 2, 0, 0] });
  if (party.contactLine) lines.push({ text: party.contactLine, color: MUTED });
  if (party.website) lines.push({ text: party.website, color: MUTED });
  return lines;
}

/** Letterhead: issuer on the left, document title and reference on the right. */
export function letterhead(issuer: Party, title: string, meta: [string, string | null | undefined][]): Content {
  return {
    columns: [
      { width: "*", stack: partyLines(issuer) },
      {
        width: "auto",
        alignment: "right",
        stack: [
          { text: title, fontSize: 15, bold: true, color: INK },
          ...meta
            .filter(([, v]) => v)
            .map(([k, v]): Content => ({ text: [{ text: `${k}: `, color: MUTED }, { text: String(v), bold: true }] })),
        ],
      },
    ],
    margin: [0, 0, 0, 10],
  };
}

export function parties(left: { label: string; party: Party }, right: { label: string; party: Party }): Content {
  const box = (label: string, party: Party): Content => ({
    width: "*",
    stack: [{ text: label.toUpperCase(), fontSize: 8, color: MUTED, margin: [0, 0, 0, 2] }, ...partyLines(party)],
  } as Content);
  return {
    columns: [box(left.label, left.party), box(right.label, right.party)],
    columnGap: 24,
    margin: [0, 0, 0, 10],
  };
}

export function heading(text: string): Content {
  return { text: text.toUpperCase(), bold: true, fontSize: 9, color: INK, margin: [0, 10, 0, 4], decoration: undefined };
}

const cell = (text: string | number | null | undefined, extra: Partial<Record<string, unknown>> = {}): TableCell => ({
  text: text === null || text === undefined ? "" : String(text),
  ...extra,
});

/** Two-column label/value table; rows with no value are dropped. */
export function keyValueTable(rows: [string, string | number | null | undefined][]): Content {
  const body = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => [cell(k, { color: MUTED }), cell(v)]);
  if (body.length === 0) return { text: "" };
  return { table: { widths: [150, "*"], body }, layout: tableLayout } as ContentTable;
}

export interface Column {
  header: string;
  width: number | "*" | "auto";
  align?: "left" | "right" | "center";
}

export function dataTable(columns: Column[], rows: (string | number | null | undefined)[][], footerRows: TableCell[][] = []): Content {
  const header = columns.map((c) => cell(c.header, { bold: true, fillColor: HEAD_FILL, alignment: c.align ?? "left" }));
  const body = rows.map((row) => row.map((value, i) => cell(value, { alignment: columns[i]!.align ?? "left" })));
  return {
    table: { headerRows: 1, widths: columns.map((c) => c.width), body: [header, ...body, ...footerRows] },
    layout: tableLayout,
  } as ContentTable;
}

export function totalRow(columnCount: number, label: string, value: string, bold = false): TableCell[] {
  const row: TableCell[] = [];
  for (let i = 0; i < columnCount - 2; i += 1) row.push({ text: "" });
  row[0] = { text: label, colSpan: columnCount - 1, alignment: "right", bold };
  for (let i = 1; i < columnCount - 1; i += 1) row[i] = { text: "" };
  row.push({ text: value, alignment: "right", bold });
  return row;
}

/** Numbered clauses ("Other terms and conditions"). Blank entries are dropped. */
export function numberedList(items: (string | null | undefined)[]): Content {
  const clean = items.filter((i): i is string => Boolean(i && i.trim()));
  if (clean.length === 0) return { text: "" };
  return { ol: clean.map((text) => ({ text, margin: [0, 0, 0, 2] })), fontSize: 8.5 };
}

export function signatures(issuerName: string, signatory: Signatory | null, counterpartyLabel: string): Content {
  return {
    unbreakable: true,
    margin: [0, 28, 0, 0],
    columns: [
      {
        width: "*",
        stack: [
          { text: `For ${issuerName}`, bold: true },
          { text: " ", margin: [0, 24, 0, 0] },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5 }] },
          { text: signatory?.name ?? "Authorised signatory", margin: [0, 2, 0, 0] },
          ...(signatory?.designation ? [{ text: signatory.designation, color: MUTED } as Content] : []),
          ...(signatory?.phone ? [{ text: signatory.phone, color: MUTED } as Content] : []),
        ],
      },
      {
        width: "*",
        stack: [
          { text: counterpartyLabel, bold: true },
          { text: " ", margin: [0, 24, 0, 0] },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.5 }] },
          { text: "Name, signature and seal", color: MUTED, margin: [0, 2, 0, 0] },
        ],
      },
    ],
  };
}

/** A4 shell with the footer every document shares: reference left, page x of y right. */
export function document(footerRef: string, content: Content[]): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 44],
    defaultStyle: { font: "Roboto", fontSize: 9, color: INK, lineHeight: 1.15 },
    footer: (page, pages) => ({
      columns: [
        { text: footerRef, color: MUTED, fontSize: 8 },
        { text: `Page ${page} of ${pages}`, alignment: "right", color: MUTED, fontSize: 8 },
      ],
      margin: [36, 12, 36, 0],
    }),
    content,
  };
}
