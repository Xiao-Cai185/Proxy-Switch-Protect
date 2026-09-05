import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { COUNTRY_OPTIONS, countryName } from '../../../shared/countries';
import { Flag } from '../../ui/components';
import { inputValue } from '../../ui/util';

/**
 * 期望国家多选：上层悬浮下拉菜单 (Floating Overlay)
 * 输入框聚焦展开，失焦或回车确认后自动收起
 */
export function CountrySelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [filter, setFilter] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (o) => o.code.toLowerCase().includes(f) || o.name.includes(filter.trim()),
    );
  }, [filter]);

  const customCode =
    /^[a-z]{2}$/i.test(filter.trim()) &&
    !COUNTRY_OPTIONS.some((o) => o.code === filter.trim().toUpperCase())
      ? filter.trim().toUpperCase()
      : null;

  const toggle = (code: string) => {
    onChange(
      value.includes(code) ? value.filter((c) => c !== code) : [...value, code],
    );
  };

  // 点击外部自动收起下拉菜单
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (customCode) {
        toggle(customCode);
        setFilter('');
      } else if (list.length > 0 && filter.trim()) {
        toggle(list[0].code);
        setFilter('');
      }
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="country-select" ref={containerRef}>
      {value.length > 0 && (
        <div className="country-chips">
          {value.map((cc) => (
            <span className="country-chip" key={cc}>
              <Flag cc={cc} size={14} />
              <span>
                {countryName(cc)} ({cc.toUpperCase()})
              </span>
              <button
                type="button"
                className="country-chip-remove"
                title="移除"
                onClick={() => toggle(cc)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="country-search-wrapper">
        <Search size={14} className="country-search-icon" />
        <input
          ref={inputRef}
          type="search"
          className="country-search-input"
          placeholder="搜索国家/地区或输入两位代码（如：新加坡 / SG），按回车或失焦收起"
          value={filter}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onChange={(e) => {
            setFilter(inputValue(e));
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // 如果焦点移动到下拉菜单外部，延迟收起
            if (!containerRef.current?.contains(e.relatedTarget as Node)) {
              setTimeout(() => setIsOpen(false), 150);
            }
          }}
        />
        <ChevronDown
          size={14}
          className="country-chevron-icon muted"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>

      {/* 上层悬浮下拉浮层 (Floating Dropdown) */}
      {isOpen && (
        <div
          className="country-list-overlay"
          onMouseDown={(e) => {
            // 阻止鼠标按下时导致输入框触发失焦事件，保证多选时不意外关闭
            e.preventDefault();
          }}
        >
          {customCode && (
            <button
              type="button"
              className="country-option"
              onClick={() => {
                toggle(customCode);
                setFilter('');
                setIsOpen(false);
              }}
            >
              <Flag cc={customCode} size={16} />
              <span className="grow">使用自定义国家代码 {customCode}</span>
            </button>
          )}

          {list.map((o) => {
            const selected = value.includes(o.code);
            return (
              <button
                type="button"
                key={o.code}
                className={`country-option ${selected ? 'country-option-selected' : ''}`}
                onClick={() => {
                  toggle(o.code);
                }}
              >
                <Flag cc={o.code} size={16} />
                <span className="grow">
                  {o.name}（{o.code}）
                </span>
                {selected && <Check size={14} className="country-check-icon" />}
              </button>
            );
          })}

          {list.length === 0 && !customCode && (
            <div className="empty" style={{ padding: '14px' }}>
              没有匹配的国家或地区
            </div>
          )}
        </div>
      )}
    </div>
  );
}
