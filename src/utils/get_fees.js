/**
 * Get fees from Uber Eats checkout API
 * Extracts subtotal, delivery fee, taxes, and other fees from getCheckoutPresentationV1 API
 */
// const fs = require('fs');
import  { randomUUID } from 'crypto';
import Cookie from '../models/cookieModel.js';

/**
 * Extract all fees from the API response
 * 
 * @param {Object} api_response - The full API response JSON
 * @returns {Object} Dictionary with extracted fees
 */
function extract_fees(api_response) {
    const result = {
        'subtotal': null,
        'delivery_fee': null,
        'taxes_and_fees': null,
        'total': null,
        'fee_breakdown': [],
        'detailed_fees': {},
        'items': [],
        'raw_response': api_response
    };
    
    const checkout_payloads = api_response?.data?.checkoutPayloads || {};
    
    if (checkout_payloads.subtotal && checkout_payloads.subtotal) {
        const subtotal_data = checkout_payloads.subtotal.subtotal || {};
        if (subtotal_data.value?.formattedValue) {
            result.subtotal = subtotal_data.value.formattedValue;
        } else if (subtotal_data.value?.amountE5 !== undefined) {
            const amount_e5 = subtotal_data.value.amountE5;
            result.subtotal = `$${(amount_e5 / 100000).toFixed(2)}`;
        }
    }
    
    if (checkout_payloads.total && checkout_payloads.total) {
        const total_data = checkout_payloads.total.total || {};
        if (total_data.value?.formattedValue) {
            result.total = total_data.value.formattedValue;
        } else if (total_data.value?.amountE5 !== undefined) {
            const amount_e5 = total_data.value.amountE5;
            result.total = `$${(amount_e5 / 100000).toFixed(2)}`;
        }
    }
    
    if (checkout_payloads.fareBreakdown && checkout_payloads.fareBreakdown) {
        const fare_breakdown = checkout_payloads.fareBreakdown;
        const charges = fare_breakdown.charges || [];
        
        for (const charge of charges) {
            const title = charge?.title?.text || 'Unknown';
            const value = charge?.value?.text || 'N/A';
            
            const fee_info = {
                'title': title,
                'amount': value,
                'amountE5': null
            };
            
            const metadata = charge?.fareBreakdownChargeMetadata || {};
            const analytics = metadata?.analyticsInfo || [];
            if (analytics.length > 0) {
                const currency_amount = analytics[0]?.currencyAmount || {};
                const amount_e5 = currency_amount?.amountE5;
                if (amount_e5 && typeof amount_e5 === 'object' && !Array.isArray(amount_e5)) {
                    fee_info.amountE5 = amount_e5.low || 0;
                } else if (typeof amount_e5 === 'number') {
                    fee_info.amountE5 = amount_e5;
                }
            }
            
            result.fee_breakdown.push(fee_info);
            
            if (title.includes('Subtotal')) {
                result.subtotal = value;
            } else if (title.includes('Delivery Fee')) {
                result.delivery_fee = value;
            } else if (title.includes('Taxes & Other Fees') || title.includes('Taxes')) {
                result.taxes_and_fees = value;
                
                const action = charge?.action;
                if (action && action.type === 'infoBottomSheet') {
                    const paragraphs = action.infoBottomSheet?.paragraphs || [];
                    for (const para of paragraphs) {
                        const fee_name = (para?.title || '').trim();
                        const fee_amount = para?.endTitle || '';
                        if (fee_name && fee_amount) {
                            result.detailed_fees[fee_name] = fee_amount;
                        }
                    }
                }
            } else if (title.includes('Total')) {
                result.total = value;
            }
        }
    }
    
    if (checkout_payloads.cartItems && checkout_payloads.cartItems) {
        const cart_items = checkout_payloads.cartItems.cartItems || [];
        for (const item of cart_items) {
            const title_elements = item?.title?.richTextElements || [];
            let item_name = 'Unknown';
            if (title_elements.length > 0) {
                item_name = title_elements[0]?.text?.text?.text || 'Unknown';
            }
            
            const price_elements = item?.originalPrice?.richTextElements || [];
            let item_price = 'N/A';
            if (price_elements.length > 0) {
                item_price = price_elements[0]?.text?.text?.text || 'N/A';
            }
            
            const quantity_data = item?.quantity?.value?.coefficient;
            const quantity = (quantity_data && typeof quantity_data === 'object' && !Array.isArray(quantity_data)) 
                ? (quantity_data.low || 1) 
                : 1;
            
            result.items.push({
                'name': item_name,
                'price': item_price,
                'quantity': quantity
            });
        }
    }
    
    return result;
}


