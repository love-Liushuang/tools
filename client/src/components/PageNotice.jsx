import gonghuiLogo from '../assets/gonghui_logo.webp';

function PageNotice() {
  return (
    <div className="pageNotice">
      <img
        className="gonghuiLogo"
        src={gonghuiLogo}
        alt="中铁十九局集团国际公司工会"
        loading="lazy"
        width="48"
        height="48"
      />
      <div className="notice">中铁十九局集团国际公司工会</div>
      <div className="notice">提供技术支持</div>
    </div>
  );
}

export default PageNotice;
