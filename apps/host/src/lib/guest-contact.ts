export type ContactFields = Record<
  | "name"
  | "dates"
  | "arrival"
  | "departure"
  | "rooms"
  | "property"
  | "reservation",
  string
>;
export type GuestContact = {
  fields: ContactFields;
  phone: string;
  email: string;
};

export const sampleContact: ContactFields = {
  name: "Alex Rossi",
  dates: "18/11/2026 – 21/11/2026",
  arrival: "18/11/2026",
  departure: "21/11/2026",
  rooms: "Suite 2",
  property: "Casa Luna",
  reservation: "1042",
};

export function contactName(template: string, fields: ContactFields) {
  return (
    template
      .replace(/\{(\w+)\}/g, (token, field) =>
        Object.hasOwn(fields, field)
          ? fields[field as keyof ContactFields]
          : token,
      )
      .trim() || fields.name
  );
}

function escapeText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function foldLine(line: string) {
  const encoder = new TextEncoder();
  let output = "",
    bytes = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (bytes + width > 75) {
      output += "\r\n ";
      bytes = 1;
    }
    output += char;
    bytes += width;
  }
  return output;
}

export async function saveGuestContact(
  contact: GuestContact,
  template: string,
) {
  const name = contactName(template, contact.fields) || contact.phone;
  const display = escapeText(name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:" + display,
    "N:" + display + ";;;;",
    "TEL;TYPE=CELL:" + escapeText(contact.phone),
  ];
  if (contact.email) lines.push("EMAIL:" + escapeText(contact.email));
  lines.push("END:VCARD");
  const filename =
    name.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 100) + ".vcf";
  const file = new File([lines.map(foldLine).join("\r\n") + "\r\n"], filename, {
    type: "text/vcard",
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}
