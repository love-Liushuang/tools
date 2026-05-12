import { useEffect, useState } from 'react';

const CHECK_DELAY_MS = 900;

const AD_CHECKING = 'checking';
const AD_ALLOWED = 'allowed';
const AD_BLOCKED = 'blocked';

function isLocalDevelopment() {
  const localHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];
  return import.meta.env.DEV || localHosts.includes(window.location.hostname);
}

function isLocalPreviewBlocked() {
  if (!isLocalDevelopment()) {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('adblockPreview') === '1';
}

function isBaitHidden(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    !element.isConnected
    || element.offsetParent === null
    || element.offsetHeight === 0
    || element.clientHeight === 0
    || rect.height === 0
    || style.display === 'none'
    || style.visibility === 'hidden'
    || style.opacity === '0'
  );
}

function createBaitElement() {
  const bait = document.createElement('div');
  bait.className = 'adsbox adsbygoogle ad-banner ad-placement pub_300x250 textads banner-ads';
  bait.setAttribute('aria-hidden', 'true');
  bait.style.cssText = [
    'position:absolute',
    'left:-10000px',
    'top:-10000px',
    'width:1px',
    'height:1px',
    'pointer-events:none',
  ].join(';');

  return bait;
}

function AdBlockNotice({ children, enabled = true }) {
  const previewBlocked = enabled && isLocalPreviewBlocked();
  const skipCheck = !previewBlocked && (!enabled || isLocalDevelopment());
  const [status, setStatus] = useState(previewBlocked ? AD_BLOCKED : skipCheck ? AD_ALLOWED : AD_CHECKING);

  useEffect(() => {
    if (previewBlocked || skipCheck) {
      setStatus(previewBlocked ? AD_BLOCKED : AD_ALLOWED);
      return undefined;
    }

    setStatus(AD_CHECKING);

    let cancelled = false;
    const bait = createBaitElement();
    document.body.appendChild(bait);

    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const scriptBlocked = window.__adsenseScriptBlocked === true;

      if (scriptBlocked || isBaitHidden(bait)) {
        setStatus(AD_BLOCKED);
      } else {
        setStatus(AD_ALLOWED);
      }

      bait.remove();
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      bait.remove();
    };
  }, [previewBlocked, skipCheck, enabled]);

  if (status === AD_ALLOWED) {
    return children;
  }

  if (status === AD_CHECKING) {
    return null;
  }

  return (
    <div className="adblockNotice" role="alertdialog" aria-modal="true" aria-labelledby="adblockNoticeTitle">
      <div className="adblockNoticePanel">
        <h2 id="adblockNoticeTitle">致每一位使用本站的朋友：</h2>
        <p>
          这是一个由工会工作人员利用休息时间搭建的小站，没有工会经费支持，所有服务器、域名和工具维护费用都由我们个人承担。开启少量广告，只是为了能让这个小站一直运行下去。如果您觉得本站帮到了您，烦将我们加入广告屏蔽白名单，关闭后刷新页面即可继续使用。您的每一次点击，都是对我们无偿付出的最大肯定。再次感谢！
        </p>
        <div className="adblockNoticeActions">
          <button className="adblockNoticeButton" type="button" onClick={() => window.location.reload()}>
            我已关闭，刷新页面
          </button>
          <button className="adblockNoticeButton is-secondary" type="button" onClick={() => window.location.assign('/')}>
            回首页
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdBlockNotice;
