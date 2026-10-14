// Localised transactional email templates: ar, en, id, tr, bn, de, fr, es, hi, zh.
// No tracking pixels, no remote images. Every string can be overridden from the admin (settings key email_template:<template>:<lang>).
// ar/en are the reviewed baseline; the other languages are drafts to be checked by a native editor (plan section 15).
export const RTL = new Set(['ar']);
export const LANGS = ['ar', 'en', 'id', 'tr', 'bn', 'de', 'fr', 'es', 'hi', 'zh'];

const S = {
  en: {
    code_delivered: { subject: 'Your Duolingo Super link - order {ref}', intro: 'Thank you for your order. Your 12-month Duolingo Super redeem link is ready.',
      linkLabel: 'Your redeem link', stepsTitle: 'How to activate',
      steps: ['Open the link in a web browser (computer, tablet or phone).', 'Sign in to your Duolingo account, or create one.', 'Follow the on-screen steps to start Super.'],
      note: 'Duolingo states that a code cannot be used on an active Super subscription, and that all subscriptions auto-renew unless cancelled.',
      support: 'Need help? Reply to this email with your order reference.', order: 'Order reference' },
    review_invitation: { subject: 'How was your Lingora order {ref}?', intro: 'We hope Super is working well. If you have a minute, a short honest review helps other learners.', button: 'Write a review', optout: 'This is the only review invitation we will send.' },
    order_received: { subject: 'We received your payment - order {ref}', intro: 'Your payment was confirmed. Please enter your email on the order page so we can send your link.' },
    refund_approved: { subject: 'Your refund was approved - order {ref}', intro: 'We approved your refund request. We will send it in USDT (BEP20) to the address you provide.' },
    refund_rejected: { subject: 'About your refund request - order {ref}', intro: 'We reviewed your request and could not approve a refund. Reply to this email if you think we missed something.' },
  },
  ar: {
    code_delivered: { subject: 'رابط دولينجو سوبر الخاص بك - الطلب {ref}', intro: 'شكرًا لطلبك. رابط تفعيل دولينجو سوبر لمدة 12 شهرًا جاهز.',
      linkLabel: 'رابط التفعيل', stepsTitle: 'طريقة التفعيل',
      steps: ['افتح الرابط من متصفح ويب (حاسوب أو تابلت أو هاتف).', 'سجّل الدخول إلى حسابك في دولينجو أو أنشئ حسابًا.', 'اتبع الخطوات على الشاشة لبدء سوبر.'],
      note: 'بحسب Duolingo لا يمكن استخدام الرمز على اشتراك سوبر نشط، وجميع الاشتراكات تتجدد تلقائيًا ما لم تُلغَ.',
      support: 'تحتاج مساعدة؟ ردّ على هذه الرسالة مع رقم طلبك.', order: 'رقم الطلب' },
    review_invitation: { subject: 'كيف كان طلبك من Lingora رقم {ref}؟', intro: 'نأمل أن يعمل سوبر جيدًا معك. إن كان لديك دقيقة، فمراجعة قصيرة وصادقة تفيد متعلمين آخرين.', button: 'اكتب مراجعة', optout: 'هذه هي دعوة المراجعة الوحيدة التي سنرسلها.' },
    order_received: { subject: 'استلمنا دفعتك - الطلب {ref}', intro: 'تم تأكيد دفعتك. أدخل بريدك الإلكتروني في صفحة الطلب لنرسل لك الرابط.' },
    refund_approved: { subject: 'تمت الموافقة على استرجاعك - الطلب {ref}', intro: 'وافقنا على طلب الاسترجاع. سنرسل المبلغ بعملة USDT على شبكة BEP20 إلى العنوان الذي تزودنا به.' },
    refund_rejected: { subject: 'بخصوص طلب الاسترجاع - الطلب {ref}', intro: 'راجعنا طلبك ولم نتمكن من الموافقة على الاسترجاع. ردّ على هذه الرسالة إن رأيت أن شيئًا فاتنا.' },
  },
  id: {
    code_delivered: { subject: 'Tautan Duolingo Super Anda - pesanan {ref}', intro: 'Terima kasih atas pesanan Anda. Tautan penukaran Duolingo Super 12 bulan sudah siap.',
      linkLabel: 'Tautan penukaran', stepsTitle: 'Cara mengaktifkan',
      steps: ['Buka tautan di peramban web (komputer, tablet, atau ponsel).', 'Masuk ke akun Duolingo Anda, atau buat akun baru.', 'Ikuti langkah di layar untuk memulai Super.'],
      note: 'Duolingo menyatakan kode tidak dapat dipakai pada langganan Super yang aktif, dan semua langganan diperpanjang otomatis kecuali dibatalkan.',
      support: 'Butuh bantuan? Balas email ini dengan nomor pesanan Anda.', order: 'Nomor pesanan' },
    review_invitation: { subject: 'Bagaimana pesanan Lingora {ref} Anda?', intro: 'Semoga Super berjalan baik. Jika ada waktu, ulasan singkat yang jujur membantu pelajar lain.', button: 'Tulis ulasan', optout: 'Ini satu-satunya undangan ulasan yang kami kirim.' },
    order_received: { subject: 'Pembayaran diterima - pesanan {ref}', intro: 'Pembayaran Anda dikonfirmasi. Masukkan email Anda di halaman pesanan agar kami dapat mengirim tautan.' },
    refund_approved: { subject: 'Pengembalian dana disetujui - pesanan {ref}', intro: 'Kami menyetujui permintaan pengembalian dana. Dana dikirim dalam USDT (BEP20) ke alamat yang Anda berikan.' },
    refund_rejected: { subject: 'Tentang permintaan pengembalian dana - pesanan {ref}', intro: 'Kami telah meninjau permintaan Anda dan tidak dapat menyetujuinya. Balas email ini jika ada yang terlewat.' },
  },
  tr: {
    code_delivered: { subject: 'Duolingo Super bağlantınız - sipariş {ref}', intro: 'Siparişiniz için teşekkürler. 12 aylık Duolingo Super kullanım bağlantınız hazır.',
      linkLabel: 'Kullanım bağlantısı', stepsTitle: 'Nasıl etkinleştirilir',
      steps: ['Bağlantıyı bir web tarayıcısında açın (bilgisayar, tablet veya telefon).', 'Duolingo hesabınıza giriş yapın veya yeni bir hesap oluşturun.', 'Super\'i başlatmak için ekrandaki adımları izleyin.'],
      note: 'Duolingo, kodun etkin bir Super aboneliğinde kullanılamayacağını ve tüm aboneliklerin iptal edilmedikçe otomatik yenilendiğini belirtir.',
      support: 'Yardım mı gerekiyor? Sipariş numaranızla bu e-postayı yanıtlayın.', order: 'Sipariş numarası' },
    review_invitation: { subject: 'Lingora siparişiniz {ref} nasıldı?', intro: 'Super\'in iyi çalıştığını umuyoruz. Vaktiniz varsa kısa ve dürüst bir yorum diğer öğrencilere yardımcı olur.', button: 'Yorum yaz', optout: 'Göndereceğimiz tek yorum davetidir.' },
    order_received: { subject: 'Ödemeniz alındı - sipariş {ref}', intro: 'Ödemeniz onaylandı. Bağlantıyı gönderebilmemiz için sipariş sayfasına e-postanızı girin.' },
    refund_approved: { subject: 'İade talebiniz onaylandı - sipariş {ref}', intro: 'İade talebinizi onayladık. Tutar, verdiğiniz adrese USDT (BEP20) olarak gönderilecek.' },
    refund_rejected: { subject: 'İade talebiniz hakkında - sipariş {ref}', intro: 'Talebinizi inceledik ve iadeyi onaylayamadık. Gözden kaçırdığımız bir şey varsa bu e-postayı yanıtlayın.' },
  },
  bn: {
    code_delivered: { subject: 'আপনার Duolingo Super লিংক - অর্ডার {ref}', intro: 'অর্ডারের জন্য ধন্যবাদ। আপনার ১২ মাসের Duolingo Super রিডিম লিংক প্রস্তুত।',
      linkLabel: 'রিডিম লিংক', stepsTitle: 'সক্রিয় করার নিয়ম',
      steps: ['লিংকটি একটি ওয়েব ব্রাউজারে খুলুন (কম্পিউটার, ট্যাবলেট বা ফোন)।', 'আপনার Duolingo অ্যাকাউন্টে সাইন ইন করুন বা নতুন অ্যাকাউন্ট খুলুন।', 'Super শুরু করতে পর্দার ধাপগুলো অনুসরণ করুন।'],
      note: 'Duolingo জানায়, সক্রিয় Super সাবস্ক্রিপশনে কোড ব্যবহার করা যায় না এবং বাতিল না করলে সব সাবস্ক্রিপশন স্বয়ংক্রিয়ভাবে নবায়ন হয়।',
      support: 'সাহায্য লাগবে? অর্ডার নম্বরসহ এই ইমেইলের উত্তর দিন।', order: 'অর্ডার নম্বর' },
    review_invitation: { subject: 'আপনার Lingora অর্ডার {ref} কেমন ছিল?', intro: 'আশা করি Super ভালো চলছে। সময় থাকলে একটি সংক্ষিপ্ত সৎ রিভিউ অন্য শিক্ষার্থীদের সাহায্য করবে।', button: 'রিভিউ লিখুন', optout: 'এটিই আমাদের পাঠানো একমাত্র রিভিউ আমন্ত্রণ।' },
    order_received: { subject: 'আপনার পেমেন্ট পেয়েছি - অর্ডার {ref}', intro: 'পেমেন্ট নিশ্চিত হয়েছে। লিংক পাঠাতে অর্ডার পেজে আপনার ইমেইল দিন।' },
    refund_approved: { subject: 'রিফান্ড অনুমোদিত - অর্ডার {ref}', intro: 'আমরা আপনার রিফান্ড অনুরোধ অনুমোদন করেছি। আপনার দেওয়া ঠিকানায় USDT (BEP20) পাঠানো হবে।' },
    refund_rejected: { subject: 'রিফান্ড অনুরোধ সম্পর্কে - অর্ডার {ref}', intro: 'আমরা অনুরোধটি পর্যালোচনা করেছি, রিফান্ড অনুমোদন করতে পারিনি। কিছু বাদ পড়লে এই ইমেইলের উত্তর দিন।' },
  },
  de: {
    code_delivered: { subject: 'Ihr Duolingo-Super-Link - Bestellung {ref}', intro: 'Danke für Ihre Bestellung. Ihr Einlöse-Link für 12 Monate Duolingo Super ist bereit.',
      linkLabel: 'Ihr Einlöse-Link', stepsTitle: 'So aktivieren Sie ihn',
      steps: ['Öffnen Sie den Link in einem Webbrowser (Computer, Tablet oder Handy).', 'Melden Sie sich bei Duolingo an oder erstellen Sie ein Konto.', 'Folgen Sie den Schritten auf dem Bildschirm, um Super zu starten.'],
      note: 'Duolingo gibt an, dass ein Code nicht auf ein aktives Super-Abo angewendet werden kann und alle Abos automatisch verlängert werden, sofern sie nicht gekündigt werden.',
      support: 'Brauchen Sie Hilfe? Antworten Sie auf diese E-Mail mit Ihrer Bestellnummer.', order: 'Bestellnummer' },
    review_invitation: { subject: 'Wie war Ihre Lingora-Bestellung {ref}?', intro: 'Wir hoffen, Super funktioniert gut. Eine kurze, ehrliche Bewertung hilft anderen Lernenden.', button: 'Bewertung schreiben', optout: 'Dies ist die einzige Bewertungseinladung, die wir senden.' },
    order_received: { subject: 'Zahlung erhalten - Bestellung {ref}', intro: 'Ihre Zahlung wurde bestätigt. Bitte geben Sie auf der Bestellseite Ihre E-Mail ein, damit wir den Link senden können.' },
    refund_approved: { subject: 'Rückerstattung genehmigt - Bestellung {ref}', intro: 'Wir haben Ihre Rückerstattung genehmigt. Sie erfolgt in USDT (BEP20) an die von Ihnen angegebene Adresse.' },
    refund_rejected: { subject: 'Zu Ihrer Rückerstattungsanfrage - Bestellung {ref}', intro: 'Wir haben Ihre Anfrage geprüft und konnten sie nicht genehmigen. Antworten Sie, falls wir etwas übersehen haben.' },
  },
  fr: {
    code_delivered: { subject: 'Votre lien Duolingo Super - commande {ref}', intro: 'Merci pour votre commande. Votre lien d\'activation Duolingo Super de 12 mois est prêt.',
      linkLabel: 'Votre lien d\'activation', stepsTitle: 'Comment l\'activer',
      steps: ['Ouvrez le lien dans un navigateur web (ordinateur, tablette ou téléphone).', 'Connectez-vous à votre compte Duolingo ou créez-en un.', 'Suivez les étapes à l\'écran pour démarrer Super.'],
      note: 'Duolingo indique qu\'un code ne peut pas être utilisé sur un abonnement Super actif et que tous les abonnements se renouvellent automatiquement sauf résiliation.',
      support: 'Besoin d\'aide ? Répondez à cet e-mail avec votre numéro de commande.', order: 'Numéro de commande' },
    review_invitation: { subject: 'Comment s\'est passée votre commande Lingora {ref} ?', intro: 'Nous espérons que Super fonctionne bien. Un avis court et honnête aide les autres apprenants.', button: 'Écrire un avis', optout: 'C\'est la seule invitation à laisser un avis que nous enverrons.' },
    order_received: { subject: 'Paiement reçu - commande {ref}', intro: 'Votre paiement est confirmé. Saisissez votre e-mail sur la page de commande pour que nous envoyions le lien.' },
    refund_approved: { subject: 'Remboursement approuvé - commande {ref}', intro: 'Nous avons approuvé votre demande. Le remboursement sera envoyé en USDT (BEP20) à l\'adresse que vous indiquerez.' },
    refund_rejected: { subject: 'À propos de votre demande de remboursement - commande {ref}', intro: 'Nous avons examiné votre demande et n\'avons pas pu l\'approuver. Répondez à cet e-mail si nous avons oublié quelque chose.' },
  },
  hi: {
    code_delivered: { subject: 'आपका Duolingo Super लिंक - ऑर्डर {ref}', intro: 'आपके ऑर्डर के लिए धन्यवाद। आपका 12 महीने का Duolingo Super रिडीम लिंक तैयार है।',
      linkLabel: 'आपका रिडीम लिंक', stepsTitle: 'एक्टिवेट कैसे करें',
      steps: ['लिंक को वेब ब्राउज़र में खोलें (कंप्यूटर, टैबलेट या फ़ोन)।', 'अपने Duolingo अकाउंट में साइन इन करें, या नया बनाएँ।', 'स्क्रीन पर दिए कदमों से Super शुरू करें।'],
      note: 'Duolingo के अनुसार सक्रिय Super सब्सक्रिप्शन पर कोड इस्तेमाल नहीं हो सकता, और सभी सब्सक्रिप्शन रद्द न करने पर अपने आप रिन्यू होते हैं।',
      support: 'मदद चाहिए? इस ईमेल का जवाब ऑर्डर नंबर के साथ दें।', order: 'ऑर्डर नंबर' },
    review_invitation: { subject: 'आपका Lingora ऑर्डर {ref} कैसा रहा?', intro: 'हमें उम्मीद है कि Super अच्छा चल रहा है। एक छोटी, ईमानदार समीक्षा दूसरे सीखने वालों के काम आती है।', button: 'समीक्षा लिखें', optout: 'हम केवल यही एक समीक्षा-निमंत्रण भेजते हैं।' },
    order_received: { subject: 'हमें आपका भुगतान मिल गया - ऑर्डर {ref}', intro: 'आपके भुगतान की पुष्टि हो गई। लिंक भेजने के लिए ऑर्डर पेज पर अपना ईमेल लिखें।' },
    refund_approved: { subject: 'आपका रिफंड मंज़ूर हुआ - ऑर्डर {ref}', intro: 'हमने आपका रिफंड अनुरोध मंज़ूर कर लिया है। रकम आपके बताए पते पर USDT (BEP20) में भेजी जाएगी।' },
    refund_rejected: { subject: 'आपके रिफंड अनुरोध के बारे में - ऑर्डर {ref}', intro: 'हमने आपका अनुरोध जाँचा और रिफंड मंज़ूर नहीं कर सके। अगर आपको लगता है कि हमसे कुछ छूटा है तो इस ईमेल का जवाब दें।' },
  },
  zh: {
    code_delivered: { subject: '您的 Duolingo Super 链接 - 订单 {ref}', intro: '感谢您的订单。您的 12 个月 Duolingo Super 兑换链接已准备好。',
      linkLabel: '您的兑换链接', stepsTitle: '激活方法',
      steps: ['在网页浏览器中打开链接（电脑、平板或手机均可）。', '登录您的 Duolingo 账号，或新建一个账号。', '按屏幕提示完成步骤，即可开始使用 Super。'],
      note: '据 Duolingo 说明，兑换码不能用于仍在有效期内的 Super 订阅，且所有订阅在取消前都会自动续订。',
      support: '需要帮助？请回复此邮件并附上订单编号。', order: '订单编号' },
    review_invitation: { subject: '您的 Lingora 订单 {ref} 体验如何？', intro: '希望 Super 使用顺利。如果您有一分钟时间，一条简短而真实的评价会帮助其他学习者。', button: '撰写评价', optout: '我们只会发送这一次评价邀请。' },
    order_received: { subject: '我们已收到您的付款 - 订单 {ref}', intro: '您的付款已确认。请在订单页面输入邮箱，以便我们发送链接。' },
    refund_approved: { subject: '您的退款已获批准 - 订单 {ref}', intro: '我们已批准您的退款申请。款项将以 USDT（BEP20）发送到您提供的地址。' },
    refund_rejected: { subject: '关于您的退款申请 - 订单 {ref}', intro: '我们已审核您的申请，但未能批准退款。如果您认为我们有遗漏，请回复此邮件。' },
  },
  es: {
    code_delivered: { subject: 'Tu enlace de Duolingo Super - pedido {ref}', intro: 'Gracias por tu pedido. Tu enlace de canje de Duolingo Super por 12 meses está listo.',
      linkLabel: 'Tu enlace de canje', stepsTitle: 'Cómo activarlo',
      steps: ['Abre el enlace en un navegador web (ordenador, tableta o móvil).', 'Inicia sesión en tu cuenta de Duolingo o crea una.', 'Sigue los pasos en pantalla para empezar con Super.'],
      note: 'Duolingo indica que un código no puede usarse en una suscripción Super activa y que todas las suscripciones se renuevan automáticamente salvo que se cancelen.',
      support: '¿Necesitas ayuda? Responde a este correo con tu número de pedido.', order: 'Número de pedido' },
    review_invitation: { subject: '¿Qué tal tu pedido {ref} de Lingora?', intro: 'Esperamos que Super funcione bien. Una reseña breve y sincera ayuda a otros estudiantes.', button: 'Escribir reseña', optout: 'Es la única invitación a reseñar que enviaremos.' },
    order_received: { subject: 'Hemos recibido tu pago - pedido {ref}', intro: 'Tu pago está confirmado. Introduce tu correo en la página del pedido para que enviemos el enlace.' },
    refund_approved: { subject: 'Reembolso aprobado - pedido {ref}', intro: 'Hemos aprobado tu solicitud. El reembolso se enviará en USDT (BEP20) a la dirección que indiques.' },
    refund_rejected: { subject: 'Sobre tu solicitud de reembolso - pedido {ref}', intro: 'Hemos revisado tu solicitud y no hemos podido aprobarla. Responde a este correo si crees que nos falta algo.' },
  },
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (str, d) => String(str).replace(/\{(\w+)\}/g, (_, k) => d[k] ?? '');
export const normaliseLang = l => (LANGS.includes(String(l).slice(0, 2).toLowerCase()) ? String(l).slice(0, 2).toLowerCase() : 'en');
export const defaultStrings = (template, lang) => S[normaliseLang(lang)][template] || S.en[template];

/** render(template, lang, data, overrides?) -> { subject, text, html, dir }.  data: { ref, redeemUrl, reviewUrl, supportEmail, siteUrl } */
export function renderEmail(template, lang, data, overrides = null) {
  const L = normaliseLang(lang), base = defaultStrings(template, L);
  if (!base) throw new Error(`unknown template ${template}`);
  const s = { ...base, ...(overrides || {}) };
  const dir = RTL.has(L) ? 'rtl' : 'ltr', subject = fill(s.subject, data);
  const lines = [s.intro];
  const blocks = [`<p>${esc(s.intro)}</p>`];
  if (template === 'code_delivered') {
    lines.push('', `${s.linkLabel}: ${data.redeemUrl}`, '', `${s.stepsTitle}:`, ...s.steps.map((x, i) => `${i + 1}. ${x}`), '', s.note);
    blocks.push(`<p><strong>${esc(s.linkLabel)}:</strong><br><a href="${esc(data.redeemUrl)}">${esc(data.redeemUrl)}</a></p>`,
      `<p><strong>${esc(s.stepsTitle)}</strong></p><ol>${s.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`, `<p style="color:#555">${esc(s.note)}</p>`);
  }
  if (template === 'review_invitation') {
    lines.push('', `${s.button}: ${data.reviewUrl}`, '', s.optout);
    blocks.push(`<p><a href="${esc(data.reviewUrl)}" style="display:inline-block;padding:10px 18px;background:#0f2a47;color:#fff;border-radius:8px;text-decoration:none">${esc(s.button)}</a></p>`, `<p style="color:#555">${esc(s.optout)}</p>`);
  }
  if (s.order || data.ref) { lines.push('', `${s.order || 'Order'}: ${data.ref}`); blocks.push(`<p>${esc(s.order || 'Order')}: <strong>${esc(data.ref)}</strong></p>`); }
  if (s.support) { lines.push(s.support, data.supportEmail || ''); blocks.push(`<p>${esc(s.support)} ${data.supportEmail ? `<a href="mailto:${esc(data.supportEmail)}">${esc(data.supportEmail)}</a>` : ''}</p>`); }
  lines.push('', 'Lingora (independent reseller, not affiliated with Duolingo)');
  blocks.push('<p style="color:#777;font-size:12px">Lingora - independent reseller, not affiliated with Duolingo.</p>');
  const html = `<!doctype html><html lang="${L}" dir="${dir}"><body style="font-family:Segoe UI,Tahoma,Arial,sans-serif;line-height:1.7;color:#14213d;max-width:560px;margin:auto;padding:16px">${blocks.join('')}</body></html>`;
  return { subject, text: lines.join('\n'), html, dir };
}
