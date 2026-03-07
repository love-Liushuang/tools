import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categories, featuredToolIds, tools } from '../data/tools';

const FEATURED_DEFAULT_COUNT = 6;

function HomePage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [featuredExpanded, setFeaturedExpanded] = useState(false);

  const featuredTools = useMemo(() => {
    return featuredToolIds
      .map((toolId) => tools.find((tool) => tool.id === toolId))
      .filter(Boolean);
  }, []);

  const visibleFeaturedTools = useMemo(() => {
    if (featuredExpanded) {
      return featuredTools;
    }
    return featuredTools.slice(0, FEATURED_DEFAULT_COUNT);
  }, [featuredExpanded, featuredTools]);

  const hasMoreFeatured = featuredTools.length > FEATURED_DEFAULT_COUNT;

  const visibleTools = useMemo(() => {
    if (activeCategory === 'all') {
      return tools;
    }
    return tools.filter((tool) => tool.category === activeCategory);
  }, [activeCategory]);

  return (
    <main>
      <section className="hero-block">
        <p className="hero-tag">在线工具导航</p>
        <h1>一站式实用工具箱</h1>
        <p className="hero-desc">像 uuTool 一样按分类浏览，点击即用，不需要登录。</p>
      </section>

      {featuredTools.length ? (
        <section className="featured-block">
          <div className="featured-head">
            <div>
              <h2>常用工具</h2>
              <p>优先展示高频工具，支持展开查看更多。</p>
            </div>
            {hasMoreFeatured ? (
              <button
                className="featured-toggle"
                onClick={() => setFeaturedExpanded((prev) => !prev)}
                type="button"
              >
                {featuredExpanded ? '收起' : '展开全部'}
              </button>
            ) : null}
          </div>
          <div className="tool-grid">
            {visibleFeaturedTools.map((tool) => (
              <Link className="tool-item" key={`featured-${tool.id}`} to={tool.path}>
                <h3>{tool.name}</h3>
                <p>{tool.desc}</p>
                <span>立即使用</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="category-bar">
        {categories.map((category) => (
          <button
            key={category.key}
            className={activeCategory === category.key ? 'cat-btn active' : 'cat-btn'}
            onClick={() => setActiveCategory(category.key)}
            type="button"
          >
            {category.label}
          </button>
        ))}
      </section>

      <section className="tool-grid">
        {visibleTools.map((tool) => (
          <Link className="tool-item" key={tool.id} to={tool.path}>
            <h3>{tool.name}</h3>
            <p>{tool.desc}</p>
            <span>立即使用</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

export default HomePage;
