import gonghuiLogo from '../assets/gonghui_logo.webp';
import { useEffect } from 'react';

function PageNotice () {
    useEffect(() => {
        const DEFAULT_FAVICON = '/favicon.ico';
        const head = document.head;

        let iconEl = document.querySelector('link[rel="icon"]');
        if (!iconEl) {
            iconEl = document.createElement('link');
            iconEl.setAttribute('rel', 'icon');
            head.appendChild(iconEl);
        }

        let shortcutEl = document.querySelector('link[rel="shortcut icon"]');
        if (!shortcutEl) {
            shortcutEl = document.createElement('link');
            shortcutEl.setAttribute('rel', 'shortcut icon');
            head.appendChild(shortcutEl);
        }

        const previousIcon = {
            href: iconEl.getAttribute('href') || DEFAULT_FAVICON,
            type: iconEl.getAttribute('type')
        };
        const previousShortcut = {
            href: shortcutEl.getAttribute('href') || previousIcon.href || DEFAULT_FAVICON,
            type: shortcutEl.getAttribute('type')
        };

        iconEl.setAttribute('type', 'image/webp');
        iconEl.setAttribute('href', gonghuiLogo);
        shortcutEl.setAttribute('type', 'image/webp');
        shortcutEl.setAttribute('href', gonghuiLogo);

        return () => {
            iconEl.setAttribute('href', previousIcon.href || DEFAULT_FAVICON);
            if (previousIcon.type) {
                iconEl.setAttribute('type', previousIcon.type);
            } else {
                iconEl.removeAttribute('type');
            }

            shortcutEl.setAttribute('href', previousShortcut.href || previousIcon.href || DEFAULT_FAVICON);
            if (previousShortcut.type) {
                shortcutEl.setAttribute('type', previousShortcut.type);
            } else {
                shortcutEl.removeAttribute('type');
            }
        };
    }, []);
    return (
        <div className="pageNotice">
            <img
                className="gonghuiLogo"
                src={gonghuiLogo}
                alt="工会"
                loading="lazy"
                width="48"
                height="48"
            />
            <div className="notice">工会</div>
            <div className="notice">提供技术支持</div>
        </div>
    );
}

export default PageNotice;
