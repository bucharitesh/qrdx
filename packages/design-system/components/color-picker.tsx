/** biome-ignore-all lint/correctness/useExhaustiveDependencies: <explanation> */
"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { useForwardedRef } from "@repo/design-system/hooks/use-forwarded-ref";
import { cn } from "@repo/design-system/lib/utils";
import { type ForwardedRef, useMemo, useState } from "react";
import { HexColorPicker } from "react-colorful";

type ColorPickerProps = {
  ref?: ForwardedRef<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
};

const ColorInput = ({
  disabled,
  value,
  onChange,
  onBlur,
  name,
  className,
  size,
  label,
  ref: forwardedRef,
  ...props
}: React.ComponentProps<"button"> &
  ColorPickerProps &
  React.ComponentProps<typeof Button> & {
    ref?: ForwardedRef<HTMLInputElement>;
  }) => {
  const ref = useForwardedRef<HTMLInputElement>(
    forwardedRef as ForwardedRef<HTMLInputElement>
  );
  const [open, setOpen] = useState(false);

  const parsedValue = useMemo(() => value || "#FFFFFF", [value]);

  const validateHexColor = (color: string): boolean => {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexColorRegex.test(color);
  };

  const isValid = useMemo(() => validateHexColor(parsedValue), [parsedValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!validateHexColor(e.target.value)) {
      // Reset to last valid value on blur if invalid
      onChange(parsedValue);
    }
    onBlur?.();
  };

  return (
    <div className="flex flex-col gap-2">
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-2">
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
            <Button
              {...props}
              className={cn("block", className)}
              name={name}
              onClick={() => {
                setOpen(true);
              }}
              size={size}
              style={{
                backgroundColor: parsedValue,
              }}
              variant="outline"
            >
              <div />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full space-y-4">
            <HexColorPicker color={parsedValue} onChange={onChange} />
            <Input
              maxLength={7}
              onChange={(e) => {
                onChange(e?.currentTarget?.value);
              }}
              ref={ref}
              value={parsedValue}
            />
          </PopoverContent>
        </Popover>
        <Input
          className={cn(
            "w-28 font-mono text-sm",
            !isValid && "border-red-500 focus-visible:ring-red-500"
          )}
          disabled={disabled}
          maxLength={7}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
          placeholder="#FFFFFF"
          value={parsedValue}
        />
      </div>
    </div>
  );
};

ColorInput.displayName = "ColorInput";

export { ColorInput };
