// Valid app discount operations using GraphQL Admin API
export const CREATE_DISCOUNT_MUTATION = `
  mutation CreateCustomDiscount($input: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $input) {
      userErrors {
        field
        message
      }
      automaticAppDiscount {
        discountId
        title
      }
    }
  }
`;

export const GET_DISCOUNT_QUERY = `
  query GetAppDiscount($id: ID!) {
    discountNode(id: $id) {
      id
      discount {
        ... on DiscountAutomaticApp {
          title
          status
        }
      }
    }
  }
`;
