import { promises as fs } from "fs";
import path from "path";

export const parseCartFromMockData = async () => {
  try {
    const mockDataPath = path.join(process.cwd(), "uber_eats_test.json");
    const rawData = await fs.readFile(mockDataPath, "utf-8");
    const data = JSON.parse(rawData);

    if (!data.data?.draftOrder?.shoppingCart) {
      throw new Error("Invalid cart data structure");
    }

    const cart = data.data.draftOrder.shoppingCart;
    const items = [];
    let subtotal = 0;

    for (const item of cart.items) {
      const itemPrice = item.price / 100;
      let customizations = [];

      if (item.customizations) {
        for (const customizationGroup of Object.values(item.customizations)) {
          for (const customization of customizationGroup) {
            customizations.push({
              title: customization.title,
              price: customization.price / 100
            });
            subtotal += (customization.price / 100) * customization.quantity;
          }
        }
      }

      items.push({
        title: item.title,
        quantity: item.quantity,
        price: itemPrice,
        imageURL: item.imageURL,
        customizations: customizations
      });

      subtotal += itemPrice * item.quantity;
    }

    const deliveryFee = 0;
    const savings = 0;
    const finalTotal = subtotal + deliveryFee - savings;

    const totalItems = items.length;
    const itemName = totalItems === 1 ? items[0].title : "Mixed Order";

    return {
      cartUuid: cart.cartUuid,
      storeUuid: cart.storeUuid,
      currencyCode: cart.currencyCode,
      items: items,
      totals: {
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryFee: deliveryFee,
        savings: savings,
        finalTotal: Math.round(finalTotal * 100) / 100
      },
      summary: {
        totalItems: totalItems,
        itemName: itemName
      }
    };
  } catch (error) {
    throw new Error(`Failed to parse cart data: ${error.message}`);
  }
};
