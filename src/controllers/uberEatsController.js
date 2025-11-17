import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Order from "../models/orderModel.js";
import { generateOrderId } from "../helpers/index.js";
import { SiteSettings } from "../models/siteSettingsModel.js";
import { getOrderDetails, getFrontendReadyOrderData, testAuth, updateSid, ensureValidSid, getSid, extractGroupUuid } from "../utils/uberEats.js";
import { get_fees } from "../utils/get_fees.js";

export const scrapeUberEatsGroupOrderLink = catchAsyncErrors(
  async (req, res, next) => {
    const setting = await SiteSettings.findOne().lean();

    if (!setting?.ServiceAvavailable) {
      throw new ErrorHandler(
        "Service is currently unavailable. Please try again later.",
        400
      );
    }

    // Check service availability time (UTC)
    if (setting?.startTime && setting?.endTime) {
      const now = new Date();
      const currentTime = now.toISOString().slice(11, 16);
      
      const startTime = setting.startTime;
      const endTime = setting.endTime;
      
      // Convert times to minutes for comparison
      const currentMinutes = parseInt(currentTime.split(':')[0]) * 60 + parseInt(currentTime.split(':')[1]);
      const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
      const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
      
      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        throw new ErrorHandler(
          `Service is only available between ${startTime} and ${endTime} UTC. Please try again during service hours.`,
          400
        );
      }
    }

    let { url, sid } = req.body;
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new ErrorHandler("URL is required", 400);
    }
    
    // Check if URL contains placeholder
    if (url.includes('your-group-order-id')) {
      throw new ErrorHandler("Please provide a real Uber Eats group order link, not a placeholder", 400);
    }
    
        // Handle SID update if provided
        if (sid && typeof sid === 'string' && sid.length >= 20) {
          updateSid(sid);
        }
        
    url = url.replace("https://eats.uber.com", "https://www.ubereats.com");
        
        // Ensure we have a valid SID (auto-refresh if needed)
        await ensureValidSid();
        
        // Check if SID is valid (with more lenient validation)
        const authResult = await testAuth();
        if (!authResult) {
          console.log("⚠️ SID validation failed, but proceeding anyway...");
          // Don't throw error, just log and continue
        } else {
          console.log("✅ SID validation successful");
        }

    // Check if user has already used this link 3 times
    const existingOrdersCount = await Order.countDocuments({
      user_id: req.user.id,
      cart_url: url,
    });
    
    if (existingOrdersCount >= 3) {
      throw new ErrorHandler("You have already used this link 3 times. Maximum usage limit reached.", 400);
    }
    
    // Check if user has 3 active orders with this link
    const activeOrdersCount = await Order.countDocuments({
      user_id: req.user.id,
      cart_url: url,
      status: { $in: ["PLACED", "DELIVERED"] }
    });
    
    if (activeOrdersCount >= 3) {
      throw new ErrorHandler("You already have 3 active orders with this link. Maximum active orders limit reached.", 400);
    }
    
    // Find existing order for update (if any)
    let order = await Order.findOne({
      user_id: req.user.id,
      cart_url: url,
    });

    try {
      // Extract draft_order_uuid from URL
      const draft_order_uuid = extractGroupUuid(url);
      
      // Get fees using get_fees function (will use active cookie from database)
      let feesData = null;
      if (draft_order_uuid) {
        try {
          // get_fees will automatically fetch active cookie from database if not provided
          feesData = await get_fees(draft_order_uuid, null, {
            printSummary: false,
            saveToFile: false,
            useDatabaseCookie: true
          });
        } catch (feesError) {
          console.error("❌ Error fetching fees from get_fees:", feesError.message);
          // Continue without fees data if it fails
        }
      }
      
      // Get frontend-ready order data with real fees and Uber One benefits
      const orderDetails = await getFrontendReadyOrderData(url);
      
      if (!orderDetails.success) {
        return res.status(400).json({ 
          success: false, 
          message: orderDetails.error || "Failed to fetch order details. Please check the link and try again." 
        });
      }

      // Extract data from our frontend-ready response
      const orderData = orderDetails.data;
      
      // Extract pricing data from the pricing object
      const pricing = orderData.pricing;
      const {
        subtotal,
        // fees,  // COMMENTED OUT
        // taxes,  // COMMENTED OUT
        // service_fee,  // COMMENTED OUT
        // tip,  // COMMENTED OUT
        // small_order_fee,  // COMMENTED OUT
        // adjustments_fee,  // COMMENTED OUT
        // pickup_fee,  // COMMENTED OUT
        // other_fees,  // COMMENTED OUT
        total,
        currency
      } = pricing;
      
      // Extract delivery_fee from fees (since fees is the delivery fee for non-Uber One users) - COMMENTED OUT
      // const delivery_fee = fees;
      
      // Extract other data
      const {
        items,
        restaurant,
        delivery,
        // uber_one,  // COMMENTED OUT
        customer_details
      } = orderData;
      
      // Extract restaurant data
      const restaurant_name = restaurant?.name;
      const restaurant_address = restaurant?.address;
      const restaurant_hours = restaurant?.hours;
      const restaurant_image_url = restaurant?.image_url;
      
      // Extract delivery data
      const delivery_address = delivery?.address;
      const delivery_instructions = delivery?.instructions;
      
      // Extract Uber One data - COMMENTED OUT
      // const is_uber_one_eligible = uber_one?.is_uber_one_eligible || false;
      // const has_uber_one = uber_one?.has_uber_one || false;
      // const uber_one_benefit = uber_one?.uber_one_benefit || 0;

      // Basic validation
      if (typeof subtotal !== "number") {
        throw new ErrorHandler(
          "Failed to extract order subtotal. Please check the Uber Eats link and try again.",
          400
        );
      }

      if (subtotal <= 0 && (!items || items.length === 0)) {
        throw new ErrorHandler(
          "No items found in the order. Please make sure the Uber Eats group order has items added.",
          400
        );
      }

      // Check minimum and maximum order amount
      const minimumOrderAmount = 25;
      const maximumOrderAmount = 32;
      
      // Subtotal is already in dollars from our frontend-ready response
      const subtotalInDollars = subtotal;

      if (subtotalInDollars < minimumOrderAmount) {
        const remainingAmount = minimumOrderAmount - subtotalInDollars;
        throw new ErrorHandler(
          `Your cart subtotal is $${subtotalInDollars.toFixed(2)}, but the minimum order amount is $${minimumOrderAmount}. Please add $${remainingAmount.toFixed(2)} more to your cart to proceed.`,
          400
        );
      }

      if (subtotalInDollars > maximumOrderAmount) {
        const excessAmount = subtotalInDollars - maximumOrderAmount;
        throw new ErrorHandler(
          `Your cart subtotal is $${subtotalInDollars.toFixed(2)}, but the maximum order amount is $${maximumOrderAmount}. Please remove $${excessAmount.toFixed(2)} from your cart to proceed.`,
          400
        );
      }

      // Values are already in dollars from frontend response
      const subtotalCents = Math.round(subtotal * 100);
      // const feesCents = Math.round(fees * 100);  // COMMENTED OUT
      // const taxesCents = Math.round(taxes * 100);  // COMMENTED OUT
      // const deliveryFeeCents = Math.round(delivery_fee * 100);  // COMMENTED OUT
      // const serviceFeeCents = Math.round(service_fee * 100);  // COMMENTED OUT
      // const tipCents = Math.round(tip * 100);  // COMMENTED OUT
      const totalCents = Math.round(total * 100);  // Total = Subtotal (no fees)
      // const uberOneBenefitCents = Math.round(uber_one_benefit * 100);  // COMMENTED OUT

      if (order) {
        // Update existing order
        order.subtotal = subtotalCents;
        order.fees = 0;  // Set to 0 instead of commented out (model requires this field)
        order.taxes = 0;  // Set to 0 instead of commented out (model requires this field)
        // order.delivery_fee = deliveryFeeCents;  // COMMENTED OUT
        // order.service_fee = serviceFeeCents;  // COMMENTED OUT
        // order.tip = tipCents;  // COMMENTED OUT
        // order.small_order_fee = 0;  // COMMENTED OUT
        // order.adjustments_fee = 0;  // COMMENTED OUT
        // order.pickup_fee = 0;  // COMMENTED OUT
        // order.other_fees = 0;  // COMMENTED OUT
        // order.has_uber_one = has_uber_one;  // COMMENTED OUT
        // order.uber_one_benefit = uberOneBenefitCents;  // COMMENTED OUT
        order.total = totalCents;  // Total = Subtotal (no fees)
        order.currency = currency || "USD";
        order.items = items;
        order.restaurant_name = restaurant_name;
        order.restaurant_address = restaurant_address;
        order.restaurant_hours = restaurant_hours;
        order.delivery_address = delivery_address;
        order.delivery_instructions = delivery_instructions;
        order.restaurant_image_url = restaurant_image_url;
        // order.is_uber_one_eligible = is_uber_one_eligible;  // COMMENTED OUT
        order.customer_details = customer_details;
        await order.save();
      } else {
        // Create new order
        order = await Order.create({
          order_id: generateOrderId(),
          user_id: req.user.id,
          cart_url: url,
          status: "PENDING",
          subtotal: subtotalCents,
          fees: 0,  // Set to 0 instead of commented out (model requires this field)
          taxes: 0,  // Set to 0 instead of commented out (model requires this field)
          // delivery_fee: deliveryFeeCents,  // COMMENTED OUT
          // service_fee: serviceFeeCents,  // COMMENTED OUT
          // tip: tipCents,  // COMMENTED OUT
          // small_order_fee: 0,  // COMMENTED OUT
          // adjustments_fee: 0,  // COMMENTED OUT
          // pickup_fee: 0,  // COMMENTED OUT
          // other_fees: 0,  // COMMENTED OUT
          // has_uber_one,  // COMMENTED OUT
          // uber_one_benefit: uberOneBenefitCents,  // COMMENTED OUT
          total: totalCents,  // Total = Subtotal (no fees)
          currency: currency || "USD",
          items,
          restaurant_name,
          restaurant_address,
          restaurant_hours,
          delivery_address,
          delivery_instructions,
          restaurant_image_url,
          // is_uber_one_eligible,  // COMMENTED OUT
          customer_details
        });
      }

      // Add fees data to response in a separate object
      const responseData = {
        ...orderDetails,
        fees_data: feesData || null
      };
      
      // Return our real response format with fees data
      return res.status(200).json(responseData);
    } catch (err) {
      console.error("❌ Uber Eats order processing failed:", err.message);
      throw err;
    }
    }
  );

export const refreshSid = catchAsyncErrors(
  async (req, res, next) => {
    try {
  
      
      // Simple response without auto-refresh for now
      const currentSid = getSid();
      res.status(200).json({
        success: true,
        message: "SID refresh endpoint working",
        sid: currentSid || "No SID found",
        sid_preview: currentSid ? currentSid.substring(0, 10) + "..." : "No SID found",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("❌ SID refresh failed:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to refresh SID",
        error: error.message
      });
    }
  }
);


