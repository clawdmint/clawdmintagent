export const PUBLIC_COLLECTION_STATUSES = ["ACTIVE", "SOLD_OUT"] as const;

const HIDDEN_PUBLIC_COLLECTIONS = new Set([
  "0xa36bfea4b27ff26a8e4c580a925761025ae6e551",
  "dsujau9vnaqrmyv7u8dx4xg6azffzsh4fzn4g95dytx",
  "4pk6vwfnxyja3whksgsmevtkpzr2efskpuvlre82yvjd",
  "2fls53pygxtbacud3sy6bs3supw4u8makdpwd8iguvec",
  "5jzbocsrm6n8hf1qc7wh62ws19jqmxnd9dmljcgrdyrr",
  "2nb5hy1qbfeseyfx2ep1ecxwzdcbplkxq7adwf465nyq",
]);

export function isPublicCollectionAddressVisible(address: string) {
  return !HIDDEN_PUBLIC_COLLECTIONS.has(address.toLowerCase());
}

export function filterVisiblePublicCollections<T extends { address: string }>(collections: T[]) {
  return collections.filter((collection) => isPublicCollectionAddressVisible(collection.address));
}
