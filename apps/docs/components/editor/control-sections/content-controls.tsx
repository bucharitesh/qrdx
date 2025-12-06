"use client";

import {
  AppStoresForm,
  EmailForm,
  FacebookForm,
  InstagramForm,
  LinkedInForm,
  MapsForm,
  PayPalForm,
  PhoneForm,
  PinterestForm,
  RedditForm,
  SmsForm,
  SnapchatForm,
  ThreadsForm,
  TikTokForm,
  TwitterForm,
  UPIForm,
  UrlForm,
  VCardForm,
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
        {contentType === "email" && <EmailForm />}
        {contentType === "phone" && <PhoneForm />}
        {contentType === "sms" && <SmsForm />}
        {contentType === "whatsapp" && <WhatsAppForm />}
        {contentType === "wifi" && <WifiForm />}
        {contentType === "vcard" && <VCardForm />}
        {contentType === "maps" && <MapsForm />}
        {contentType === "app-stores" && <AppStoresForm />}
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
      </div>
    </div>
  );
}
