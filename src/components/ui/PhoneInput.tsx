'use client';
import { useEffect, useRef, useState } from 'react';
import COUNTRIES, { Country, searchCountries } from '@/lib/countries';

interface PhoneInputProps {
  value: string;
  country: Country;
  onChange: (phone: string) => void;
  onCountryChange: (country: Country) => void;
  placeholder?: string;
  disabled?: boolean;
}

const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.iso === 'IN')!;

export { DEFAULT_COUNTRY };

export default function PhoneInput({
  value,
  country,
  onChange,
  onCountryChange,
  placeholder = '9876543210',
  disabled = false,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim() ? searchCountries(query) : COUNTRIES;

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (c: Country) => {
    onCountryChange(c);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="flex gap-0 w-full">
      {/* Country code trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-2 border border-r-0 border-gray-200 rounded-l-lg text-sm bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 h-full whitespace-nowrap"
          style={{ minWidth: 90 }}
        >
          <span className="text-base leading-none">{country.flag}</span>
          <span className="font-medium text-gray-700">{country.dialCode}</span>
          <svg className="w-3 h-3 text-gray-400 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div
            className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg"
            style={{ width: 280, maxHeight: 320, left: 0, top: '100%' }}
          >
            {/* Search */}
            <div className="p-2 border-b border-gray-100">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code…"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No results</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => select(c)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-blue-50 text-left transition-colors"
                    style={{ color: c.iso === country.iso ? '#1A3FD1' : '#111827' }}
                  >
                    <span className="text-base w-6 text-center shrink-0">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-gray-400 shrink-0 font-medium">{c.dialCode}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phone number input */}
      <input
        type="tel"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        maxLength={15}
        className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
