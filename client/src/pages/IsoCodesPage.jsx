import { useMemo, useState } from 'react';
import ToolPageShell from '../components/ToolPageShell';
import { continentIsoCodes, countryIsoCodes } from '../data/isoCodes';

const VIEW_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'countries', label: '国家/地区' },
  { key: 'continents', label: '七大洲' }
];

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, '');
}

function getCountrySearchText(item) {
  return normalizeText(`${item.alpha2} ${item.alpha3} ${item.numeric} ${item.nameEn} ${item.nameZh}`);
}

function getContinentSearchText(item) {
  return normalizeText(`${item.code} ${item.nameEn} ${item.nameZh}`);
}

function IsoCodesPage() {
  const [query, setQuery] = useState('');
  const [activeView, setActiveView] = useState('all');

  const normalizedQuery = normalizeText(query);

  const filteredCountries = useMemo(() => {
    if (!normalizedQuery) {
      return countryIsoCodes;
    }

    return countryIsoCodes.filter((item) => getCountrySearchText(item).includes(normalizedQuery));
  }, [normalizedQuery]);

  const filteredContinents = useMemo(() => {
    if (!normalizedQuery) {
      return continentIsoCodes;
    }

    return continentIsoCodes.filter((item) => getContinentSearchText(item).includes(normalizedQuery));
  }, [normalizedQuery]);

  const tabCounts = {
    all: filteredCountries.length + filteredContinents.length,
    countries: filteredCountries.length,
    continents: filteredContinents.length
  };

  const showCountries = activeView === 'all' || activeView === 'countries';
  const showContinents = activeView === 'all' || activeView === 'continents';

  return (
    <ToolPageShell
      title="ISO 代码查询"
      desc="查询 ISO 3166-1 国家/地区代码，以及七大洲二字代码与中英文名称。"
    >
      <div className="iso-code-shell">
        <div className="iso-code-toolbar">
          <label className="field-block iso-code-search">
            <span>搜索</span>
            <div className="iso-code-search-row">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入国家、地区、洲名或代码，如 CN / CHN / 156 / 中国"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')}>
                  清空
                </button>
              ) : null}
            </div>
          </label>
          <div className="iso-code-tabs" aria-label="ISO 代码类型">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={activeView === option.key ? 'active' : ''}
                onClick={() => setActiveView(option.key)}
              >
                <span>{option.label}</span>
                <em>{tabCounts[option.key]} 条</em>
              </button>
            ))}
          </div>
        </div>

        {showCountries ? (
          <section className="iso-code-section">
            <div className="iso-code-section-head">
              <h2>国家/地区 ISO 3166-1 代码</h2>
              <span>{filteredCountries.length} 条</span>
            </div>
            <div className="iso-code-table-wrap">
              <table className="iso-code-table">
                <thead>
                  <tr>
                    <th>ISO二字代码</th>
                    <th>ISO三字代码</th>
                    <th>ISO数字代码</th>
                    <th>国家/地区(含中文)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCountries.map((item) => (
                    <tr key={item.alpha2}>
                      <td>{item.alpha2}</td>
                      <td>{item.alpha3}</td>
                      <td>{item.numeric}</td>
                      <td>
                        <strong>{item.nameZh}</strong>
                        <span>{item.nameEn}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredCountries.length ? <div className="iso-code-empty">没有匹配的国家或地区。</div> : null}
            </div>
          </section>
        ) : null}

        {showContinents ? (
          <section className="iso-code-section">
            <div className="iso-code-section-head">
              <h2>全球七大洲代码</h2>
              <span>{filteredContinents.length} 条</span>
            </div>
            <div className="iso-code-table-wrap">
              <table className="iso-code-table">
                <thead>
                  <tr>
                    <th>ISO二字代码</th>
                    <th>英文名称</th>
                    <th>中文名称</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContinents.map((item) => (
                    <tr key={item.code}>
                      <td>{item.code}</td>
                      <td>{item.nameEn}</td>
                      <td>{item.nameZh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredContinents.length ? <div className="iso-code-empty">没有匹配的大洲。</div> : null}
            </div>
          </section>
        ) : null}
      </div>
    </ToolPageShell>
  );
}

export default IsoCodesPage;
