import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import { parseCartFromMockData } from "../utils/cartParser.js";
import Order from "../models/orderModel.js";
import { generateOrderId } from "../helpers/index.js";

export const getUberOrder = catchAsyncErrors(async (req, res, next) => {
  const { cartUrl } = req.body || {};

  if (!cartUrl) {
    return next(new ErrorHandler("cartUrl is required", 400));
  }

  try {
    new URL(cartUrl);
  } catch (error) {
    return next(new ErrorHandler("Invalid cart URL format", 400));
  }

  try {
    const parsed = await parseCartFromMockData();

    const gross = Math.round((parsed.totals.subtotal + parsed.totals.deliveryFee) * 100);

    const computeOption = (percent) => {
      const discount_amount = Math.round(gross * (percent / 100));
      const final_total = gross - discount_amount;
      return { discount_percent: percent, discount_amount, final_total };
    };

    const pricing_options = {
      sol: computeOption(40),
      spl: computeOption(70),
      card: computeOption(0),
    };

    // Check if user has already used this link 3 times
    const existingOrdersCount = await Order.countDocuments({
      user_id: req.user.id,
      cart_url: cartUrl,
    });
    
    if (existingOrdersCount >= 3) {
      return next(new ErrorHandler("You have already used this link 3 times. Maximum usage limit reached.", 400));
    }
    
    // Check if user has 3 active orders with this link
    const activeOrdersCount = await Order.countDocuments({
      user_id: req.user.id,
      cart_url: cartUrl,
      status: { $in: ["PLACED", "DELIVERED"] }
    });
    
    if (activeOrdersCount >= 3) {
      return next(new ErrorHandler("You already have 3 active orders with this link. Maximum active orders limit reached.", 400));
    }

    const order = await Order.create({
      order_id: generateOrderId(),
      user_id: req.user.id,
      cart_url: cartUrl,
      status: "PENDING",
      subtotal: Math.round(parsed.totals.subtotal * 100),
      delivery_fee: Math.round(parsed.totals.deliveryFee * 100),
      pricing_options,
      order_cart_details: {
        store_uuid: parsed.storeUuid,
        cart_uuid: parsed.cartUuid,
        items: parsed.items.map((it) => ({
          title: it.title,
          quantity: it.quantity,
          price: Math.round(it.price * 100),
          image_url: it.imageURL,
          customizations: (it.customizations || []).map((c) => ({ title: c.title, price: Math.round(c.price * 100) })),
        })),
        summary: { total_items: parsed.summary.totalItems, item_name: parsed.summary.itemName },
      },
    });

    res.json({
      success: true,
      message: "Cart parsed and order created",
      data: {
        order_id: order.order_id,
        user_id: order.user_id,
        status: order.status,
        order_cart_details: order.order_cart_details,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        pricing_options: order.pricing_options
      }
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
