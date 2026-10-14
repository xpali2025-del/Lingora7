import './globals.css';
export const metadata = { title: 'Page not found', robots: { index: false, follow: false } };
export default function GlobalNotFound() {
  return (<html lang="en"><body><main className="page"><h1>404</h1><p>Page not found. <a href="/">Go to the home page</a> · <a href="/ar-eg/">الصفحة الرئيسية بالعربية</a></p></main></body></html>);
}
