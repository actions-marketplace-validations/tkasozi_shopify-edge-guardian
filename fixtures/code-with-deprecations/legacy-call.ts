// This file demonstrates legacy deprecated patterns
export async function fetchLegacyData() {
  const endpoint = "https://myshop.myshopify.com/admin/api/2023-04/orders.json";
  return fetch(endpoint);
}

export const queryWithPrivateMetafields = `
  query GetMetafields {
    app {
      privateMetafields(first: 10) {
        nodes {
          key
          value
        }
      }
    }
  }
`;
