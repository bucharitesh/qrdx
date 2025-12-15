"use client";

import {
  AmazonForm,
  AttendanceForm,
  BitcoinForm,
  CalcomForm,
  DubshForm,
  EmailForm,
  EthereumForm,
  EtsyForm,
  FacebookForm,
  FlipkartForm,
  GoogleReviewForm,
  InstagramForm,
  LinkedInForm,
  MapsForm,
  PayPalForm,
  PhoneForm,
  PinterestForm,
  RedditForm,
  SmsForm,
  SnapchatForm,
  SpotifyForm,
  TextForm,
  ThreadsForm,
  TikTokForm,
  TwitterForm,
  UPIForm,
  UrlForm,
  VCardForm,
  VenmoForm,
  WhatsAppForm,
  WifiForm,
  YouTubeForm,
} from "@/components/editor/content-forms";
import { ContentTypeSelector } from "@/components/editor/content-type-selector";
import { useQREditorStore } from "@/store/editor-store";

export function ContentControls() {
  const { contentType } = useQREditorStore();

  return (
    <div className="space-y-6 py-4">
      <ContentTypeSelector />

      <div className="space-y-4">
        {contentType === "url" && <UrlForm />}
        {contentType === "text" && <TextForm />}
        {contentType === "email" && <EmailForm />}
        {contentType === "phone" && <PhoneForm />}
        {contentType === "sms" && <SmsForm />}
        {contentType === "whatsapp" && <WhatsAppForm />}
        {contentType === "wifi" && <WifiForm />}
        {contentType === "vcard" && <VCardForm />}
        {contentType === "maps" && <MapsForm />}
        {contentType === "facebook" && <FacebookForm />}
        {contentType === "instagram" && <InstagramForm />}
        {contentType === "reddit" && <RedditForm />}
        {contentType === "tiktok" && <TikTokForm />}
        {contentType === "twitter" && <TwitterForm />}
        {contentType === "linkedin" && <LinkedInForm />}
        {contentType === "youtube" && <YouTubeForm />}
        {contentType === "pinterest" && <PinterestForm />}
        {contentType === "snapchat" && <SnapchatForm />}
        {contentType === "threads" && <ThreadsForm />}
        {contentType === "upi" && <UPIForm />}
        {contentType === "paypal" && <PayPalForm />}
        {contentType === "google-review" && <GoogleReviewForm />}
        {contentType === "venmo" && <VenmoForm />}
        {contentType === "spotify" && <SpotifyForm />}
        {contentType === "bitcoin" && <BitcoinForm />}
        {contentType === "ethereum" && <EthereumForm />}
        {contentType === "etsy" && <EtsyForm />}
        {contentType === "dubsh" && <DubshForm />}
        {contentType === "attendance" && <AttendanceForm />}
        {contentType === "amazon" && <AmazonForm />}
        {contentType === "flipkart" && <FlipkartForm />}
        {contentType === "calcom" && <CalcomForm />}
      </div>
    </div>
  );
}