/**
 * Print a formatted summary of all fees
 * @param {Object} fees_data - The fees data object
 */
function print_fees_summary(fees_data) {
    console.log("=".repeat(70));
    console.log("UBER EATS ORDER FEES BREAKDOWN");
    console.log("=".repeat(70));
    
    if (fees_data.error) {
        console.log(`\nError: ${fees_data.error}`);
        return;
    }
    
    if (fees_data.items && fees_data.items.length > 0) {
        console.log(`\nITEMS (${fees_data.items.length}):`);
        console.log("-".repeat(70));
        fees_data.items.forEach((item, i) => {
            console.log(`${i + 1}. ${item.name}`);
            console.log(`   Quantity: ${item.quantity}`);
            console.log(`   Price: ${item.price}`);
            console.log();
        });
    }
    
    console.log("\nFEE BREAKDOWN:");
    console.log("-".repeat(70));
    
    const fee_breakdown = fees_data.fee_breakdown || [];
    for (const fee of fee_breakdown) {
        const title = fee.title || '';
        const amount = fee.amount || '';
        console.log(`${title.padEnd(30)}${amount.padStart(15)}`);
    }
    
    if (fees_data.detailed_fees && Object.keys(fees_data.detailed_fees).length > 0) {
        console.log("\nDETAILED FEE BREAKDOWN:");
        console.log("-".repeat(70));
        for (const [fee_name, fee_amount] of Object.entries(fees_data.detailed_fees)) {
            console.log(`${fee_name.padEnd(30)}${fee_amount.padStart(15)}`);
        }
    }
    
    console.log("\n" + "=".repeat(70));
    
    console.log("\nSUMMARY:");
    console.log("-".repeat(70));
    if (fees_data.subtotal) {
        console.log(`Subtotal:        ${fees_data.subtotal.padStart(15)}`);
    }
    if (fees_data.delivery_fee) {
        console.log(`Delivery Fee:     ${fees_data.delivery_fee.padStart(15)}`);
    }
    if (fees_data.taxes_and_fees) {
        console.log(`Taxes & Fees:    ${fees_data.taxes_and_fees.padStart(15)}`);
    }
    if (fees_data.total) {
        console.log(`${'Total:'.padEnd(30)}${fees_data.total.padStart(15)}`);
    }
    console.log("=".repeat(70));
}
/**
 * Get active cookies from database
 * @returns {Promise<Array>} Array of active cookie objects
 */
async function getActiveCookiesFromDB() {
    try {
        const activeCookies = await Cookie.find({ 
            isActive: true, 
            isValid: true 
        }).lean();
        
        console.log(`✅ Found ${activeCookies.length} active cookie(s) in database`);
        return activeCookies;
    } catch (error) {
        console.error(`[ERROR] Failed to get active cookies from database: ${error.message}`);
        return [];
    }
}

/**
 * Get random cookie from active cookies array
 * @param {Array} activeCookies - Array of cookie objects
 * @returns {string|null} Cookie value or null
 */
function getRandomCookie(activeCookies) {
    if (!activeCookies || activeCookies.length === 0) {
        return null;
    }
    
    // Get random index
    const randomIndex = Math.floor(Math.random() * activeCookies.length);
    const selectedCookie = activeCookies[randomIndex];
    
    // Extract cookie value
    if (selectedCookie.cookie_value) {
        return selectedCookie.cookie_value;
    } else if (selectedCookie.getCookieValue) {
        return selectedCookie.getCookieValue();
    }
    
    return null;
}

/**
 * Update cookie usage statistics
 * @param {string} cookieId - Cookie document ID
 */
async function updateCookieUsage(cookieId) {
    try {
        await Cookie.findByIdAndUpdate(cookieId, {
            $inc: { usageCount: 1 },
            $set: { lastUsed: new Date() }
        });
    } catch (error) {
        console.error(`[ERROR] Failed to update cookie usage: ${error.message}`);
    }
}

