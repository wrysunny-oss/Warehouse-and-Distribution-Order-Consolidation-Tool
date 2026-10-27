'use strict';

// Serialized into the page. Exclude our status banner: its instructions also
// contain “验证”, and must never be mistaken for a website challenge.
function detectVerification() {
  const visible = el => {
    if (!el || !el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const banner = document.getElementById('__tf_crawler_banner');
  const userscriptPanel = document.getElementById('tf-rice-crawler-panel');
  const text = (document.body?.innerText || '').replace(banner?.innerText || '\u0000', '').replace(userscriptPanel?.innerText || '\u0000', '');
  const title = document.title || '';
  const url = location.href;
  const selectors = '#nc_1_n1z, .nc_scale, .nc_wrapper, .baxia-dialog, #baxia-dialog, #nocaptcha, [id^="nc_"][id$="_n1z"]';
  const slider = [...document.querySelectorAll(selectors)].some(visible);
  const frame = [...document.querySelectorAll('iframe')].some(el => visible(el)
    && /captcha|punish|baxia|nocaptcha|verify|login\.(taobao|tmall)/i.test(el.src || ''));
  const login = /login\.(taobao|tmall)\.com/i.test(url);
  const denial = /访问被拒绝|访问受限|操作过于频繁|访问过于频繁|请求过于频繁|访问频繁|请求频繁|Too Many Requests|Access Denied/i;
  const restricted = denial.test(title) || [...document.querySelectorAll('div, span, p, [role="dialog"]')].some(el => {
    if (!visible(el) || banner?.contains?.(el) || userscriptPanel?.contains?.(el) || el.closest?.('[class*="Comment--"], .tm-rate-list, .rate-grid')) return false;
    const value = String(el.innerText || el.textContent || '').trim();
    return value.length < 100 && denial.test(value);
  });
  const captcha = slider || frame || /punish|captcha|baxia/i.test(url)
    || /安全验证|访问验证|滑动验证|Punish/i.test(title)
    || /拖动.{0,15}滑块|向右滑动.{0,15}验证|请.{0,6}完成.{0,6}验证/.test(text);
  return { blocked: login || captcha || restricted, restricted, login, captcha, ready: document.readyState !== 'loading' };
}

function createContinueGate() {
  let resolve;
  let settled = false;
  const promise = new Promise(done => { resolve = done; });
  return {
    promise,
    resume() { if (!settled) { settled = true; resolve(true); } },
    cancel() { if (!settled) { settled = true; resolve(false); } }
  };
}

module.exports = { detectVerification, createContinueGate };
