import React from 'react';
import { ITEM_CATEGORIES, ItemCategory } from '../../types';

interface CategoryDropdownProps {
  value: string;
  onChange: (value: ItemCategory) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  includeAllOption?: boolean;
  className?: string;
  label?: string;
  error?: string;
}

export const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  value,
  onChange,
  id = 'item-category',
  name = 'category',
  required = false,
  disabled = false,
  includeAllOption = false,
  className = '',
  label = 'Item Category',
  error,
}) => {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-bold text-slate-700 mb-1"
        >
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
      )}
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value as ItemCategory)}
        required={required}
        disabled={disabled}
        className={`w-full px-3 py-2 text-sm bg-white border rounded-lg shadow-xs transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-500 ${
          error ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-300'
        } ${className}`}
      >
        {includeAllOption && <option value="All">All Categories</option>}
        {!includeAllOption && !value && <option value="">Select category...</option>}
        {ITEM_CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
};