/**
 * Validate if fees data is accurate and complete
 * @param {Object} fees_data - The fees data object
 * @returns {boolean} True if data is valid, false otherwise
 */
function isFeesDataValid(fees_data) {
    // Check for errors
    if (fees_data.error) {
        console.log(`❌ Fees data has error: ${fees_data.error}`);
        return false;
    }
    
    // Check if critical fields are present
    if (!fees_data.total || fees_data.total === null) {
        console.log(`❌ Fees data missing total`);
        return false;
    }
    
    // Check if we have at least subtotal or total
    if (!fees_data.subtotal && !fees_data.total) {
        console.log(`❌ Fees data missing both subtotal and total`);
        return false;
    }
    
    // Check if fee_breakdown has data
    if (!fees_data.fee_breakdown || fees_data.fee_breakdown.length === 0) {
        console.log(`❌ Fees data missing fee breakdown`);
        return false;
    }
    
    // Check if items array exists (even if empty, it should exist)
    if (!Array.isArray(fees_data.items)) {
        console.log(`❌ Fees data missing items array`);
        return false;
    }
    
    console.log(`✅ Fees data is valid`);
    return true;
}

/**
 * Get all fees from Uber Eats checkout API with a specific cookie
 * 
 * @param {string} draft_order_uuid - The draft order UUID (group order ID)
 * @param {string} cookieValue - The cookie value to use
 * @param {Object} cookieObj - The cookie object (for usage tracking)
 * @returns {Promise<Object>} Dictionary containing all fees and order details
 */
async function get_checkout_fees_with_cookie(draft_order_uuid, cookieValue, cookieObj = null) {
    if (!cookieValue) {
        return { 
            'error': 'Cookie value is required',
            'subtotal': null,
            'delivery_fee': null,
            'taxes_and_fees': null,
            'total': null,
            'fee_breakdown': [],
            'detailed_fees': {},
            'items': []
        };
    }
    
    const api_url = "https://www.ubereats.com/_p/api/getCheckoutPresentationV1";
    
    const payload = {
        "payloadTypes": [
            "canonicalProductStorePickerPayload",
            "total",
            "subtotal",
            "paymentProfilesEligibility",
            "cartItems",
            "basketSize",
            "promotion",
            "restrictedItems",
            "venueSectionPicker",
            "locationInfo",
            "upsellCatalogSections",
            "subTotalFareBreakdown",
            "storeSwitcherActionableBannerPayload",
            "promoAndMembershipSavingBannerPayload",
            "passBanner",
            "passBannerOnCartPayload",
            "merchantMembership",
            "requestUtensilPayload",
            "fareBreakdown",
            "upsellFeed"
        ],
        "draftOrderUUID": draft_order_uuid,
        "isGroupOrder": true,
        "clientFeaturesData": {
            "paymentSelectionContext": {
                "value": '{"deviceContext":{"thirdPartyApplications":["google_pay","venmo"]}}'
            }
        }
    };
    
    // Extract sid cookie value
    let sid_value;
    if (cookieValue.includes('sid=')) {
        sid_value = cookieValue.split('sid=')[1].split(';')[0].trim();
    } else {
        sid_value = cookieValue;
    }
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/json',
        'Origin': 'https://www.ubereats.com',
        'Referer': 'https://www.ubereats.com/store/dominos-unit-b-12916-us-highway-24-285/C6SdQSiFVQaLdTzKiMEBrQ?diningMode=DELIVERY&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMlVuaXRlZCUyMEtpbmdkb20lMkMlMjJyZWZlcmVuY2UlMjIlM0ElMjJDaElKcVpISFFoRTdXZ0lSZWlXSU1rT2ctTVElMjIlMkMlMjJyZWZlcmVuY2VUeXBlJTIyJTNBJTIyZ29vZ2xlX3BsYWNlcyUyMiUyQyUyMmxhdGl0dWRlJTIyJTNBNTUuMzc4MDUxJTJDJTIybG9uZ2l0dWRlJTIyJTNBLTMuNDM1OTczJTdE',
        'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-ch-prefers-color-scheme': 'light',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'priority': 'u=1, i',
        'x-csrf-token': 'x',
        'x-uber-client-gitref': '19e2eaa407e45ed5444d6e906c68144f7bc8d2e9',
        'Cookie': `sid=${sid_value}`,
        'x-uber-request-id': randomUUID()
    };
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(api_url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 200) {
            const data = await response.json();
            
            if (data.status === 'success') {
                // Update cookie usage statistics
                if (cookieObj && (cookieObj._id || cookieObj.id)) {
                    const cookieId = cookieObj._id || cookieObj.id;
                    await updateCookieUsage(cookieId);
                }
                
                return extract_fees(data);
            } else {
                return { 'error': 'API returned failure status', 'response': data };
            }
        } else {
            const responseText = await response.text();
            return { 'error': `HTTP ${response.status}`, 'response': responseText };
        }
            
    } catch (error) {
        return { 'error': error.message };
    }
}

