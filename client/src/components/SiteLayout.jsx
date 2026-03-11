import { Link, NavLink, Outlet } from 'react-router-dom';

function SiteLayout() {
  return (
    <div className="site-bg">
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" to="/">
            ABIGBOOK BoxTools
          </Link>
          <nav className="topnav">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/tools/json-formatter">JSON</NavLink>
            <NavLink to="/tools/base64">Base64</NavLink>
            <NavLink to="/tools/text-stats">文本统计</NavLink>
            <NavLink to="/tools/text-letter">文本加密</NavLink>
            <NavLink to="/tools/txt-diff">文本对比</NavLink>
            <NavLink to="/tools/unlock-pdf">PDF解密</NavLink>
            <NavLink to="/tools/image-convert">图片转换</NavLink>
            <NavLink to="/tools/svg-base64">SVG Base64</NavLink>
            <NavLink to="/tools/svg-path">SVG Path</NavLink>
            <NavLink to="/tools/svg-preview">SVG预览</NavLink>
          </nav>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

export default SiteLayout;
