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

// Plain Text
export const textSchema = z.object({
  text: z.string().min(1, "Text is required"),
});

// Google Review
export const googleReviewSchema = z.object({
  placeId: z.string().min(1, "Place ID is required"),
});

// Venmo
export const venmoSchema = z.object({
  username: z
    .string()
    .min(1, "Venmo username is required")
    .regex(/^@?[\w-]+$/, "Invalid Venmo username"),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  note: z.string().optional(),
});

// Spotify
export const spotifySchema = z.object({
  uri: z
    .string()
    .min(1, "Spotify URI or URL is required")
    .refine(
      (val) =>
        val.startsWith("spotify:") ||
        val.includes("spotify.com") ||
        val.startsWith("https://"),
      "Invalid Spotify URI or URL",
    ),
});

// Bitcoin
export const bitcoinSchema = z.object({
  address: z
    .string()
    .min(26, "Invalid Bitcoin address")
    .max(62, "Invalid Bitcoin address"),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  label: z.string().optional(),
  message: z.string().optional(),
});

// Ethereum
export const ethereumSchema = z.object({
  address: z
    .string()
    .min(1, "Ethereum address is required")
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
  amount: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid amount format")
    .optional()
    .or(z.literal("")),
  gas: z
    .string()
    .regex(/^\d*\.?\d*$/, "Invalid gas format")
    .optional()
    .or(z.literal("")),
});

// Etsy
export const etsySchema = z.object({
  shopUrl: z.string().min(1, "Etsy shop URL is required").url("Invalid URL"),
});

// Dub.sh
export const dubshSchema = z.object({
  shortUrl: z.string().min(1, "Short URL is required").url("Invalid URL"),
});

// Attendance (Google Form)
export const attendanceSchema = z.object({
  formUrl: z
    .string()
    .min(1, "Google Form URL is required")
    .url("Invalid URL")
    .refine(
      (val) => val.includes("google.com/forms") || val.includes("forms.gle"),
      "Must be a Google Forms URL",
    ),
});

// Amazon
export const amazonSchema = z.object({
  productUrl: z
    .string()
    .min(1, "Amazon product URL is required")
    .url("Invalid URL")
    .refine((val) => val.includes("amazon."), "Must be an Amazon URL"),
});

// Flipkart
export const flipkartSchema = z.object({
  productUrl: z
    .string()
    .min(1, "Flipkart product URL is required")
    .url("Invalid URL")
    .refine((val) => val.includes("flipkart.com"), "Must be a Flipkart URL"),
});

// Cal.com
export const calcomSchema = z.object({
  bookingUrl: z
    .string()
    .min(1, "Cal.com booking URL is required")
    .url("Invalid URL")
    .refine((val) => val.includes("cal.com"), "Must be a Cal.com URL"),
});

// Export type inference helpers
export type UrlFormData = z.infer<typeof urlSchema>;
export type TextFormData = z.infer<typeof textSchema>;
export type EmailFormData = z.infer<typeof emailSchema>;
export type PhoneFormData = z.infer<typeof phoneSchema>;
export type SmsFormData = z.infer<typeof smsSchema>;
export type WhatsAppFormData = z.infer<typeof whatsappSchema>;
export type WifiFormData = z.infer<typeof wifiSchema>;
export type VCardFormData = z.infer<typeof vcardSchema>;
export type MapsFormData = z.infer<typeof mapsSchema>;
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
export type GoogleReviewFormData = z.infer<typeof googleReviewSchema>;
export type VenmoFormData = z.infer<typeof venmoSchema>;
export type SpotifyFormData = z.infer<typeof spotifySchema>;
export type BitcoinFormData = z.infer<typeof bitcoinSchema>;
export type EthereumFormData = z.infer<typeof ethereumSchema>;
export type EtsyFormData = z.infer<typeof etsySchema>;
export type DubshFormData = z.infer<typeof dubshSchema>;
export type AttendanceFormData = z.infer<typeof attendanceSchema>;
export type AmazonFormData = z.infer<typeof amazonSchema>;
export type FlipkartFormData = z.infer<typeof flipkartSchema>;
export type CalcomFormData = z.infer<typeof calcomSchema>;
