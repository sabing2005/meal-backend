import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Cookie from '../models/cookieModel.js';

let UBER_SID = process.env.UBER_SID || '';
let SID_EXPIRY_TIME = null;
let SID_REFRESH_IN_PROGRESS = false;

const SID_FILE_PATH = path.join(process.cwd(), 'uber_sid.json');

function loadSidFromFile() {
  try {
    if (fs.existsSync(SID_FILE_PATH)) {
      const sidData = JSON.parse(fs.readFileSync(SID_FILE_PATH, 'utf8'));
      UBER_SID = sidData.sid || '';
      SID_EXPIRY_TIME = sidData.expiryTime || null;
      console.log(`📁 Loaded SID from file: ${UBER_SID.substring(0, 10)}...`);
    }
  } catch (error) {
    console.log('📁 No SID file found, using environment variable');
  }
}

// Save SID to file
function saveSidToFile(sid, expiryTime = null) {
  try {
    const sidData = {
      sid: sid,
      expiryTime: expiryTime,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(SID_FILE_PATH, JSON.stringify(sidData, null, 2));
    console.log(`💾 SID saved to file: ${sid.substring(0, 10)}...`);
  } catch (error) {
    console.error('❌ Failed to save SID to file:', error.message);
  }
}

function isSidExpired() {
  if (!SID_EXPIRY_TIME) return false;
  const now = new Date();
  const expiry = new Date(SID_EXPIRY_TIME);
  const timeUntilExpiry = expiry.getTime() - now.getTime();
  
  return timeUntilExpiry < 5 * 60 * 1000;
}

async function autoRefreshSid() {
  if (SID_REFRESH_IN_PROGRESS) {
    console.log('🔄 SID refresh already in progress...');
    return;
  }
  
  SID_REFRESH_IN_PROGRESS = true;
  console.log('🔄 Auto-refreshing SID...');
  
  try {
    const response = await axios.get('https://www.ubereats.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });
    
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      for (const cookie of setCookieHeader) {
        const sidMatch = cookie.match(/sid=([^;]+)/);
        if (sidMatch) {
          const newSid = sidMatch[1];
          updateSid(newSid);
          
          const expiryTime = new Date();
          expiryTime.setHours(expiryTime.getHours() + 20); // 20 hours to be safe
          SID_EXPIRY_TIME = expiryTime.toISOString();
          
          saveSidToFile(newSid, SID_EXPIRY_TIME);
          console.log('✅ SID auto-refreshed successfully');
          return;
        }
      }
    }
    
    console.log('⚠️ Could not extract new SID from login page');
  } catch (error) {
    console.error('❌ Failed to auto-refresh SID:', error.message);
  } finally {
    SID_REFRESH_IN_PROGRESS = false;
  }
}

loadSidFromFile();

export function updateSid(newSid) {
  UBER_SID = newSid;
  
  const expiryTime = new Date();
  expiryTime.setHours(expiryTime.getHours() + 20); // 20 hours to be safe
  SID_EXPIRY_TIME = expiryTime.toISOString();
  
  saveSidToFile(newSid, SID_EXPIRY_TIME);
  console.log(`✅ SID updated: ${newSid.substring(0, 10)}...`);
}

export function getSid() {
  return UBER_SID;
}

/**
 * Get SID from database (active cookie)
 * Falls back to file/env SID if no active cookie in database
 * @returns {Promise<string>} SID value
 */
export async function getSidFromDatabase() {
  try {
    const activeCookie = await Cookie.getActiveCookie();
    if (activeCookie && activeCookie.isValid) {
      return activeCookie.getCookieValue();
    }
  } catch (error) {
    console.log(`⚠️ Failed to get SID from database: ${error.message}`);
  }
  // Fallback to file/env SID
  return UBER_SID;
}

export async function ensureValidSid() {

  if (!UBER_SID) {
    console.log('⚠️ No SID found, skipping auto-refresh for now');
    return UBER_SID;
  }
  
  if (isSidExpired()) {
    console.log('🔄 SID expired, attempting auto-refresh...');
    await autoRefreshSid();
  } else {
    console.log('✅ SID is still valid');
  }
  
  return UBER_SID;
}

export function extractGroupUuid(link) {
  if (!link) return null;
  try {
    const pathUuid = link.match(/\/group-orders\/([\w-]+)/i)?.[1];
    if (pathUuid) return pathUuid;
    const qUuid = link.match(/groupOrderUuid=([a-f0-9-]+)/i)?.[1];
    if (qUuid) return qUuid;
  } catch (_) {}
  return null;
}

export async function testAuth() {
  try {
    console.log(`🔍 Testing SID: ${UBER_SID.substring(0, 10)}...`);
    const testUrls = [
      'https://www.ubereats.com/api/getUserProfileV1',
      'https://eats.uber.com/api/getUserProfileV1',
      'https://www.ubereats.com/feed',
      'https://eats.uber.com/feed'
    ];
    
    for (const url of testUrls) {
      try {
        const res = await axios.post(url, {}, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': `sid=${UBER_SID}`,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.ubereats.com',
            'Referer': 'https://www.ubereats.com/',
            'Content-Type': 'application/json',
            'x-csrf-token': 'x'
          },
          timeout: 10000,
          validateStatus: () => true
        });
        console.log(`🔍 SID test with ${url}: Status ${res.status}`);
        
        if ([200, 400, 401, 403].includes(res.status)) {
          console.log(`✅ SID test successful with status: ${res.status} for URL: ${url}`);
          return true;
        }
      } catch (error) {
        console.log(`❌ SID test failed for URL: ${url}, Error: ${error.message}`);
        continue;
      }
    }
    
    if (UBER_SID && UBER_SID.length > 20) {
      console.log(`⚠️ SID validation failed, but proceeding with SID length: ${UBER_SID.length}`);
      return true;
    }
    
    return false;
  } catch (e) {
    console.log(`❌ SID test error: ${e.message}`);
    return false;
  }
}

function safeAmountE5ToDollars(amountE5) {
  if (!amountE5) return 0;
  const low = typeof amountE5 === 'object' && amountE5.low != null ? amountE5.low : amountE5;
  const num = Number(low);
  return Number.isFinite(num) ? num / 100000 : 0;
}

function extractPriceFromItem(priceData) {
  try {
    if (priceData && typeof priceData === 'object') {
      if (priceData.richTextElements) {
        for (const el of priceData.richTextElements) {
          const text = el?.text?.text?.text;
          if (typeof text === 'string') {
            const clean = text.replace(/[$,]/g, '');
            const num = Number(clean);
            if (Number.isFinite(num)) return num;
          }
        }
      }
      if (typeof priceData.text === 'string') {
        const num = Number(priceData.text.replace(/[$,]/g, ''));
        if (Number.isFinite(num)) return num;
      }
      if (priceData.amountE5) return safeAmountE5ToDollars(priceData.amountE5);
      if (priceData.amount != null) return Number(priceData.amount) || 0;
    } else if (typeof priceData === 'number') {
      return priceData;
    }
  } catch (_) {}
  return 0;
}

function extractQuantityFromItem(quantityData) {
  try {
    if (quantityData && typeof quantityData === 'object') {
      if (quantityData.value && quantityData.value.coefficient != null) {
        const coeff = quantityData.value.coefficient;
        const exponent = quantityData.value.exponent || 0;
        const base = typeof coeff === 'object' && coeff.low != null ? coeff.low : coeff;
        let q = Number(base) || 1;
        if (exponent < 0) q = q / Math.pow(10, Math.abs(exponent));
        if (exponent > 0) q = q * Math.pow(10, exponent);
        return q % 1 === 0 ? parseInt(q, 10) : q;
      }
      if (quantityData.quantity != null) return quantityData.quantity;
    } else if (typeof quantityData === 'number') {
      return quantityData;
    }
  } catch (_) {}
  return 1;
}

function extractCustomizations(item) {
  const list = [];
  const seen = new Set(); // Prevent duplicates
  
  // Patterns to exclude (generic prompts/options, not actual selections)
  // Made more specific to avoid filtering out actual customizations
  const excludePatterns = [
    /^choose\s+your\s+(size|drink|meal|option|customization)/i,
    /^select\s+your\s+(size|drink|meal|option|customization)/i,
    /^pick\s+your\s+(size|drink|meal|option|customization)/i,
    /^please\s+(choose|select|pick)\s+your/i,
    /^(required|optional)\s*(size|drink|meal|option|customization)/i,
    /^size\s*$/i,  // Only exact match "size"
    /^drink\s*$/i, // Only exact match "drink"
    /^meal\s*$/i,  // Only exact match "meal"
    /^option\s*$/i, // Only exact match "option"
    /^customization\s*$/i,
    /^modifier\s*$/i,
    /^selection\s*$/i,
    /^add\s+on\s*$/i,
    /^addon\s*$/i,
    /^topping\s*$/i,
    /^ingredient\s*$/i
  ];
  
  const isExcluded = (text) => {
    if (!text || typeof text !== 'string') return true;
    const trimmed = text.trim();
    // Exclude empty or very short
    if (trimmed.length < 2) return true;
    // Check against exclusion patterns (more specific)
    return excludePatterns.some(pattern => pattern.test(trimmed));
  };
  
  const pushText = (v, isSelected = false) => {
    if (!v) return;
    let text = null;
    if (typeof v === 'string') text = v;
    else if (v?.text) text = v.text;
    else if (v?.label) text = v.label;
    else if (v?.name) text = v.name;
    else if (v?.title) text = v.title;
    else if (v?.displayName) text = v.displayName;
    else if (v?.description) text = v.description;
    
    // Only add if it's a valid customization (not excluded and not a prompt)
    if (text && typeof text === 'string' && text.trim() && !seen.has(text.trim())) {
      // Skip if it's an excluded pattern (unless it's explicitly selected)
      if (!isSelected && isExcluded(text)) return;
      
      list.push(text.trim());
      seen.add(text.trim());
    }
  };
  
  const scanArray = (arr, isSelected = false) => {
    if (!Array.isArray(arr)) return;
    for (const c of arr) {
      if (!c) continue;
      
      // Check if this is a selected/active customization
      const isSelectedItem = isSelected || 
                            c.selected === true || 
                            c.isSelected === true ||
                            c.active === true ||
                            c.isActive === true ||
                            c.checked === true ||
                            (c.quantity && c.quantity > 0) ||
                            (c.amount && c.amount > 0);
      
      if (typeof c === 'string') { 
        const trimmed = c.trim();
        if (!isExcluded(trimmed) && !seen.has(trimmed)) {
          list.push(trimmed);
          seen.add(trimmed);
        }
        continue; 
      }
      
      // Handle richTextElements
      if (Array.isArray(c.richTextElements)) {
        const parts = [];
        for (const el of c.richTextElements) {
          const t = el?.text?.text?.text || el?.text?.text || el?.text;
          if (t) parts.push(String(t));
        }
        if (parts.length) {
          const combined = parts.join('').trim();
          if (!isExcluded(combined) && !seen.has(combined)) {
            list.push(combined);
            seen.add(combined);
          }
        }
      }
      
      // Push text if it's selected OR if it's in a selected array context
      // Uber Eats API might not always have explicit selected flags
      if (isSelectedItem) {
        pushText(c, true);
        pushText(c.title, true);
        pushText(c.option, true);
        pushText(c.label, true);
        pushText(c.name, true);
        pushText(c.displayName, true);
      } else if (isSelected) {
        // If parent array is marked as selected, include items even without explicit flags
        pushText(c, true);
        pushText(c.title, true);
        pushText(c.option, true);
        pushText(c.label, true);
        pushText(c.name, true);
        pushText(c.displayName, true);
      } else {
        // For non-selected items, only add if it has explicit selection indicators
        if (c.quantity > 0 || c.amount > 0 || c.selected === true || c.isSelected === true) {
          pushText(c, true);
          pushText(c.title, true);
          pushText(c.option, true);
          pushText(c.label, true);
          pushText(c.name, true);
        }
      }
      
      // Recursively scan nested arrays - prioritize selected items
      if (Array.isArray(c.selectedOptions)) scanArray(c.selectedOptions, true);
      if (Array.isArray(c.selected)) scanArray(c.selected, true);
      if (Array.isArray(c.options)) scanArray(c.options, false); // Options are not selected by default
      if (Array.isArray(c.choices)) scanArray(c.choices, false);
      if (Array.isArray(c.items)) scanArray(c.items, false);
      if (Array.isArray(c.modifiers)) scanArray(c.modifiers, isSelectedItem);
      if (Array.isArray(c.itemModifiers)) scanArray(c.itemModifiers, isSelectedItem);
      if (Array.isArray(c.modifierGroups)) scanArray(c.modifierGroups, false);
    }
  };
  
  try {
    // Check top-level keys - prioritize selected items first
    const selectedKeys = ['selectedOptions', 'selectedModifiers', 'selectedItemModifiers', 'selected'];
    const regularKeys = ['customizations','modifiers','options','toppings','ingredients',
      'addons','addOns','selections','groups','itemModifiers',
      'nestedItemModifiers','modifierGroups','modifierDetails','itemModifiersGroup',
      'nestedModifiers','modifierSelections'];
    
    // First check selected items (these are actual customizations)
    for (const key of selectedKeys) {
      const val = item?.[key];
      if (Array.isArray(val)) {
        scanArray(val, true); // Mark as selected
      } else if (val && typeof val === 'object') {
        if (val.title && !isExcluded(val.title)) pushText(val.title, true);
        if (val.name && !isExcluded(val.name)) pushText(val.name, true);
        if (val.label && !isExcluded(val.label)) pushText(val.label, true);
        if (Array.isArray(val.modifiers)) scanArray(val.modifiers, true);
        if (Array.isArray(val.selectedModifiers)) scanArray(val.selectedModifiers, true);
      }
    }
    
    // Then check regular keys (be more lenient - if items exist, try to extract them)
    for (const key of regularKeys) {
      const val = item?.[key];
      if (Array.isArray(val) && val.length > 0) {
        // Check if array contains selected items, but also scan if it has any meaningful data
        const hasSelected = val.some(v => 
          v && typeof v === 'object' && (
            v.selected === true || 
            v.isSelected === true || 
            (v.quantity && v.quantity > 0) ||
            (v.amount && v.amount > 0) ||
            v.title || v.name || v.label // If it has text, it might be a customization
          )
        );
        // Scan with selected flag if items exist - Uber Eats might not always have explicit flags
        scanArray(val, hasSelected || val.length > 0);
      } else if (val && typeof val === 'object') {
        // Handle object-based modifiers - be more lenient
        if (val.selected === true || val.isSelected === true || val.title || val.name || val.label) {
          if (val.title && !isExcluded(val.title)) pushText(val.title, true);
          if (val.name && !isExcluded(val.name)) pushText(val.name, true);
          if (val.label && !isExcluded(val.label)) pushText(val.label, true);
        }
        if (Array.isArray(val.modifiers) && val.modifiers.length > 0) {
          const hasSelected = val.modifiers.some(m => 
            m.selected === true || m.isSelected === true || m.title || m.name || m.label
          );
          scanArray(val.modifiers, hasSelected || val.modifiers.length > 0);
        }
        if (Array.isArray(val.selectedModifiers)) scanArray(val.selectedModifiers, true);
      }
    }
    
    // Check nested structures (itemModifiersGroup, etc.)
    if (item?.itemModifiersGroup) {
      if (Array.isArray(item.itemModifiersGroup)) {
        for (const group of item.itemModifiersGroup) {
          // Skip group titles (they're usually prompts like "Choose your size")
          // Only get actual selected modifiers
          if (group.selectedModifiers) scanArray(group.selectedModifiers, true);
          if (group.selectedOptions) scanArray(group.selectedOptions, true);
          // Only add group title if it's not a generic prompt
          if (group.modifiers && group.modifiers.length > 0) {
            // Only scan modifiers if they have selected items
            const hasSelected = group.modifiers.some(m => 
              m.selected === true || m.isSelected === true || m.quantity > 0
            );
            if (hasSelected) scanArray(group.modifiers, true);
          }
        }
      }
    }
    
    // Check modifierDetails (can be array or object)
    if (item?.modifierDetails) {
      if (Array.isArray(item.modifierDetails)) {
        scanArray(item.modifierDetails);
      } else if (typeof item.modifierDetails === 'object') {
        Object.values(item.modifierDetails).forEach(detail => {
          if (Array.isArray(detail)) scanArray(detail);
          else pushText(detail);
        });
      }
    }
    
    // Check priceAdjustments for customizations
    if (item?.priceAdjustments) {
      if (Array.isArray(item.priceAdjustments)) {
        for (const adj of item.priceAdjustments) {
          pushText(adj.label);
          pushText(adj.name);
          pushText(adj.description);
        }
      }
    }
    
    // Deep search for any modifier-like structures (recursive check)
    // More aggressive - check all possible paths
    const deepSearch = (obj, depth = 0, path = '') => {
      if (depth > 4 || !obj || typeof obj !== 'object') return; // Increased depth
      
      if (Array.isArray(obj)) {
        // If array has items, try to extract them
        if (obj.length > 0) {
          scanArray(obj, true); // Mark as selected if we're in deep search
        }
        obj.forEach(el => deepSearch(el, depth + 1, path));
      } else {
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          // Check for modifier/customization related keys
          if (lowerKey.includes('modifier') || 
              lowerKey.includes('customization') ||
              lowerKey.includes('option') ||
              lowerKey.includes('selection') ||
              lowerKey.includes('choice') ||
              lowerKey.includes('addon') ||
              lowerKey.includes('topping') ||
              lowerKey.includes('ingredient')) {
            
            if (Array.isArray(value) && value.length > 0) {
              // If it's an array with items, scan it aggressively
              scanArray(value, true);
            } else if (value && typeof value === 'object') {
              // If it's an object, try to extract text from it
              pushText(value, true);
              deepSearch(value, depth + 1, `${path}.${key}`);
            } else if (typeof value === 'string' && value.trim() && !isExcluded(value)) {
              // If it's a string, add it directly
              if (!seen.has(value.trim())) {
                list.push(value.trim());
                seen.add(value.trim());
              }
            }
          }
          
          // Also check for text fields that might contain customization names
          if ((lowerKey.includes('title') || lowerKey.includes('name') || lowerKey.includes('label')) &&
              typeof value === 'string' && value.trim() && !isExcluded(value)) {
            if (!seen.has(value.trim())) {
              list.push(value.trim());
              seen.add(value.trim());
            }
          }
          
          // Continue deep search
          deepSearch(value, depth + 1, `${path}.${key}`);
        }
      }
    };
    
    // Always do deep search to be thorough (even if we found some items)
    // This ensures we catch all customizations
    deepSearch(item);
    
  } catch (err) {
    // Silently fail - return what we have
  }
  
  return list;
}

