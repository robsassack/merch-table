export function resolveStorefrontBrandLabel(input: {
  storeName: string | null;
  brandName: string | null;
  organizationName: string | null;
}) {
  const storeName = input.storeName?.trim();
  if (storeName) return storeName;

  const brandName = input.brandName?.trim();
  if (brandName) return brandName;

  const organizationName = input.organizationName?.trim();
  if (organizationName) return organizationName;

  return "Storefront";
}
