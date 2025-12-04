"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@repo/design-system/hooks/use-toast";
import {
  createTheme,
  deleteTheme,
  getTheme,
  getThemes,
  updateTheme,
} from "@/actions/qr-themes";
import type { QRStyle } from "@/types/qr";
import { authClient } from "@/lib/auth-client";

export function useQRThemes() {
  const { data: session } = authClient.useSession();
  
  return useQuery({
    queryKey: ["qr-themes"],
    queryFn: getThemes,
    enabled: !!session?.user, // Only fetch when authenticated
    retry: false,
    // Return empty array on error or when not authenticated
    placeholderData: [],
  });
}

export function useQRTheme(themeId: string | undefined) {
  return useQuery({
    queryKey: ["qr-theme", themeId],
    queryFn: () => (themeId ? getTheme(themeId) : null),
    enabled: !!themeId,
  });
}

export function useCreateQRTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTheme,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qr-themes"] });
      toast({
        title: "Success",
        description: "QR code theme saved successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save QR code theme",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateQRTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTheme,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["qr-themes"] });
      queryClient.invalidateQueries({ queryKey: ["qr-theme", data.id] });
      toast({
        title: "Success",
        description: "QR code theme updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update QR code theme",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteQRTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTheme,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qr-themes"] });
      toast({
        title: "Success",
        description: "QR code theme deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete QR code theme",
        variant: "destructive",
      });
    },
  });
}

