import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
    customizations: { type: [String], default: [] },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    order_id: { type: String, required: true, unique: true },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cart_url: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "PLACED", "CANCELLED", "REFUNDED", "DELIVERED"], // DELIVERED kept for backward compatibility
      default: "PENDING",
    },

    subtotal: { type: Number, required: true },
    fees: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    delivery_fee: { type: Number, default: 0 },
    service_fee: { type: Number, default: 0 },
    tip: { type: Number, default: 0 },
    small_order_fee: { type: Number, default: 0 },
    adjustments_fee: { type: Number, default: 0 },
    pickup_fee: { type: Number, default: 0 },
    other_fees: { type: Number, default: 0 },
    has_uber_one: { type: Boolean, default: false },
    uber_one_benefit: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: "USD" },

    restaurant_name: { type: String },
    restaurant_address: { type: String },
    restaurant_hours: { type: String },
    restaurant_image_url: { type: String },
    is_uber_one_eligible: { type: Boolean, default: false },

    delivery_address: { type: String },
    delivery_instructions: { type: String },

    items: { type: [itemSchema], default: [] },

    customer_details: {
      customer_name: { type: String },
      customer_email: { type: String },
      customer_phone: { type: String },
      customer_id: { type: String },
      customer_uuid: { type: String },
      customer_profile_image: { type: String },
      customer_coordinates: { type: mongoose.Schema.Types.Mixed },
      customer_preferences: { type: mongoose.Schema.Types.Mixed },
      customer_membership_status: { type: String },
      customer_order_history_count: { type: Number },
      customer_rating: { type: Number },
      customer_first_name: { type: String },
      customer_last_name: { type: String },
      customer_display_name: { type: String },
      customer_username: { type: String },
      customer_joined_date: { type: String },
      customer_last_active: { type: String },
      customer_total_orders: { type: Number },
      customer_total_spent: { type: Number },
      customer_favorite_restaurants: { type: [mongoose.Schema.Types.Mixed], default: [] },
      customer_dietary_preferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
      customer_payment_methods: { type: [mongoose.Schema.Types.Mixed], default: [] },
      customer_delivery_addresses: { type: [mongoose.Schema.Types.Mixed], default: [] },
      customer_order_preferences: { type: mongoose.Schema.Types.Mixed },
      customer_delivery_address: { type: String },
      customer_phone_number: { type: String },
      customer_email_address: { type: String },
      customer_full_name: { type: String },
      customer_location: { type: mongoose.Schema.Types.Mixed },
      customer_profile: { type: mongoose.Schema.Types.Mixed },
      customer_info: { type: mongoose.Schema.Types.Mixed },
      customer_data: { type: mongoose.Schema.Types.Mixed },
      user_info: { type: mongoose.Schema.Types.Mixed },
      user_profile: { type: mongoose.Schema.Types.Mixed },
      user_data: { type: mongoose.Schema.Types.Mixed },
      eater_info: { type: mongoose.Schema.Types.Mixed },
      member_info: { type: mongoose.Schema.Types.Mixed },
      group_order_customer: { type: mongoose.Schema.Types.Mixed },
      order_customer: { type: mongoose.Schema.Types.Mixed },
      delivery_customer: { type: mongoose.Schema.Types.Mixed },
      delivery_instructions: { type: String },
      addParticipantsIntended: { type: Boolean },
      storeUuid: { type: String },
      state: { type: String },
      hasSpendingLimit: { type: Boolean },
      spendingLimitType: { type: String },
      spendingLimitAmount: { type: mongoose.Schema.Types.Mixed },
      shoppingCart: { type: mongoose.Schema.Types.Mixed },
      businessDetails: { type: mongoose.Schema.Types.Mixed },
      targetDeliveryTimeRange: { type: mongoose.Schema.Types.Mixed },
      deliveryType: { type: String },
      orderCreationContext: { type: mongoose.Schema.Types.Mixed },
      eaterUuid: { type: String },
      isUserCreator: { type: Boolean },
      originApplicationId: { type: String },
      expiresAt: { type: String },
      createdAt: { type: String },
      externalId: { type: String },
      orderUuid: { type: String },
      uuid: { type: String },
      paymentProfileUUID: { type: String },
      promotionOptions: { type: mongoose.Schema.Types.Mixed },
      upfrontTipOption: { type: mongoose.Schema.Types.Mixed },
      useCredits: { type: Boolean },
      diningMode: { type: String },
      extraPaymentProfiles: { type: mongoose.Schema.Types.Mixed },
      interactionType: { type: String },
      billSplitOption: { type: mongoose.Schema.Types.Mixed },
      displayName: { type: String },
      cartLockOptions: { type: mongoose.Schema.Types.Mixed },
      repeatOrderTemplateUUID: { type: String },
      handledHighCapacityOrderMetadata: { type: mongoose.Schema.Types.Mixed },
      repeatSchedule: { type: mongoose.Schema.Types.Mixed },
      orderMetadata: { type: mongoose.Schema.Types.Mixed }
    },

    participants: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ user_id: 1, cart_url: 1 }, { unique: true });

orderSchema.pre('save', function(next) {
  if (this.status === 'DELIVERED') {
    this.status = 'PLACED';
  }
  next();
});

const Order = mongoose.model("Order", orderSchema);

export default Order;
