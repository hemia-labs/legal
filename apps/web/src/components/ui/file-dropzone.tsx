"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FileDropzone({
  id,
  file,
  accept,
  helperText,
  error,
  disabled = false,
  onFileChange,
}: {
  id: string;
  file: File | null;
  accept?: string;
  helperText: string;
  error?: string;
  disabled?: boolean;
  onFileChange: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const descriptionId = error ? `${id}-error` : `${id}-help`;

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    onFileChange(event.dataTransfer.files.item(0) ?? undefined);
  }

  return (
    <>
      <div
        className={cn(
          "min-w-0 rounded-lg border border-dashed p-6 text-center transition-colors",
          dragActive ? "border-primary bg-secondary/50" : "border-border bg-surface-soft",
          disabled && "pointer-events-none opacity-60",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragActive(false);
          }
        }}
        onDragEnd={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(event) => onFileChange(event.target.files?.[0])}
        />
        <Upload className="mx-auto size-8 text-primary" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">Arrastra tu archivo aquí</p>
        <p className="mt-1 text-sm text-muted-foreground">o selecciónalo desde tu equipo</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 h-12"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Seleccionar archivo
        </Button>
        <p id={`${id}-help`} className="mt-3 text-xs text-muted-foreground">
          {helperText}
        </p>
        {file && (
          <p className="mt-3 rounded-md bg-card px-3 py-2 text-sm font-medium text-foreground" role="status">
            {file.name}
          </p>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-error" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </>
  );
}
