/**
 * Zod validation schemas for QR content types
 */

import { z } from "zod";

// URL/Plain Text
export const urlSchema = z.object({
  url: z.string().min(1, "URL or text is required"),
});

// Email
export const emailSchema = z.object({
  recipient: z.email("Invalid email address"),
  subject: z.string().optional(),
  body: z.string().optional(),
});

// Phone
export const phoneSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
});

// SMS
export const smsSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
  message: z.string().optional(),
});

// WhatsApp
export const whatsappSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^[+\d\s()-]+$/, "Invalid phone number format"),
  message: z.string().optional(),
});

// WiFi
export const wifiSchema = z.object({
  ssid: z.string().min(1, "WiFi SSID is required"),
  password: z.string(),
  encryption: z.enum(["WPA", "WEP", "nopass"]),
  hidden: z.boolean().optional(),
});

// vCard
export const vcardSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  organization: z.string().optional(),
  phone: z.string().optional(),
  email: z.email("Invalid email address").optional().or(z.literal("")),
  url: z.string().url("Invalid URL").optional().or(z.literal("")),
  address: z.string().optional(),
  note: z.string().optional(),
});

// Maps
export const mapsSchema = z.object({
  location: z.string().min(1, "Location is required"),
});

// App Stores
export const appStoresSchema = z
  .object({
    iosUrl: z.string().url("Invalid iOS URL").optional().or(z.literal("")),
    androidUrl: z
      .string()
      .url("Invalid Android URL")
      .optional()
      .or(z.literal("")),
    fallbackUrl: z
      .string()
      .url("Invalid fallback URL")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.iosUrl || data.androidUrl || data.fallbackUrl, {
    message: "At least one app store link is required",
  });

// Facebook
export const facebookSchema = z.object({
  profileUrl: z
    .string()
    .min(1, "Facebook profile URL is required")
    .url("Invalid URL"),
});

// Instagram
export const instagramSchema = z.object({
  username: z
    .string()
    .min(1, "Instagram username is required")
    .regex(/^@?[\w.]+$/, "Invalid Instagram username"),
});

// Reddit
export const redditSchema = z
  .object({
    username: z
      .string()
      .regex(/^u\/[\w-]+$|^[\w-]+$/, "Invalid Reddit username")
      .optional()
      .or(z.literal("")),
    subreddit: z
      .string()
      .regex(/^r\/[\w-]+$|^[\w-]+$/, "Invalid subreddit name")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => data.username || data.subreddit, {
    message: "Either username or subreddit is required",
  });

// TikTok
export const tiktokSchema = z.object({
  username: z
    .string()
    .min(1, "TikTok username is required")
    .regex(/^@?[\w.]+$/, "Invalid TikTok username"),
});

// Twitter/X
export const twitterSchema = z.object({
  username: z
    .string()
    .min(1, "Twitter username is required")
    .regex(/^@?[\w]+$/, "Invalid Twitter username"),
});

// LinkedIn
export const linkedinSchema = z.object({
  profileUrl: z
    .string()
    .min(1, "LinkedIn profile URL is required")
    .url("Invalid URL"),
});

// YouTube
export const youtubeSchema = z
  .object({
    channelUrl: z
      .string()
      .url("Invalid channel URL")
      .optional()
      .or(z.literal("")),
    videoUrl: z.string().url("Invalid video URL").optional().or(z.literal("")),
  })
  .refine((data) => data.channelUrl || data.videoUrl, {
    message: "Either channel or video URL is required",
  });

// Pinterest
export const pinterestSchema = z.object({
  username: z
    .string()
    .min(1, "Pinterest username is required")
    .regex(/^[\w-]+$/, "Invalid Pinterest username"),
});

// Snapchat
export const snapchatSchema = z.object({
  username: z
    .string()
    .min(1, "Snapchat username is required")
    .regex(/^[\w.-]+$/, "Invalid Snapchat username"),
});

// Threads
export const threadsSchema = z.object({
  username: z
    .string()
    .min(1, "Threads username is required")
    .regex(/^@?[\w.]+$/, "Invalid Threads username"),
});

// UPI
export const upiSchema = z.object({
  upiId: z
    .string()
    .min(1, "UPI ID is required")
    .regex(/^[\w.-]+@[\w.-]+$/, "Invalid UPI ID format (e.g., user@bank)"),
  name: z.string().optional(),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  note: z.string().optional(),
});

// PayPal
export const paypalSchema = z.object({
  paypalUrl: z
    .string()
    .min(1, "PayPal URL is required")
    .url("Invalid PayPal URL"),
});

// Export type inference helpers
export type UrlFormData = z.infer<typeof urlSchema>;
export type EmailFormData = z.infer<typeof emailSchema>;
export type PhoneFormData = z.infer<typeof phoneSchema>;
export type SmsFormData = z.infer<typeof smsSchema>;
export type WhatsAppFormData = z.infer<typeof whatsappSchema>;
export type WifiFormData = z.infer<typeof wifiSchema>;
export type VCardFormData = z.infer<typeof vcardSchema>;
export type MapsFormData = z.infer<typeof mapsSchema>;
export type AppStoresFormData = z.infer<typeof appStoresSchema>;
export type FacebookFormData = z.infer<typeof facebookSchema>;
export type InstagramFormData = z.infer<typeof instagramSchema>;
export type RedditFormData = z.infer<typeof redditSchema>;
export type TikTokFormData = z.infer<typeof tiktokSchema>;
export type TwitterFormData = z.infer<typeof twitterSchema>;
export type LinkedInFormData = z.infer<typeof linkedinSchema>;
export type YouTubeFormData = z.infer<typeof youtubeSchema>;
export type PinterestFormData = z.infer<typeof pinterestSchema>;
export type SnapchatFormData = z.infer<typeof snapchatSchema>;
export type ThreadsFormData = z.infer<typeof threadsSchema>;
export type UPIFormData = z.infer<typeof upiSchema>;
export type PayPalFormData = z.infer<typeof paypalSchema>;

