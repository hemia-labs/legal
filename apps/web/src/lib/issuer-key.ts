const PREFIX = "issuer_";

export function issuerKeyFromName(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80 - PREFIX.length)
    .replace(/_+$/g, "");

  return `${PREFIX}${slug}`;
}
