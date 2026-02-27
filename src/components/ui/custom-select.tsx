'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  minWidth?: string;
}

export default function CustomSelect({
  placeholder,
  options,
  value,
  onChange,
  searchable = false,
  minWidth,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 40);
    }
  }, [open, searchable]);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  return (
    <div className="cs-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`cs-btn ${open ? 'cs-active' : ''}`}
        style={minWidth ? { minWidth } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <span className="cs-val">{value ? selectedLabel : placeholder}</span>
        <span className="cs-arrow">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div className={`cs-panel ${open ? 'cs-open' : ''}`}>
        {searchable && (
          <div className="cs-search">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div className="cs-list">
          {filtered.map((opt) => (
            <div
              key={opt.value}
              className={`cs-opt ${opt.value === value ? 'cs-sel' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
                setSearch('');
              }}
            >
              <span className="cs-check">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              </span>
              <span>{opt.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
