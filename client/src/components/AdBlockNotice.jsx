import { useEffect, useState } from 'react';

const DISMISS_KEY = 'abigbook-adblock-notice-dismissed';

function hasDismissedNotice() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismissNotice() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Ignore storage failures so the close button still works.
  }
}

function isBaitHidden(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    element.offsetParent === null
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

function AdBlockNotice() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (hasDismissedNotice()) {
      return undefined;
    }

    let cancelled = false;
    const bait = createBaitElement();
    document.body.appendChild(bait);

    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const scriptBlocked = window.__adsenseScriptBlocked === true;

      if (scriptBlocked || isBaitHidden(bait)) {
        setBlocked(true);
      }

      bait.remove();
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      bait.remove();
    };
  }, []);

  const handleClose = () => {
    dismissNotice();
    setBlocked(false);
  };

  if (!blocked) {
    return null;
  }

  return (
    <div className="adblockNotice" role="dialog" aria-modal="true" aria-labelledby="adblockNoticeTitle">
      <div className="adblockNoticePanel">
        <button className="adblockNoticeClose" type="button" onClick={handleClose} aria-label="关闭提示">
          x
        </button>
        <p className="adblockNoticeKicker">广告屏蔽提示</p>
        <h2 id="adblockNoticeTitle">小站经营不易，请不要开启广告屏蔽</h2>
        <p>
          本站依靠少量广告维持服务器和工具维护成本。如果你觉得这些工具有帮助，建议将本站加入广告屏蔽插件的白名单后继续使用。
        </p>
        <button className="adblockNoticeButton" type="button" onClick={handleClose}>
          我知道了
        </button>
      </div>
    </div>
  );
}

export default AdBlockNotice;