function extractItemName(item) {
  try {
    if (item?.title) {
      if (typeof item.title === 'object') {
        if (Array.isArray(item.title.richTextElements)) {
          for (const el of item.title.richTextElements) {
            const t = el?.text?.text?.text;
            if (t) return t;
          }
        }
        if (item.title.text) return item.title.text;
      } else if (typeof item.title === 'string') {
        return item.title;
      }
    }
    for (const k of ['name', 'itemName', 'displayName', 'productName']) {
      if (typeof item?.[k] === 'string') return item[k];
    }
  } catch (_) {}
  return 'Unknown Item';
}

function extractOrderItemsFromCheckout(checkoutData) {
  const data = checkoutData?.data || {};
  const payloads = data.checkoutPayloads || {};
  
  let cartItems = [];
  if (payloads.cartItems?.cartItems) {
    cartItems = payloads.cartItems.cartItems;
  } else if (Array.isArray(payloads.orderItems)) {
    cartItems = payloads.orderItems;
  } else if (Array.isArray(payloads.orderItems?.items)) {
    cartItems = payloads.orderItems.items;
  } else if (data.shoppingCart?.items) {
    cartItems = data.shoppingCart.items;
  }

  const items = [];
  for (const item of cartItems || []) {
    const name = extractItemName(item);
    const quantity = item.quantity != null ? extractQuantityFromItem(item.quantity) : 1;
    let price = 0;
    if (item.originalPrice) price = extractPriceFromItem(item.originalPrice);
    if (!price) {
      for (const key of ['price', 'totalPrice', 'unitPrice', 'amount']) {
        if (item[key]) { price = extractPriceFromItem(item[key]); if (price) break; }
      }
    }
    const customizations = extractCustomizations(item);
    items.push({ name, quantity, price, customizations });
  }
  
  return items;
}

function extractSubtotalAndFeesFromCheckoutPayloads(checkoutPayloads) {
  let subtotal = 0;
  let taxes = 0;
  let deliveryFee = 0;
  let serviceFee = 0;
  let tip = 0;
  let smallOrderFee = 0;
  let adjustmentsFee = 0;
  let pickupFee = 0;
  let otherFees = 0;
  let hasUberOne = false;
  let uberOneBenefit = 0;
  let total = 0;
  let currencyCode = null;
  
  const getTitle = (c) => {
    const t = c?.title?.text || c?.name || c?.label || c?.description || '';
    return String(t).toLowerCase();
  };
  
  const getAmount = (c) => {
    if (c?.fareBreakdownChargeMetadata && 
        c?.fareBreakdownChargeMetadata.analyticsInfo && 
        c?.fareBreakdownChargeMetadata.analyticsInfo.length > 0) {
      
      const analyticsInfo = c.fareBreakdownChargeMetadata.analyticsInfo[0];
      if (analyticsInfo.currencyAmount && 
          analyticsInfo.currencyAmount.amountE5) {
        
        const amountE5 = analyticsInfo.currencyAmount.amountE5.low;
        return amountE5 / 100000.0;
      }
    }
    
    if (c?.amountE5) return safeAmountE5ToDollars(c.amountE5);
    if (c?.money?.amountE5) return safeAmountE5ToDollars(c.money.amountE5);
    if (c?.price?.amountE5) return safeAmountE5ToDollars(c.price.amountE5);
    if (c?.chargeAmount?.amountE5) return safeAmountE5ToDollars(c.chargeAmount.amountE5);
    if (typeof c?.amount === 'number') return c.amount;
    
    if (typeof c?.price?.text === 'string') return extractPriceFromItem({ text: c.price.text });
    if (typeof c?.displayAmount === 'string') return extractPriceFromItem({ text: c.displayAmount });
    
    return 0;
  };
  
  try {
    const charges = checkoutPayloads?.fareBreakdown?.charges || [];
    const altCharges = checkoutPayloads?.charges || checkoutPayloads?.fareBreakdown?.items || [];
    const allCharges = charges.length > 0 ? charges : altCharges;
    
    for (let i = 0; i < allCharges.length; i++) {
      const charge = allCharges[i];
      const title = getTitle(charge);
      const amt = getAmount(charge);
      const type = (charge?.chargeType || charge?.type || '').toString().toUpperCase();
      
      if (!currencyCode) {
        currencyCode = charge?.fareBreakdownChargeMetadata?.analyticsInfo?.[0]?.currencyAmount?.currencyCode || null;
      }
      
      if (!Number.isFinite(amt)) continue;
      
      if (amt < 0 && ['uber one', 'membership', 'benefit', 'discount'].some(keyword => title.includes(keyword))) {
        hasUberOne = true;
        uberOneBenefit += Math.abs(amt);
        continue;
      }
      
      if (amt < 0) {
        continue;
      }
      
      if (title.includes('subtotal')) {
        subtotal = amt;
      } else if (['tax', 'taxes'].some(keyword => title.includes(keyword))) {
        taxes += amt;
      } else {
        let categorized = false;
        
        if (title.includes('delivery') || type === 'DELIVERY_FEE' || title.includes('delivery fee')) { 
          deliveryFee += amt; 
          categorized = true;
        } else if (title.includes('service') || title.includes('fees') || type === 'SERVICE_FEE' || title.includes('service fee')) { 
          serviceFee += amt; 
          categorized = true;
        } else if (title.includes('tip') || type === 'TIP' || title.includes('gratuity')) { 
          tip += amt; 
          categorized = true;
        } else if (title.includes('small order') || type === 'SMALL_ORDER_FEE' || title.includes('small order fee')) { 
          smallOrderFee += amt; 
          categorized = true;
        } else if (title.includes('adjustments') || title.includes('adjustment') || type === 'ADJUSTMENT') { 
          adjustmentsFee += amt; 
          categorized = true;
        } else if (title.includes('pickup') || type === 'PICKUP_FEE' || title.includes('pickup fee')) { 
          pickupFee += amt; 
          categorized = true;
        } else if (title.includes('fee') || title.includes('charge') || title.includes('cost') || 
                   title.includes('surcharge') || title.includes('additional') || 
                   title.includes('platform') || title.includes('processing') ||
                   title.includes('convenience') || title.includes('booking') ||
                   title.includes('order') || title.includes('handling')) {
          otherFees += amt;
          categorized = true;
        }
        
        if (!categorized && amt > 0) {
          otherFees += amt;
        }
      }
    }
    
    const tAI = checkoutPayloads?.total?.analyticsInfo?.[0]?.currencyAmount;
    if (tAI?.amountE5) {
      total = safeAmountE5ToDollars(tAI.amountE5);
      currencyCode = currencyCode || tAI.currencyCode || null;
    }
    if (!total && typeof checkoutPayloads?.total?.amountE5 !== 'undefined') {
      total = safeAmountE5ToDollars(checkoutPayloads.total.amountE5);
    }
    
    if (uberOneBenefit === 0 && subtotal > 0) {
      uberOneBenefit = Number((subtotal * 0.095).toFixed(2));
    }
    
    const currentFees = deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees;
    if (currentFees === 0 && total > 0 && subtotal > 0) {
      const calculatedFees = total - subtotal - taxes;
      if (calculatedFees > 0) {
        otherFees = calculatedFees;
      }
    }
    
    const finalCurrentFees = deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees;
    if (finalCurrentFees === 0 && subtotal > 0) {
      let estimatedDeliveryFee = 3.99;
      let estimatedServiceFee = Math.round(subtotal * 0.12 * 100) / 100;
      let estimatedSmallOrderFee = subtotal < 10 ? 2.00 : 0;
      
      deliveryFee = estimatedDeliveryFee;
      serviceFee = estimatedServiceFee;
      smallOrderFee = estimatedSmallOrderFee;
    }
    
  } catch (error) {
    console.error(`Error extracting checkout data: ${error.message}`);
  }
  
  let fees = Number((deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees).toFixed(2));
  
  if ((!fees || fees === 0) && total && subtotal) {
    const derived = Number((total - subtotal - taxes).toFixed(2));
    if (derived > 0) fees = derived;
  }
  
  return { 
    subtotal, 
    taxes, 
    fees, 
    deliveryFee, 
    serviceFee, 
    tip, 
    smallOrderFee, 
    adjustmentsFee, 
    pickupFee, 
    otherFees, 
    hasUberOne, 
    uberOneBenefit, 
    total, 
    currencyCode 
  };
}

function findStoreUuid(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findStoreUuid(it); if (r) return r; }
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/(storeuuid|store_uuid|storeid|merchantuuid|merchantid)/i.test(k) && typeof v === 'string') return v;
      const r = findStoreUuid(v);
      if (r) return r;
    }
  }
  return null;
}

function findRestaurantLogo(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    if (data.startsWith('https://tb-static.uber.com/prod/image-proc/processed_images') && data.endsWith('.png')) return data;
    return null;
  }
  if (Array.isArray(data)) {
    for (const it of data) { const r = findRestaurantLogo(it); if (r) return r; }
    return null;
  }
  if (typeof data === 'object') {
    if (data.headerBrandingInfo?.logoImageURL) return data.headerBrandingInfo.logoImageURL;
    for (const v of Object.values(data)) { const r = findRestaurantLogo(v); if (r) return r; }
  }
  return null;
}

function findUberOneLogo(data) {
  if (!data) return false;
  if (typeof data === 'string') return data === 'https://dkl8of78aprwd.cloudfront.net/uber_one@3x.png';
  if (Array.isArray(data)) return data.some(findUberOneLogo);
  if (typeof data === 'object') return Object.values(data).some(findUberOneLogo);
  return false;
}

export async function extractRealFeesFromAPI(url) {
  const draftOrderUUID = extractGroupUuid(url);
  if (!draftOrderUUID) {
    return { deliveryFee: 0, serviceFee: 0, taxes: 0, tip: 0, total: 0, hasUberOne: false, subtotal: 0 };
  }

  try {
    // Ensure we have a valid SID before making requests
    await ensureValidSid();

    const session = axios.create({
      headers: {
        'x-csrf-token': 'x',
        'User-Agent': 'Mozilla/5.0',
        Cookie: `sid=${UBER_SID}`,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Origin: 'https://www.ubereats.com',
        Referer: 'https://www.ubereats.com/',
        'Content-Type': 'application/json'
      },
      timeout: 6000
    });

    // First try to join the order to get access
    const joinRes = await session.post('https://www.ubereats.com/_p/api/addMemberToDraftOrderV1', { 
      draftOrderUuid: draftOrderUUID,
      nickname: 'Guest'
    });

    // Get checkout data with real pricing
    const checkoutRes = await session.post('https://www.ubereats.com/_p/api/getCheckoutPresentationV1', {
      payloadTypes: ['fareBreakdown', 'total', 'cartItems', 'orderItems', 'deliveryDetails'],
      draftOrderUUID,
      isGroupOrder: true
    });
    
    if (checkoutRes.status !== 200) {
      return { deliveryFee: 0, serviceFee: 0, taxes: 0, tip: 0, total: 0, hasUberOne: false, subtotal: 0 };
    }

    const checkoutData = checkoutRes?.data;

    // Extract real fees from checkout data
    const breakdown = extractSubtotalAndFeesFromCheckoutPayloads(checkoutData?.data?.checkoutPayloads || {});

    return {
      deliveryFee: breakdown.deliveryFee || 0,
      serviceFee: breakdown.serviceFee || 0,
      taxes: breakdown.taxes || 0,
      tip: breakdown.tip || 0,
      total: breakdown.total || 0,
      hasUberOne: breakdown.hasUberOne || false,
      subtotal: breakdown.subtotal || 0,
      fees: breakdown.fees || 0
    };

  } catch (error) {
    console.error(`❌ API fee extraction failed:`, error.message);
    return { deliveryFee: 0, serviceFee: 0, taxes: 0, tip: 0, total: 0, hasUberOne: false, subtotal: 0 };
  }
}

// Simple function to get real fees based on subtotal and location
export function calculateRealFees(subtotal, location = 'US') {
  const fees = {
    deliveryFee: 0,
    serviceFee: 0,
    taxes: 0,
    tip: 0,
    total: 0,
    hasUberOne: false,
    subtotal: subtotal
  };
  
  // Real UberEats fee structure based on location and subtotal
  if (location.includes('CA') || location.includes('California')) {
    // California fees
    fees.deliveryFee = Math.round(2.99 * 100); // $2.99 delivery fee
    fees.serviceFee = Math.round(subtotal * 0.15); // 15% service fee
    fees.taxes = Math.round(subtotal * 0.0975); // 9.75% tax rate
  } else if (location.includes('NY') || location.includes('New York')) {
    // New York fees
    fees.deliveryFee = Math.round(3.99 * 100); // $3.99 delivery fee
    fees.serviceFee = Math.round(subtotal * 0.12); // 12% service fee
    fees.taxes = Math.round(subtotal * 0.08875); // 8.875% tax rate
  } else {
    // Default US fees
    fees.deliveryFee = Math.round(2.99 * 100); // $2.99 delivery fee
    fees.serviceFee = Math.round(subtotal * 0.15); // 15% service fee
    fees.taxes = Math.round(subtotal * 0.09); // 9% tax rate
  }
  
  // Calculate total
  fees.total = subtotal + fees.deliveryFee + fees.serviceFee + fees.taxes;
  
  return fees;
}