/**
 * Get all fees from Uber Eats checkout API
 * 
 * @param {string} draft_order_uuid - The draft order UUID (group order ID)
 * @param {Array} activeCookies - Array of active cookie objects from database
 * @returns {Promise<Object>} Dictionary containing all fees and order details
 */
async function get_checkout_fees(draft_order_uuid, activeCookies) {
    if (!activeCookies || activeCookies.length === 0) {
        return { 
            'error': 'No active cookies available',
            'subtotal': null,
            'delivery_fee': null,
            'taxes_and_fees': null,
            'total': null,
            'fee_breakdown': [],
            'detailed_fees': {},
            'items': []
        };
    }
    
    // Get random cookie from active cookies array (for backward compatibility)
    const cookieValue = getRandomCookie(activeCookies);
    
    if (!cookieValue) {
        return { 
            'error': 'Failed to get cookie value from active cookies',
            'subtotal': null,
            'delivery_fee': null,
            'taxes_and_fees': null,
            'total': null,
            'fee_breakdown': [],
            'detailed_fees': {},
            'items': []
        };
    }
    
    // Find the cookie object to update usage stats later
    const selectedCookieObj = activeCookies.find(c => {
        const cookieVal = c.cookie_value || c.getCookieValue?.();
        return cookieVal === cookieValue;
    });
    
    // Log which cookie was selected
    if (selectedCookieObj) {
        const cookieName = selectedCookieObj.name || 'Unknown';
        console.log(`🎲 Randomly selected cookie: ${cookieName} (from ${activeCookies.length} active cookie(s))`);
    }
    
    console.log("Calling checkout API...");
    console.log(`Draft Order UUID: ${draft_order_uuid}`);
    
    return await get_checkout_fees_with_cookie(draft_order_uuid, cookieValue, selectedCookieObj);
}

/**
 * Main function to get fees - can be imported and used in other files
 * 
 * @param {string} draft_order_uuid - The draft order UUID (group order ID)
 * @param {string} cookie - Optional: Authentication cookie (sid). If not provided, will fetch from database
 * @param {Object} options - Optional configuration
 * @param {boolean} options.printSummary - Whether to print the fees summary (default: false)
 * @param {boolean} options.saveToFile - Whether to save data to JSON file (default: false)
 * @param {string} options.outputFile - Output file path (default: 'fees_data.json')
 * @param {boolean} options.useDatabaseCookie - Whether to use active cookies from database (default: true)
 * @returns {Promise<Object>} Dictionary containing all fees and order details
 */
