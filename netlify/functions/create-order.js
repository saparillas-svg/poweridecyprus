// Netlify Function: create-order
// Verifies cart items/prices against the site's own products.json (never trusts
// prices sent from the browser), then creates a Viva Wallet Smart Checkout
// payment order and returns the checkout URL to redirect the customer to.
//
// Required environment variables (set in Netlify dashboard → Site settings →
// Environment variables):
//   VIVA_CLIENT_ID      - Smart Checkout API client ID from Viva
//   VIVA_CLIENT_SECRET   - Smart Checkout API client secret from Viva
//   VIVA_ENV             - "demo" while testing, "live" when ready to go live
//   VIVA_SOURCE_CODE     - (optional) your Viva payment source code, defaults to "Default"
//   SITE_URL             - (optional) overrides the base URL used for products.json
//                           and the success/cancel redirect URLs

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const customer = body.customer || {};
  if (items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
  }

  const siteUrl = process.env.SITE_URL || process.env.URL || 'https://poweridecyprus.com';
  const isDemo = (process.env.VIVA_ENV || 'demo') !== 'live';
  const clientId = process.env.VIVA_CLIENT_ID;
  const clientSecret = process.env.VIVA_CLIENT_SECRET;
  const sourceCode = process.env.VIVA_SOURCE_CODE || 'Default';

  if (!clientId || !clientSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Payments are not configured yet. Please order via WhatsApp.' }) };
  }

  // 1. Load the canonical product list generated at build time and verify
  //    every cart item + price server-side (never trust the client).
  let products;
  try {
    const productsRes = await fetch(siteUrl.replace(/\/$/, '') + '/products.json');
    if (!productsRes.ok) throw new Error('products.json fetch failed');
    products = await productsRes.json();
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not verify product catalog' }) };
  }

  let totalCents = 0;
  const lineDescriptions = [];
  for (const item of items) {
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    const product = products.find(p => p.id === item.id);
    if (!product) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown product in cart: ' + item.id }) };
    }
    if (product.availability === 'Out of Stock' || product.availability === 'Coming Soon') {
      return { statusCode: 400, body: JSON.stringify({ error: product.title + ' is not currently available for purchase' }) };
    }
    const priceEuros = parseInt(String(product.price).replace(/[^\d]/g, ''), 10) || 0;
    totalCents += priceEuros * 100 * qty;
    lineDescriptions.push(product.title + ' x' + qty);
  }

  if (totalCents <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid order total' }) };
  }

  const tokenUrl = isDemo
    ? 'https://demo-accounts.vivapayments.com/connect/token'
    : 'https://accounts.vivapayments.com/connect/token';
  const ordersUrl = isDemo
    ? 'https://demo-api.vivapayments.com/checkout/v2/orders'
    : 'https://api.vivapayments.com/checkout/v2/orders';
  const checkoutBaseUrl = isDemo
    ? 'https://demo.vivapayments.com/web/checkout'
    : 'https://www.vivapayments.com/web/checkout';

  try {
    // 2. OAuth2 client-credentials token
    const basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error('Viva auth failed: ' + errText);
    }
    const tokenData = await tokenRes.json();

    // 3. Create the payment order
    const orderRes = await fetch(ordersUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + tokenData.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: totalCents,
        customerTrns: lineDescriptions.join(', '),
        merchantTrns: 'poweridecyprus.com order',
        sourceCode: sourceCode,
        paymentTimeout: 1800,
        customer: {
          email: customer.email || undefined,
          fullName: customer.fullName || undefined,
          phone: customer.phone || undefined,
          countryCode: 'CY',
          requestLang: 'en-US'
        }
      })
    });
    if (!orderRes.ok) {
      const errText = await orderRes.text();
      throw new Error('Viva order creation failed: ' + errText);
    }
    const orderData = await orderRes.json();
    if (!orderData.orderCode) {
      throw new Error('Viva did not return an order code');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        checkoutUrl: checkoutBaseUrl + '?ref=' + orderData.orderCode,
        orderCode: orderData.orderCode
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Payment setup failed' }) };
  }
};
