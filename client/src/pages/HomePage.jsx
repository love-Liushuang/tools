import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categories, tools } from '../data/tools';

function HomePage() {
  const [activeCategory, setActiveCategory] = useState('all');

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
