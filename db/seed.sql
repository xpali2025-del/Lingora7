-- Idempotent seed: markets, settings, provider rows. Prices are editable in the admin (13 USDT arab tier, 15 USDT others).
INSERT INTO markets (code, country_code, locale, language, tier, price_usdt, enabled, status) VALUES
 ('en',    NULL, 'en',    'en', 'intl', 15, TRUE,  'live'),
 ('ar',    NULL, 'ar',    'ar', 'arab', 13, FALSE, 'draft'),   -- no landing page yet: keep draft until one exists
 ('ar-eg', 'EG', 'ar-EG', 'ar', 'arab', 13, TRUE,  'live'),
 ('ar-sa', 'SA', 'ar-SA', 'ar', 'arab', 13, TRUE,  'live'),
 ('ar-ae', 'AE', 'ar-AE', 'ar', 'arab', 13, TRUE,  'live'),
 ('ye',    'YE', 'ar-YE', 'ar', 'arab', 13, TRUE,  'live'),   -- price follows the Arab tier; change it in the admin if you want a different one
 ('ar-qa', 'QA', 'ar-QA', 'ar', 'arab', 13, FALSE, 'draft'),
 ('en-gb', 'GB', 'en-GB', 'en', 'intl', 15, TRUE,  'live'),
 ('hi',    'IN', 'hi-IN', 'hi', 'intl', 15, TRUE,  'live'),
 ('fr',    NULL, 'fr',    'fr', 'intl', 15, TRUE,  'live'),
 ('zh',    NULL, 'zh-Hans', 'zh', 'intl', 15, TRUE, 'live'),
 ('ar-ma', 'MA', 'ar-MA', 'ar', 'arab', 13, FALSE, 'draft'),
 ('id-id', 'ID', 'id-ID', 'id', 'intl', 15, FALSE, 'draft'),
 ('tr-tr', 'TR', 'tr-TR', 'tr', 'intl', 15, FALSE, 'draft'),
 ('en-ke', 'KE', 'en-KE', 'en', 'intl', 15, FALSE, 'draft'),
 ('en-za', 'ZA', 'en-ZA', 'en', 'intl', 15, FALSE, 'draft'),
 ('bn-bd', 'BD', 'bn-BD', 'bn', 'intl', 15, FALSE, 'draft'),
 ('en-gh', 'GH', 'en-GH', 'en', 'intl', 15, FALSE, 'draft'),
 ('de-de', 'DE', 'de-DE', 'de', 'intl', 15, FALSE, 'draft'),
 ('fr-fr', 'FR', 'fr-FR', 'fr', 'intl', 15, FALSE, 'draft'),
 ('es-es', 'ES', 'es-ES', 'es', 'intl', 15, FALSE, 'draft'),
 ('en-ca', 'CA', 'en-CA', 'en', 'intl', 15, FALSE, 'draft'),
 ('en-au', 'AU', 'en-AU', 'en', 'intl', 15, FALSE, 'draft')
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value) VALUES
 ('fulfilment_mode',      '"manual"'),
 ('order_expiry_minutes', '30'),
 ('unique_decimal_min',   '"0.0001"'),
 ('unique_decimal_max',   '"0.0099"'),
 ('low_stock_threshold',  '5'),
 ('review_invite_days',   '3'),
 ('overpay_policy',       '"accept"'),
 ('block_orders_when_out_of_stock', 'true')
ON CONFLICT (key) DO NOTHING;

INSERT INTO payment_providers (type, enabled) VALUES
 ('binance_bep20', FALSE), ('paypal', FALSE), ('payoneer', FALSE), ('mock', FALSE), ('balance', TRUE)   -- 'balance' = pay from the customer wallet (internal, always on)
ON CONFLICT (type) DO NOTHING;

-- Binance USDT is offered on every enabled market by default; turn it off per country in the admin where counsel advises.
INSERT INTO market_payment_methods (market_id, provider_id, enabled, sort)
SELECT m.id, p.id, TRUE, 0 FROM markets m, payment_providers p WHERE p.type IN ('binance_bep20','mock')
ON CONFLICT DO NOTHING;
