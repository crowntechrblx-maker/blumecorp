import { useRef } from "react";

interface FileButtonProps {
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  label?: string;
  disabled?: boolean;
}

export function FileButton({
  file,
  onChange,
  accept,
  label = "Choose image",
  disabled,
}: FileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="file-button-wrap">
      <button
        type="button"
        className="file-button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {file ? "Change image" : label}
      </button>
      {file && (
        <span className="file-button-name">
          {file.name}
          <button
            type="button"
            className="file-button-clear"
            aria-label="Remove image"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            ×
          </button>
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="file-button-input"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </div>
  );
}
