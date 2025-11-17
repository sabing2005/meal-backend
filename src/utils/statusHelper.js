/**
 * Status helper utilities for handling order statuses
 * This ensures backward compatibility with DELIVERED status
 */

/**
 * Normalizes order status - converts DELIVERED to PLACED for consistency
 * @param {string} status - The order status
 * @returns {string} - Normalized status
 */
export const normalizeOrderStatus = (status) => {
  if (status === "DELIVERED") {
    return "PLACED";
  }
  return status;
};

/**
 * Checks if an order status is considered "active" (PLACED or DELIVERED)
 * @param {string} status - The order status
 * @returns {boolean} - True if status is active
 */
export const isActiveOrderStatus = (status) => {
  return ["PLACED", "DELIVERED"].includes(status);
};

/**
 * Checks if an order status is considered "completed" (PLACED or DELIVERED)
 * @param {string} status - The order status
 * @returns {boolean} - True if status is completed
 */
export const isCompletedOrderStatus = (status) => {
  return ["PLACED", "DELIVERED"].includes(status);
};

/**
 * Gets the display status for UI - converts DELIVERED to PLACED
 * @param {string} status - The order status
 * @returns {string} - Display status
 */
export const getDisplayStatus = (status) => {
  return normalizeOrderStatus(status);
};

/**
 * Validates if a status is allowed (includes DELIVERED for backward compatibility)
 * @param {string} status - The order status
 * @returns {boolean} - True if status is valid
 */
export const isValidOrderStatus = (status) => {
  const validStatuses = ["PENDING", "PLACED", "CANCELLED", "REFUNDED", "DELIVERED"];
  return validStatuses.includes(status);
};