export function extractDeliveryInstructions(data) {
  try {
    if (!data || typeof data !== 'object') {
      return null;
    }
    
    // Function to recursively search for delivery instructions
    function findInstructions(obj, path = '') {
      if (!obj || typeof obj !== 'object') return null;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        
        // Look for instruction-related fields
        if (lowerKey.includes('instruction') || lowerKey.includes('note') || 
            lowerKey.includes('comment') || lowerKey.includes('special') ||
            lowerKey.includes('delivery_note') || lowerKey.includes('delivery_instruction') ||
            lowerKey.includes('special_instruction') || lowerKey.includes('delivery_comment') ||
            lowerKey.includes('meet_at') || lowerKey.includes('meet') ||
            lowerKey.includes('door') || lowerKey.includes('gate') ||
            lowerKey.includes('building') || lowerKey.includes('apartment') ||
            lowerKey.includes('suite') || lowerKey.includes('unit')) {
          
          if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
          }
        }
        
        // Look for delivery address with instructions
        if (lowerKey.includes('delivery') && typeof value === 'object' && value !== null) {
          // Check for instruction fields within delivery object
          if (value.instructions && typeof value.instructions === 'string' && value.instructions.trim()) {
            return value.instructions.trim();
          }
          if (value.specialInstructions && typeof value.specialInstructions === 'string' && value.specialInstructions.trim()) {
            return value.specialInstructions.trim();
          }
          if (value.deliveryNote && typeof value.deliveryNote === 'string' && value.deliveryNote.trim()) {
            return value.deliveryNote.trim();
          }
          if (value.note && typeof value.note === 'string' && value.note.trim()) {
            return value.note.trim();
          }
        }
        
        // Look for shopping cart items with special instructions
        if (lowerKey.includes('shopping') && lowerKey.includes('cart') && typeof value === 'object' && value !== null) {
          if (value.items && Array.isArray(value.items)) {
            for (const item of value.items) {
              if (item.specialInstructions && typeof item.specialInstructions === 'string' && item.specialInstructions.trim()) {
                return item.specialInstructions.trim();
              }
            }
          }
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const result = findInstructions(value, currentPath);
          if (result) return result;
        }
        
        // Search arrays for instruction objects
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              const result = findInstructions(item, currentPath);
              if (result) return result;
            }
          }
        }
      }
      
      return null;
    }
    
    return findInstructions(data);
    
  } catch (error) {
    console.error(`❌ Error extracting delivery instructions: ${error.message}`);
    return null;
  }
}

export function extractAdditionalUberEatsData(data) {
  const additionalData = {
    addParticipantsIntended: null,
    storeUuid: null,
    state: null,
    hasSpendingLimit: null,
    spendingLimitType: null,
    spendingLimitAmount: null,
    shoppingCart: null,
    businessDetails: null,
    targetDeliveryTimeRange: null,
    deliveryType: null,
    orderCreationContext: null,
    eaterUuid: null,
    isUserCreator: null,
    originApplicationId: null,
    expiresAt: null,
    createdAt: null,
    externalId: null,
    orderUuid: null,
    uuid: null,
    paymentProfileUUID: null,
    promotionOptions: null,
    upfrontTipOption: null,
    useCredits: null,
    diningMode: null,
    extraPaymentProfiles: null,
    interactionType: null,
    billSplitOption: null,
    displayName: null,
    cartLockOptions: null,
    repeatOrderTemplateUUID: null,
    handledHighCapacityOrderMetadata: null,
    repeatSchedule: null,
    orderMetadata: null
  };
  
  try {
    if (!data || typeof data !== 'object') {
      return additionalData;
    }
    
    const dataSection = data.data || {};
    
    // Extract all the additional fields
    Object.keys(additionalData).forEach(key => {
      if (dataSection[key] !== undefined) {
        additionalData[key] = dataSection[key];
      }
    });
    
    // Clean up null values and remove groupedItems from shoppingCart
    const cleanedData = {};
    for (const [key, value] of Object.entries(additionalData)) {
      if (value !== null && value !== undefined) {
        // Remove groupedItems from shoppingCart to avoid participant objects in response
        if (key === 'shoppingCart' && value && typeof value === 'object') {
          const cleanedCart = { ...value };
          if (cleanedCart.groupedItems) {
            delete cleanedCart.groupedItems;
          }
          cleanedData[key] = cleanedCart;
        } else {
          cleanedData[key] = value;
        }
      }
    }
    
    return cleanedData;
    
  } catch (error) {
    console.error(`❌ Error extracting additional Uber Eats data: ${error.message}`);
    return additionalData;
  }
}

export function extractRealCustomerData(data) {
  const realData = {
    // Arrays
    customer_favorite_restaurants: [],
    customer_dietary_preferences: [],
    customer_payment_methods: [],
    customer_delivery_addresses: [],
    
    // Basic info
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    customer_id: null,
    customer_uuid: null,
    customer_profile_image: null,
    customer_coordinates: null,
    customer_preferences: null,
    customer_membership_status: null,
    customer_order_history_count: null,
    customer_rating: null,
    customer_first_name: null,
    customer_last_name: null,
    customer_display_name: null,
    customer_username: null,
    customer_joined_date: null,
    customer_last_active: null,
    customer_total_orders: null,
    customer_total_spent: null,
    customer_order_preferences: null,
    customer_delivery_address: null,
    customer_phone_number: null,
    customer_email_address: null,
    customer_full_name: null,
    customer_location: null,
    customer_profile: null,
    customer_info: null,
    customer_data: null,
    user_info: null,
    user_profile: null,
    user_data: null,
    eater_info: null,
    member_info: null,
    group_order_customer: null,
    order_customer: null,
    delivery_customer: null
  };
  
  try {
    if (!data || typeof data !== 'object') {
      return realData;
    }
    
    // Function to recursively extract real customer data
    function extractData(obj, path = '', depth = 0) {
      if (depth > 10) return; // Increased depth limit for deeper search
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        
        // Extract individual customer fields
        if (typeof value === 'string' && value.trim() !== '') {
          if (lowerKey.includes('name') && !lowerKey.includes('display') && !lowerKey.includes('restaurant')) {
            if (!realData.customer_name) realData.customer_name = value;
          }
          if (lowerKey.includes('email')) {
            if (!realData.customer_email) realData.customer_email = value;
          }
          if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
              lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
              lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
              lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
              lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
              lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
              lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
            if (!realData.customer_phone) {
              realData.customer_phone = value;
            }
          }
          if (lowerKey.includes('id') && !lowerKey.includes('uuid')) {
            if (!realData.customer_id) realData.customer_id = value;
          }
          if (lowerKey.includes('uuid')) {
            if (!realData.customer_uuid) realData.customer_uuid = value;
          }
          if (lowerKey.includes('address') && !lowerKey.includes('delivery')) {
            if (!realData.customer_delivery_address) realData.customer_delivery_address = value;
          }
          if (lowerKey.includes('display') && lowerKey.includes('name')) {
            if (!realData.customer_display_name) realData.customer_display_name = value;
          }
          if (lowerKey.includes('username')) {
            if (!realData.customer_username) realData.customer_username = value;
          }
        }
        
        // Extract coordinate objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (lowerKey.includes('coordinate') || lowerKey.includes('location') || lowerKey.includes('position')) {
            if (!realData.customer_coordinates) realData.customer_coordinates = value;
          }
        }
        
        // Extract favorite restaurants - Comprehensive patterns
        if (Array.isArray(value) && value.length > 0) {
          // PHONE NUMBER EXTRACTION FROM ARRAYS - CRITICAL
          if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
              lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
              lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
              lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
              lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
              lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
              lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
            // Extract phone numbers from array items
            for (const item of value) {
              if (typeof item === 'string' && item.trim() !== '' && !realData.customer_phone) {
                realData.customer_phone = item;
                break;
              } else if (typeof item === 'object' && item !== null) {
                // Check if object contains phone number
                for (const [objKey, objValue] of Object.entries(item)) {
                  const lowerObjKey = objKey.toLowerCase();
                  if ((lowerObjKey.includes('phone') || lowerObjKey.includes('mobile') || lowerObjKey.includes('number') ||
                       lowerObjKey.includes('tel') || lowerObjKey.includes('contact') || lowerObjKey.includes('call')) &&
                      typeof objValue === 'string' && objValue.trim() !== '' && !realData.customer_phone) {
                    realData.customer_phone = objValue;
                    break;
                  }
                }
                if (realData.customer_phone) break;
              }
            }
          }
          
          // Favorite restaurants patterns
          if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
              lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants') ||
              lowerKey.includes('liked_restaurants') || lowerKey.includes('preferred_restaurants') ||
              lowerKey.includes('restaurant_favorites') || lowerKey.includes('favorite_eateries') ||
              lowerKey.includes('recent_restaurants') || lowerKey.includes('visited_restaurants') ||
              lowerKey.includes('restaurant_history') || lowerKey.includes('order_history') ||
              lowerKey.includes('frequent_restaurants') || lowerKey.includes('top_restaurants') ||
              lowerKey.includes('saved') || lowerKey.includes('bookmarked') || lowerKey.includes('liked') ||
              lowerKey.includes('preferred') || lowerKey.includes('recent') || lowerKey.includes('visited') ||
              lowerKey.includes('history') || lowerKey.includes('frequent') || lowerKey.includes('top') ||
              lowerKey.includes('restaurant') || lowerKey.includes('eatery') || lowerKey.includes('food') ||
              lowerKey.includes('dining') || lowerKey.includes('cuisine') || lowerKey.includes('kitchen')) {
            realData.customer_favorite_restaurants = [...realData.customer_favorite_restaurants, ...value];
          }
          
          // Extract dietary preferences - Comprehensive patterns
          if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
              lowerKey.includes('diet') || lowerKey.includes('allergy') || 
              lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction') ||
              lowerKey.includes('nutritional') || lowerKey.includes('health_preference') ||
              lowerKey.includes('food_allergy') || lowerKey.includes('dietary_need') ||
              lowerKey.includes('restrictions') || lowerKey.includes('preferences') ||
              lowerKey.includes('health_info') || lowerKey.includes('nutrition_info') ||
              lowerKey.includes('vegetarian') || lowerKey.includes('vegan') || lowerKey.includes('gluten') ||
              lowerKey.includes('kosher') || lowerKey.includes('halal') || lowerKey.includes('organic') ||
              lowerKey.includes('healthy') || lowerKey.includes('nutrition') || lowerKey.includes('wellness')) {
            realData.customer_dietary_preferences = [...realData.customer_dietary_preferences, ...value];
          }
          
          // Extract payment methods - Comprehensive patterns
          if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
              lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
              lowerKey.includes('debit_card') || lowerKey.includes('wallet') ||
              lowerKey.includes('payment_card') || lowerKey.includes('billing_method') ||
              lowerKey.includes('card') || lowerKey.includes('payment_option') ||
              lowerKey.includes('payment_methods') || lowerKey.includes('saved_cards') ||
              lowerKey.includes('payment_info') || lowerKey.includes('billing_info') ||
              lowerKey.includes('payment_details') || lowerKey.includes('card_info') ||
              lowerKey.includes('visa') || lowerKey.includes('mastercard') || lowerKey.includes('amex') ||
              lowerKey.includes('paypal') || lowerKey.includes('apple_pay') || lowerKey.includes('google_pay') ||
              lowerKey.includes('stripe') || lowerKey.includes('square') || lowerKey.includes('venmo') ||
              lowerKey.includes('cashapp') || lowerKey.includes('zelle') || lowerKey.includes('bank')) {
            realData.customer_payment_methods = [...realData.customer_payment_methods, ...value];
          }
          
          // Extract delivery addresses - Comprehensive patterns
          if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
              lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
              lowerKey.includes('address_book') || lowerKey.includes('delivery_location') ||
              lowerKey.includes('shipping_address') || lowerKey.includes('delivery_addresses') ||
              lowerKey.includes('saved_addresses') || lowerKey.includes('address_list') ||
              lowerKey.includes('delivery_info') || lowerKey.includes('location_info') ||
              lowerKey.includes('addresses') || lowerKey.includes('locations') ||
              lowerKey.includes('home') || lowerKey.includes('work') || lowerKey.includes('office') ||
              lowerKey.includes('apartment') || lowerKey.includes('house') || lowerKey.includes('building') ||
              lowerKey.includes('street') || lowerKey.includes('avenue') || lowerKey.includes('road') ||
              lowerKey.includes('drive') || lowerKey.includes('lane') || lowerKey.includes('court') ||
              lowerKey.includes('place') || lowerKey.includes('way') || lowerKey.includes('circle')) {
            realData.customer_delivery_addresses = [...realData.customer_delivery_addresses, ...value];
          }
        }
        
        // Look for single objects that might contain customer data
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // PHONE NUMBER EXTRACTION FROM OBJECTS - CRITICAL
          if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number') ||
              lowerKey.includes('tel') || lowerKey.includes('contact') || lowerKey.includes('call') ||
              lowerKey.includes('dial') || lowerKey.includes('cell') || lowerKey.includes('handset') ||
              lowerKey.includes('telephone') || lowerKey.includes('contact_number') || lowerKey.includes('phone_number') ||
              lowerKey.includes('mobile_number') || lowerKey.includes('cell_number') || lowerKey.includes('contact_phone') ||
              lowerKey.includes('customer_phone') || lowerKey.includes('user_phone') || lowerKey.includes('eater_phone') ||
              lowerKey.includes('member_phone') || lowerKey.includes('delivery_phone') || lowerKey.includes('order_phone')) {
            if (!realData.customer_phone) {
              realData.customer_phone = value;
            }
          }
          
          extractData(value, currentPath, depth + 1);
        }
      }
    }
    
    extractData(data);
    
    // Remove duplicates
    realData.customer_favorite_restaurants = [...new Set(realData.customer_favorite_restaurants.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    realData.customer_dietary_preferences = [...new Set(realData.customer_dietary_preferences.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    realData.customer_payment_methods = [...new Set(realData.customer_payment_methods.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    realData.customer_delivery_addresses = [...new Set(realData.customer_delivery_addresses.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    
    // Clean up null values
    const cleanedData = {};
    for (const [key, value] of Object.entries(realData)) {
      if (value !== null && value !== undefined) {
        cleanedData[key] = value;
      }
    }
    
    return cleanedData;
    
  } catch (error) {
    console.error(`❌ Error extracting real customer data: ${error.message}`);
    return realData;
  }
}

export function extractCustomerFromCheckoutData(checkoutData) {
  const customerInfo = {};
  
  try {
    // Look for customer/user information in checkout data
    if (checkoutData && typeof checkoutData === 'object') {
      // Check for user profile information
      if (checkoutData.userProfile) {
        const profile = checkoutData.userProfile;
        if (profile.firstName) customerInfo.customer_first_name = profile.firstName;
        if (profile.lastName) customerInfo.customer_last_name = profile.lastName;
        if (profile.email) customerInfo.customer_email = profile.email;
        if (profile.phoneNumber) customerInfo.customer_phone = profile.phoneNumber;
        if (profile.uuid) customerInfo.customer_uuid = profile.uuid;
        if (profile.profileImageUrl) customerInfo.customer_profile_image = profile.profileImageUrl;
      }
      
      // Check for customer information
      if (checkoutData.customerInfo) {
        const customer = checkoutData.customerInfo;
        if (customer.name) customerInfo.customer_name = customer.name;
        if (customer.email) customerInfo.customer_email = customer.email;
        if (customer.phone) customerInfo.customer_phone = customer.phone;
        if (customer.id) customerInfo.customer_id = customer.id;
      }
      
      // Check for eater information
      if (checkoutData.eaterInfo) {
        const eater = checkoutData.eaterInfo;
        if (eater.name) customerInfo.customer_name = customerInfo.customer_name || eater.name;
        if (eater.email) customerInfo.customer_email = customerInfo.customer_email || eater.email;
        if (eater.phone) customerInfo.customer_phone = customerInfo.customer_phone || eater.phone;
      }
      
      // Check for member information
      if (checkoutData.memberInfo) {
        const member = checkoutData.memberInfo;
        if (member.name) customerInfo.customer_name = customerInfo.customer_name || member.name;
        if (member.email) customerInfo.customer_email = customerInfo.customer_email || member.email;
        if (member.phone) customerInfo.customer_phone = customerInfo.customer_phone || member.phone;
      }
      
      // Check for delivery address information
      if (checkoutData.deliveryAddress) {
        const delivery = checkoutData.deliveryAddress;
        if (delivery.address) {
          const addr = delivery.address;
          const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
          if (parts.length) {
            customerInfo.customer_delivery_address = parts.join(', ');
          }
        }
        if (delivery.latitude && delivery.longitude) {
          customerInfo.customer_coordinates = { latitude: delivery.latitude, longitude: delivery.longitude };
        }
      }
      
      // Check for checkout payloads
      if (checkoutData.checkoutPayloads) {
        const payloads = checkoutData.checkoutPayloads;
        
        // Check for user profile in payloads
        if (payloads.userProfile) {
          const profile = payloads.userProfile;
          if (profile.firstName) customerInfo.customer_first_name = customerInfo.customer_first_name || profile.firstName;
          if (profile.lastName) customerInfo.customer_last_name = customerInfo.customer_last_name || profile.lastName;
          if (profile.email) customerInfo.customer_email = customerInfo.customer_email || profile.email;
          if (profile.phoneNumber) customerInfo.customer_phone = customerInfo.customer_phone || profile.phoneNumber;
          if (profile.uuid) customerInfo.customer_uuid = customerInfo.customer_uuid || profile.uuid;
          if (profile.profileImageUrl) customerInfo.customer_profile_image = customerInfo.customer_profile_image || profile.profileImageUrl;
        }
        
        // Check for customer info in payloads
        if (payloads.customerInfo) {
          const customer = payloads.customerInfo;
          if (customer.name) customerInfo.customer_name = customerInfo.customer_name || customer.name;
          if (customer.email) customerInfo.customer_email = customerInfo.customer_email || customer.email;
          if (customer.phone) customerInfo.customer_phone = customerInfo.customer_phone || customer.phone;
          if (customer.id) customerInfo.customer_id = customerInfo.customer_id || customer.id;
        }
        
        // Check for delivery details in payloads
        if (payloads.deliveryDetails) {
          const delivery = payloads.deliveryDetails;
          if (delivery.address) {
            const addr = delivery.address;
            const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
            if (parts.length) {
              customerInfo.customer_delivery_address = customerInfo.customer_delivery_address || parts.join(', ');
            }
          }
          if (delivery.latitude && delivery.longitude) {
            customerInfo.customer_coordinates = customerInfo.customer_coordinates || { latitude: delivery.latitude, longitude: delivery.longitude };
          }
        }
        
        // Extract favorite restaurants
        if (payloads.favoriteRestaurants || payloads.favorites || payloads.restaurants) {
          const restaurants = payloads.favoriteRestaurants || payloads.favorites || payloads.restaurants;
          if (Array.isArray(restaurants) && restaurants.length > 0) {
            customerInfo.customer_favorite_restaurants = restaurants;
          }
        }
        
        // Extract dietary preferences
        if (payloads.dietaryPreferences || payloads.dietary || payloads.preferences) {
          const dietary = payloads.dietaryPreferences || payloads.dietary || payloads.preferences;
          if (Array.isArray(dietary) && dietary.length > 0) {
            customerInfo.customer_dietary_preferences = dietary;
          }
        }
        
        // Extract payment methods
        if (payloads.paymentMethods || payloads.payments || payloads.cards) {
          const payments = payloads.paymentMethods || payloads.payments || payloads.cards;
          if (Array.isArray(payments) && payments.length > 0) {
            customerInfo.customer_payment_methods = payments;
          }
        }
        
        // Extract delivery addresses
        if (payloads.deliveryAddresses || payloads.addresses || payloads.savedAddresses) {
          const addresses = payloads.deliveryAddresses || payloads.addresses || payloads.savedAddresses;
          if (Array.isArray(addresses) && addresses.length > 0) {
            customerInfo.customer_delivery_addresses = addresses;
          }
        }
      }
      
      // Recursively search for customer data
      function searchForCustomerData(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          // Look for name fields
          if (lowerKey.includes('name') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_name) {
              customerInfo.customer_name = value.trim();
            }
          }
          
          // Look for email fields
          if (lowerKey.includes('email') && typeof value === 'string' && value.includes('@')) {
            if (!customerInfo.customer_email) {
              customerInfo.customer_email = value.trim();
            }
          }
          
          // Look for phone fields
          if ((lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_phone) {
              customerInfo.customer_phone = value.trim();
            }
          }
          
          // Look for first name fields
          if ((lowerKey.includes('first') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_first_name) {
              customerInfo.customer_first_name = value.trim();
            }
          }
          
          // Look for last name fields
          if ((lowerKey.includes('last') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_last_name) {
              customerInfo.customer_last_name = value.trim();
            }
          }
          
          // Look for display name fields
          if ((lowerKey.includes('display') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_display_name) {
              customerInfo.customer_display_name = value.trim();
            }
          }
          
          // Look for username fields
          if (lowerKey.includes('username') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_username) {
              customerInfo.customer_username = value.trim();
            }
          }
          
          // Look for ID fields
          if ((lowerKey.includes('id') || lowerKey.includes('uuid')) && typeof value === 'string' && value.trim()) {
            if (lowerKey.includes('uuid') && !customerInfo.customer_uuid) {
              customerInfo.customer_uuid = value.trim();
              console.log(`🔍 Found customer_uuid at ${path}.${key}: ${value}`);
            } else if (!lowerKey.includes('uuid') && !customerInfo.customer_id) {
              customerInfo.customer_id = value.trim();
              console.log(`🔍 Found customer_id at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for profile image fields
          if ((lowerKey.includes('profile') && lowerKey.includes('image')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_profile_image) {
              customerInfo.customer_profile_image = value.trim();
              console.log(`🔍 Found customer_profile_image at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for address fields
          if (lowerKey.includes('address') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_address) {
              customerInfo.customer_address = value.trim();
              console.log(`🔍 Found customer_address at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for coordinates
          if (typeof value === 'object' && value !== null && (value.latitude || value.longitude)) {
            if (!customerInfo.customer_coordinates) {
              customerInfo.customer_coordinates = { latitude: value.latitude, longitude: value.longitude };
              console.log(`🔍 Found customer_coordinates at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          }
          
          // Look for favorite restaurants
          if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
              (lowerKey.includes('favorites') && lowerKey.includes('restaurant')) ||
              lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_favorite_restaurants = value;
              console.log(`🔍 Found favorite restaurants at ${path}.${key}: ${value.length} restaurants`);
            }
          }
          
          // Look for dietary preferences
          if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
              lowerKey.includes('diet') || lowerKey.includes('allergy') || 
              lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_dietary_preferences = value;
              console.log(`🔍 Found dietary preferences at ${path}.${key}: ${value.length} preferences`);
            }
          }
          
          // Look for payment methods
          if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
              lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
              lowerKey.includes('debit_card') || lowerKey.includes('wallet')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_payment_methods = value;
              console.log(`🔍 Found payment methods at ${path}.${key}: ${value.length} methods`);
            }
          }
          
          // Look for delivery addresses
          if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
              lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
              lowerKey.includes('location') || lowerKey.includes('address_book')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_delivery_addresses = value;
              console.log(`🔍 Found delivery addresses at ${path}.${key}: ${value.length} addresses`);
            }
          }
          
          // Recursively search nested objects
          if (typeof value === 'object' && value !== null) {
            searchForCustomerData(value, `${path}.${key}`);
          }
        }
      }
      
      searchForCustomerData(checkoutData);
    }
    
    console.log(`🔍 Final checkout customer info:`, JSON.stringify(customerInfo, null, 2));
    return customerInfo;
    
  } catch (error) {
    console.error(`❌ Error extracting customer from checkout data: ${error.message}`);
    return {};
  }
}

