# مصادر Duolingo الرسمية لملء السجل

وجدتها عبر البحث في 14 أكتوبر 2026، **ولم أستطع قراءة نصها** (تُرسم بجافاسكربت، والجلب أعاد بيانات وصفية فقط). انسخ القيم منها يدويًا ثم ضعها في `registry.json` مع رابط المصدر وتاريخ اليوم.

| لملء المفاتيح | الصفحة الرسمية |
|---|---|
| step_web_*, step_mobile_*, account_eligibility, error_*_* | https://www.duolingo.com/help/use-a-promo-code |
| step_web_* (صفحة التفعيل نفسها) | https://www.duolingo.com/redeem |
| free_*, super_*, auto_renew, progress_on_upgrade, super_languages | https://www.duolingo.com/help/super-duolingo |
| official_price_*, official_payment_methods | https://www.duolingo.com/super (تعرض الأسعار حسب منطقتك) |
| uk_refund_policy (سياسة Duolingo نفسها للمقارنة) | https://www.duolingo.com/help/how-do-I-request-a-refund |

## صيغة الإدخال

```json
{ "key": "auto_renew", "market": "ar", "value": "...",
  "source_url": "https://www.duolingo.com/help/super-duolingo",
  "verified_at": "2026-10-14", "expires_at": "2027-01-14" }
```

اقتراح لتاريخ الانتهاء: 90 يومًا للمزايا والأسعار، و30 يومًا للأسعار المتغيرة.
