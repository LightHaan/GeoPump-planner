import { useEffect, useState } from "react";

import type { ParameterDefinition } from "../parameters/definitions";
import type { Replacement } from "../parameters/types";

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  unit?: string;
  help?: string;
  required?: boolean;
  displayDigits?: number;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step = 0.1,
  unit,
  help,
  required = false,
  displayDigits,
}: NumberFieldProps) {
  const [focused, setFocused] = useState(false);
  const displayValue = value === null
    ? ""
    : displayDigits === undefined || focused
      ? value
      : Number(value.toFixed(displayDigits));
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="input-with-unit">
        <input
          id={id}
          type="number"
          step={step}
          value={displayValue}
          required={required}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
      {help && <small>{help}</small>}
    </label>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  help?: string;
}

export function SelectField({ id, label, value, options, onChange, help }: SelectFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {help && <small>{help}</small>}
    </label>
  );
}

interface ParameterControlProps {
  definition: ParameterDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function ParameterControl({ definition, value, onChange }: ParameterControlProps) {
  const [complexText, setComplexText] = useState("");
  const [complexError, setComplexError] = useState<string | null>(null);
  useEffect(() => {
    if (
      definition.valueType === "number_array" ||
      definition.valueType === "replacement_schedule"
    ) {
      setComplexText(
        definition.valueType === "number_array"
          ? (value as number[]).join(", ")
          : JSON.stringify(value, null, 2),
      );
      setComplexError(null);
    }
  }, [definition.path, definition.valueType, value]);

  const help = `${definition.path} · Source: ${definition.source}`;
  if (definition.valueType === "boolean") {
    return (
      <label className="parameter-toggle">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span><strong>{definition.label}</strong><small>{help}</small></span>
      </label>
    );
  }
  if (definition.options !== null) {
    return (
      <SelectField
        id={`parameter-${definition.path}`}
        label={definition.label}
        value={String(value)}
        options={definition.options.map((option) => ({ value: option, label: option }))}
        onChange={onChange}
        help={help}
      />
    );
  }
  if (definition.valueType === "number" || definition.valueType === "nullable_number") {
    return (
      <NumberField
        id={`parameter-${definition.path}`}
        label={definition.label}
        value={value as number | null}
        onChange={onChange}
        step={definition.step ?? 0.01}
        unit={definition.unit ?? ""}
        help={help}
      />
    );
  }
  if (definition.valueType === "number_array" || definition.valueType === "replacement_schedule") {
    const commit = () => {
      try {
        let parsed: number[] | Replacement[];
        if (definition.valueType === "number_array") {
          parsed = complexText.split(",").map((part) => Number(part.trim()));
          if (parsed.length === 0 || parsed.some((number) => !Number.isFinite(number))) {
            throw new Error("Enter comma-separated numbers.");
          }
        } else {
          parsed = JSON.parse(complexText) as Replacement[];
          if (!Array.isArray(parsed)) throw new Error("The replacement schedule must be a JSON array.");
        }
        setComplexError(null);
        onChange(parsed);
      } catch (error) {
        setComplexError(error instanceof Error ? error.message : "Invalid format.");
      }
    };
    return (
      <label className="field" htmlFor={`parameter-${definition.path}`}>
        <span className="field-label">{definition.label}</span>
        <textarea
          id={`parameter-${definition.path}`}
          rows={definition.valueType === "replacement_schedule" ? 4 : 2}
          value={complexText}
          onChange={(event) => setComplexText(event.target.value)}
          onBlur={commit}
        />
        <small>{complexError ?? help}</small>
      </label>
    );
  }
  return (
    <label className="field" htmlFor={`parameter-${definition.path}`}>
      <span className="field-label">{definition.label}</span>
      <input
        id={`parameter-${definition.path}`}
        type="text"
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>{help}</small>
    </label>
  );
}
