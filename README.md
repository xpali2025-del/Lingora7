# Lingora.world — المشروع الكامل

موقع بيع روابط تفعيل Duolingo Super بالدفع بـ USDT (BEP20)، مع كشف الدفع تلقائيًا، وتسليم الرابط بالبريد، ولوحة إدارة، ومراجعات مشترين موثّقين، ومحتوى SEO جاهز.

## المكوّنات

| المسار | الوظيفة |
|---|---|
| `apps/web` | موقع Next.js 15: صفحات الأسواق (SSG)، الدفع (`/order/`)، API، لوحة الإدارة (`/admin/`) |
| `apps/worker` | عامل خلفية: يراقب الإيداعات (Binance أو BSC)، ينهي الطلبات، يرسل البريد، ينبّه المالك. **نسخة واحدة فقط** |
| `packages/shared` | قلب التجارة: حالات الطلب، المطابقة، توزيع الروابط، التشفير، TOTP، الأدوار، المزوّدات |
| `packages/seo-core` | hreflang، JSON-LD، فحص التشابه، سجل الحقائق |
| `content/` | صفحات Markdown (ar/en): الأسواق، التفعيل، السعر، من نحن، السياسات |
| `db/` | الهجرات والبيانات الأولية (19 سوقًا، الموجة الأولى مفعّلة) |
| `docs/` | استراتيجية السيو |

## التشغيل المحلي (بدون تثبيت Postgres)

```bash
npm install
cp .env.example .env     # املأ MASTER_ENCRYPTION_KEY (أمر التوليد داخل الملف)
npm run dev:db &         # قاعدة PGlite مدمجة على المنفذ 5433
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres DB_POOL_MAX=1 DB_IDLE_MS=100 INSECURE_COOKIES=1
npm run db:migrate
ADMIN_PASSWORD='كلمة-سر-طويلة-12+' npm run db:seed-admin -- --username nasim   # يطبع سر 2FA مرة واحدة
npm run web:dev          # الموقع http://localhost:3000  ·  الإدارة /admin/
npm run worker:start     # في نافذة أخرى
```

اختبار الدفع التجريبي: في لوحة الإدارة › Payment settings فعّل مزوّد `mock` وضع أي عنوان `0x…` ثم Enable. أنشئ طلبًا من صفحة سوق، ثم:
`npm run sim:deposit -- --ref LG-XXXXXXXX` — خلال ثوانٍ يصبح الطلب «awaiting_email».

## الإنتاج

1. PostgreSQL حقيقي (`docker compose up -d db` أو خدمة مُدارة) ثم `DATABASE_URL`.
2. `cp .env.example .env` واملأه. **انسخ `MASTER_ENCRYPTION_KEY` احتياطيًا في مكان منفصل عن القاعدة**: بدونه لا يمكن فك البريد والروابط.
3. `npm run db:migrate` ثم أنشئ المالك (`db:seed-admin`).
4. `docker compose up -d --build` (أو شغّل `web:build && web:start` و`worker:start` بمدير عمليات). العامل من **IP ثابت** يُسمح له في مفتاح Binance.
5. من لوحة الإدارة: Payment settings ← عنوان المحفظة، مفتاح Binance للقراءة فقط (بدون صلاحية سحب)، **Test connection**، ثم Enable. استورد الروابط من Codes. اختر `fulfilment_mode` (يدوي أو تلقائي).
6. بوّابة النشر: `npm run check` (الاختبارات + فحص المحتوى والتشابه)، ثم بعد تشغيل الموقع: `SITE_URL=https://yourdomain npm run seo:check -- http://localhost:3000` — يفحص الـHTML المُصيَّر فعليًا (lang/dir، canonical، hreflang المتبادل، الروابط الداخلية المكسورة، ≥3 روابط داخلة لكل صفحة، JSON-LD، 404، robots).
7. **خلف بروكسي/Cloudflare**: اضبط `CLIENT_IP_HEADER` (مثل `cf-connecting-ip`) أو `TRUSTED_PROXY_HOPS`، وإلا تُرفض الطلبات الحساسة (حدود المعدل تعتمد على عنوان IP). و`SITE_URL` يُقرأ أيضًا أثناء **البناء**.

