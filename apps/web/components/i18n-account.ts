// Strings for the account area, the Yemen top-up form and the balance button. Arabic and English; other languages show English.
import type { Lang } from './i18n';
type Dict = Record<string, string>;
const en: Dict = {
  accountTitle: 'My account', signIn: 'Sign in', signInHint: 'Sign in to see your balance and pay from it. You do not need an account to pay with USDT.',
  google: 'Continue with Google', or: 'or', email: 'Email address', sendLink: 'Email me a sign-in link', linkSent: 'If the address is valid, a sign-in link is on its way. It works once and expires in 15 minutes.',
  confirmTitle: 'Finish signing in', confirmBtn: 'Sign in', confirming: 'Signing you in…', signOut: 'Sign out',
  balance: 'Balance', usdt: 'USDT', history: 'Wallet history', orders: 'My orders', none: 'Nothing here yet.', topupLink: 'Need to add balance? Request a top-up',
  col_date: 'Date', col_type: 'Type', col_amount: 'Amount', col_balance: 'Balance after', col_order: 'Order', col_status: 'Status', col_market: 'Market',
  kind_topup: 'Top-up', kind_purchase: 'Purchase', kind_adjustment: 'Adjustment', kind_refund: 'Refund',
  payFromBalance: 'Pay from my balance', balanceNow: 'Your balance', notEnough: 'Your balance is not enough for this price.', signInToUse: 'Sign in to pay from your balance',
  outOfStock: 'Temporarily out of stock. Please check back soon.', openOrder: 'Opening your order…',
  tuTitle: 'Cannot pay in USDT? Request a balance top-up', tuIntro: 'Send the payment with one of the methods above, then fill this form. We will contact you, confirm the payment and add the balance to your account.',
  tuName: 'Your name', tuEmail: 'Email you will sign in with', tuContact: 'WhatsApp or phone number', tuMethod: 'Payment method you used or will use', tuAmount: 'Amount you sent or will send', tuNote: 'Note (optional)',
  tuSend: 'Send request', tuDone: 'Request received. We will contact you on the number you gave. Once the payment is confirmed, sign in and your balance will be there.',
  e_invalid_email: 'That email address is not valid.', e_invalid_request: 'Please fill in your phone number and the payment method.', e_too_many_open_requests: 'You already have open requests. We will contact you soon.',
  e_rate_limited: 'Too many attempts, please wait a little.', e_insufficient_balance: 'Your balance is not enough.', e_out_of_stock: 'Temporarily out of stock. Please check back soon.',
  e_invalid_token: 'This sign-in link is not valid or was already used. Request a new one.', e_server_error: 'Something went wrong, please try again.', e_not_found: 'Please sign in first.', e_captcha_failed: 'Security check failed, please retry.',
  e_google: 'Google sign-in did not complete. Try again or use the email link.', e_google_off: 'Google sign-in is not available.', e_rate: 'Too many attempts, please wait a little.',
};
const ar: Dict = {
  accountTitle: 'حسابي', signIn: 'تسجيل الدخول', signInHint: 'سجّل الدخول لترى رصيدك وتدفع منه. لا تحتاج حسابًا للدفع بعملة USDT.',
  google: 'المتابعة عبر جوجل', or: 'أو', email: 'البريد الإلكتروني', sendLink: 'أرسل لي رابط الدخول', linkSent: 'إن كان البريد صحيحًا فرابط الدخول في طريقه إليك. يعمل مرة واحدة وينتهي بعد 15 دقيقة.',
  confirmTitle: 'أكمل تسجيل الدخول', confirmBtn: 'تسجيل الدخول', confirming: 'جارٍ تسجيل دخولك…', signOut: 'تسجيل الخروج',
  balance: 'الرصيد', usdt: 'USDT', history: 'سجل المحفظة', orders: 'طلباتي', none: 'لا شيء هنا بعد.', topupLink: 'تريد إضافة رصيد؟ اطلب شحنًا',
  col_date: 'التاريخ', col_type: 'النوع', col_amount: 'المبلغ', col_balance: 'الرصيد بعدها', col_order: 'الطلب', col_status: 'الحالة', col_market: 'السوق',
  kind_topup: 'شحن رصيد', kind_purchase: 'شراء', kind_adjustment: 'تعديل', kind_refund: 'استرجاع',
  payFromBalance: 'ادفع من رصيدي', balanceNow: 'رصيدك', notEnough: 'رصيدك لا يكفي لهذا السعر.', signInToUse: 'سجّل الدخول لتدفع من رصيدك',
  outOfStock: 'نفد المخزون مؤقتًا. عد قريبًا.', openOrder: 'جارٍ فتح طلبك…',
  tuTitle: 'لا تستطيع الدفع بـ USDT؟ اطلب شحن رصيد', tuIntro: 'حوّل المبلغ بإحدى الطرق المذكورة أعلاه ثم املأ هذا النموذج. سنتواصل معك ونتحقق من وصول المبلغ ونضيفه إلى رصيد حسابك.',
  tuName: 'اسمك', tuEmail: 'البريد الذي ستدخل به', tuContact: 'رقم واتساب أو الجوال', tuMethod: 'طريقة الدفع التي استخدمتها أو ستستخدمها', tuAmount: 'المبلغ الذي أرسلته أو سترسله', tuNote: 'ملاحظة (اختياري)',
  tuSend: 'إرسال الطلب', tuDone: 'استلمنا طلبك. سنتواصل معك على الرقم الذي كتبته. بعد تأكيد الدفع سجّل الدخول وسترى رصيدك.',
  e_invalid_email: 'البريد الإلكتروني غير صالح.', e_invalid_request: 'اكتب رقم جوالك وطريقة الدفع.', e_too_many_open_requests: 'لديك طلبات مفتوحة بالفعل. سنتواصل معك قريبًا.',
  e_rate_limited: 'محاولات كثيرة، انتظر قليلًا.', e_insufficient_balance: 'رصيدك لا يكفي.', e_out_of_stock: 'نفد المخزون مؤقتًا. عد قريبًا.',
  e_invalid_token: 'رابط الدخول غير صالح أو سبق استخدامه. اطلب رابطًا جديدًا.', e_server_error: 'حدث خطأ، حاول مرة أخرى.', e_not_found: 'سجّل الدخول أولًا.', e_captcha_failed: 'فشل التحقق الأمني، أعد المحاولة.',
  e_google: 'لم يكتمل الدخول عبر جوجل. حاول مجددًا أو استخدم رابط البريد.', e_google_off: 'الدخول عبر جوجل غير متاح.', e_rate: 'محاولات كثيرة، انتظر قليلًا.',
};
export const A = (lang: Lang): Dict => (lang === 'ar' ? ar : en);
export const aErr = (lang: Lang, code: string) => A(lang)['e_' + code] || A(lang).e_server_error;
