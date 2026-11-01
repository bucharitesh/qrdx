import "server-only";

import {
  account,
  aiUsage,
  brandKit,
  communityTheme,
  conversion,
  customDomain,
  database as db,
  fileAsset,
  folder,
  formResponse,
  integration,
  landingPage,
  landingPageVersion,
  member,
  notificationSetting,
  oauthApp,
  organization,
  qrCode,
  qrCodeTag,
  qrCodeVersion,
  qrPreset,
  qrScan,
  session,
  subscription,
  tag,
  themeLike,
  user,
  webhookEndpoint,
} from "@repo/database";
import { and, asc, count, eq, gt, inArray, or, sql } from "drizzle-orm";

/**
 * Every query behind "Download my data", for one user. Two rules, checked by
 * tests/lib/account-export.test.ts against the generated SQL:
 *
 * 1. Scoped: each query filters on this user's id, directly (user_id,
 *    owner_user_id) or through the codes and pages they created.
 * 2. Allowlisted columns: secrets (tokens, password hashes, webhook and
 *    client secrets, integration credentials) are never selected.
 *
 * Team content counts as the user's when they created it (user_id), the same
 * rule the dashboard uses for "created by you".
 */

export const SCAN_PAGE_SIZE = 5_000;
export const FORM_RESPONSE_PAGE_SIZE = 2_000;

export interface ScanCursor {
  scannedAt: Date;
  id: string;
}

export interface RowCursor {
  createdAt: Date;
  id: string;
}