## قرارات تصميم مهمة

- **السعر دائمًا من قاعدة البيانات**؛ العميل يرسل رمز السوق فقط.
- **مبلغ فريد لكل طلب** (السعر + 0.0001…0.0099) ويُطابَق بالمبلغ؛ مهلة الطلب 30 دقيقة؛ الدفع المتأخر أو الخاطئ يذهب لطابور «غير مطابق» ولا يُعتمد تلقائيًا.
- **idempotency**: `payments.tx_hash` فريد، وتوزيع الرابط بـ `FOR UPDATE SKIP LOCKED`، وكل انتقال حالة compare-and-set.
- **التشفير**: AES-256-GCM للبريد والروابط وأسرار المزوّد؛ الأسرار write-only في الإدارة؛ تغيير المحفظة يطلب رمز 2FA جديدًا ويُسجَّل.
- **المراجعات** من مشترين موثّقين فقط عبر رابط خاص؛ لا توجد وظيفة لإنشاء مراجعة من الإدارة؛ لا يوجد AggregateRating في الـ markup.
- مفتاح الطلب في **fragment** الرابط (`#k=`) فلا يصل للخوادم أو السجلات.
- صفحات المسودة (`DRAFT` أو فيها متغيرات غير محلولة) تحمل noindex وتُستثنى من sitemap.

## ما لم يُتحقق منه (يجب فعله قبل الإطلاق)

1. **Binance**: سلوك التحويلات الداخلية (Binance Pay/Internal) في `deposit/hisrec` لم يُختبر بمفتاح حقيقي. جرّبه على staging بمبلغ صغير، أو استخدم الاستراتيجية B (BSC عبر RPC).
2. **عقد USDT على BSC**: ضع العنوان بنفسك بعد التحقق منه من bscscan.com قبل التفعيل.
3. **التزامن على Postgres حقيقي**: الاختبارات على PGlite (تسلسلية). الحماية قائمة (`SKIP LOCKED` + فهارس فريدة) لكن اختبر حِملًا متوازيًا على Postgres.
4. **ترجمات البريد** لغير العربية والإنجليزية (id, tr, bn, de, fr, es) مسودات تحتاج مراجعة ناطق أصلي.
5. **النصوص القانونية** (الاسترجاع، الخصوصية، إخلاء المسؤولية) تحتاج مراجعة قانونية. أضف بيانات الاتصال والكيان القانوني في صفحتي «من نحن» (تعليق HTML مكانها).
6. **Dockerfile/compose** لم يُبنيا في هذه البيئة (لا Docker)؛ جرّبهما.
7. مزوّدا PayPal/Payoneer: الواجهة جاهزة في `providers/` لكن لا محوّلات بعد.
8. أرقام السيو (حجم البحث، الترتيب) تحتاج Search Console وأدوات الكلمات بعد النشر.

## بعد النشر: الفهرسة (P1-17)

1. Search Console: أضف النطاق (DNS) ثم قدّم `https://yourdomain/sitemap.xml`، وافحص `/ar-eg/` و`/en/` بأداة URL Inspection.
2. Bing Webmaster Tools: استورد الموقع من Search Console وقدّم الـsitemap.
3. IndexNow: عيّن `INDEXNOW_KEY` على الخادم ثم `npm run indexnow` بعد كل نشر (جوجل لا يدعمه).
4. السعر والمراجعات في صفحات الأسواق تأتي من قاعدة البيانات (ISR كل 5 دقائق + تحديث فوري عند تغييرها من الإدارة)؛ `npm run content:check` يمنع تباعد سعر الـMarkdown عن `db/seed.sql`.