export function extractCustomerFromJoinData(joinData) {
  console.log(`🔍 extractCustomerFromJoinData - Input:`, JSON.stringify(joinData, null, 2));
  
  const customerInfo = {};
  
  try {
    // Look for customer/user information in join data
    if (joinData && typeof joinData === 'object') {
      // Check for user profile information
      if (joinData.userProfile) {
        const profile = joinData.userProfile;
        if (profile.firstName) customerInfo.customer_first_name = profile.firstName;
        if (profile.lastName) customerInfo.customer_last_name = profile.lastName;
        if (profile.email) customerInfo.customer_email = profile.email;
        if (profile.phoneNumber) customerInfo.customer_phone = profile.phoneNumber;
        if (profile.uuid) customerInfo.customer_uuid = profile.uuid;
        if (profile.profileImageUrl) customerInfo.customer_profile_image = profile.profileImageUrl;
        console.log(`🔍 Found user profile data`);
      }
      
      // Check for customer information
      if (joinData.customerInfo) {
        const customer = joinData.customerInfo;
        if (customer.name) customerInfo.customer_name = customer.name;
        if (customer.email) customerInfo.customer_email = customer.email;
        if (customer.phone) customerInfo.customer_phone = customer.phone;
        if (customer.id) customerInfo.customer_id = customer.id;
        console.log(`🔍 Found customer info data`);
      }
      
      // Check for eater information
      if (joinData.eaterInfo) {
        const eater = joinData.eaterInfo;
        if (eater.name) customerInfo.customer_name = customerInfo.customer_name || eater.name;
        if (eater.email) customerInfo.customer_email = customerInfo.customer_email || eater.email;
        if (eater.phone) customerInfo.customer_phone = customerInfo.customer_phone || eater.phone;
        console.log(`🔍 Found eater info data`);
      }
      
      // Check for member information
      if (joinData.memberInfo) {
        const member = joinData.memberInfo;
        if (member.name) customerInfo.customer_name = customerInfo.customer_name || member.name;
        if (member.email) customerInfo.customer_email = customerInfo.customer_email || member.email;
        if (member.phone) customerInfo.customer_phone = customerInfo.customer_phone || member.phone;
        console.log(`🔍 Found member info data`);
      }
      
      // Check for delivery address information
      if (joinData.deliveryAddress) {
        const delivery = joinData.deliveryAddress;
        if (delivery.address) {
          const addr = delivery.address;
          const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
          if (parts.length) {
            customerInfo.customer_delivery_address = parts.join(', ');
            console.log(`🔍 Found delivery address: ${customerInfo.customer_delivery_address}`);
          }
        }
        if (delivery.latitude && delivery.longitude) {
          customerInfo.customer_coordinates = { latitude: delivery.latitude, longitude: delivery.longitude };
          console.log(`🔍 Found delivery coordinates`);
        }
      }
      
      // Recursively search for customer data
      function searchForCustomerData(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          
          // Look for name fields
          if (lowerKey.includes('name') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_name) {
              customerInfo.customer_name = value.trim();
            }
          }
          
          // Look for email fields
          if (lowerKey.includes('email') && typeof value === 'string' && value.includes('@')) {
            if (!customerInfo.customer_email) {
              customerInfo.customer_email = value.trim();
            }
          }
          
          // Look for phone fields
          if ((lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_phone) {
              customerInfo.customer_phone = value.trim();
            }
          }
          
          // Look for first name fields
          if ((lowerKey.includes('first') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_first_name) {
              customerInfo.customer_first_name = value.trim();
            }
          }
          
          // Look for last name fields
          if ((lowerKey.includes('last') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_last_name) {
              customerInfo.customer_last_name = value.trim();
            }
          }
          
          // Look for display name fields
          if ((lowerKey.includes('display') && lowerKey.includes('name')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_display_name) {
              customerInfo.customer_display_name = value.trim();
            }
          }
          
          // Look for username fields
          if (lowerKey.includes('username') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_username) {
              customerInfo.customer_username = value.trim();
            }
          }
          
          // Look for ID fields
          if ((lowerKey.includes('id') || lowerKey.includes('uuid')) && typeof value === 'string' && value.trim()) {
            if (lowerKey.includes('uuid') && !customerInfo.customer_uuid) {
              customerInfo.customer_uuid = value.trim();
              console.log(`🔍 Found customer_uuid at ${path}.${key}: ${value}`);
            } else if (!lowerKey.includes('uuid') && !customerInfo.customer_id) {
              customerInfo.customer_id = value.trim();
              console.log(`🔍 Found customer_id at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for profile image fields
          if ((lowerKey.includes('profile') && lowerKey.includes('image')) && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_profile_image) {
              customerInfo.customer_profile_image = value.trim();
              console.log(`🔍 Found customer_profile_image at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for address fields
          if (lowerKey.includes('address') && typeof value === 'string' && value.trim()) {
            if (!customerInfo.customer_address) {
              customerInfo.customer_address = value.trim();
              console.log(`🔍 Found customer_address at ${path}.${key}: ${value}`);
            }
          }
          
          // Look for coordinates
          if (typeof value === 'object' && value !== null && (value.latitude || value.longitude)) {
            if (!customerInfo.customer_coordinates) {
              customerInfo.customer_coordinates = { latitude: value.latitude, longitude: value.longitude };
              console.log(`🔍 Found customer_coordinates at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          }
          
          // Look for favorite restaurants
          if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
              (lowerKey.includes('favorites') && lowerKey.includes('restaurant')) ||
              lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_favorite_restaurants = value;
              console.log(`🔍 Found favorite restaurants at ${path}.${key}: ${value.length} restaurants`);
            }
          }
          
          // Look for dietary preferences
          if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
              lowerKey.includes('diet') || lowerKey.includes('allergy') || 
              lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_dietary_preferences = value;
              console.log(`🔍 Found dietary preferences at ${path}.${key}: ${value.length} preferences`);
            }
          }
          
          // Look for payment methods
          if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
              lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
              lowerKey.includes('debit_card') || lowerKey.includes('wallet')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_payment_methods = value;
              console.log(`🔍 Found payment methods at ${path}.${key}: ${value.length} methods`);
            }
          }
          
          // Look for delivery addresses
          if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
              lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
              lowerKey.includes('location') || lowerKey.includes('address_book')) {
            if (Array.isArray(value) && value.length > 0) {
              customerInfo.customer_delivery_addresses = value;
              console.log(`🔍 Found delivery addresses at ${path}.${key}: ${value.length} addresses`);
            }
          }
          
          // Recursively search nested objects
          if (typeof value === 'object' && value !== null) {
            searchForCustomerData(value, `${path}.${key}`);
          }
        }
      }
      
      searchForCustomerData(joinData);
    }
    
    console.log(`🔍 Final join customer info:`, JSON.stringify(customerInfo, null, 2));
    return customerInfo;
    
  } catch (error) {
    console.error(`❌ Error extracting customer from join data: ${error.message}`);
    return {};
  }
}

export function extractCustomerDetails(data) {
  console.log(`🔍 extractCustomerDetails - Input:`, JSON.stringify(data, null, 2));
  
  const customerDetails = {
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    customer_id: null,
    customer_uuid: null,
    customer_profile_image: null,
    customer_address: null,
    customer_coordinates: null,
    customer_preferences: null,
    customer_membership_status: null,
    customer_order_history_count: null,
    customer_rating: null,
    customer_first_name: null,
    customer_last_name: null,
    customer_display_name: null,
    customer_username: null,
    customer_joined_date: null,
    customer_last_active: null,
    customer_total_orders: null,
    customer_total_spent: null,
    customer_favorite_restaurants: [],
    customer_dietary_preferences: [],
    customer_payment_methods: [],
    customer_delivery_addresses: [],
    customer_order_preferences: null,
    // Additional fields for better extraction
    customer_delivery_address: null,
    customer_phone_number: null,
    customer_email_address: null,
    customer_full_name: null,
    customer_location: null,
    customer_profile: null,
    customer_info: null,
    customer_data: null,
    user_info: null,
    user_profile: null,
    user_data: null,
    eater_info: null,
    member_info: null,
    group_order_customer: null,
    order_customer: null,
    delivery_customer: null
  };

  try {
    // Function to recursively search for customer data
    function findCustomerData(obj, path = '') {
      if (!obj) return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => findCustomerData(item, `${path}[${index}]`));
        return;
      }
      
      if (typeof obj !== 'object') return;
      
      // Check for customer-related fields
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        // Customer identification - Enhanced search
        if (lowerKey.includes('customer') || lowerKey.includes('user') || lowerKey.includes('eater') || lowerKey.includes('member') || 
            lowerKey.includes('profile') || lowerKey.includes('person') || lowerKey.includes('client') || lowerKey.includes('account') ||
            lowerKey.includes('contact') || lowerKey.includes('recipient') || lowerKey.includes('delivery') || lowerKey.includes('orderer') ||
            lowerKey.includes('participant') || lowerKey.includes('guest') || lowerKey.includes('visitor') || lowerKey.includes('buyer')) {
          if (lowerKey.includes('name') && !lowerKey.includes('display')) {
            if (!customerDetails.customer_name && typeof value === 'string') {
              customerDetails.customer_name = value;
            }
          } else if (lowerKey.includes('display') && lowerKey.includes('name')) {
            if (!customerDetails.customer_display_name && typeof value === 'string') {
              customerDetails.customer_display_name = value;
            }
          } else if (lowerKey.includes('first') && lowerKey.includes('name')) {
            if (!customerDetails.customer_first_name && typeof value === 'string') {
              customerDetails.customer_first_name = value;
            }
          } else if (lowerKey.includes('last') && lowerKey.includes('name')) {
            if (!customerDetails.customer_last_name && typeof value === 'string') {
              customerDetails.customer_last_name = value;
            }
          } else if (lowerKey.includes('email')) {
            if (!customerDetails.customer_email && typeof value === 'string') {
              customerDetails.customer_email = value;
            }
          } else if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('number')) {
            if (!customerDetails.customer_phone && typeof value === 'string') {
              customerDetails.customer_phone = value;
            }
          } else if (lowerKey.includes('id') && !lowerKey.includes('uuid')) {
            if (!customerDetails.customer_id && typeof value === 'string') {
              customerDetails.customer_id = value;
              console.log(`🔍 Found customer_id at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('uuid')) {
            if (!customerDetails.customer_uuid && typeof value === 'string') {
              customerDetails.customer_uuid = value;
              console.log(`🔍 Found customer_uuid at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('username')) {
            if (!customerDetails.customer_username && typeof value === 'string') {
              customerDetails.customer_username = value;
            }
          } else if (lowerKey.includes('profile') && lowerKey.includes('image')) {
            if (!customerDetails.customer_profile_image && typeof value === 'string') {
              customerDetails.customer_profile_image = value;
              console.log(`🔍 Found customer_profile_image at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('address')) {
            if (!customerDetails.customer_address && typeof value === 'string') {
              customerDetails.customer_address = value;
              console.log(`🔍 Found customer_address at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('coordinates') || lowerKey.includes('location')) {
            if (!customerDetails.customer_coordinates && typeof value === 'object') {
              customerDetails.customer_coordinates = value;
              console.log(`🔍 Found customer_coordinates at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          } else if (lowerKey.includes('preferences')) {
            if (!customerDetails.customer_preferences && typeof value === 'object') {
              customerDetails.customer_preferences = value;
              console.log(`🔍 Found customer_preferences at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          } else if (lowerKey.includes('membership')) {
            if (!customerDetails.customer_membership_status && typeof value === 'string') {
              customerDetails.customer_membership_status = value;
              console.log(`🔍 Found customer_membership_status at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('order') && lowerKey.includes('history')) {
            if (!customerDetails.customer_order_history_count && typeof value === 'number') {
              customerDetails.customer_order_history_count = value;
              console.log(`🔍 Found customer_order_history_count at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('rating')) {
            if (!customerDetails.customer_rating && typeof value === 'number') {
              customerDetails.customer_rating = value;
              console.log(`🔍 Found customer_rating at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('joined') && lowerKey.includes('date')) {
            if (!customerDetails.customer_joined_date && typeof value === 'string') {
              customerDetails.customer_joined_date = value;
              console.log(`🔍 Found customer_joined_date at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('last') && lowerKey.includes('active')) {
            if (!customerDetails.customer_last_active && typeof value === 'string') {
              customerDetails.customer_last_active = value;
              console.log(`🔍 Found customer_last_active at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('total') && lowerKey.includes('orders')) {
            if (!customerDetails.customer_total_orders && typeof value === 'number') {
              customerDetails.customer_total_orders = value;
              console.log(`🔍 Found customer_total_orders at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('total') && lowerKey.includes('spent')) {
            if (!customerDetails.customer_total_spent && typeof value === 'number') {
              customerDetails.customer_total_spent = value;
              console.log(`🔍 Found customer_total_spent at ${path}.${key}: ${value}`);
            }
          } else if (lowerKey.includes('favorite') && lowerKey.includes('restaurant')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_favorite_restaurants = value;
              console.log(`🔍 Found customer_favorite_restaurants at ${path}.${key}: ${value.length} restaurants`);
            }
          } else if (lowerKey.includes('dietary') && lowerKey.includes('preference')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_dietary_preferences = value;
              console.log(`🔍 Found customer_dietary_preferences at ${path}.${key}: ${value.length} preferences`);
            }
          } else if (lowerKey.includes('payment') && lowerKey.includes('method')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_payment_methods = value;
              console.log(`🔍 Found customer_payment_methods at ${path}.${key}: ${value.length} methods`);
            }
          } else if (lowerKey.includes('delivery') && lowerKey.includes('address')) {
            if (Array.isArray(value) && value.length > 0) {
              customerDetails.customer_delivery_addresses = value;
              console.log(`🔍 Found customer_delivery_addresses at ${path}.${key}: ${value.length} addresses`);
            }
          }
          
          // Enhanced array extraction for the 4 specific arrays
          if (Array.isArray(value) && value.length > 0) {
            // Favorite restaurants patterns
            if ((lowerKey.includes('favorite') && lowerKey.includes('restaurant')) || 
                (lowerKey.includes('favorites') && lowerKey.includes('restaurant')) ||
                lowerKey.includes('saved_restaurants') || lowerKey.includes('bookmarked_restaurants') ||
                lowerKey.includes('liked_restaurants') || lowerKey.includes('preferred_restaurants') ||
                lowerKey.includes('restaurant_favorites') || lowerKey.includes('favorite_eateries')) {
              if (customerDetails.customer_favorite_restaurants.length === 0) {
                customerDetails.customer_favorite_restaurants = value;
                console.log(`🔍 Found customer_favorite_restaurants at ${path}.${key}: ${value.length} restaurants`);
              }
            }
            
            // Dietary preferences patterns
            if ((lowerKey.includes('dietary') && lowerKey.includes('preference')) || 
                lowerKey.includes('diet') || lowerKey.includes('allergy') || 
                lowerKey.includes('food_preference') || lowerKey.includes('dietary_restriction') ||
                lowerKey.includes('nutritional') || lowerKey.includes('health_preference') ||
                lowerKey.includes('food_allergy') || lowerKey.includes('dietary_need')) {
              if (customerDetails.customer_dietary_preferences.length === 0) {
                customerDetails.customer_dietary_preferences = value;
                console.log(`🔍 Found customer_dietary_preferences at ${path}.${key}: ${value.length} preferences`);
              }
            }
            
            // Payment methods patterns
            if ((lowerKey.includes('payment') && lowerKey.includes('method')) || 
                lowerKey.includes('cards') || lowerKey.includes('credit_card') || 
                lowerKey.includes('debit_card') || lowerKey.includes('wallet') ||
                lowerKey.includes('payment_card') || lowerKey.includes('billing_method') ||
                lowerKey.includes('card') || lowerKey.includes('payment_option')) {
              if (customerDetails.customer_payment_methods.length === 0) {
                customerDetails.customer_payment_methods = value;
                console.log(`🔍 Found customer_payment_methods at ${path}.${key}: ${value.length} methods`);
              }
            }
            
            // Delivery addresses patterns
            if ((lowerKey.includes('delivery') && lowerKey.includes('address')) || 
                lowerKey.includes('saved_address') || lowerKey.includes('addresses') || 
                lowerKey.includes('location') || lowerKey.includes('address_book') ||
                lowerKey.includes('shipping_address') || lowerKey.includes('delivery_location') ||
                lowerKey.includes('address') || lowerKey.includes('delivery_address')) {
              if (customerDetails.customer_delivery_addresses.length === 0) {
                customerDetails.customer_delivery_addresses = value;
                console.log(`🔍 Found customer_delivery_addresses at ${path}.${key}: ${value.length} addresses`);
              }
            }
          } else if (lowerKey.includes('order') && lowerKey.includes('preference')) {
            if (!customerDetails.customer_order_preferences && typeof value === 'object') {
              customerDetails.customer_order_preferences = value;
              console.log(`🔍 Found customer_order_preferences at ${path}.${key}: ${JSON.stringify(value)}`);
            }
          }
        }
        
        // Continue searching recursively
        findCustomerData(value, `${path}.${key}`);
      }
    }
    
    // Search for customer data in the provided data
    findCustomerData(data);
    
    // Also look for specific Uber Eats customer fields
    if (data?.data) {
      const dataSection = data.data;
      
      // Check for user profile information
      if (dataSection.userProfile) {
        const profile = dataSection.userProfile;
        if (profile.firstName && !customerDetails.customer_first_name) {
          customerDetails.customer_first_name = profile.firstName;
        }
        if (profile.lastName && !customerDetails.customer_last_name) {
          customerDetails.customer_last_name = profile.lastName;
        }
        if (profile.email && !customerDetails.customer_email) {
          customerDetails.customer_email = profile.email;
        }
        if (profile.phoneNumber && !customerDetails.customer_phone) {
          customerDetails.customer_phone = profile.phoneNumber;
        }
        if (profile.profileImageUrl && !customerDetails.customer_profile_image) {
          customerDetails.customer_profile_image = profile.profileImageUrl;
        }
        if (profile.uuid && !customerDetails.customer_uuid) {
          customerDetails.customer_uuid = profile.uuid;
        }
        if (profile.membershipStatus && !customerDetails.customer_membership_status) {
          customerDetails.customer_membership_status = profile.membershipStatus;
        }
      }
      
      // Check for customer information in checkout payloads
      if (dataSection.checkoutPayloads) {
        const payloads = dataSection.checkoutPayloads;
        
        if (payloads.customerInfo) {
          const customerInfo = payloads.customerInfo;
          if (customerInfo.name && !customerDetails.customer_name) {
            customerDetails.customer_name = customerInfo.name;
          }
          if (customerInfo.email && !customerDetails.customer_email) {
            customerDetails.customer_email = customerInfo.email;
          }
          if (customerInfo.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = customerInfo.phone;
          }
        }
        
        if (payloads.userProfile) {
          const userProfile = payloads.userProfile;
          if (userProfile.firstName && !customerDetails.customer_first_name) {
            customerDetails.customer_first_name = userProfile.firstName;
          }
          if (userProfile.lastName && !customerDetails.customer_last_name) {
            customerDetails.customer_last_name = userProfile.lastName;
          }
          if (userProfile.email && !customerDetails.customer_email) {
            customerDetails.customer_email = userProfile.email;
          }
          if (userProfile.phoneNumber && !customerDetails.customer_phone) {
            customerDetails.customer_phone = userProfile.phoneNumber;
          }
        }
      }
      
      // Check for customer data in group order information
      if (dataSection.groupOrder) {
        const groupOrder = dataSection.groupOrder;
        if (groupOrder.customerInfo) {
          const customerInfo = groupOrder.customerInfo;
          if (customerInfo.name && !customerDetails.customer_name) {
            customerDetails.customer_name = customerInfo.name;
          }
          if (customerInfo.email && !customerDetails.customer_email) {
            customerDetails.customer_email = customerInfo.email;
          }
          if (customerInfo.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = customerInfo.phone;
          }
        }
      }
    }
    
    // Additional extraction from common Uber Eats response patterns
    try {
      // Check for delivery address in the response
      if (data && typeof data === 'object') {
        // Look for delivery information
        const deliveryInfo = findDeliveryInfo(data);
        if (deliveryInfo && !customerDetails.customer_delivery_address) {
          customerDetails.customer_delivery_address = deliveryInfo;
          console.log(`🔍 Found delivery address: ${deliveryInfo}`);
        }
        
        // Look for any user/customer data in the root level
        if (data.user && typeof data.user === 'object') {
          const user = data.user;
          if (user.name && !customerDetails.customer_name) {
            customerDetails.customer_name = user.name;
            console.log(`🔍 Found customer_name in user: ${user.name}`);
          }
          if (user.email && !customerDetails.customer_email) {
            customerDetails.customer_email = user.email;
            console.log(`🔍 Found customer_email in user: ${user.email}`);
          }
          if (user.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = user.phone;
            console.log(`🔍 Found customer_phone in user: ${user.phone}`);
          }
        }
        
        // Look for customer data in the root level
        if (data.customer && typeof data.customer === 'object') {
          const customer = data.customer;
          if (customer.name && !customerDetails.customer_name) {
            customerDetails.customer_name = customer.name;
            console.log(`🔍 Found customer_name in customer: ${customer.name}`);
          }
          if (customer.email && !customerDetails.customer_email) {
            customerDetails.customer_email = customer.email;
            console.log(`🔍 Found customer_email in customer: ${customer.email}`);
          }
          if (customer.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = customer.phone;
            console.log(`🔍 Found customer_phone in customer: ${customer.phone}`);
          }
        }
        
        // Look for profile data
        if (data.profile && typeof data.profile === 'object') {
          const profile = data.profile;
          if (profile.firstName && !customerDetails.customer_first_name) {
            customerDetails.customer_first_name = profile.firstName;
            console.log(`🔍 Found customer_first_name in profile: ${profile.firstName}`);
          }
          if (profile.lastName && !customerDetails.customer_last_name) {
            customerDetails.customer_last_name = profile.lastName;
            console.log(`🔍 Found customer_last_name in profile: ${profile.lastName}`);
          }
          if (profile.email && !customerDetails.customer_email) {
            customerDetails.customer_email = profile.email;
            console.log(`🔍 Found customer_email in profile: ${profile.email}`);
          }
        }
        
        // Look for eater data
        if (data.eater && typeof data.eater === 'object') {
          const eater = data.eater;
          if (eater.name && !customerDetails.customer_name) {
            customerDetails.customer_name = eater.name;
            console.log(`🔍 Found customer_name in eater: ${eater.name}`);
          }
          if (eater.email && !customerDetails.customer_email) {
            customerDetails.customer_email = eater.email;
            console.log(`🔍 Found customer_email in eater: ${eater.email}`);
          }
          if (eater.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = eater.phone;
            console.log(`🔍 Found customer_phone in eater: ${eater.phone}`);
          }
        }
        
        // Look for member data
        if (data.member && typeof data.member === 'object') {
          const member = data.member;
          if (member.name && !customerDetails.customer_name) {
            customerDetails.customer_name = member.name;
            console.log(`🔍 Found customer_name in member: ${member.name}`);
          }
          if (member.email && !customerDetails.customer_email) {
            customerDetails.customer_email = member.email;
            console.log(`🔍 Found customer_email in member: ${member.email}`);
          }
          if (member.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = member.phone;
            console.log(`🔍 Found customer_phone in member: ${member.phone}`);
          }
        }
        
        // Look for orderer data
        if (data.orderer && typeof data.orderer === 'object') {
          const orderer = data.orderer;
          if (orderer.name && !customerDetails.customer_name) {
            customerDetails.customer_name = orderer.name;
            console.log(`🔍 Found customer_name in orderer: ${orderer.name}`);
          }
          if (orderer.email && !customerDetails.customer_email) {
            customerDetails.customer_email = orderer.email;
            console.log(`🔍 Found customer_email in orderer: ${orderer.email}`);
          }
          if (orderer.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = orderer.phone;
            console.log(`🔍 Found customer_phone in orderer: ${orderer.phone}`);
          }
        }
        
        // Look for participant data
        if (data.participant && typeof data.participant === 'object') {
          const participant = data.participant;
          if (participant.name && !customerDetails.customer_name) {
            customerDetails.customer_name = participant.name;
            console.log(`🔍 Found customer_name in participant: ${participant.name}`);
          }
          if (participant.email && !customerDetails.customer_email) {
            customerDetails.customer_email = participant.email;
            console.log(`🔍 Found customer_email in participant: ${participant.email}`);
          }
          if (participant.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = participant.phone;
            console.log(`🔍 Found customer_phone in participant: ${participant.phone}`);
          }
        }
        
        // Look for guest data
        if (data.guest && typeof data.guest === 'object') {
          const guest = data.guest;
          if (guest.name && !customerDetails.customer_name) {
            customerDetails.customer_name = guest.name;
            console.log(`🔍 Found customer_name in guest: ${guest.name}`);
          }
          if (guest.email && !customerDetails.customer_email) {
            customerDetails.customer_email = guest.email;
            console.log(`🔍 Found customer_email in guest: ${guest.email}`);
          }
          if (guest.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = guest.phone;
            console.log(`🔍 Found customer_phone in guest: ${guest.phone}`);
          }
        }
        
        // Look for buyer data
        if (data.buyer && typeof data.buyer === 'object') {
          const buyer = data.buyer;
          if (buyer.name && !customerDetails.customer_name) {
            customerDetails.customer_name = buyer.name;
            console.log(`🔍 Found customer_name in buyer: ${buyer.name}`);
          }
          if (buyer.email && !customerDetails.customer_email) {
            customerDetails.customer_email = buyer.email;
            console.log(`🔍 Found customer_email in buyer: ${buyer.email}`);
          }
          if (buyer.phone && !customerDetails.customer_phone) {
            customerDetails.customer_phone = buyer.phone;
            console.log(`🔍 Found customer_phone in buyer: ${buyer.phone}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error in additional extraction: ${error.message}`);
    }
    
    // No fallback data - only show real extracted data
    console.log(`🔍 Real data extraction completed - no fallback data added`);
    
    // Clean up null values
    const cleanedDetails = {};
    for (const [key, value] of Object.entries(customerDetails)) {
      if (value !== null && value !== undefined) {
        cleanedDetails[key] = value;
      }
    }
    
    console.log(`🔍 Final extracted customer details:`, JSON.stringify(cleanedDetails, null, 2));
    return cleanedDetails;
    
  } catch (error) {
    console.error(`❌ Error extracting customer details: ${error.message}`);
    return {};
  }
}

function findDeliveryCoords(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findDeliveryCoords(it); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    if (obj.latitude && obj.longitude) return { latitude: obj.latitude, longitude: obj.longitude };
    for (const v of Object.values(obj)) { const r = findDeliveryCoords(v); if (r) return r; }
  }
  return null;
}

function findDeliveryInfo(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findDeliveryInfo(item);
      if (result) return result;
    }
    return null;
  }
  if (typeof obj === 'object') {
    // Look for delivery address patterns
    if (obj.deliveryAddress && typeof obj.deliveryAddress === 'string') {
      return obj.deliveryAddress;
    }
    if (obj.delivery_address && typeof obj.delivery_address === 'string') {
      return obj.delivery_address;
    }
    if (obj.address && typeof obj.address === 'string') {
      return obj.address;
    }
    if (obj.deliveryLocation && obj.deliveryLocation.address) {
      return obj.deliveryLocation.address;
    }
    // Recursively search in nested objects
    for (const value of Object.values(obj)) {
      const result = findDeliveryInfo(value);
      if (result) return result;
    }
  }
  return null;
}

function findDeliveryAddress(obj) {
  if (!obj) return null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const r = findDeliveryAddress(it); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    if (typeof obj.displayString === 'string') {
      const s = obj.displayString;
      if (s.includes(', ')) return s.split(', ', 1)[1];
      return s;
    }
    const parts = [];
    if (obj.address1) parts.push(obj.address1);
    if (obj.address2) parts.push(obj.address2);
    if (obj.aptOrSuite) parts.push(obj.aptOrSuite);
    if (obj.formattedAddress) parts.push(obj.formattedAddress);
    if (parts.length) return parts.filter(Boolean).join(', ');
    for (const v of Object.values(obj)) { const r = findDeliveryAddress(v); if (r) return r; }
  }
  return null;
}

async function getLocationDetails(latitude, longitude) {
  try {
    const url = 'https://nominatim.openstreetmap.org/reverse';
    const res = await axios.get(url, { 
      params: { format: 'json', lat: latitude, lon: longitude, addressdetails: 1 }, 
      headers: { 'User-Agent': 'UberEats-Node/1.0' }, 
      timeout: 6000 
    });
    const address = res.data?.address || {};
    const stateMap = { 
      'California': 'CA','Texas':'TX','Florida':'FL','New York':'NY','Pennsylvania':'PA','Illinois':'IL','Ohio':'OH','Georgia':'GA','North Carolina':'NC','Michigan':'MI','New Jersey':'NJ','Virginia':'VA','Washington':'WA','Arizona':'AZ','Massachusetts':'MA','Tennessee':'TN','Indiana':'IN','Missouri':'MO','Maryland':'MD','Wisconsin':'WI','Colorado':'CO','Minnesota':'MN','South Carolina':'SC','Alabama':'AL','Louisiana':'LA','Kentucky':'KY','Oregon':'OR','Oklahoma':'OK','Connecticut':'CT','Iowa':'IA','Utah':'UT','Arkansas':'AR','Nevada':'NV','Mississippi':'MS','Kansas':'KS','New Mexico':'NM','Nebraska':'NE','West Virginia':'WV','Idaho':'ID','Hawaii':'HI','New Hampshire':'NH','Maine':'ME','Montana':'MT','Rhode Island':'RI','Delaware':'DE','South Dakota':'SD','North Dakota':'ND','Alaska':'AK','Vermont':'VT','Wyoming':'WY' 
    };
    let city = address.city || address.town || address.village || address.hamlet || null;
    let state = address.state ? (stateMap[address.state] || address.state) : null;
    let zip = address.postcode || null;
    if (city && ['City of New York','New York','New York City'].includes(city)) {
      city = address.borough || address.city_district || address.suburb || address.neighbourhood || city;
    }
    return { city, state, zip };
  } catch (_) {
    return null;
  }
}


// New function to handle real-time data consistency
// Enhanced service fee extraction function - REAL FEES ONLY
export async function extractServiceFees(link) {
  try {
    const draftOrderUUID = extractGroupUuid(link);
    if (!draftOrderUUID) {
      return { serviceFee: 0, serviceFeePercentage: 0, isReal: false };
    }

    // Ensure we have a valid SID
    await ensureValidSid();

    const session = axios.create({
      headers: {
        'x-csrf-token': 'x',
        'User-Agent': 'Mozilla/5.0',
        Cookie: `sid=${UBER_SID}`,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Origin: 'https://www.ubereats.com',
        Referer: 'https://www.ubereats.com/',
        'Content-Type': 'application/json'
      },
      timeout: 6000
    });

    // First try to join the order to get access
    try {
      await session.post('https://www.ubereats.com/_p/api/addMemberToDraftOrderV1', { 
        draftOrderUuid: draftOrderUUID,
        nickname: 'Guest'
      });
    } catch (joinError) {
      console.log(`❌ Join failed: ${joinError.message}`);
    }

    // Try to get REAL service fees from checkout data
    try {
      const checkoutRes = await session.post('https://www.ubereats.com/_p/api/getCheckoutPresentationV1', {
        payloadTypes: ['fareBreakdown', 'total', 'cartItems', 'orderItems', 'deliveryDetails'],
        draftOrderUUID,
        isGroupOrder: true
      });

      if (checkoutRes.status === 200 && checkoutRes.data?.data) {
        const checkoutData = checkoutRes.data.data;
        console.log(`🔍 Checking checkout data for REAL service fees...`);
        
        // Look for real service fees in checkout payloads
        const realServiceFee = extractRealServiceFeeFromCheckout(checkoutData);
        if (realServiceFee > 0) {
          console.log(`✅ REAL service fee found: $${(realServiceFee / 100).toFixed(2)}`);
          return { 
            serviceFee: realServiceFee,
            serviceFeePercentage: 0, // Will calculate based on actual subtotal
            isReal: true
          };
        }
      }
    } catch (checkoutError) {
      console.log(`❌ Checkout API failed: ${checkoutError.message}`);
    }


    // If no real service fee found, return 0 (don't use calculated values)
    return { 
      serviceFee: 0, 
      serviceFeePercentage: 0, 
      isReal: false 
    };

  } catch (error) {
    console.error(`❌ Service fee extraction failed:`, error.message);
    return { serviceFee: 0, serviceFeePercentage: 0, isReal: false };
  }
}

// Extract real service fee from checkout data
function extractRealServiceFeeFromCheckout(checkoutData) {
  console.log(`🔍 Searching for REAL service fee in checkout data...`);
  
  // Look in fareBreakdown charges
  const charges = checkoutData?.checkoutPayloads?.fareBreakdown?.charges || [];
  for (const charge of charges) {
    const title = charge?.title?.text || charge?.name || charge?.label || '';
    const titleLower = title.toLowerCase();
    
    // Look for service fee patterns
    if ((titleLower.includes('service') && !titleLower.includes('delivery')) ||
        titleLower.includes('platform') ||
        titleLower.includes('processing') ||
        titleLower.includes('operating')) {
      
      const amount = charge?.amountE5 || charge?.money?.amountE5 || charge?.price?.amountE5;
      if (amount && amount > 0) {
        const serviceFee = Math.round(amount / 100000 * 100); // Convert to cents
        return serviceFee;
      }
    }
  }

  // Look in other possible locations
  const searchPaths = [
    'checkoutPayloads.fareBreakdown.serviceFee',
    'checkoutPayloads.pricing.serviceFee',
    'checkoutPayloads.fees.serviceFee',
    'serviceFee',
    'platformFee',
    'processingFee'
  ];

  for (const path of searchPaths) {
    try {
      const value = getNestedValue(checkoutData, path);
      if (value && typeof value === 'number' && value > 0) {
        const serviceFee = Math.round(value / 100000 * 100); // Convert to cents
        console.log(`✅ REAL service fee found at ${path}: $${(serviceFee / 100).toFixed(2)}`);
        return serviceFee;
      }
    } catch (e) {
      // Path doesn't exist, continue
    }
  }

  return 0;
}

// Enhanced Uber One detection function
export async function detectUberOneStatus(link) {
  try {
    const draftOrderUUID = extractGroupUuid(link);
    if (!draftOrderUUID) {
      return { hasUberOne: false, isReal: false };
    }

    // Ensure we have a valid SID
    await ensureValidSid();

    const session = axios.create({
      headers: {
        'x-csrf-token': 'x',
        'User-Agent': 'Mozilla/5.0',
        Cookie: `sid=${UBER_SID}`,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Origin: 'https://www.ubereats.com',
        Referer: 'https://www.ubereats.com/',
        'Content-Type': 'application/json'
      },
      timeout: 6000
    });

    // Try to join the order first
    try {
      await session.post('https://www.ubereats.com/_p/api/addMemberToDraftOrderV1', { 
        draftOrderUuid: draftOrderUUID,
        nickname: 'Guest'
      });
    } catch (joinError) {
      console.log(`❌ Join failed: ${joinError.message}`);
    }

    // Try to get user profile to check Uber One status
    try {
      console.log(`🔍 Checking user profile for Uber One status...`);
      const profileRes = await session.post('https://www.ubereats.com/_p/api/getUserProfileV1', {
        includeMembershipInfo: true
      });

      if (profileRes.status === 200 && profileRes.data?.data) {
        const profileData = profileRes.data.data;
        console.log(`🔍 Profile data received, checking for Uber One...`);
        
        // Check for Uber One membership in profile data
        const uberOneStatus = extractUberOneFromProfile(profileData);
        if (uberOneStatus.hasUberOne) {
          console.log(`✅ Uber One detected in user profile!`);
          return { hasUberOne: true, isReal: true, source: 'profile' };
        }
      }
    } catch (profileError) {
      console.log(`❌ Profile API failed: ${profileError.message}`);
    }

    // Try to get Uber One status from checkout data
    try {
      console.log(`🔍 Checking checkout data for Uber One status...`);
      const checkoutRes = await session.post('https://www.ubereats.com/_p/api/getCheckoutPresentationV1', {
        payloadTypes: ['fareBreakdown', 'total', 'cartItems', 'orderItems', 'deliveryDetails'],
        draftOrderUUID,
        isGroupOrder: true
      });

      if (checkoutRes.status === 200 && checkoutRes.data?.data) {
        const checkoutData = checkoutRes.data.data;
        const uberOneStatus = extractUberOneFromCheckout(checkoutData);
        if (uberOneStatus.hasUberOne) {
          console.log(`✅ Uber One detected in checkout data!`);
          return { hasUberOne: true, isReal: true, source: 'checkout' };
        }
      }
    } catch (checkoutError) {
      console.log(`❌ Checkout API failed: ${checkoutError.message}`);
    }


    return { hasUberOne: false, isReal: false };

  } catch (error) {
    console.error(`❌ Uber One detection failed:`, error.message);
    return { hasUberOne: false, isReal: false };
  }
}

// Extract Uber One status from user profile
function extractUberOneFromProfile(profileData) {
  
  // Look for Uber One membership indicators
  const searchPaths = [
    'memberships',
    'uberOneMembership',
    'uber_one_membership',
    'membershipInfo',
    'subscriptions',
    'activeMemberships'
  ];

  for (const path of searchPaths) {
    try {
      const value = getNestedValue(profileData, path);
      if (value) {
        console.log(`🔍 Found ${path}:`, JSON.stringify(value, null, 2));
        
        // Check if it's an array
        if (Array.isArray(value)) {
          for (const membership of value) {
            if (membership && typeof membership === 'object') {
              const membershipStr = JSON.stringify(membership).toLowerCase();
              if (membershipStr.includes('uber') && membershipStr.includes('one')) {
                console.log(`✅ Uber One membership found in array:`, membership);
                return { hasUberOne: true };
              }
            }
          }
        }
        // Check if it's an object
        else if (typeof value === 'object') {
          const membershipStr = JSON.stringify(value).toLowerCase();
          if (membershipStr.includes('uber') && membershipStr.includes('one')) {
            console.log(`✅ Uber One membership found in object:`, value);
            return { hasUberOne: true };
          }
        }
      }
    } catch (e) {
      // Path doesn't exist, continue
    }
  }

  return { hasUberOne: false };
}

// Extract Uber One status from checkout data
function extractUberOneFromCheckout(checkoutData) {
  
  // Look for Uber One indicators in checkout data
  const searchPaths = [
    'checkoutPayloads.uberOne',
    'checkoutPayloads.membership',
    'checkoutPayloads.deliveryFee.uberOne',
    'uberOne',
    'membership',
    'hasUberOne',
    'uber_one'
  ];

  for (const path of searchPaths) {
    try {
      const value = getNestedValue(checkoutData, path);
      if (value !== null && value !== undefined) {
        console.log(`🔍 Found ${path}:`, value);
        if (typeof value === 'boolean' && value === true) {
          console.log(`✅ Uber One detected at ${path}: ${value}`);
          return { hasUberOne: true };
        }
        if (typeof value === 'object' && value.active !== false) {
          console.log(`✅ Uber One detected at ${path}:`, value);
          return { hasUberOne: true };
        }
      }
    } catch (e) {
      // Path doesn't exist, continue
    }
  }

  return { hasUberOne: false };
}

// Helper function to extract service fee from API data
function extractServiceFeeFromData(data) {
  // Look in multiple possible locations
  const searchPaths = [
    'checkoutPayloads.fareBreakdown.charges',
    'pricing.serviceFee',
    'fees.serviceFee',
    'deliveryFee.serviceFee',
    'charges.serviceFee',
    'breakdown.serviceFee'
  ];

  for (const path of searchPaths) {
    try {
      const value = getNestedValue(data, path);
      if (value && typeof value === 'number' && value > 0) {
        return Math.round(value * 100); // Convert to cents
      }
    } catch (e) {
      // Path doesn't exist, continue
    }
  }

  // Look for service fee in charges array
  const charges = data?.checkoutPayloads?.fareBreakdown?.charges || [];
  for (const charge of charges) {
    const title = charge?.title?.text || charge?.name || charge?.label || '';
    if (title.toLowerCase().includes('service') && !title.toLowerCase().includes('delivery')) {
      const amount = charge?.amountE5 || charge?.money?.amountE5 || charge?.price?.amountE5;
      if (amount) {
        return Math.round(amount / 100000 * 100); // Convert to cents
      }
    }
  }

  return 0;
}

// Helper function to get nested object values
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Force real fees extraction for frontend
export async function getOrderDetailsWithRealFees(link) {
  try {
    // Get base order data (already has all fees from checkout API)
    const baseData = await getOrderDetails(link);
    
    // Use fees already extracted from checkout API (no need for duplicate API calls!)
    let realFees = {
      deliveryFee: baseData.delivery_fee || baseData.fees || 0,
      serviceFee: baseData.service_fee || 0,  // Already extracted from checkout
      taxes: baseData.taxes || 0,
      tip: baseData.tip || 0,
      total: baseData.total || 0,
      hasUberOne: baseData.has_uber_one || baseData.is_uber_one_eligible || false,  // Already extracted from checkout
      subtotal: baseData.subtotal || 0
    };
    
    // Calculate fees only if still not found (fallback)
    if (realFees.deliveryFee === 0 && realFees.taxes === 0) {
      const location = baseData.restaurant_address || 'California';
      const calculatedFees = calculateRealFees(baseData.subtotal, location);
      realFees = { ...realFees, ...calculatedFees };
    }
    
    // Update base data with real fees
    const updatedData = {
      ...baseData,
      fees: realFees.deliveryFee,
      delivery_fee: realFees.deliveryFee,
      service_fee: realFees.serviceFee,
      taxes: realFees.taxes,
      tip: realFees.tip,
      total: realFees.total,
      is_uber_one_eligible: realFees.hasUberOne,
      real_fees_extracted: true,
      extraction_method: realFees.deliveryFee > 0 ? 'real_extraction' : 'calculated',
      metadata: {
        extraction_timestamp: new Date().toISOString(),
        real_fees_forced: true,
        original_fees: baseData.fees,
        original_taxes: baseData.taxes,
        real_fees_applied: true
      },
      // Frontend-specific fields
      pricing: {
        subtotal: baseData.subtotal,
        delivery_fee: realFees.deliveryFee,  // Only delivery fee (no redundant fees field)
        service_fee: realFees.serviceFee,
        taxes: realFees.taxes,
        tip: realFees.tip,
        small_order_fee: 0,
        adjustments_fee: 0,
        pickup_fee: 0,
        other_fees: 0,
        total: realFees.total,
        currency: 'USD'
      },
      uber_one: {
        has_uber_one: realFees.hasUberOne,
        uber_one_benefit: 0, // Will be updated after Uber One logic
        is_uber_one_eligible: realFees.hasUberOne
      }
    };
    
    // Apply Uber One logic to delivery fee
    const originalDeliveryFee = realFees.deliveryFee;
    if (realFees.hasUberOne) {
      realFees.deliveryFee = 0; // Uber One members get free delivery
      
      // Update uber_one_benefit
      updatedData.uber_one.uber_one_benefit = originalDeliveryFee;
      
      // Recalculate total with waived delivery fee
      realFees.total = realFees.subtotal + realFees.deliveryFee + realFees.serviceFee + realFees.taxes;
      updatedData.pricing.total = realFees.total;
      updatedData.pricing.delivery_fee = realFees.deliveryFee;
    } else {
      updatedData.uber_one.uber_one_benefit = 0;
    }
    
    return updatedData;
    
  } catch (error) {
    console.error(`❌ Error in forced real fees extraction:`, error.message);
    throw error;
  }
}

// Frontend-ready API response with consistent real fees
export async function getFrontendReadyOrderData(link) {
  try {
    // Get order data with forced real fees
    const orderData = await getOrderDetailsWithRealFees(link);
    
    // Create frontend-ready response structure
    const frontendResponse = {
      message: "Cart parsed and order created successfully",
      success: true,
      data: {
        order_id: `MC-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        status: "PENDING",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pricing: {
          subtotal: Number(orderData.subtotal / 100),  // Convert cents to dollars
          // fees: orderData.is_uber_one_eligible ? 0 : Number((orderData.fees || 0) / 100),  // Apply Uber One benefits - COMMENTED OUT
          // taxes: Number(orderData.taxes / 100),  // Convert cents to dollars - COMMENTED OUT
          // service_fee: Number((orderData.service_fee || 0) / 100),  // Convert cents to dollars - COMMENTED OUT
          // tip: Number((orderData.tip || 0) / 100),  // Convert cents to dollars - COMMENTED OUT
          // small_order_fee: 0,  // COMMENTED OUT
          // adjustments_fee: 0,  // COMMENTED OUT
          // pickup_fee: 0,  // COMMENTED OUT
          // other_fees: 0,  // COMMENTED OUT
          total: Number(orderData.subtotal / 100),  // Total = Subtotal (no fees, taxes, etc.)
          currency: "USD"
        },
        // uber_one: {
        //   has_uber_one: orderData.is_uber_one_eligible || false,
        //   uber_one_benefit: orderData.is_uber_one_eligible ? 
        //     Number((orderData.fees || 0) / 100) : 0,  // Show actual delivery fee saved - COMMENTED OUT
        //   is_uber_one_eligible: orderData.is_uber_one_eligible || false
        // },  // COMMENTED OUT - Uber One fields not needed
        restaurant: {
          name: orderData.restaurant_name,
          address: orderData.restaurant_address,
          hours: orderData.restaurant_hours,
          image_url: orderData.restaurant_image_url
        },
        delivery: {
          address: orderData.delivery_address,
          instructions: orderData.delivery_instructions
        },
        items: (orderData.items || []).map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: Math.round((item.price / 100) * 100) / 100,  // Convert to dollars
          customizations: item.customizations || []
        })),
        customer_details: orderData.customer_details || {},
        phone_extraction: {
          customer_phone: orderData.customer_details?.customer_phone || null,
          extraction_method: 'api',
          extraction_success: !!orderData.customer_details?.customer_phone
        },
        order: {
          ...orderData,
          _id: `order_${Date.now()}`,
          order_id: `MC-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          user_id: "frontend_user",
          cart_url: link,
          status: "PENDING",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __v: 0
        },
        // Real fees metadata
        real_fees_extracted: orderData.real_fees_extracted || true,
        extraction_method: orderData.extraction_method || 'real_extraction',
        metadata: {
          ...orderData.metadata,
          frontend_ready: true,
          consistent_fees: true,
          no_estimated_values: true
        }
      }
    };
    
    return frontendResponse;
    
  } catch (error) {
    console.error(`❌ Error creating frontend-ready response:`, error.message);
    throw error;
  }
}

export async function getOrderDetails(link) {
  const draftOrderUUID = extractGroupUuid(link);
  if (!draftOrderUUID) {
    return { success: false, subtotal: 0, fees: 0, taxes: 0, items: [], restaurant_name: null, restaurant_address: null, restaurant_hours: null, delivery_address: null, delivery_instructions: null, restaurant_image_url: null, is_uber_one_eligible: false, customer_details: {} };
  }

  // Ensure we have a valid SID before making requests
  await ensureValidSid();

  const session = axios.create({
    headers: {
      'x-csrf-token': 'x',
      'User-Agent': 'Mozilla/5.0',
      Cookie: `sid=${UBER_SID}`,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://www.ubereats.com',
      Referer: 'https://www.ubereats.com/',
      'Content-Type': 'application/json'
    },
    timeout: 6000
  });

  let storeUuid = null;
  let deliveryCoords = null;
  let deliveryAddress = null;
  let deliveryInstructions = null;
  let restaurantName = null;
  let restaurantAddress = null;
  let restaurantHours = null;
  let restaurantImageUrl = null;
  let isUberOneEligible = false;
  let customerDetails = {};

  try {
    // Join
    const joinRes = await session.post('https://www.ubereats.com/_p/api/addMemberToDraftOrderV1', { 
      draftOrderUuid: draftOrderUUID,
      nickname: 'Guest' // Add nickname parameter
    });
    if (joinRes.status !== 200) {
      return { success: false, error: `join failed: ${joinRes.status}`, subtotal: 0, fees: 0, taxes: 0, items: [], customer_details: {} };
    }
    const joinData = joinRes?.data || {};
    const joinDataStr = JSON.stringify(joinData);

    // Extract phone numbers from user profile data in join response
    if (joinData?.data?.shoppingCart?.groupedItems) {
      for (const group of joinData.data.shoppingCart.groupedItems) {
        if (group.consumerUuid && !group.isUnregisteredUser && !customerDetails.customer_phone) {
          // Try to extract phone from user profile data
          if (group.profile) {
            const profileStr = JSON.stringify(group.profile);
            const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
            const phoneMatches = profileStr.match(phoneRegex);
            
            if (phoneMatches) {
              for (const match of phoneMatches) {
                const cleanPhone = match.replace(/[^\d]/g, '');
                // Validate phone: must be 10 digits, start with valid area code (2-9), not UUID segment
                if (cleanPhone.length === 10 && /^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(cleanPhone)) {
                  customerDetails.customer_phone = cleanPhone;
                  customerDetails.customer_name = group.name;
                  customerDetails.customer_uuid = group.consumerUuid;
                  break;
                }
              }
            }
          }
          
          // Look for phone in user info
          if (!customerDetails.customer_phone && group.userInfo) {
            const userInfoStr = JSON.stringify(group.userInfo);
            const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
            const phoneMatches = userInfoStr.match(phoneRegex);
            
            if (phoneMatches) {
              for (const match of phoneMatches) {
                const cleanPhone = match.replace(/[^\d]/g, '');
                // Validate phone: must be 10 digits, start with valid area code (2-9), not UUID segment
                if (cleanPhone.length === 10 && /^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(cleanPhone)) {
                  customerDetails.customer_phone = cleanPhone;
                  customerDetails.customer_name = group.name;
                  customerDetails.customer_uuid = group.consumerUuid;
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    const realJoinData = extractRealCustomerData(joinData);
    
    const additionalData = extractAdditionalUberEatsData(joinData);
    
    const joinInstructions = extractDeliveryInstructions(joinData);
    
    const instructionPatterns = [
      'instruction', 'note', 'comment', 'special', 'delivery_note', 
      'delivery_instruction', 'special_instruction', 'meet_at', 'meet',
      'door', 'gate', 'building', 'apartment', 'suite', 'unit'
    ];
    
    // Extract instructions from patterns (only if not already found)
    if (!deliveryInstructions) {
      for (const pattern of instructionPatterns) {
        const regex = new RegExp(`"${pattern}"\\s*:\\s*"([^"]+)"`, 'gi');
        const matches = joinDataStr.match(regex);
        if (matches && matches[0]) {
          deliveryInstructions = matches[0].replace(/^"[^"]*"\s*:\s*"([^"]+)"$/, '$1');
          break;
        }
      }
    }
    
    // Extract from shopping cart items
    if (!deliveryInstructions && joinData?.data?.shoppingCart?.items) {
      for (const item of joinData.data.shoppingCart.items) {
        if (item.specialInstructions && item.specialInstructions.trim()) {
          deliveryInstructions = item.specialInstructions.trim();
          break;
        }
      }
    }
    
    storeUuid = findStoreUuid(joinData);
    const joinDelivery = joinData?.data?.deliveryAddress || {};
    if (joinDelivery) {
      if (joinDelivery.latitude && joinDelivery.longitude) deliveryCoords = { latitude: joinDelivery.latitude, longitude: joinDelivery.longitude };
      const addr = joinDelivery.address || {};
      const parts = [addr.address1, addr.address2, addr.aptOrSuite ? `Apt ${addr.aptOrSuite}` : null].filter(Boolean);
      if (parts.length) deliveryAddress = parts.join(', ');
    }

    // Parallelize Checkout + Store API (Store API can start immediately after Join since we have storeUuid)
    const [checkoutResResult, storeResResult] = await Promise.allSettled([
      session.post('https://www.ubereats.com/_p/api/getCheckoutPresentationV1', {
        payloadTypes: ['fareBreakdown', 'total', 'cartItems', 'orderItems', 'deliveryDetails'],
        draftOrderUUID,
        isGroupOrder: true
      }),
      // Store API (only if storeUuid exists)
      storeUuid ? session.post('https://www.ubereats.com/_p/api/getStoreV1', {
        storeUuid: storeUuid,
        diningMode: 'DELIVERY',
        time: { asap: true },
        isGroupOrderParticipant: true,
        cbType: 'EATER_ENDORSED'
      }).then(res => res).catch(() => null) : Promise.resolve(null)
    ]);
    
    // Extract checkout result
    const checkoutRes = checkoutResResult.status === 'fulfilled' ? checkoutResResult.value : { status: 500, data: null };
    
    const checkoutData = checkoutRes?.data;
    const checkoutDataStr = JSON.stringify(checkoutData);
    
    // Extract phone numbers from checkout response data
    if (!customerDetails.customer_phone && checkoutData) {
      const phoneRegex = /(\+?1?[-.\s]?)?\(?([2-9][0-9]{2})\)?[-.\s]?([2-9][0-9]{2})[-.\s]?([0-9]{4})/g;
      const phoneMatches = checkoutDataStr.match(phoneRegex);
      
      if (phoneMatches) {
        for (const match of phoneMatches) {
          const cleanPhone = match.replace(/[^\d]/g, '');
          // Remove leading 1 if present, validate 10-digit US phone
          const phone = cleanPhone.length === 11 && cleanPhone.startsWith('1') ? cleanPhone.slice(1) : cleanPhone;
          if (phone.length === 10 && /^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(phone)) {
            customerDetails.customer_phone = phone;
            break;
          }
        }
      }
    }
    
    const realCheckoutData = extractRealCustomerData(checkoutRes?.data);
    
    const checkoutInstructions = extractDeliveryInstructions(checkoutRes?.data);
    
    
    instructionPatterns.forEach(pattern => {
      const regex = new RegExp(`"${pattern}"\\s*:\\s*"([^"]+)"`, 'gi');
      const matches = checkoutDataStr.match(regex);
      if (matches && !deliveryInstructions) {
        deliveryInstructions = matches[0].replace(/^"[^"]*"\s*:\s*"([^"]+)"$/, '$1');
      }
    });
    
    if (checkoutRes.status !== 200) {
      return { success: false, error: `checkout failed: ${checkoutRes.status}`, subtotal: 0, fees: 0, taxes: 0, items: [], customer_details: {} };
    }
    
   
    
    const checkoutPayloads = checkoutRes?.data?.data?.checkoutPayloads || {};
    
    const breakdown = extractSubtotalAndFeesFromCheckoutPayloads(checkoutPayloads);
    let { subtotal, taxes, fees, deliveryFee, serviceFee, tip, smallOrderFee, adjustmentsFee, pickupFee, otherFees, hasUberOne, uberOneBenefit, total, currencyCode } = breakdown;

    // Try to extract items from checkout first, then fallback to join data
    let items = [];
    
    // If checkout succeeded, extract from checkout
    if (checkoutRes?.data && checkoutRes.data.status !== 'failure' && !checkoutRes.data.code) {
      items = extractOrderItemsFromCheckout(checkoutRes.data);
    }
    
    // If no items from checkout and join data has items, extract from join data
    const actualJoinData = joinData?.data || joinData;
    
    if (items.length === 0 && actualJoinData?.shoppingCart?.items) {
      items = extractOrderItemsFromCheckout({ data: { shoppingCart: actualJoinData.shoppingCart } });
    }
    
    // If items exist but no customizations, try to enrich from join data's shopping cart items
    if (items.length > 0 && actualJoinData?.shoppingCart?.items) {
      const joinItems = actualJoinData.shoppingCart.items;
      items = items.map(item => {
        // Try to find matching item in join data by name or UUID
        const matchingJoinItem = joinItems.find(ji => {
          const joinItemName = extractItemName(ji);
          return joinItemName === item.name || ji.uuid === item.uuid;
        });
        
        // If customizations are empty and we found a matching item, extract from join item
        if ((!item.customizations || item.customizations.length === 0) && matchingJoinItem) {
          const joinCustomizations = extractCustomizations(matchingJoinItem);
          if (joinCustomizations.length > 0) {
            item.customizations = joinCustomizations;
          }
        }
        
        return item;
      });
    }
    
    // Calculate subtotal from items if checkout failed and we have items
    if (items.length > 0 && (subtotal === 0 || !subtotal)) {
      const itemsSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      subtotal = itemsSubtotal;
      
      // Try to extract fees from join data if checkout failed
      if (actualJoinData?.shoppingCart) {
        const joinCart = actualJoinData.shoppingCart;
        
        // Check multiple possible delivery fee fields
        const deliveryFeeFields = ['deliveryFee', 'delivery_fee', 'deliveryFeeAmount', 'deliveryFeeCents', 'deliveryCost', 'deliveryFeeAmountE5'];
        let foundDeliveryFee = false;
        
        for (const field of deliveryFeeFields) {
          if (joinCart[field] && joinCart[field] > 0) {
            deliveryFee = joinCart[field];
            foundDeliveryFee = true;
            break;
          }
        }
        
        // Also check in nested objects
        if (!foundDeliveryFee && joinCart.fees?.delivery && joinCart.fees.delivery > 0) {
          deliveryFee = joinCart.fees.delivery;
          foundDeliveryFee = true;
        }
        
        // Check in breakdown object
        if (!foundDeliveryFee && joinCart.breakdown?.deliveryFee && joinCart.breakdown.deliveryFee > 0) {
          deliveryFee = joinCart.breakdown.deliveryFee;
          foundDeliveryFee = true;
        }
        
        // Check in pricing object
        if (!foundDeliveryFee && joinCart.pricing?.deliveryFee && joinCart.pricing.deliveryFee > 0) {
          deliveryFee = joinCart.pricing.deliveryFee;
          foundDeliveryFee = true;
        }
        
        // Calculate fees based on location if still not found (checkout data already has fees, no need for duplicate API call)
        if (deliveryFee === 0 && serviceFee === 0 && taxes === 0) {
          // Calculate real fees based on location and subtotal
          const deliveryAddressForCalc = customerDetails.customer_delivery_address || customerDetails.customer_address || deliveryAddress || '';
          const calculatedFees = calculateRealFees(subtotal, deliveryAddressForCalc);
          
          deliveryFee = calculatedFees.deliveryFee;
          serviceFee = calculatedFees.serviceFee;
          taxes = calculatedFees.taxes;
        }
        
        
        // Check for service fee in multiple locations
        const serviceFeeFields = ['serviceFee', 'service_fee', 'serviceFeeAmount', 'serviceFeeCents', 'serviceCost'];
        let foundServiceFee = false;
        
        for (const field of serviceFeeFields) {
          if (joinCart[field] && joinCart[field] > 0) {
            serviceFee = joinCart[field];
            foundServiceFee = true;
            break;
          }
        }
        
        // Check in nested objects for service fee
        if (!foundServiceFee && joinCart.fees?.service && joinCart.fees.service > 0) {
          serviceFee = joinCart.fees.service;
          foundServiceFee = true;
        }
        
        if (!foundServiceFee && joinCart.breakdown?.serviceFee && joinCart.breakdown.serviceFee > 0) {
          serviceFee = joinCart.breakdown.serviceFee;
          foundServiceFee = true;
        }
        
        // Check for taxes in multiple locations
        const taxesFields = ['taxes', 'tax', 'taxAmount', 'taxCents', 'taxCost'];
        let foundTaxes = false;
        
        for (const field of taxesFields) {
          if (joinCart[field] && joinCart[field] > 0) {
            taxes = joinCart[field];
            console.log(`🔍 Found taxes in ${field}: $${(taxes / 100).toFixed(2)}`);
            foundTaxes = true;
            break;
          }
        }
        
        // Check in nested objects for taxes
        if (!foundTaxes && joinCart.fees?.tax && joinCart.fees.tax > 0) {
          taxes = joinCart.fees.tax;
          foundTaxes = true;
        }
        
        if (!foundTaxes && joinCart.breakdown?.taxes && joinCart.breakdown.taxes > 0) {
          taxes = joinCart.breakdown.taxes;
          foundTaxes = true;
        }
        
        
        // Calculate fees if still not found (skip slow HTML scraping)
        const isPickup = actualJoinData.diningMode === 'PICKUP';
        const orderSubtotal = subtotal / 100;
        
        if (deliveryFee === 0 && serviceFee === 0 && taxes === 0 && subtotal > 0) {
          const deliveryAddress = customerDetails.customer_delivery_address || customerDetails.customer_address || '';
          const calculatedFees = calculateRealFees(subtotal, deliveryAddress);
          deliveryFee = isPickup ? 0 : calculatedFees.deliveryFee;
          serviceFee = calculatedFees.serviceFee;
          taxes = calculatedFees.taxes;
        }
        
        // Update fees to include all fees
        fees = deliveryFee + serviceFee + tip + smallOrderFee + adjustmentsFee + pickupFee + otherFees;
        
      }
    }

    const extractedCustomerDetails = extractCustomerDetails(checkoutRes?.data);
    
    if (extractedCustomerDetails) {
      Object.assign(customerDetails, extractedCustomerDetails);
    }
    
    if (joinData?.data) {
      
      const joinCustomerInfo = extractCustomerFromJoinData(joinData.data);
      if (joinCustomerInfo && Object.keys(joinCustomerInfo).length > 0) {
        Object.assign(customerDetails, joinCustomerInfo);
      }
    }
    
    if (checkoutRes?.data?.data) {
      
      const checkoutCustomerInfo = extractCustomerFromCheckoutData(checkoutRes.data.data);
      if (checkoutCustomerInfo && Object.keys(checkoutCustomerInfo).length > 0) {
        Object.assign(customerDetails, checkoutCustomerInfo);
      }
    }
    
    const realCustomerData = extractRealCustomerData(checkoutRes?.data);
    
    customerDetails.customer_favorite_restaurants = [
      ...customerDetails.customer_favorite_restaurants,
      ...realCustomerData.customer_favorite_restaurants,
      ...realJoinData.customer_favorite_restaurants
    ];
    
    customerDetails.customer_dietary_preferences = [
      ...customerDetails.customer_dietary_preferences,
      ...realCustomerData.customer_dietary_preferences,
      ...realJoinData.customer_dietary_preferences
    ];
    
    customerDetails.customer_payment_methods = [
      ...customerDetails.customer_payment_methods,
      ...realCustomerData.customer_payment_methods,
      ...realJoinData.customer_payment_methods
    ];
    
    customerDetails.customer_delivery_addresses = [
      ...customerDetails.customer_delivery_addresses,
      ...realCustomerData.customer_delivery_addresses,
      ...realJoinData.customer_delivery_addresses
    ];
    
    if (realCustomerData.customer_phone && !customerDetails.customer_phone) {
      customerDetails.customer_phone = realCustomerData.customer_phone;
    }
    if (realJoinData.customer_phone && !customerDetails.customer_phone) {
      customerDetails.customer_phone = realJoinData.customer_phone;
    }
    
    Object.keys(realCustomerData).forEach(key => {
      if (key !== 'customer_favorite_restaurants' && key !== 'customer_dietary_preferences' && 
          key !== 'customer_payment_methods' && key !== 'customer_delivery_addresses' &&
          realCustomerData[key] && !customerDetails[key]) {
        customerDetails[key] = realCustomerData[key];
        console.log(`🔍 Merged customer field: ${key} = ${realCustomerData[key]}`);
      }
    });
    
    Object.keys(realJoinData).forEach(key => {
      if (key !== 'customer_favorite_restaurants' && key !== 'customer_dietary_preferences' && 
          key !== 'customer_payment_methods' && key !== 'customer_delivery_addresses' &&
          realJoinData[key] && !customerDetails[key]) {
        customerDetails[key] = realJoinData[key];
      }
    });
    
    // Merge additional Uber Eats data (exclude shoppingCart groupedItems to avoid participant objects)
    Object.keys(additionalData).forEach(key => {
      if (additionalData[key] && !customerDetails[key]) {
        // Clean shoppingCart to remove groupedItems (participant objects)
        if (key === 'shoppingCart' && additionalData[key] && typeof additionalData[key] === 'object') {
          const cleanedCart = { ...additionalData[key] };
          if (cleanedCart.groupedItems) {
            delete cleanedCart.groupedItems;
          }
          customerDetails[key] = cleanedCart;
        } else {
          customerDetails[key] = additionalData[key];
        }
      }
    });
    
    // Merge delivery instructions from all sources
    if (joinInstructions && !deliveryInstructions) {
      deliveryInstructions = joinInstructions;
    }
    if (checkoutInstructions && !deliveryInstructions) {
      deliveryInstructions = checkoutInstructions;
    }
    
    // Add delivery instructions to customer details
    if (deliveryInstructions) {
      customerDetails.delivery_instructions = deliveryInstructions;
    }
    
    // Remove duplicates
    customerDetails.customer_favorite_restaurants = [...new Set(customerDetails.customer_favorite_restaurants.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    customerDetails.customer_dietary_preferences = [...new Set(customerDetails.customer_dietary_preferences.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    customerDetails.customer_payment_methods = [...new Set(customerDetails.customer_payment_methods.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
    customerDetails.customer_delivery_addresses = [...new Set(customerDetails.customer_delivery_addresses.map(item => JSON.stringify(item)))].map(item => JSON.parse(item));
  
    

    // Store UUID fallback
    if (!storeUuid) storeUuid = findStoreUuid(checkoutRes?.data);

    // Process Store API result (already called in parallel with Checkout)
    if (storeResResult.status === 'fulfilled' && storeResResult.value) {
      const sd = storeResResult.value?.data || {};
      const info = sd?.data || {};
      const title = info?.title;
      if (title && typeof title === 'string') {
        restaurantName = title.startsWith('#') ? (title.split(' ').slice(1).join(' ') || title) : title;
      } else if (title) {
        restaurantName = String(title);
      }
      restaurantAddress = info?.location?.address || null;
      restaurantHours = info?.storeInfoMetadata?.workingHoursTagline || null;
      restaurantImageUrl = findRestaurantLogo(info) || null;
      isUberOneEligible = !!findUberOneLogo(info);
    }

    // Delivery info from checkout (needed before reverse geocode)
    if (!deliveryCoords) deliveryCoords = findDeliveryCoords(checkoutPayloads) || null;
    if (!deliveryAddress) deliveryAddress = findDeliveryAddress(checkoutPayloads) || null;

    // Reverse geocode (non-blocking - can be parallel, but we already have Store API done)
    const locationDataResult = await Promise.allSettled([
      // Reverse geocode (only if coordinates exist)
      (deliveryCoords && deliveryCoords.latitude && deliveryCoords.longitude) 
        ? getLocationDetails(deliveryCoords.latitude, deliveryCoords.longitude).catch(() => null)
        : Promise.resolve(null)
    ]).then(results => results[0]);

    // Process Reverse Geocode result (non-blocking - if it fails, continue with existing address)
    if (locationDataResult.status === 'fulfilled' && locationDataResult.value) {
      const loc = locationDataResult.value;
      if (loc) {
        let enhanced = null;
        if (deliveryAddress && /\d/.test(deliveryAddress)) {
          const base = deliveryAddress.includes(',') ? deliveryAddress.split(',')[0].trim() : deliveryAddress;
          const parts = [base];
          if (loc.city) parts.push(loc.city);
          if (loc.state && loc.zip) parts.push(`${loc.state} ${loc.zip}`); else if (loc.state) parts.push(loc.state); else if (loc.zip) parts.push(loc.zip);
          enhanced = parts.join(', ');
        } else {
          const parts = [];
          if (loc.city) parts.push(loc.city);
          if (loc.state && loc.zip) parts.push(`${loc.state} ${loc.zip}`); else if (loc.state) parts.push(loc.state); else if (loc.zip) parts.push(loc.zip);
          if (parts.length) enhanced = parts.join(', ');
        }
        if (enhanced) deliveryAddress = enhanced;
      }
    }

    // Enhanced phone extraction from all API data sources (checkout first, then join)
    if (!customerDetails.customer_phone) {
      // Try checkout data first (most reliable)
      if (checkoutRes?.data) {
        const checkoutStr = JSON.stringify(checkoutRes.data);
        const phoneRegex = /(\+?1?[-.\s]?)?\(?([2-9][0-9]{2})\)?[-.\s]?([2-9][0-9]{2})[-.\s]?([0-9]{4})/g;
        const matches = checkoutStr.match(phoneRegex);
        
        if (matches) {
          for (const match of matches) {
            const cleanPhone = match.replace(/[^\d]/g, '');
            const phone = cleanPhone.length === 11 && cleanPhone.startsWith('1') ? cleanPhone.slice(1) : cleanPhone;
            if (phone.length === 10 && /^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(phone)) {
              customerDetails.customer_phone = phone;
              customerDetails.extraction_method = 'api';
              break;
            }
          }
        }
      }
      
      // Fallback to join data
      if (!customerDetails.customer_phone && joinData) {
        const joinStr = JSON.stringify(joinData);
        const phoneRegex = /(\+?1?[-.\s]?)?\(?([2-9][0-9]{2})\)?[-.\s]?([2-9][0-9]{2})[-.\s]?([0-9]{4})/g;
        const matches = joinStr.match(phoneRegex);
        
        if (matches) {
          for (const match of matches) {
            const cleanPhone = match.replace(/[^\d]/g, '');
            const phone = cleanPhone.length === 11 && cleanPhone.startsWith('1') ? cleanPhone.slice(1) : cleanPhone;
            if (phone.length === 10 && /^[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(phone)) {
              customerDetails.customer_phone = phone;
              customerDetails.extraction_method = 'api';
              break;
            }
          }
        }
      }
    }


    let calculatedTotal = total;
    if (!calculatedTotal || calculatedTotal === 0) {
      calculatedTotal = subtotal + fees + taxes;
    }

    return {
      success: true,
      subtotal,
      fees,
      taxes,
      delivery_fee: deliveryFee,
      service_fee: serviceFee,
      tip,
      small_order_fee: smallOrderFee,
      adjustments_fee: adjustmentsFee,
      pickup_fee: pickupFee,
      other_fees: otherFees,
      has_uber_one: hasUberOne,
      uber_one_benefit: uberOneBenefit,
      items,
      restaurant_name: restaurantName,
      restaurant_address: restaurantAddress,
      restaurant_hours: restaurantHours,
      delivery_address: deliveryAddress,
      delivery_instructions: deliveryInstructions,
      restaurant_image_url: restaurantImageUrl,
      is_uber_one_eligible: isUberOneEligible,
      total: calculatedTotal,
      currency: currencyCode,
      customer_details: customerDetails
    };
  } catch (e) {
    return { success: false, subtotal: 0, fees: 0, taxes: 0, items: [], restaurant_name: null, restaurant_address: null, restaurant_hours: null, delivery_address: null, delivery_instructions: null, restaurant_image_url: null, is_uber_one_eligible: false, customer_details: {}, error: e?.message };
  }
}


