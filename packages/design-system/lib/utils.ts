import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { toast } from 'sonner';
import { twMerge } from 'tailwind-merge';
import { cva as cvaLib } from 'class-variance-authority';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const handleError = (error: unknown): void => {
  const message = isError(error) ? error.message : String(error);

  toast.error(message);
};

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export const cva = (...args: Parameters<typeof cvaLib>) => cvaLib(...args);