export function exportQueries(userId: string) {
  const myCodeIds = db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(eq(qrCode.userId, userId));
  const myPageIds = db
    .select({ id: landingPage.id })
    .from(landingPage)
    .where(eq(landingPage.userId, userId));

  return {
    profile: db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        settings: user.settings,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),

    signInMethods: db
      .select({
        provider: account.providerId,
        scope: account.scope,
        linkedAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(asc(account.createdAt)),

    sessions: db
      .select({
        signedInAt: session.createdAt,
        lastActiveAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))
      .orderBy(asc(session.createdAt)),

    aiUsage: db
      .select({
        model: aiUsage.modelId,
        promptTokens: aiUsage.promptTokens,
        completionTokens: aiUsage.completionTokens,
        createdAt: aiUsage.createdAt,
      })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId))
      .orderBy(asc(aiUsage.createdAt)),

    codes: db
      .select({
        id: qrCode.id,
        teamId: qrCode.organizationId,
        slug: qrCode.slug,
        kind: qrCode.kind,
        title: qrCode.title,
        contentType: qrCode.contentType,
        destinationUrl: qrCode.destinationUrl,
        fallbackUrl: qrCode.fallbackUrl,
        pageId: qrCode.pageId,
        domainId: qrCode.domainId,
        folderId: qrCode.folderId,
        notes: qrCode.notes,
        isFavorite: qrCode.isFavorite,
        isActive: qrCode.isActive,
        passwordProtected: sql<boolean>`(${qrCode.passwordHash} is not null)`,
        startsAt: qrCode.startsAt,
        expiresAt: qrCode.expiresAt,
        scanLimit: qrCode.scanLimit,
        pausedAt: qrCode.pausedAt,
        archivedAt: qrCode.archivedAt,
        deletedAt: qrCode.deletedAt,
        scanCount: qrCode.scanCount,
        lastScannedAt: qrCode.lastScannedAt,
        routing: qrCode.routing,
        utm: qrCode.utm,
        pixels: qrCode.pixels,
        style: qrCode.style,
        createdAt: qrCode.createdAt,
        updatedAt: qrCode.updatedAt,
      })
      .from(qrCode)
      .where(eq(qrCode.userId, userId))
      .orderBy(asc(qrCode.createdAt)),

    codeTags: db
      .select({ codeId: qrCodeTag.qrCodeId, tagId: qrCodeTag.tagId })
      .from(qrCodeTag)
      .where(inArray(qrCodeTag.qrCodeId, myCodeIds)),

    codeVersions: db
      .select({
        id: qrCodeVersion.id,
        codeId: qrCodeVersion.qrCodeId,
        snapshot: qrCodeVersion.snapshot,
        createdAt: qrCodeVersion.createdAt,
      })
      .from(qrCodeVersion)
      .where(inArray(qrCodeVersion.qrCodeId, myCodeIds))
      .orderBy(asc(qrCodeVersion.createdAt)),

    conversions: db
      .select({
        id: conversion.id,
        codeId: conversion.qrCodeId,
        name: conversion.name,
        value: conversion.value,
        currency: conversion.currency,
        metadata: conversion.metadata,
        createdAt: conversion.createdAt,
      })
      .from(conversion)
      .where(inArray(conversion.qrCodeId, myCodeIds))
      .orderBy(asc(conversion.createdAt)),

    /** Codes whose scans are exported, in order */
    scannedCodes: db
      .select({ id: qrCode.id, slug: qrCode.slug })
      .from(qrCode)
      .where(eq(qrCode.userId, userId))
      .orderBy(asc(qrCode.createdAt), asc(qrCode.id)),

    /** One page of a code's scans (keyset on scanned_at, id) */
    scanPage: (codeId: string, after: ScanCursor | null) =>
      db
        .select({
          id: qrScan.id,
          codeId: qrScan.qrCodeId,
          scannedAt: qrScan.scannedAt,
          country: qrScan.country,
          region: qrScan.region,
          city: qrScan.city,
          deviceType: qrScan.deviceType,
          os: qrScan.os,
          browser: qrScan.browser,
          referer: qrScan.referer,
          language: qrScan.language,
          variant: qrScan.variant,
          visitorHash: qrScan.visitorHash,
        })
        .from(qrScan)
        .where(
          and(
            eq(qrScan.qrCodeId, codeId),
            inArray(qrScan.qrCodeId, myCodeIds),
            after
              ? or(
                  gt(qrScan.scannedAt, after.scannedAt),
                  and(
                    eq(qrScan.scannedAt, after.scannedAt),
                    gt(qrScan.id, after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(qrScan.scannedAt), asc(qrScan.id))
        .limit(SCAN_PAGE_SIZE),

    scansDaily: db
      .select({
        codeId: qrScan.qrCodeId,
        day: sql<string>`to_char(date_trunc('day', ${qrScan.scannedAt}), 'YYYY-MM-DD')`,
        scans: count(),
      })
      .from(qrScan)
      .where(inArray(qrScan.qrCodeId, myCodeIds))
      .groupBy(qrScan.qrCodeId, sql`2`)
      .orderBy(asc(qrScan.qrCodeId), sql`2`),

    pages: db
      .select({
        id: landingPage.id,
        teamId: landingPage.organizationId,
        type: landingPage.type,
        title: landingPage.title,
        content: landingPage.content,
        version: landingPage.version,
        createdAt: landingPage.createdAt,
        updatedAt: landingPage.updatedAt,
      })
      .from(landingPage)
      .where(eq(landingPage.userId, userId))
      .orderBy(asc(landingPage.createdAt)),

    pageVersions: db
      .select({
        id: landingPageVersion.id,
        pageId: landingPageVersion.pageId,
        content: landingPageVersion.content,
        createdAt: landingPageVersion.createdAt,
      })
      .from(landingPageVersion)
      .where(inArray(landingPageVersion.pageId, myPageIds))
      .orderBy(asc(landingPageVersion.createdAt)),

    /** One page of form responses on the user's pages (keyset on created_at, id) */
    formResponsePage: (after: RowCursor | null) =>
      db
        .select({
          id: formResponse.id,
          pageId: formResponse.pageId,
          codeId: formResponse.qrCodeId,
          createdAt: formResponse.createdAt,
          visitorHash: formResponse.visitorHash,
          data: formResponse.data,
        })
        .from(formResponse)
        .where(
          and(
            inArray(formResponse.pageId, myPageIds),
            after
              ? or(
                  gt(formResponse.createdAt, after.createdAt),
                  and(
                    eq(formResponse.createdAt, after.createdAt),
                    gt(formResponse.id, after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(formResponse.createdAt), asc(formResponse.id))
        .limit(FORM_RESPONSE_PAGE_SIZE),

    themes: db
      .select({
        id: qrPreset.id,
        teamId: qrPreset.organizationId,
        name: qrPreset.name,
        style: qrPreset.style,
        isDefault: qrPreset.isDefault,
        createdAt: qrPreset.createdAt,
        updatedAt: qrPreset.updatedAt,
      })
      .from(qrPreset)
      .where(eq(qrPreset.userId, userId))
      .orderBy(asc(qrPreset.createdAt)),

    brandKits: db
      .select({
        id: brandKit.id,
        teamId: brandKit.organizationId,
        name: brandKit.name,
        logo: brandKit.logo,
        colors: brandKit.colors,
        style: brandKit.style,
        isDefault: brandKit.isDefault,
        createdAt: brandKit.createdAt,
      })
      .from(brandKit)
      .where(eq(brandKit.userId, userId))
      .orderBy(asc(brandKit.createdAt)),

    communityThemes: db
      .select({
        id: communityTheme.id,
        themeId: communityTheme.themeId,
        publishedAt: communityTheme.publishedAt,
        likeCount: communityTheme.likeCount,
      })
      .from(communityTheme)
      .where(eq(communityTheme.userId, userId))
      .orderBy(asc(communityTheme.publishedAt)),

    themeLikes: db
      .select({ themeId: themeLike.themeId, likedAt: themeLike.createdAt })
      .from(themeLike)
      .where(eq(themeLike.userId, userId))
      .orderBy(asc(themeLike.createdAt)),

    folders: db
      .select({
        id: folder.id,
        teamId: folder.organizationId,
        parentId: folder.parentId,
        name: folder.name,
        position: folder.position,
        createdAt: folder.createdAt,
      })
      .from(folder)
      .where(eq(folder.userId, userId))
      .orderBy(asc(folder.createdAt)),

    tags: db
      .select({
        id: tag.id,
        teamId: tag.organizationId,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt,
      })
      .from(tag)
      .where(eq(tag.userId, userId))
      .orderBy(asc(tag.createdAt)),

    files: db
      .select({
        id: fileAsset.id,
        teamId: fileAsset.organizationId,
        filename: fileAsset.filename,
        mime: fileAsset.mime,
        size: fileAsset.size,
        sha256: fileAsset.sha256,
        status: fileAsset.status,
        createdAt: fileAsset.createdAt,
      })
      .from(fileAsset)
      .where(eq(fileAsset.userId, userId))
      .orderBy(asc(fileAsset.createdAt)),

    domains: db
      .select({
        id: customDomain.id,
        teamId: customDomain.organizationId,
        hostname: customDomain.hostname,
        verified: customDomain.verified,
        createdAt: customDomain.createdAt,
      })
      .from(customDomain)
      .where(eq(customDomain.userId, userId))
      .orderBy(asc(customDomain.createdAt)),

    webhooks: db
      .select({
        id: webhookEndpoint.id,
        teamId: webhookEndpoint.organizationId,
        url: webhookEndpoint.url,
        events: webhookEndpoint.events,
        active: webhookEndpoint.active,
        createdAt: webhookEndpoint.createdAt,
      })
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.userId, userId))
      .orderBy(asc(webhookEndpoint.createdAt)),

    notificationSettings: db
      .select({
        teamId: notificationSetting.organizationId,
        channel: notificationSetting.channel,
        // Slack and Discord targets are incoming-webhook URLs, which work
        // like passwords: only email addresses are exported.
        emailAddress: sql<
          string | null
        >`case when ${notificationSetting.channel} = 'email' then ${notificationSetting.target} else null end`,
        events: notificationSetting.events,
        createdAt: notificationSetting.createdAt,
      })
      .from(notificationSetting)
      .where(eq(notificationSetting.userId, userId))
      .orderBy(asc(notificationSetting.createdAt)),

    oauthApps: db
      .select({
        id: oauthApp.id,
        teamId: oauthApp.organizationId,
        name: oauthApp.name,
        description: oauthApp.description,
        clientId: oauthApp.clientId,
        redirectUris: oauthApp.redirectUris,
        scopes: oauthApp.scopes,
        isActive: oauthApp.isActive,
        verified: oauthApp.verified,
        pkceRequired: oauthApp.pkceRequired,
        logoUrl: oauthApp.logoUrl,
        websiteUrl: oauthApp.websiteUrl,
        createdAt: oauthApp.createdAt,
        updatedAt: oauthApp.updatedAt,
      })
      .from(oauthApp)
      .where(eq(oauthApp.ownerUserId, userId))
      .orderBy(asc(oauthApp.createdAt)),

    integrations: db
      .select({
        provider: integration.provider,
        status: integration.status,
        scopes: integration.scopes,
        connectedAt: integration.createdAt,
        lastSyncAt: integration.lastSyncAt,
      })
      .from(integration)
      .where(eq(integration.userId, userId))
      .orderBy(asc(integration.createdAt)),

    teams: db
      .select({
        teamId: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt)),

    subscriptions: db
      .select({
        id: subscription.id,
        status: subscription.status,
        productId: subscription.productId,
        amount: subscription.amount,
        currency: subscription.currency,
        recurringInterval: subscription.recurringInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        startedAt: subscription.startedAt,
        endsAt: subscription.endsAt,
        endedAt: subscription.endedAt,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .orderBy(asc(subscription.createdAt)),
  };
}

export type ExportQueries = ReturnType<typeof exportQueries>;
