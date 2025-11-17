import axios from 'axios';
import { JSDOM } from 'jsdom';


export async function extractPhoneWithJSDOM(groupOrderUrl) {
  try {
    console.log('🌐 Starting JSDOM phone extraction...');
    
    const response = await axios.get(groupOrderUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    });
    
    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    const phones = [];
    const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    
    // Search in text content
    const textContent = document.body.textContent;
    const textMatches = textContent.match(phoneRegex);
    
    if (textMatches) {
      textMatches.forEach(match => {
        const cleanPhone = match.replace(/[^\d]/g, '');
        if (cleanPhone.length === 10 || cleanPhone.length === 11) {
          phones.push({
            raw: match,
            cleaned: cleanPhone,
            source: 'jsdom_text'
          });
        }
      });
    }
    
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      Array.from(element.attributes).forEach(attr => {
        if (attr.value && phoneRegex.test(attr.value)) {
          const matches = attr.value.match(phoneRegex);
          matches.forEach(match => {
            const cleanPhone = match.replace(/[^\d]/g, '');
            if (cleanPhone.length === 10 || cleanPhone.length === 11) {
              phones.push({
                raw: match,
                cleaned: cleanPhone,
                source: `jsdom_attr_${attr.name}`
              });
            }
          });
        }
      });
      
      if (element.innerHTML && phoneRegex.test(element.innerHTML)) {
        const matches = element.innerHTML.match(phoneRegex);
        matches.forEach(match => {
          const cleanPhone = match.replace(/[^\d]/g, '');
          if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            phones.push({
              raw: match,
              cleaned: cleanPhone,
              source: 'jsdom_innerHTML'
            });
          }
        });
      }
    });
    
    console.log(`📞 JSDOM found ${phones.length} phone numbers`);
    return {
      success: true,
      phoneNumbers: phones,
      method: 'jsdom'
    };
    
  } catch (error) {
    console.error('❌ JSDOM extraction failed:', error.message);
    return {
      success: false,
      error: error.message,
      method: 'jsdom'
    };
  }
}

