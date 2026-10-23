"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/zuno/button";
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
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [dropError, setDropError] = useState("");
  const message = dropError || error;
  const descriptionId = `${id}-help${message ? ` ${id}-error` : ""}`;

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (disabled) return;
    const files = event.dataTransfer.files;
    if (files.length > 1) {
      setDropError("Selecciona un solo archivo a la vez.");
      return;
    }
    const droppedFile = files.item(0);
    if (!droppedFile) return;
    setDropError("");
    onFileChange(droppedFile);
  }

  return (
    <>
      <div
        aria-disabled={disabled || undefined}
        className={cn(
          "min-w-0 rounded-lg border border-dashed bg-background p-5 text-center transition-colors motion-reduce:transition-none focus-within:border-ring",
          dragActive ? "border-primary bg-secondary" : "border-input",
          message && "border-destructive",
          disabled && "opacity-60",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled || !event.dataTransfer.types.includes("Files")) return;
          dragDepth.current += 1;
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragActive(false);
        }}
        onDragEnd={() => {
          dragDepth.current = 0;
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Seleccionar archivo fuente"
          aria-invalid={Boolean(message)}
          aria-describedby={descriptionId}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected) return;
            setDropError("");
            onFileChange(selected);
          }}
        />
        <Upload className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">
          {dragActive ? "Suelta el archivo aquí" : file ? "Reemplaza el archivo si lo necesitas" : "Arrastra un archivo aquí"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">o selecciónalo desde tu equipo</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 h-10"
          disabled={disabled}
          aria-controls={id}
          aria-describedby={descriptionId}
          onClick={() => inputRef.current?.click()}
        >
          {file ? "Cambiar archivo" : "Seleccionar archivo"}
        </Button>
        <p id={`${id}-help`} className="mt-3 text-xs text-muted-foreground">
          {helperText}
        </p>
        {file && (
          <div className="mt-4 flex min-w-0 items-center gap-3 rounded-md border border-border bg-card p-3 text-left">
            <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1" role="status">
              <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {file.size < 1024
                  ? `${file.size} bytes`
                  : file.size < 1024 * 1024
                    ? `${Math.ceil(file.size / 1024)} KiB`
                    : `${(file.size / (1024 * 1024)).toLocaleString("es-MX", { maximumFractionDigits: 1 })} MiB`}
                {" · Archivo seleccionado"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Quitar archivo ${file.name}`}
              title="Quitar archivo"
              onClick={() => {
                setDropError("");
                if (inputRef.current) inputRef.current.value = "";
                onFileChange(undefined);
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      {message && (
        <p id={`${id}-error`} className="mt-2 text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
