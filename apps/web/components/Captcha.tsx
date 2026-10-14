'use client';
import { useEffect, useRef } from 'react';
declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: object) => void } } }
/** Cloudflare Turnstile widget; renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */
export default function Captcha({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!site) return;
    const draw = () => ref.current && window.turnstile?.render(ref.current, { sitekey: site, callback: onToken });
    if (window.turnstile) { draw(); return; }
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = draw; document.head.appendChild(s);
  }, [site, onToken]);
  return site ? <div ref={ref} style={{ margin: '12px 0' }} /> : null;
}