async function get_fees(draft_order_uuid, cookie = null, options = {}) {
    const {
        printSummary = false,
        saveToFile = false,
        outputFile = 'fees_data.json',
        useDatabaseCookie = true
    } = options;

    if (!draft_order_uuid) {
        throw new Error('Draft order UUID is required');
    }

    try {
        let activeCookies = [];
        
        // If cookie is provided, use it directly
        if (cookie && !useDatabaseCookie) {
            // Convert single cookie to array format for compatibility
            activeCookies = [{ cookie_value: cookie }];
        } else {
            // Fetch active cookies from database
            console.log("📋 Fetching active cookies from database...");
            activeCookies = await getActiveCookiesFromDB();
            console.log("activeCookies : ",activeCookies);
            
            if (activeCookies.length === 0) {
                throw new Error('No active cookies found in database. Please activate at least one cookie.');
            }
        }
        
        // Retry logic: Try cookies until we get valid data
        let fees_data = null;
        let triedCookies = [];
        const maxRetries = activeCookies.length; // Try all cookies if needed
        
        // Shuffle cookies array for random selection
        const shuffledCookies = [...activeCookies].sort(() => Math.random() - 0.5);
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const cookieObj = shuffledCookies[attempt];
            const cookieValue = cookieObj.cookie_value || cookieObj.getCookieValue?.();
            
            if (!cookieValue) {
                console.log(`⚠️ Cookie at index ${attempt} has no value, skipping...`);
                continue;
            }
            
            // Skip if we've already tried this cookie
            if (triedCookies.includes(cookieValue)) {
                continue;
            }
            
            triedCookies.push(cookieValue);
            const cookieName = cookieObj.name || `Cookie ${attempt + 1}`;
            
            console.log(`\n🔄 Attempt ${attempt + 1}/${maxRetries}: Trying cookie "${cookieName}"...`);
            
            try {
                fees_data = await get_checkout_fees_with_cookie(draft_order_uuid, cookieValue, cookieObj);
                
                // Check if the data is valid
                if (isFeesDataValid(fees_data)) {
                    console.log(`✅ Successfully got valid fees data using cookie "${cookieName}"`);
                    break; // Exit loop if we got valid data
                } else {
                    console.log(`⚠️ Cookie "${cookieName}" returned invalid data, trying next cookie...`);
                    fees_data = null; // Reset for next attempt
                }
            } catch (error) {
                console.log(`❌ Error with cookie "${cookieName}": ${error.message}`);
                fees_data = null; // Reset for next attempt
            }
        }
        
        // If all cookies failed, return the last error or a generic error
        if (!fees_data || !isFeesDataValid(fees_data)) {
            console.log(`\n❌ All ${triedCookies.length} cookie(s) failed to return valid data`);
            if (!fees_data) {
                fees_data = {
                    'error': `All ${triedCookies.length} active cookie(s) failed to return valid data`,
                    'subtotal': null,
                    'delivery_fee': null,
                    'taxes_and_fees': null,
                    'total': null,
                    'fee_breakdown': [],
                    'detailed_fees': {},
                    'items': []
                };
            }
        }
        
        console.log("fees_data : ", fees_data);
        
        if (printSummary) {
            print_fees_summary(fees_data);
        }
        
        // if (saveToFile) {
        //     fs.writeFileSync(outputFile, JSON.stringify(fees_data, null, 2), 'utf-8');
        //     console.log(`\n[SUCCESS] Data saved to '${outputFile}'`);
        // }
        
        return fees_data;
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        throw error;
    }
}

// Main execution - runs when file is executed directly (ES module way)
let executeCode = false;
if (executeCode) {
    // Check if this file is being run directly (ES module way)
    const isMainModule = import.meta.url === `file://${process.argv[1]}`;
    if (isMainModule) {
        const DRAFT_ORDER_UUID = "21eccc97-5e53-413c-9b82-37ccf87bcc8e";
        const COOKIE = "QA.CAESEPnAIDDmcUBFkacK24qAA6YYu7_QyQYiATEqJDE3NWNmYjBmLTA0NTUtNGFjNC05NGMyLTYzNTIyMzIxMDM5MDI8J4gJLJ25BbFNTXXGkhbl3Ay7EEG5oroMoiGamgYmLVYaLDiCeGemcqKNeYSnFbIfdO5F6ugfduE9C00LOgExQg0udWJlcmVhdHMuY29t.FdEtuKcmj5dvSsfdY-BQ9-xRNfHqjLwh83jULwJDydc";
        
        console.log("Uber Eats Checkout Fees Extractor");
        console.log("=".repeat(70) + "\n");
        
        (async () => {
            try {
                const fees_data = await get_fees(DRAFT_ORDER_UUID, COOKIE, {
                    printSummary: true,
                    saveToFile: true
                });
            } catch (error) {
                console.error(`[ERROR] ${error.message}`);
            }
        })();
    }
}

// ES module exports
export {
    get_fees,
    get_checkout_fees,
    get_checkout_fees_with_cookie,
    extract_fees,
    print_fees_summary,
    isFeesDataValid
};


